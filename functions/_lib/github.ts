import { repoConfig, type Env } from './env';

type GitHubUser = {
  login: string;
  id: number;
  avatar_url?: string;
  html_url?: string;
};

function headers(token: string) {
  return {
    accept: 'application/vnd.github+json',
    authorization: `Bearer ${token}`,
    'user-agent': 'kevin-knowledge-base-admin',
    'x-github-api-version': '2022-11-28',
  };
}

async function githubFetch(path: string, token: string, init: RequestInit = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      ...headers(token),
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const message = data?.message || `GitHub API error ${response.status}`;
    const error = new Error(message) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return data;
}

export async function exchangeCodeForToken(env: Env, code: string) {
  const response = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
    }),
  });
  const data = (await response.json()) as { access_token?: string; error_description?: string };
  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description || 'GitHub OAuth token exchange failed');
  }
  return data.access_token;
}

export async function getGitHubUser(token: string) {
  return githubFetch('/user', token) as Promise<GitHubUser>;
}

export async function getTree(env: Env, token: string) {
  const { owner, repo, branch } = repoConfig(env);
  return githubFetch(`/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`, token);
}

export async function getFile(env: Env, token: string, path: string) {
  const { owner, repo, branch } = repoConfig(env);
  return githubFetch(
    `/repos/${owner}/${repo}/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}?ref=${encodeURIComponent(branch)}`,
    token
  );
}

/**
 * 使用 GraphQL API 批量获取多个文件内容，避免 N+1 REST API 调用。
 * 每批最多 50 个文件（GraphQL 别名限制），超出自动分批。
 * 返回 Map<path, text>，text 为 UTF-8 文本（非 base64）。
 *
 * 注意：单个文件超过 1MB 时 GraphQL text 字段返回 null，调用方需处理缺失情况。
 */
const GRAPHQL_BATCH_SIZE = 50;

export async function getFilesBatch(
  env: Env,
  token: string,
  paths: string[],
): Promise<Map<string, string>> {
  const { owner, repo, branch } = repoConfig(env);
  const result = new Map<string, string>();
  if (paths.length === 0) return result;

  for (let i = 0; i < paths.length; i += GRAPHQL_BATCH_SIZE) {
    const batch = paths.slice(i, i + GRAPHQL_BATCH_SIZE);
    const fields = batch.map((path, idx) => {
      // expression 格式：branch:path，需转义双引号和反斜杠
      const expr = `${branch}:${path}`.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      return `f${idx}: object(expression: "${expr}") { ... on Blob { text } }`;
    });

    const query = `query {\n  repository(owner: "${owner}", name: "${repo}") {\n    ${fields.join('\n    ')}\n  }\n}`;

    try {
      const response = await fetch('https://api.github.com/graphql', {
        method: 'POST',
        headers: {
          ...headers(token),
          'content-type': 'application/json',
        },
        body: JSON.stringify({ query }),
      });

      const data = await response.json();

      if (!response.ok) {
        const message = data?.errors?.[0]?.message || data?.message || `GitHub GraphQL error ${response.status}`;
        throw new Error(message);
      }

      const repoData = data?.data?.repository;
      if (!repoData) continue;

      for (let j = 0; j < batch.length; j++) {
        const blob = repoData[`f${j}`];
        const text = blob?.text;
        if (typeof text === 'string') {
          result.set(batch[j], text);
        }
      }
    } catch {
      // GraphQL 批量请求失败时，静默跳过该批次（调用方会回退到默认值）
    }
  }

  return result;
}

export async function putFile(env: Env, token: string, path: string, content: string, message: string, sha?: string) {
  const { owner, repo, branch } = repoConfig(env);
  return githubFetch(`/repos/${owner}/${repo}/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}`, token, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      message,
      content: encodeBase64(content),
      branch,
      ...(sha ? { sha } : {}),
    }),
  });
}

export async function putBinaryFile(env: Env, token: string, path: string, base64Content: string, message: string, sha?: string) {
  const { owner, repo, branch } = repoConfig(env);
  return githubFetch(`/repos/${owner}/${repo}/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}`, token, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      message,
      content: base64Content,
      branch,
      ...(sha ? { sha } : {}),
    }),
  });
}

export async function deleteFile(env: Env, token: string, path: string, sha: string, message: string) {
  const { owner, repo, branch } = repoConfig(env);
  return githubFetch(`/repos/${owner}/${repo}/contents/${encodeURIComponent(path).replace(/%2F/g, '/')}`, token, {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      message,
      sha,
      branch,
    }),
  });
}

export function decodeBase64Content(content: string) {
  const cleaned = content.replace(/\s/g, '');
  const binary = atob(cleaned);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function encodeBase64(text: string) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(index, index + chunkSize));
  }
  return btoa(binary);
}

export function encodeBinaryBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

