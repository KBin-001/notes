import { docsRoot } from '../../_lib/constants';
import { requireAdmin } from '../../_lib/auth';
import { type Env } from '../../_lib/env';
import { decodeBase64Content, getFile, getTree } from '../../_lib/github';
import { json, serverError } from '../../_lib/http';
import { parseNote } from '../../_lib/notes';

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

    const filesWithTitle = await Promise.all(
      files.map(async (file) => {
        try {
          const githubFile = await getFile(context.env, auth.session!.token, file.path);
          const text = decodeBase64Content(githubFile.content);
          const note = parseNote(text, file.path.split('/').pop() ?? '');
          const title = note.title || file.slug;
          return {
            ...file,
            title,
            status: note.status,
            visibility: note.visibility,
            label: `${title} · ${file.category}/${file.slug}`,
          };
        } catch {
          return {
            ...file,
            title: file.slug,
            status: '',
            visibility: '',
            label: `${file.slug} · ${file.category}/${file.slug}`,
          };
        }
      })
    );

    filesWithTitle.sort((a, b) => `${a.category}/${a.title}`.localeCompare(`${b.category}/${b.title}`, 'zh-CN'));

    return json({ ok: true, files: filesWithTitle });
  } catch (error) {
    return serverError(error instanceof Error ? error.message : 'List failed');
  }
}
