import matter from 'gray-matter';
import { allowedCategories, allowedStatuses, allowedTopics, allowedVisibilities, docsRoot } from './constants';

export type NotePayload = {
  title: string;
  description: string;
  category: string;
  slug: string;
  tags: string[];
  topics: string[];
  visibility: string;
  sensitive: boolean;
  status: string;
  date: string;
  updated: string;
  body: string;
  sha?: string;
  path?: string;
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

export function slugify(value: string) {
  const ascii = value
    .replace(/\[[^\]]+\]/g, ' ')
    .toLowerCase()
    .match(/[a-z0-9]+/g);
  if (ascii?.length) return ascii.join('-');
  return `note-${today().replace(/-/g, '')}`;
}

export function cleanTitle(value: string) {
  return value
    .replace(/\\+"/g, '"')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^#+\s*/, '')
    .trim();
}

export function extractHashTags(body: string) {
  const tags = new Set<string>();
  for (const match of body.matchAll(/(^|\s)#([A-Za-z0-9_\-\u4e00-\u9fa5]+)(?=#|\s|$)/g)) {
    tags.add(match[2].toLowerCase());
  }
  return Array.from(tags);
}

function asStringArray(value: unknown) {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  if (typeof value === 'string' && value.trim()) {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function normalizeDate(value: unknown, fallback = today()) {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) return value.toISOString().slice(0, 10);
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  return fallback;
}

export function parseNote(text: string, filename = ''): NotePayload & { warnings: string[] } {
  const parsed = matter(text);
  const body = parsed.content.trimStart();
  const data = parsed.data ?? {};
  const heading = body.match(/^#\s+(.+)$/m)?.[1];
  const title = cleanTitle(String(data.title || heading || filename.replace(/\.(md|mdx)$/i, '') || '未命名笔记'));
  const category = allowedCategories.includes(data.category) ? data.category : 'mtk';
  const tags = Array.from(new Set([...asStringArray(data.tags), ...extractHashTags(body)].map((tag) => tag.replace(/^#+|#+$/g, '').toLowerCase())));
  const topics = asStringArray(data.topics).filter((topic) => allowedTopics.includes(topic as any));
  const date = normalizeDate(data.date);
  const updated = normalizeDate(data.updated, date);
  const warnings: string[] = [];

  if (!/^##\s+/m.test(body)) {
    warnings.push('正文没有二级标题，右侧目录可能不会显示。建议至少添加一个 ## 小节。');
  }

  return {
    title,
    description:
      typeof data.description === 'string' && data.description.trim()
        ? cleanTitle(data.description)
        : `记录 ${title} 的问题现象、排查过程、修改方案和验证方法。`,
    category,
    slug: slugify(String(data.slug || title)),
    tags,
    topics,
    visibility: allowedVisibilities.includes(data.visibility) ? data.visibility : 'public',
    sensitive: typeof data.sensitive === 'boolean' ? data.sensitive : true,
    status: allowedStatuses.includes(data.status) ? data.status : '整理中',
    date,
    updated,
    body: body || `# ${title}\n\n## 笔记内容\n\n待补充。\n`,
    warnings,
  };
}

export function validateNote(note: NotePayload) {
  const errors: string[] = [];
  if (!note.title.trim()) errors.push('title 不能为空');
  if (!allowedCategories.includes(note.category as any)) errors.push('category 不合法');
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/.test(note.slug)) errors.push('slug 只能包含小写字母、数字和短横线');
  if (!allowedVisibilities.includes(note.visibility as any)) errors.push('visibility 不合法');
  if (!allowedStatuses.includes(note.status as any)) errors.push('status 不合法');
  for (const topic of note.topics) {
    if (!allowedTopics.includes(topic as any)) errors.push(`topic 不合法：${topic}`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(note.date)) errors.push('date 必须是 YYYY-MM-DD');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(note.updated)) errors.push('updated 必须是 YYYY-MM-DD');
  if (!note.body.trim()) errors.push('body 不能为空');
  return errors;
}

export function notePath(note: Pick<NotePayload, 'category' | 'slug'>) {
  const path = `${docsRoot}/${note.category}/${note.slug}.mdx`;
  return assertSafeNotePath(path);
}

export function assertSafeNotePath(path: string) {
  if (!path.startsWith(`${docsRoot}/`) || path.includes('..') || path.includes('\\')) {
    throw new Error('目标路径不合法');
  }
  if (!/\.(md|mdx)$/.test(path)) {
    throw new Error('目标文件必须是 Markdown 或 MDX');
  }
  return path;
}

export function serializeNote(note: NotePayload) {
  const body = note.body.trimEnd() + '\n';
  return matter.stringify(body, {
    title: note.title,
    description: note.description,
    category: note.category,
    tags: note.tags,
    topics: note.topics,
    visibility: note.visibility,
    sensitive: note.sensitive,
    status: note.status,
    date: note.date,
    updated: note.updated,
  });
}
