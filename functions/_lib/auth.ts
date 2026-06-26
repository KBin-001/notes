import { allowedAdmins, isLocalRequest, requireEnv, type Env } from './env';
import { forbidden, unauthorized } from './http';
import { readSession } from './session';

export async function requireAdmin(request: Request, env: Env) {
  if (isLocalRequest(request) && env.GITHUB_TOKEN) {
    return {
      response: null,
      session: { token: env.GITHUB_TOKEN, login: allowedAdmins(env)[0] || 'local-dev', ts: Date.now() },
    };
  }

  requireEnv(env, ['SESSION_SECRET']);
  const session = await readSession(request, env.SESSION_SECRET!);
  if (!session?.token || !session.login) {
    return { response: unauthorized(), session: null };
  }

  if (!allowedAdmins(env).includes(session.login.toLowerCase())) {
    return { response: forbidden('GitHub user is not allowed to manage this knowledge base'), session: null };
  }

  return { response: null, session };
}

