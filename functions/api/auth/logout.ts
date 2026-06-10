import { json } from '../../_lib/http';
import { clearSessionCookie } from '../../_lib/session';

export async function onRequestPost(context: { request: Request }) {
  return json(
    { ok: true },
    {
      headers: {
        'set-cookie': clearSessionCookie(context.request),
      },
    }
  );
}

