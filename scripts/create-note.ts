import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const validStatuses = ['整理中', '已验证', '待验证', '未完成', '废弃'];
const validTopics = ['charging', 'camera', 'display_tp', 'audio', 'sensor'];

function readFlag(name: string) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return '';
  return process.argv[index + 1] ?? '';
}

function slugify(title: string) {
  const asciiWords = title
    .replace(/\[[^\]]+\]/g, ' ')
    .toLowerCase()
    .match(/[a-z0-9]+/g);

  if (asciiWords && asciiWords.length > 0) {
    return asciiWords.join('-').replace(/^-+|-+$/g, '');
  }

  return `note-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;
}

const category = readFlag('category');
const title = readFlag('title');
const status = readFlag('status') || '整理中';
const topics = readFlag('topics')
  .split(',')
  .map((topic) => topic.trim())
  .filter(Boolean);

if (!category || !title) {
  console.error('用法：npm run new:note -- --category mtk --title "[MTK] 霍尔驱动 hall"');
  process.exit(1);
}

if (!validStatuses.includes(status)) {
  console.error(`status 只支持：${validStatuses.join('、')}`);
  process.exit(1);
}

const invalidTopics = topics.filter((topic) => !validTopics.includes(topic));
if (invalidTopics.length > 0) {
  console.error(`topics 只支持：${validTopics.join('、')}`);
  process.exit(1);
}

const slug = readFlag('slug') || slugify(title);
const now = new Date();
const today = [
  now.getFullYear(),
  String(now.getMonth() + 1).padStart(2, '0'),
  String(now.getDate()).padStart(2, '0'),
].join('-');
const targetDir = join(process.cwd(), 'src', 'content', 'docs', category);
const targetFile = join(targetDir, `${slug}.mdx`);

if (existsSync(targetFile)) {
  console.error(`文件已存在，未覆盖：${targetFile}`);
  process.exit(1);
}

mkdirSync(targetDir, { recursive: true });

const content = `---
title: "${title.replace(/"/g, '\\"')}"
description: "记录 ${title.replace(/"/g, '\\"')} 的问题现象、排查过程、修改方案和验证方法。"
category: "${category}"
tags: []
topics: [${topics.map((topic) => `"${topic}"`).join(', ')}]
visibility: "public"
sensitive: true
status: "${status}"
date: "${today}"
updated: "${today}"
---

# ${title}

## 1. 问题现象

待补充。

## 2. 平台信息

待补充。

## 3. 相关日志

\`\`\`log
待补充关键日志。
\`\`\`

## 4. 相关代码路径

\`\`\`text
待补充代码路径。
\`\`\`

## 5. 排查过程

待补充。

## 6. 修改方案

待补充。

## 7. Diff 记录

\`\`\`diff
# 待补充 diff。
\`\`\`

## 8. 验证方法

待补充。

## 9. 最终结论

待补充。

## 10. 快速判断

待补充。
`;

writeFileSync(targetFile, content, 'utf8');
console.log(`创建成功：${targetFile}`);
