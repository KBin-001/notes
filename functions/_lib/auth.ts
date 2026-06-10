import { allowedAdmins, requireEnv, type Env } from './env';
import { forbidden, unauthorized } from './http';
import { readSession } from './session';

export async function requireAdmin(request: Request, env: Env) {
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

