export function json(data: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...(init.headers ?? {}),
    },
  });
}

export function badRequest(message: string, details?: unknown) {
  return json({ ok: false, error: message, details }, { status: 400 });
}

export function unauthorized(message = 'Unauthorized') {
  return json({ ok: false, error: message }, { status: 401 });
}

export function forbidden(message = 'Forbidden') {
  return json({ ok: false, error: message }, { status: 403 });
}

export function conflict(message: string, details?: unknown) {
  return json({ ok: false, error: message, details }, { status: 409 });
}

export function serverError(message: string, details?: unknown) {
  return json({ ok: false, error: message, details }, { status: 500 });
}

export function getCookie(request: Request, name: string) {
  const cookie = request.headers.get('cookie') ?? '';
  const parts = cookie.split(';').map((part) => part.trim());
  const prefix = `${name}=`;
  const found = parts.find((part) => part.startsWith(prefix));
  return found ? decodeURIComponent(found.slice(prefix.length)) : '';
}

export function redirect(location: string, headers?: HeadersInit) {
  return new Response(null, { status: 302, headers: { location, ...(headers ?? {}) } });
}

