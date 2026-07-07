import { allowedAdmins, isLocalRequest, repoConfig, requireEnv, type Env } from '../../_lib/env';
import { getGitHubUser } from '../../_lib/github';
import { forbidden, json, unauthorized, serverError } from '../../_lib/http';
import { readSession } from '../../_lib/session';

/** GitHub 用户信息短期缓存，避免每次请求都调用 GitHub API */
interface CachedUser {
  login: string;
  avatarUrl: string;
  url: string;
  ts: number;
}

const userCache = new Map<string, CachedUser>();
const CACHE_TTL = 5 * 60 * 1000; // 5 分钟

export async function onRequestGet(context: { request: Request; env: Env }) {
  try {
    if (isLocalRequest(context.request)) {
      const login = allowedAdmins(context.env)[0] || 'local-dev';
      return json({
        ok: true,
        local: true,
        user: { login, avatarUrl: '', url: '' },
        repo: repoConfig(context.env),
      });
    }

    requireEnv(context.env, ['SESSION_SECRET']);
    const session = await readSession(context.request, context.env.SESSION_SECRET!);
    if (!session?.token) return unauthorized();

    // 优先使用缓存的用户信息（5 分钟内有效）
    const cached = userCache.get(session.token);
    let user: CachedUser;

    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      user = cached;
    } else {
      const ghUser = await getGitHubUser(session.token);
      user = {
        login: ghUser.login,
        avatarUrl: ghUser.avatar_url ?? '',
        url: ghUser.html_url ?? '',
        ts: Date.now(),
      };
      userCache.set(session.token, user);
    }

    if (!allowedAdmins(context.env).includes(user.login.toLowerCase())) {
      return forbidden('GitHub user is not allowed');
    }

    return json({
      ok: true,
      user: { login: user.login, avatarUrl: user.avatarUrl, url: user.url },
      repo: repoConfig(context.env),
    });
  } catch (error) {
    return serverError(error instanceof Error ? error.message : 'Failed to read current user');
  }
}

