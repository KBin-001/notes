import { repoConfig, requireEnv, type Env } from '../../_lib/env';
import { redirect, serverError } from '../../_lib/http';
import { makeStateCookie } from '../../_lib/session';

export async function onRequestGet(context: { request: Request; env: Env }) {
  try {
    requireEnv(context.env, ['GITHUB_CLIENT_ID']);
    const url = new URL(context.request.url);
    const { state, header } = makeStateCookie(context.request);
    const callback = `${url.origin}/api/auth/callback`;
    const scope = context.env.GITHUB_OAUTH_SCOPE || 'public_repo read:user';
    const { owner, repo } = repoConfig(context.env);

    const github = new URL('https://github.com/login/oauth/authorize');
    github.searchParams.set('client_id', context.env.GITHUB_CLIENT_ID!);
    github.searchParams.set('redirect_uri', callback);
    github.searchParams.set('scope', scope);
    github.searchParams.set('state', state);
    github.searchParams.set('allow_signup', 'false');
    github.searchParams.set('login', owner);

    return redirect(github.toString(), { 'set-cookie': header, 'x-kb-repo': `${owner}/${repo}` });
  } catch (error) {
    return serverError(error instanceof Error ? error.message : 'OAuth login failed');
  }
}

