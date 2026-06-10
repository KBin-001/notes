import { docsRoot } from '../../_lib/constants';
import { requireAdmin } from '../../_lib/auth';
import { type Env } from '../../_lib/env';
import { getTree } from '../../_lib/github';
import { json, serverError } from '../../_lib/http';

type TreeItem = {
  path: string;
  type: string;
  sha: string;
};

export async function onRequestGet(context: { request: Request; env: Env }) {
  try {
    const auth = await requireAdmin(context.request, context.env);
    if (auth.response) return auth.response;

    const tree = await getTree(context.env, auth.session!.token);
    const files = ((tree.tree ?? []) as TreeItem[])
      .filter((item) => item.type === 'blob' && item.path.startsWith(`${docsRoot}/`) && /\.(md|mdx)$/.test(item.path))
      .map((item) => {
        const relative = item.path.slice(`${docsRoot}/`.length);
        const [category, filename] = relative.split('/');
        const slug = filename?.replace(/\.(md|mdx)$/i, '') ?? '';
        return { path: item.path, category, slug, sha: item.sha };
      })
      .sort((a, b) => a.path.localeCompare(b.path));

    return json({ ok: true, files });
  } catch (error) {
    return serverError(error instanceof Error ? error.message : 'List failed');
  }
}

