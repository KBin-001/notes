import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';

type Frontmatter = Record<string, unknown>;

const docsRoot = join(process.cwd(), 'src', 'content', 'docs');
const validStatuses = ['整理中', '已验证', '待验证', '未完成', '废弃'];
const validVisibilities = ['public', 'private', 'draft'];
const validTopics = ['charging', 'camera', 'display_tp', 'audio', 'sensor'];
const defaultDate = '2026-06-06';
const numberedPrefix = '[一二三四五六七八九十]';
const commonHeadings = [
  '问题背景',
  '问题现象',
  '平台信息',
  '相关日志',
  '相关代码路径',
  '排查过程',
  '修改方案',
  'Diff 记录',
  '验证方法',
  '最终结论',
  '快速判断',
  '解决方案',
  '说明',
  '原因分析',
  '验证结果',
  '操作步骤',
];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : path.endsWith('.mdx') ? [path] : [];
  });
}

function cleanTitle(value: string) {
  return value
    .replace(/\\([\\`*_[\]{}()#+\-.!>])/g, '$1')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/~~(.*?)~~/g, '$1')
    .replace(/^[#>*\-\s]+/, '')
    .trim();
}

function splitFrontmatter(text: string) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return { frontmatter: {}, body: text };
  return { frontmatter: parseFrontmatter(match[1]), body: text.slice(match[0].length) };
}

function parseFrontmatter(raw: string): Frontmatter {
  const data: Frontmatter = {};
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    data[key] = parseValue(rawValue.trim());
  }
  return data;
}

function parseValue(value: string): unknown {
  if (value === '') return '';
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === '[]') return [];
  if (value.startsWith('[') && value.endsWith(']')) {
    const inner = value.slice(1, -1).trim();
    if (!inner) return [];
    return inner
      .split(',')
      .map((item) => item.trim().replace(/^["']|["']$/g, ''))
      .filter(Boolean);
  }
  return value.replace(/^["']|["']$/g, '');
}

function asStringArray(value: unknown) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  return [];
}

function quote(value: string) {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function stringifyArray(values: string[]) {
  return `[${Array.from(new Set(values)).map(quote).join(', ')}]`;
}

function inferCategory(file: string, data: Frontmatter) {
  if (typeof data.category === 'string' && data.category.trim()) return data.category.trim();
  const rel = relative(docsRoot, dirname(file)).replace(/\\/g, '/');
  return rel === '' ? 'home' : rel.split('/')[0];
}

function inferTitle(file: string, body: string, data: Frontmatter) {
  if (typeof data.title === 'string' && data.title.trim()) return cleanTitle(data.title);
  const heading = body.match(/^#\s+(.+)$/m)?.[1];
  if (heading) return cleanTitle(heading);
  return cleanTitle(basename(file, '.mdx').replace(/-/g, ' '));
}

function extractHashTags(body: string) {
  const tags = new Set<string>();
  for (const match of body.matchAll(/(^|\s)#([A-Za-z0-9_\-\u4e00-\u9fa5]+)(?=#|\s|$)/g)) {
    tags.add(match[2].toLowerCase());
  }
  return tags;
}

function stripInlineTags(line: string) {
  return line.replace(/(^|\s)(#[A-Za-z0-9_\-\u4e00-\u9fa5]+)+(?=\s|$)/g, '').trimEnd();
}

function normalizeHeadingLine(line: string) {
  const cleaned = cleanTitle(line.trim()).replace(/[：:]\s*$/, '');

  if (/^#{1,6}\s+/.test(cleaned)) {
    return cleaned.replace(/^####\s+/, '### ').replace(/^###\s+/, '## ');
  }

  const patterns = [
    new RegExp(`^(${numberedPrefix})[、.：:-]\\s*(.+)$`),
    new RegExp(`^第(${numberedPrefix})部分[：:]?\\s*(.+)$`),
    new RegExp(`^第(${numberedPrefix})步[：:]?\\s*(.+)$`),
    /^(\d+)[、.：:-]\s*(.+)$/,
  ];

  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    if (match) return `## ${(match[2] ?? match[1]).trim()}`;
  }

  if (commonHeadings.includes(cleaned)) return `## ${cleaned}`;

  return stripInlineTags(line);
}

function inferFenceLanguage(code: string) {
  const trimmed = code.trim();
  if (!trimmed) return 'text';
  if (/^(diff --git|---\s+a\/|\+\+\+\s+b\/|@@\s+-|\+|-)/m.test(trimmed)) return 'diff';
  if (/(\bobj-\$\(|^ccflags-|^KERNEL_MODULES|^LOCAL_PATH|^include \$\(|^CONFIG_[A-Z0-9_]+=)/m.test(trimmed)) return 'makefile';
  if (/(adb\s+|fastboot\s+|source\s+build\/envsetup|lunch\s+|make\s+|\.\/|^cd\s+|^getprop\b|^setprop\b|^cat\s+|^dmesg\b)/m.test(trimmed)) return 'bash';
  if (/(avc: denied|E\/|W\/|I\/|D\/|FATAL|Exception|backtrace|logcat|bootreason|\[[\s\d.]+\]\s+\w+)/i.test(trimmed)) return 'log';
  if (/(<\?xml|<\/[A-Za-z][\w:-]*>|<[A-Za-z][\w:-]*(\s|>))/.test(trimmed)) return 'xml';
  if (/([A-Za-z0-9_]+:\s*{|\bcompatible\s*=|pinctrl-|gpio|&[A-Za-z0-9_]+\s*{)/.test(trimmed)) return 'dts';
  if (/^\s*(#include|int\s+|static\s+|struct\s+|void\s+|return\s+|if\s*\()/m.test(trimmed)) return 'c';
  return 'text';
}

function normalizeCodeFences(body: string) {
  return body.replace(/```([A-Za-z0-9_-]*)\r?\n([\s\S]*?)```/g, (_match, lang: string, code: string) => {
    const inferred = inferFenceLanguage(code);
    const current = lang.trim();
    const language = inferred !== 'text' ? inferred : current || inferred;
    return `\`\`\`${language}\n${code.replace(/\s+$/, '')}\n\`\`\``;
  });
}

function splitInlineFences(body: string) {
  return body
    .split('\n')
    .flatMap((line) => {
      const marker = line.indexOf('```');
      if (marker <= 0) return [line];

      const before = line.slice(0, marker).trimEnd();
      const after = line.slice(marker).trim();
      if (!before || !after.startsWith('```')) return [line];

      return [before, after];
    })
    .join('\n');
}

function closeFencesBeforeHeadings(body: string) {
  const lines = body.split('\n');
  const next: string[] = [];
  let inside = false;

  for (const line of lines) {
    if (inside && /^#{1,3}\s+/.test(line)) {
      next.push('```');
      inside = false;
    }

    if (/^```[A-Za-z0-9_-]*\s*$/.test(line.trim())) {
      inside = !inside;
    }

    next.push(line);
  }

  if (inside) next.push('```');
  return next.join('\n');
}

function canonicalizeFenceTransitions(body: string) {
  const next: string[] = [];
  let inside = false;

  for (const line of body.split('\n')) {
    const fence = line.trim().match(/^```([A-Za-z0-9_-]*)$/);
    if (!fence) {
      next.push(line);
      continue;
    }

    const lang = fence[1];
    if (!inside) {
      inside = true;
      next.push(line);
      continue;
    }

    if (!lang) {
      inside = false;
      next.push(line);
      continue;
    }

    next.push('```');
    next.push(line);
    inside = true;
  }

  if (inside) next.push('```');
  return next.join('\n');
}

function convertLooseBacktickBlocks(body: string) {
  const lines = body.split('\n');
  const next: string[] = [];
  let buffer: string[] = [];

  function flush() {
    if (buffer.length === 0) return;
    const code = buffer.join('\n');
    next.push(`\`\`\`${inferFenceLanguage(code)}`, code, '```');
    buffer = [];
  }

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('```')) {
      flush();
      next.push(line);
      continue;
    }

    if (/^`[^`]+`$/.test(trimmed) && !trimmed.includes(' ')) {
      buffer.push(trimmed.slice(1, -1));
      continue;
    }

    if (/^`[\s\S]*$/.test(trimmed) && !trimmed.endsWith('`')) {
      flush();
      next.push(line.replace(/^`/, '```text'));
      continue;
    }

    flush();
    next.push(line);
  }

  flush();
  return next.join('\n');
}

function normalizeBody(_file: string, body: string, title: string) {
  let normalized = body.replace(/\r\n/g, '\n').trim();
  normalized = normalized.replace(/^#\s+(.+)$/m, `# ${title}`);

  if (!/^#\s+/m.test(normalized)) {
    normalized = `# ${title}\n\n${normalized}`;
  }

  normalized = normalized
    .split('\n')
    .map(normalizeHeadingLine)
    .join('\n');

  normalized = splitInlineFences(normalized);
  normalized = canonicalizeFenceTransitions(normalized);
  normalized = closeFencesBeforeHeadings(normalized);
  normalized = convertLooseBacktickBlocks(normalized);
  normalized = splitInlineFences(normalized);
  normalized = canonicalizeFenceTransitions(normalized);
  normalized = closeFencesBeforeHeadings(normalized);
  normalized = normalizeCodeFences(normalized);
  normalized = splitInlineFences(normalized);
  normalized = canonicalizeFenceTransitions(normalized);
  normalized = closeFencesBeforeHeadings(normalized);

  const hasSubheading = /^##\s+/m.test(normalized);
  if (!hasSubheading) {
    const lines = normalized.split('\n');
    const h1Index = lines.findIndex((line) => /^#\s+/.test(line));
    if (h1Index >= 0) {
      lines.splice(h1Index + 1, 0, '', '## 笔记内容');
      normalized = lines.join('\n');
    }
  }

  return `${normalized.trim()}\n`;
}

function normalizeFile(file: string) {
  const original = readFileSync(file, 'utf8');
  const { frontmatter, body } = splitFrontmatter(original);
  const title = inferTitle(file, body, frontmatter);
  const category = inferCategory(file, frontmatter);
  const hashTags = extractHashTags(body);
  const tags = new Set([...asStringArray(frontmatter.tags), ...hashTags].map((tag) => tag.replace(/^#+|#+$/g, '').toLowerCase()).filter(Boolean));
  const topics = asStringArray(frontmatter.topics).filter((topic) => validTopics.includes(topic));
  const status = typeof frontmatter.status === 'string' && validStatuses.includes(frontmatter.status) ? frontmatter.status : '整理中';
  const visibility =
    typeof frontmatter.visibility === 'string' && validVisibilities.includes(frontmatter.visibility) ? frontmatter.visibility : 'public';
  const sensitive = typeof frontmatter.sensitive === 'boolean' ? frontmatter.sensitive : true;
  const date = typeof frontmatter.date === 'string' && frontmatter.date.trim() ? frontmatter.date : defaultDate;
  const updated = typeof frontmatter.updated === 'string' && frontmatter.updated.trim() ? frontmatter.updated : date;
  const description =
    typeof frontmatter.description === 'string' && frontmatter.description.trim()
      ? cleanTitle(frontmatter.description)
      : `记录 ${title} 的问题现象、排查过程、修改方案和验证方法。`;

  const normalizedBody = normalizeBody(file, body, title);
  const next = `---\ntitle: ${quote(title)}\ndescription: ${quote(description)}\ncategory: ${quote(category)}\ntags: ${stringifyArray(Array.from(tags))}\ntopics: ${stringifyArray(topics)}\nvisibility: ${quote(visibility)}\nsensitive: ${sensitive}\nstatus: ${quote(status)}\ndate: ${quote(date)}\nupdated: ${quote(updated)}\n---\n\n${normalizedBody}`;

  if (next !== original) {
    writeFileSync(file, next, 'utf8');
    return true;
  }
  return false;
}

if (!existsSync(docsRoot)) {
  console.error(`内容目录不存在：${docsRoot}`);
  process.exit(1);
}

const files = walk(docsRoot);
const changed = files.filter(normalizeFile);
console.log(`normalize-notes: checked ${files.length} files, changed ${changed.length} files.`);
changed.forEach((file) => console.log(`- ${relative(process.cwd(), file)}`));
