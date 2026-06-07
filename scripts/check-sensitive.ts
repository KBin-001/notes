import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const docsRoot = join(process.cwd(), 'src', 'content', 'docs');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : path.endsWith('.mdx') ? [path] : [];
  });
}

function frontmatterOf(text: string) {
  return text.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? '';
}

function readField(frontmatter: string, key: string) {
  return frontmatter.match(new RegExp(`^${key}:\\s*["']?(.+?)["']?\\s*$`, 'm'))?.[1]?.trim();
}

const sensitivePublicFiles = walk(docsRoot).filter((file) => {
  const frontmatter = frontmatterOf(readFileSync(file, 'utf8'));
  const visibility = readField(frontmatter, 'visibility') ?? 'public';
  const sensitive = readField(frontmatter, 'sensitive') ?? 'true';
  return visibility === 'public' && sensitive === 'true';
});

if (sensitivePublicFiles.length > 0) {
  console.warn(`[sensitive] ${sensitivePublicFiles.length} 篇 public 文章仍标记 sensitive: true，请部署前确认已脱敏：`);
  for (const file of sensitivePublicFiles) {
    console.warn(`- ${relative(process.cwd(), file).replace(/\\/g, '/')}`);
  }
}
