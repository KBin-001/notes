import { allowedAdmins, isLocalRequest, repoConfig, requireEnv, type Env } from '../../_lib/env';
import { getGitHubUser } from '../../_lib/github';
import { forbidden, json, unauthorized, serverError } from '../../_lib/http';
import { readSession } from '../../_lib/session';

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

    const user = await getGitHubUser(session.token);
    if (!allowedAdmins(context.env).includes(user.login.toLowerCase())) {
      return forbidden('GitHub user is not allowed');
    }

    return json({
      ok: true,
      user: { login: user.login, avatarUrl: user.avatar_url, url: user.html_url },
      repo: repoConfig(context.env),
    });
  } catch (error) {
    return serverError(error instanceof Error ? error.message : 'Failed to read current user');
  }
}

