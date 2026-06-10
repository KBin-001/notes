import { docsRoot } from '../../_lib/constants';
import { requireAdmin } from '../../_lib/auth';
import { type Env } from '../../_lib/env';
import { decodeBase64Content, getFile } from '../../_lib/github';
import { badRequest, json, serverError } from '../../_lib/http';
import { parseNote } from '../../_lib/notes';

function safePath(path: string) {
  return path.startsWith(`${docsRoot}/`) && !path.includes('..') && !path.includes('\\') && /\.(md|mdx)$/.test(path);
}

export async function onRequestGet(context: { request: Request; env: Env }) {
  try {
    const auth = await requireAdmin(context.request, context.env);
    if (auth.response) return auth.response;

    const url = new URL(context.request.url);
    const path = url.searchParams.get('path') ?? '';
    if (!safePath(path)) return badRequest('path 不合法');

    const file = await getFile(context.env, auth.session!.token, path);
    const text = decodeBase64Content(file.content);
    const note = parseNote(text, path.split('/').pop() ?? '');
    note.category = path.slice(`${docsRoot}/`.length).split('/')[0] || note.category;
    note.slug = path.split('/').pop()?.replace(/\.(md|mdx)$/i, '') || note.slug;
    note.sha = file.sha;

    return json({ ok: true, path, note });
  } catch (error) {
    return serverError(error instanceof Error ? error.message : 'Read failed');
  }
}

