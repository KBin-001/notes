import { maxMarkdownBytes } from '../../_lib/constants';
import { requireAdmin } from '../../_lib/auth';
import { type Env } from '../../_lib/env';
import { badRequest, json, serverError } from '../../_lib/http';
import { parseNote } from '../../_lib/notes';

export async function onRequestPost(context: { request: Request; env: Env }) {
  try {
    const auth = await requireAdmin(context.request, context.env);
    if (auth.response) return auth.response;

    const form = await context.request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return badRequest('请上传 Markdown 文件');
    if (!/\.(md|mdx)$/i.test(file.name)) return badRequest('只支持 .md 或 .mdx 文件');
    if (file.size > maxMarkdownBytes) return badRequest('文件不能超过 2MB');

    const text = await file.text();
    const note = parseNote(text, file.name);
    return json({ ok: true, note });
  } catch (error) {
    return serverError(error instanceof Error ? error.message : 'Parse failed');
  }
}

