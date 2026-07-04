import { requireAdmin } from '../../_lib/auth';
import { type Env } from '../../_lib/env';
import { json, serverError } from '../../_lib/http';
import { readSiteConfig } from '../../_lib/site-config';

export async function onRequestGet(context: { request: Request; env: Env }) {
  try {
    const auth = await requireAdmin(context.request, context.env);
    if (auth.response) return auth.response;

    const { config, sha } = await readSiteConfig(context.env, auth.session!.token);
    return json({ ok: true, config, sha });
  } catch (error) {
    return serverError(error instanceof Error ? error.message : 'Read site config failed');
  }
}
