export type Env = {
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  SESSION_SECRET?: string;
  ADMIN_GITHUB_USERS?: string;
  GITHUB_OWNER?: string;
  GITHUB_REPO?: string;
  GITHUB_BRANCH?: string;
  GITHUB_OAUTH_SCOPE?: string;
};

export function requireEnv(env: Env, keys: Array<keyof Env>) {
  const missing = keys.filter((key) => !env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing environment variables: ${missing.join(', ')}`);
  }
}

export function repoConfig(env: Env) {
  return {
    owner: env.GITHUB_OWNER || 'KBin-001',
    repo: env.GITHUB_REPO || 'notes',
    branch: env.GITHUB_BRANCH || 'main',
  };
}

export function allowedAdmins(env: Env) {
  return (env.ADMIN_GITHUB_USERS || 'KBin-001')
    .split(',')
    .map((user) => user.trim().toLowerCase())
    .filter(Boolean);
}

