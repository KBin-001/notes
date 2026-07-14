import { requireAdmin } from '../../_lib/auth';
import { type Env } from '../../_lib/env';
import { deleteFile } from '../../_lib/github';
import { badRequest, json, serverError } from '../../_lib/http';
import { appendLog } from '../../_lib/logs';
import { assertSafeNotePath } from '../../_lib/notes';

interface DeleteBody {
  path?: string;
  sha?: string;
  title?: string;
}

export async function onRequestPost(context: { request: Request; env: Env }) {
  try {
    const auth = await requireAdmin(context.request, context.env);
    if (auth.response) return auth.response;

    const body = (await context.request.json().catch(() => ({}))) as DeleteBody;
    const path = String(body.path || '').trim();
    const sha = String(body.sha || '').trim();
    const title = String(body.title || '').trim();

    if (!path) return badRequest('缺少 path 参数');
    if (!sha) return badRequest('缺少 sha 参数（删除需要文件 blob sha）');

    // 安全校验：必须是 docsRoot 下的 md/mdx 文件
    const safePath = assertSafeNotePath(path);

    const result = await deleteFile(
      context.env,
      auth.session!.token,
      safePath,
      sha,
      `docs: delete ${title || path}`,
    );

    // 写入操作日志
    await appendLog(context.env, auth.session!.token, {
      action: 'note.delete',
      actor: auth.session!.login,
      target: safePath,
      title: title || undefined,
      commit: result?.commit?.sha,
    });

    return json({ ok: true, path: safePath, commit: result?.commit });
  } catch (error) {
    return serverError(error instanceof Error ? error.message : 'Delete failed');
  }
}
