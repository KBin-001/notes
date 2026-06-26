import { requireAdmin } from '../../_lib/auth';
import { deployHookUrl, type Env } from '../../_lib/env';
import { getFile, putFile } from '../../_lib/github';
import { badRequest, conflict, json, serverError } from '../../_lib/http';
import { assertSafeNotePath, notePath, serializeNote, validateNote, type NotePayload } from '../../_lib/notes';

async function triggerDeploy(env: Env) {
  const url = deployHookUrl(env);
  if (!url) return { configured: false, ok: false };

  try {
    const response = await fetch(url, { method: 'POST' });
    return {
      configured: true,
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
    };
  } catch (error) {
    return {
      configured: true,
      ok: false,
      error: error instanceof Error ? error.message : 'Deploy hook failed',
    };
  }
}

export async function onRequestPost(context: { request: Request; env: Env }) {
  try {
    const auth = await requireAdmin(context.request, context.env);
    if (auth.response) return auth.response;

    const note = (await context.request.json()) as NotePayload;
    const errors = validateNote(note);
    if (errors.length > 0) return badRequest('笔记字段校验失败', errors);

    const path = note.sha && note.path ? assertSafeNotePath(note.path) : notePath(note);
    const content = serializeNote(note);
    const message = note.sha ? `docs: update ${note.title}` : `docs: add ${note.title}`;

    if (!note.sha) {
      try {
        await getFile(context.env, auth.session!.token, path);
        return conflict('文件已存在，默认不会覆盖。请切换到编辑已有笔记。', { path });
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        if (!message.includes('Not Found')) throw error;
      }
    }

    const result = await putFile(context.env, auth.session!.token, path, content, message, note.sha);
    const deploy = await triggerDeploy(context.env);
    return json({ ok: true, path, commit: result.commit, content: result.content, deploy });
  } catch (error) {
    return serverError(error instanceof Error ? error.message : 'Save failed');
  }
}
