import { allowedImageExtensions, docsRoot } from '../../_lib/constants';
import { requireAdmin } from '../../_lib/auth';
import { type Env } from '../../_lib/env';
import { decodeBase64Content, getFile, getTree } from '../../_lib/github';
import { json, serverError } from '../../_lib/http';

type TreeItem = {
  path: string;
  type: string;
  sha: string;
  size?: number;
};

const imageExtRe = new RegExp(`\\.(${allowedImageExtensions.join('|')})$`, 'i');

interface ImageEntry {
  path: string;
  sha: string;
  size: number;
  category: string;
  name: string;
  references: number;
  referencedBy: string[];
}

interface StorageStats {
  total: number;
  totalSize: number;
  referenced: number;
  unreferenced: number;
  unreferencedSize: number;
  byCategory: Record<string, { count: number; size: number }>;
}

/** 收集所有 markdown 文件并扫描引用 */
async function collectReferences(
  env: Env,
  token: string,
  mdFiles: TreeItem[],
): Promise<Map<string, { count: number; files: string[] }>> {
  const refMap = new Map<string, { count: number; files: string[] }>();

  await Promise.all(
    mdFiles.map(async (file) => {
      try {
        const ghFile = await getFile(env, token, file.path);
        const text = decodeBase64Content(ghFile.content);
        // 匹配 ![alt](./images/...) 或 ![alt](images/...) 或裸路径 ./images/xxx/yyy.png
        const re = /!\[[^\]]*\]\(([^)]+)\)|\((\.\/)?images\/[^)]+\)/g;
        const matches = text.matchAll(re);
        for (const m of matches) {
          const raw = m[1] || m[0].replace(/^\(|\)$/g, '');
          // 归一化为相对于 docsRoot 的路径
          const normalized = normalizeImageRef(raw, file.path);
          if (!normalized) continue;
          const entry = refMap.get(normalized) || { count: 0, files: [] };
          entry.count += 1;
          if (!entry.files.includes(file.path)) entry.files.push(file.path);
          refMap.set(normalized, entry);
        }
      } catch {
        /* ignore single-file failures */
      }
    }),
  );
  return refMap;
}

function normalizeImageRef(ref: string, mdFilePath: string): string | null {
  // 去掉 query/hash
  const clean = ref.split('#')[0].split('?')[0].trim();
  if (!clean) return null;
  // 处理绝对 docs 内部路径（/src/content/docs/...）
  if (clean.startsWith(`${docsRoot}/`)) {
    return clean.slice(`${docsRoot}/`.length);
  }
  // 处理相对路径 ./images/xxx/yyy.png 或 images/xxx/yyy.png
  const mdDir = mdFilePath.slice(0, Math.max(0, mdFilePath.lastIndexOf('/')));
  const stripped = clean.replace(/^\.\//, '');
  const candidate = stripped.startsWith('images/') ? `${mdDir}/${stripped}` : stripped;
  if (candidate.startsWith(`${docsRoot}/`)) return candidate.slice(`${docsRoot}/`.length);
  return null;
}

export async function onRequestGet(context: { request: Request; env: Env }) {
  try {
    const auth = await requireAdmin(context.request, context.env);
    if (auth.response) return auth.response;

    const tree = await getTree(context.env, auth.session!.token);
    const items = (tree.tree ?? []) as TreeItem[];

    const imageFiles = items.filter((i) => i.type === 'blob' && i.path.startsWith(`${docsRoot}/`) && imageExtRe.test(i.path));
    const mdFiles = items.filter((i) => i.type === 'blob' && i.path.startsWith(`${docsRoot}/`) && /\.(md|mdx)$/.test(i.path));

    const refMap = await collectReferences(context.env, auth.session!.token, mdFiles);

    const images: ImageEntry[] = imageFiles
      .map((img) => {
        const relative = img.path.slice(`${docsRoot}/`.length);
        const [category, ...rest] = relative.split('/');
        const name = rest[rest.length - 1] || '';
        const ref = refMap.get(relative);
        return {
          path: relative,
          sha: img.sha,
          size: img.size ?? 0,
          category: category || '',
          name,
          references: ref?.count ?? 0,
          referencedBy: ref?.files ?? [],
        };
      })
      .sort((a, b) => (b.references - a.references) || a.path.localeCompare(b.path));

    // 聚合统计
    const stats: StorageStats = {
      total: images.length,
      totalSize: images.reduce((sum, i) => sum + i.size, 0),
      referenced: images.filter((i) => i.references > 0).length,
      unreferenced: images.filter((i) => i.references === 0).length,
      unreferencedSize: images.filter((i) => i.references === 0).reduce((sum, i) => sum + i.size, 0),
      byCategory: {},
    };
    for (const img of images) {
      const cat = img.category || '(root)';
      const cur = stats.byCategory[cat] || { count: 0, size: 0 };
      cur.count += 1;
      cur.size += img.size;
      stats.byCategory[cat] = cur;
    }

    return json({ ok: true, images, stats });
  } catch (error) {
    return serverError(error instanceof Error ? error.message : 'Storage list failed');
  }
}
