import { allowedAdmins, requireEnv, type Env } from '../../_lib/env';
import { exchangeCodeForToken, getGitHubUser } from '../../_lib/github';
import { forbidden, redirect, serverError } from '../../_lib/http';
import { clearStateCookie, makeSessionCookie, readStateCookie } from '../../_lib/session';

export async function onRequestGet(context: { request: Request; env: Env }) {
  try {
    requireEnv(context.env, ['GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET', 'SESSION_SECRET']);
    const url = new URL(context.request.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const expectedState = readStateCookie(context.request);

    if (!code || !state || !expectedState || state !== expectedState) {
      return redirect('/admin?error=oauth_state', { 'set-cookie': clearStateCookie(context.request) });
    }

    const token = await exchangeCodeForToken(context.env, code);
    const user = await getGitHubUser(token);
    const admins = allowedAdmins(context.env);
    if (!admins.includes(user.login.toLowerCase())) {
      return forbidden(`GitHub user ${user.login} is not allowed`);
    }

    const sessionCookie = await makeSessionCookie(
      context.request,
      { token, login: user.login, ts: Date.now() },
      context.env.SESSION_SECRET!
    );

    const headers = new Headers({ location: '/admin' });
    headers.append('set-cookie', clearStateCookie(context.request));
    headers.append('set-cookie', sessionCookie);
    return new Response(null, { status: 302, headers });
  } catch (error) {
    return serverError(error instanceof Error ? error.message : 'OAuth callback failed');
  }
}
