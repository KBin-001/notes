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
    throw new Error(message);
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

