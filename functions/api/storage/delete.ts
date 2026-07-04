import { docsRoot } from '../../_lib/constants';
import { requireAdmin } from '../../_lib/auth';
import { type Env } from '../../_lib/env';
import { deleteFile } from '../../_lib/github';
import { badRequest, json, serverError } from '../../_lib/http';

interface DeleteBody {
  path?: string;
  sha?: string;
}

export async function onRequestPost(context: { request: Request; env: Env }) {
  try {
    const auth = await requireAdmin(context.request, context.env);
    if (auth.response) return auth.response;

    const body = (await context.request.json().catch(() => ({}))) as DeleteBody;
    const relativePath = String(body.path || '').trim();
    const sha = String(body.sha || '').trim();

    if (!relativePath) return badRequest('缺少 path 参数');
    if (!relativePath.startsWith('images/') && !relativePath.includes('/images/')) {
      return badRequest('只能删除 images/ 目录下的资源');
    }
    // 防止路径穿越
    if (relativePath.includes('..')) return badRequest('非法路径');

    const fullPath = `${docsRoot}/${relativePath}`;
    if (!sha) return badRequest('缺少 sha 参数（删除需要文件 blob sha）');

    const result = await deleteFile(
      context.env,
      auth.session!.token,
      fullPath,
      sha,
      `chore: delete unused image ${relativePath}`,
    );

    return json({ ok: true, path: relativePath, commit: result?.commit });
  } catch (error) {
    return serverError(error instanceof Error ? error.message : 'Delete failed');
  }
}
