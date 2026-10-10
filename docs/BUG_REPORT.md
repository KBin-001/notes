# 知识库项目 Bug 检测报告

> 检测日期：2026-07-06
> 检测范围：前端组件、客户端脚本、后端 API（Cloudflare Functions）、样式系统、构建配置
> 检测方式：全量代码审查（未运行项目）

---

## 目录

- [P0 — 严重（安全漏洞 / 数据丢失）](#p0--严重安全漏洞--数据丢失)
  - [P0-1 XSS 漏洞：RandomReviewCard innerHTML 注入未转义数据](#p0-1-xss-漏洞randomreviewcard-innerhtml-注入未转义数据)
  - [P0-2 XSS 漏洞：preview.ts 预览渲染器未过滤危险 URL 协议](#p0-2-xss-漏洞previewts-预览渲染器未过滤危险-url-协议)
  - [P0-3 并发写入导致日志数据丢失：appendLog TOCTOU 竞态](#p0-3-并发写入导致日志数据丢失appendlog-toctou-竞态)
- [P1 — 高（功能缺陷 / 性能问题）](#p1--高功能缺陷--性能问题)
  - [P1-1 N+1 API 调用：notes/list.ts 逐文件拉取内容](#p1-1-n1-api-调用noteslistts-逐文件拉取内容)
  - [P1-2 N+1 API 调用：storage/list.ts 同样逐文件拉取](#p1-2-n1-api-调用storagelistts-同样逐文件拉取)
  - [P1-3 主题硬编码 Tailwind 颜色类，Claude 浅色主题下显示错误](#p1-3-主题硬编码-tailwind-颜色类claude-浅色主题下显示错误)
  - [P1-4 package.json 核心依赖使用 "latest" 版本](#p1-4-packagejson-核心依赖使用-latest-版本)
  - [P1-5 check-sensitive.ts 只扫描 .mdx 文件，遗漏 .md 文件](#p1-5-checksensitivets-只扫描-mdx-文件遗漏-md-文件)
- [P2 — 中（代码质量 / 维护性）](#p2--中代码质量--维护性)
  - [P2-1 TableOfContents.astro 包含乱码字符串](#p2-1-tableofcontentsastro-包含乱码字符串)
  - [P2-2 appendLog 重复读取日志文件](#p2-2-appendlog-重复读取日志文件)
  - [P2-3 getSiteConfig 模块级缓存导致 dev 模式下不更新](#p2-3-getsiteconfig-模块级缓存导致-dev-模式下不更新)
  - [P2-4 encodeBinaryBase64 使用 O(n²) 字符串拼接](#p2-4-encodebinarybase64-使用-on²-字符串拼接)
  - [P2-5 me.ts 每次请求都调用 GitHub API 验证用户](#p2-5-mets-每次请求都调用-github-api-验证用户)
- [P3 — 低（优化 / 体验细节）](#p3--低优化--体验细节)
  - [P3-1 Shiki 代码高亮主题硬编码为 github-dark](#p3-1-shiki-代码高亮主题硬编码为-github-dark)
  - [P3-2 ContributionHeatmap "查看整理统计"链接指向充电专题](#p3-2-contributionheatmap-查看整理统计链接指向充电专题)
  - [P3-3 知识工作台使用硬编码 Mock 数据](#p3-3-知识工作台使用硬编码-mock-数据)
  - [P3-4 hash-scroll.ts 使用三次超时重试滚动](#p3-4-hash-scrollts-使用三次超时重试滚动)
  - [P3-5 astro.config.mjs 未配置 site URL](#p3-5-astroconfigmjs-未配置-site-url)
  - [P3-6 SearchDialog.astro 搜索结果使用 innerHTML 渲染](#p3-6-searchdialogastro-搜索结果使用-innerhtml-渲染)
- [汇总统计](#汇总统计)
- [建议修复顺序](#建议修复顺序)

---

## P0 — 严重（安全漏洞 / 数据丢失）

### P0-1 XSS 漏洞：RandomReviewCard innerHTML 注入未转义数据

| 属性 | 值 |
|------|-----|
| **文件** | `src/components/KnowledgeWorkspace/RandomReviewCard.astro` |
| **行号** | 58-66 |
| **类型** | 存储型 XSS（潜在） |
| **状态** | 未修复 |

#### 问题描述

`RandomReviewCard.astro` 的前端脚本在渲染随机复习结果时，使用 `innerHTML` 直接拼接未转义的字符串：

```javascript
preview.innerHTML = `
  <div class="kw-review-item">
    <a class="kw-review-link" href="${pick.href}">
      <span class="kw-review-tag">${pick.category}</span>
      <span class="kw-review-title">${pick.title}</span>
      <span class="kw-review-time">${pick.time}</span>
    </a>
  </div>
`;
```

`pick.href`、`pick.title`、`pick.category`、`pick.time` 直接拼接进 HTML 字符串，没有任何 HTML 转义处理。

#### 影响

- 当前数据来自 `knowledgeMock.ts`（硬编码），风险较低
- 一旦后续接入后端 API（如笔记标题从用户输入获取），即变成真正的 XSS 攻击向量
- 即使是 mock 数据，若标题包含 `<`、`"` 等字符也会破坏 HTML 结构
- 项目中已有 `escapeHtml` 函数（`src/scripts/admin/shared.ts`），但此处未使用

#### 建议修复方案

使用 `document.createElement` 构建 DOM 节点，或对所有动态值调用 `escapeHtml`：

```javascript
const item = document.createElement('div');
item.className = 'kw-review-item';

const link = document.createElement('a');
link.className = 'kw-review-link';
link.href = pick.href;

const tag = document.createElement('span');
tag.className = 'kw-review-tag';
tag.textContent = pick.category;

const title = document.createElement('span');
title.className = 'kw-review-title';
title.textContent = pick.title;

const time = document.createElement('span');
time.className = 'kw-review-time';
time.textContent = pick.time;

link.append(tag, title, time);
item.append(link);
preview.replaceChildren(item);
```

---

### P0-2 XSS 漏洞：preview.ts 预览渲染器未过滤危险 URL 协议

| 属性 | 值 |
|------|-----|
| **文件** | `src/scripts/admin/preview.ts` |
| **行号** | 33-42 |
| **类型** | 自 XSS |
| **状态** | 未修复 |

#### 问题描述

`renderInline` 函数虽然先调用了 `escapeHtml` 对文本进行转义，但在生成 `<a>` 和 `<img>` 标签时，URL 值直接插入 `href` / `src` 属性中，未过滤 `javascript:` 等危险协议：

```javascript
// 图片 ![alt](url)
out = out.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g, (_, alt, url, title) => {
  return `<img src="${url}" alt="${alt}"${t} />`;
});

// 链接 [text](url)
out = out.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g, (_, label, url, title) => {
  return `<a href="${url}"${t} target="_blank" rel="noopener noreferrer">${label}</a>`;
});
```

`javascript:alert(1)` 不含 HTML 特殊字符，`escapeHtml` 转义后仍然存活，渲染后产生：

```html
<a href="javascript:alert(1)" target="_blank">click</a>
```

#### 影响

- 管理后台预览面板中的自 XSS
- 虽然仅管理员可见，但预览内容来自上传的 Markdown 文件
- 攻击者可构造恶意 `.md` 文件诱导管理员上传预览

#### 建议修复方案

在 URL 插入 `href` / `src` 前进行协议白名单校验：

```javascript
function sanitizeUrl(url: string): string {
  const trimmed = url.trim();
  if (/^(https?:|mailto:|tel:|\/|\.\/|\.\.\/|#)/i.test(trimmed)) {
    return trimmed;
  }
  return '#'; // 阻止 javascript: data: 等危险协议
}
```

---

### P0-3 并发写入导致日志数据丢失：appendLog TOCTOU 竞态

| 属性 | 值 |
|------|-----|
| **文件** | `functions/_lib/logs.ts` |
| **行号** | 55-82 |
| **类型** | 竞态条件 / 数据丢失 |
| **状态** | 未修复 |

#### 问题描述

`appendLog` 函数采用「先读后写」模式，存在 TOCTOU（Time-of-Check-to-Time-of-Use）竞态：

```javascript
export async function appendLog(env, token, entry) {
  try {
    const current = await readLogs(env, token);  // ① 读取日志
    const newEntry = { ... };
    const entries = [newEntry, ...current.entries].slice(0, MAX_ENTRIES);
    const content = JSON.stringify(next, null, 2) + '\n';
    let sha;
    try {
      const file = await getFile(env, token, LOGS_PATH);  // ② 再次读取拿 sha
      sha = file.sha;
    } catch { /* 新文件 */ }
    await putFile(env, token, LOGS_PATH, content, ..., sha);  // ③ 写入
  } catch { /* 静默 */ }
}
```

#### 竞态场景

若两个请求并发执行：

| 步骤 | 请求 A | 请求 B |
|------|--------|--------|
| ① | 读取 entries `[E1, E2]`，sha `S1` | — |
| ① | — | 读取 entries `[E1, E2]`（A 还没写入） |
| ② | 读取 sha `S1` | — |
| ③ | 写入 `[E3, E1, E2]`，sha 变为 `S2` | — |
| ② | — | 读取 sha `S2` |
| ③ | — | 写入 `[E4, E1, E2]`（基于旧的 entries） → **E3 被覆盖** |

或：

| 步骤 | 请求 A | 请求 B |
|------|--------|--------|
| ① | 读取 entries `[E1, E2]` | — |
| ① | — | 读取 entries `[E1, E2]` |
| ② | 读取 sha `S1` | — |
| ② | — | 读取 sha `S1` |
| ③ | 写入成功，sha 变为 `S2` | — |
| ③ | — | 用 sha `S1` 写入 → **GitHub 返回 409 冲突，E4 丢失** |

#### 影响

- 操作日志静默丢失，审计记录不完整
- 由于 `catch` 块静默处理，错误不会被发现

#### 建议修复方案

1. `readLogs` 返回 `sha` 字段，消除 ② 的重复读取
2. 对 409 冲突实现指数退避重试（最多 3 次）
3. 考虑使用 GitHub Git Data API（原子化提交）替代 Contents API

---

## P1 — 高（功能缺陷 / 性能问题）

### P1-1 N+1 API 调用：notes/list.ts 逐文件拉取内容

| 属性 | 值 |
|------|-----|
| **文件** | `functions/api/notes/list.ts` |
| **行号** | 30-54 |
| **类型** | 性能问题 |
| **状态** | 未修复 |

#### 问题描述

```javascript
const filesWithTitle = await Promise.all(
  files.map(async (file) => {
    const githubFile = await getFile(context.env, auth.session!.token, file.path);
    const text = decodeBase64Content(githubFile.content);
    const note = parseNote(text, ...);
    // ...
  })
);
```

先通过 `getTree` 拿到文件列表（1 次调用），然后对每个 Markdown 文件单独调用 `getFile` 获取内容。若有 N 篇笔记则产生 N+1 次 GitHub API 调用。

#### 影响

- 50 篇笔记 = 51 次 API 请求，加载时间可能超过 10 秒
- GitHub API 限速 5000 次/小时，频繁操作易触发
- `Promise.all` 并发请求可能触发 GitHub 的二级并发限速

#### 建议修复方案

使用 GitHub Git Data API 一次性获取整个 tree 的 blob 内容，或使用 GraphQL API 批量查询。

---

### P1-2 N+1 API 调用：storage/list.ts 同样逐文件拉取

| 属性 | 值 |
|------|-----|
| **文件** | `functions/api/storage/list.ts` |
| **行号** | 43-66 |
| **类型** | 性能问题 |
| **状态** | 未修复 |

#### 问题描述

```javascript
await Promise.all(
  mdFiles.map(async (file) => {
    const ghFile = await getFile(env, token, file.path);
    const text = decodeBase64Content(ghFile.content);
    // 扫描图片引用...
  })
);
```

与 P1-1 相同的 N+1 模式，扫描所有 Markdown 文件以统计图片引用情况。

#### 影响

同 P1-1。

#### 建议修复方案

同 P1-1，使用批量 API 或缓存机制。

---

### P1-3 主题硬编码 Tailwind 颜色类，Claude 浅色主题下显示错误

| 属性 | 值 |
|------|-----|
| **文件** | `src/scripts/topic-context.ts` |
| **行号** | 5-16 |
| **类型** | 主题兼容性 |
| **状态** | 未修复 |

#### 问题描述

```javascript
function setActiveLink(link: Element) {
  link.classList.add('is-active', 'bg-cyan-400/10', 'text-cyan-100', 'ring-1', 'ring-cyan-400/20');
  link.classList.remove('text-slate-400');
}

function setActiveSummary(summary: Element) {
  summary.classList.add('is-active', 'bg-slate-900', 'text-white');
  summary.classList.remove('text-slate-500', 'text-slate-400');
}
```

项目使用 CSS 变量（`--kb-accent` 等）实现双主题（dark / claude），但此脚本硬编码了 Tailwind 默认色板：
- `text-cyan-100` 在浅色背景下几乎不可见
- `bg-slate-900` 在 Claude 浅色主题下会产生突兀的深色色块
- `text-white` 在浅色主题下不可读

#### 影响

Claude 主题下，通过 `?topic=` 访问笔记时，侧边栏高亮状态视觉异常。

#### 建议修复方案

移除硬编码颜色类，改用 CSS 变量驱动的类名（如已有的 `is-active` + CSS 中的 `.sidebar-link.is-active` 样式）。

---

### P1-4 package.json 核心依赖使用 "latest" 版本

| 属性 | 值 |
|------|-----|
| **文件** | `package.json` |
| **行号** | 14-20 |
| **类型** | 依赖管理 |
| **状态** | 未修复 |

#### 问题描述

```json
"dependencies": {
    "@astrojs/mdx": "latest",
    "@lucide/astro": "latest",
    "@tailwindcss/postcss": "latest",
    "astro": "latest",
    "tailwindcss": "latest"
}
```

5 个核心依赖使用 `"latest"`。

#### 影响

- 构建不可复现（不同时间 `npm install` 结果不同）
- 依赖 breaking change 可能在任何时候破坏构建
- `package-lock.json` 存在一定缓解作用，但 `npm install`（非 `npm ci`）仍会尝试更新

#### 建议修复方案

将所有 `"latest"` 替换为 `package-lock.json` 中锁定的具体版本号。

---

### P1-5 check-sensitive.ts 只扫描 .mdx 文件，遗漏 .md 文件

| 属性 | 值 |
|------|-----|
| **文件** | `scripts/check-sensitive.ts` |
| **行号** | 9 |
| **类型** | 安全检查遗漏 |
| **状态** | 未修复 |

#### 问题描述

```javascript
return statSync(path).isDirectory() ? walk(path) : path.endsWith('.mdx') ? [path] : [];
```

Content Collection 配置接受 `**/*.{md,mdx}`（见 `content.config.ts`），但脱敏检查脚本只扫描 `.mdx` 文件。

#### 影响

`.md` 格式的公开笔记若标记 `sensitive: true`，构建时不会输出警告，可能泄露敏感信息。

#### 建议修复方案

```javascript
return statSync(path).isDirectory() ? walk(path) : /\.(md|mdx)$/.test(path) ? [path] : [];
```

---

## P2 — 中（代码质量 / 维护性）

### P2-1 TableOfContents.astro 包含乱码字符串

| 属性 | 值 |
|------|-----|
| **文件** | `src/components/TableOfContents.astro` |
| **行号** | 15 |
| **类型** | 编码问题 |
| **状态** | 未修复 |

#### 问题描述

```javascript
return heading.depth >= 2 && heading.depth <= 3 && text !== '笔记内容' && text !== '绗旇鍐呭';
```

`'绗旇鍐呭'` 是 `'笔记内容'` 的 GBK 乱码（mojibake）。代码通过同时匹配正确文本和乱码文本来"绕过"问题，而非修复根因。

#### 根因

某些 MDX 源文件可能以非 UTF-8 编码保存，导致标题在构建时被错误解码。

#### 建议修复方案

1. 检查所有 MDX 源文件编码，确保统一为 UTF-8
2. 移除乱码匹配，仅保留 `text !== '笔记内容'`

---

### P2-2 appendLog 重复读取日志文件

| 属性 | 值 |
|------|-----|
| **文件** | `functions/_lib/logs.ts` |
| **行号** | 60-78 |
| **类型** | 冗余 API 调用 |
| **状态** | 未修复 |

#### 问题描述

```javascript
const current = await readLogs(env, token);  // 第一次读文件（含 JSON 解析）
// ...
const file = await getFile(env, token, LOGS_PATH);  // 第二次读同一文件（仅拿 sha）
sha = file.sha;
```

`readLogs` 内部已调用 `getFile` 获取了文件内容，但丢弃了 `sha`。随后又调用一次 `getFile` 仅为获取 `sha`。

#### 影响

每次写日志多一次 GitHub API 调用，加剧限速压力。

#### 建议修复方案

`readLogs` 返回 `{ entries, sha }`，消除重复读取。

---

### P2-3 getSiteConfig 模块级缓存导致 dev 模式下不更新

| 属性 | 值 |
|------|-----|
| **文件** | `src/lib/site-config.ts` |
| **行号** | 35-54 |
| **类型** | 缓存问题 |
| **状态** | 未修复 |

#### 问题描述

```javascript
let cachedConfig: SiteConfig | null = null;

export async function getSiteConfig(): Promise<SiteConfig> {
  if (cachedConfig) return cachedConfig;  // 永久缓存
  // ...
  cachedConfig = { ...DEFAULT_SITE_CONFIG, ...data };
  return cachedConfig;
}
```

`cachedConfig` 是模块级变量，在 `astro dev` 长驻进程中一旦缓存就不会再读文件。

#### 影响

通过后台 API 修改 `site-config.json` 后，前台页面刷新不会反映更改，必须重启 dev server。

#### 建议修复方案

在 dev 模式下禁用缓存，或使用 Astro 的 `import.meta.env.DEV` 条件判断：

```javascript
if (cachedConfig && !import.meta.env.DEV) return cachedConfig;
```

---

### P2-4 encodeBinaryBase64 使用 O(n²) 字符串拼接

| 属性 | 值 |
|------|-----|
| **文件** | `functions/_lib/github.ts` |
| **行号** | 131-138 |
| **类型** | 性能问题 |
| **状态** | 未修复 |

#### 问题描述

```javascript
export function encodeBinaryBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);  // 逐字符拼接
  }
  return btoa(binary);
}
```

循环内字符串拼接在 JavaScript 中是 O(n²) 操作。对比 `encodeBase64` 函数使用了分块处理（`chunkSize = 0x8000`），但此处没有。

#### 影响

对于 5MB 图片（`maxImageBytes`），会产生显著的性能开销。

#### 建议修复方案

复用 `encodeBase64` 的分块策略：

```javascript
export function encodeBinaryBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(i, i + chunkSize));
  }
  return btoa(binary);
}
```

---

### P2-5 me.ts 每次请求都调用 GitHub API 验证用户

| 属性 | 值 |
|------|-----|
| **文件** | `functions/api/auth/me.ts` |
| **行号** | 22 |
| **类型** | 冗余 API 调用 |
| **状态** | 未修复 |

#### 问题描述

```javascript
const user = await getGitHubUser(session.token);
```

每次 `/api/auth/me` 调用都会向 GitHub API 发起请求验证 token 和获取用户信息。Session 中已存储了 `login`，但仍然每次都远程验证。

同样，`storage.ts` 中 `mountStorage` 会再次调用 `fetchCurrentUser()` 获取 repo 信息，即使 `app.ts` 启动时已调用过。

#### 影响

不必要的 GitHub API 调用，增加延迟和限速风险。

#### 建议修复方案

1. 短期缓存 GitHub 用户信息（如 5 分钟内复用）
2. Session 中已存储 `login`，非敏感操作可直接使用 session 数据
3. 前端缓存 repo 配置，避免重复请求

---

## P3 — 低（优化 / 体验细节）

### P3-1 Shiki 代码高亮主题硬编码为 github-dark

| 属性 | 值 |
|------|-----|
| **文件** | `astro.config.mjs` |
| **行号** | 8 |
| **类型** | 主题兼容性 |
| **状态** | 未修复 |

#### 问题描述

```javascript
markdown: {
  shikiConfig: {
    theme: 'github-dark',
  },
},
```

Claude 浅色主题下，代码块始终显示深色背景，与整体浅色风格不一致。

#### 建议修复方案

使用 Shiki 双主题切换：

```javascript
shikiConfig: {
  themes: { light: 'github-light', dark: 'github-dark' },
},
```

配合 CSS 根据 `data-theme` 属性切换 `--shiki-light` / `--shiki-dark` 变量。

---

### P3-2 ContributionHeatmap "查看整理统计"链接指向充电专题

| 属性 | 值 |
|------|-----|
| **文件** | `src/components/ContributionHeatmap.astro` |
| **行号** | 147 |
| **类型** | 链接错误 |
| **状态** | 未修复 |

#### 问题描述

```html
<a href="/topics/charging/" class="...">
  查看整理统计
</a>
```

链接文案是"查看整理统计"，但实际指向 `/topics/charging/`（充电专题页），并非统计页面。

#### 影响

用户点击后看到的不是统计数据，而是充电相关笔记列表，造成困惑。

#### 建议修复方案

修改链接指向首页 `#all-notes` 锚点，或创建专门的统计页面。

---

### P3-3 知识工作台使用硬编码 Mock 数据

| 属性 | 值 |
|------|-----|
| **文件** | `src/data/knowledgeMock.ts` |
| **行号** | 全文件 |
| **类型** | 数据准确性 |
| **状态** | 未修复 |

#### 问题描述

```typescript
export const recentNotes: RecentNote[] = [
  { id: '1', title: 'MT6765 相机闪光灯时序问题复盘', time: '今天 10:32', ... },
  // ...
];
export const todayCalendarStats = {
  todayNotes: 2,
  weekNotes: 8,
  streakDays: 12,
};
```

首页右侧知识工作台（今日日历、最近更新、待整理、随机复习）全部使用硬编码假数据。

#### 影响

"连续 12 天"、"今日 2 篇"等数字与实际笔记无关，可能误导用户。

#### 建议修复方案

接入 Content Collections 数据，从 `getCollection('docs')` 动态计算统计数据。

---

### P3-4 hash-scroll.ts 使用三次超时重试滚动

| 属性 | 值 |
|------|-----|
| **文件** | `src/scripts/hash-scroll.ts` |
| **行号** | 15-19 |
| **类型** | 代码健壮性 |
| **状态** | 未修复 |

#### 问题描述

```javascript
window.addEventListener('DOMContentLoaded', () => {
  scrollToHashTarget('auto');
  window.setTimeout(() => scrollToHashTarget('auto'), 120);
  window.setTimeout(() => scrollToHashTarget('auto'), 360);
});
```

使用 0ms + 120ms + 360ms 三次重试来应对页面渲染时序问题，是一种脆弱的 workaround。

#### 建议修复方案

使用 `ResizeObserver` 或 `MutationObserver` 监听目标元素出现后再滚动。

---

### P3-5 astro.config.mjs 未配置 site URL

| 属性 | 值 |
|------|-----|
| **文件** | `astro.config.mjs` |
| **行号** | 4 |
| **类型** | SEO / 配置 |
| **状态** | 未修复 |

#### 问题描述

```javascript
export default defineConfig({
  integrations: [mdx()],
  // 没有 site: 'https://...'
});
```

#### 影响

- Astro 无法生成规范 URL
- 无法生成 sitemap.xml
- 无法生成 RSS feed
- 对 SEO 有一定影响

#### 建议修复方案

```javascript
export default defineConfig({
  site: 'https://your-domain.com',
  integrations: [mdx()],
});
```

---

### P3-6 SearchDialog.astro 搜索结果使用 innerHTML 渲染

| 属性 | 值 |
|------|-----|
| **文件** | `src/components/SearchDialog.astro` |
| **行号** | 81-88 |
| **类型** | 安全实践 |
| **状态** | 未修复 |

#### 问题描述

```javascript
title.innerHTML = titleHtml;
// ...
excerpt.innerHTML = excerptHtml;
```

搜索结果来自 Pagefind 索引，包含 `<mark>` 高亮标签。虽然数据源是站点自身内容（风险较低），但使用 `innerHTML` 渲染外部库返回的 HTML 仍不是最佳实践。

#### 建议修复方案

使用 DOM API 构建节点，或对 Pagefind 返回的 HTML 进行白名单过滤（仅允许 `<mark>` 标签）。

---

## 汇总统计

| 级别 | 数量 | 说明 |
|------|------|------|
| **P0** | 3 | 安全漏洞（XSS × 2）+ 数据丢失（竞态条件） |
| **P1** | 5 | 性能问题（N+1 × 2）+ 主题兼容 + 依赖管理 + 脱敏遗漏 |
| **P2** | 5 | 代码质量（乱码、重复读取、缓存、性能、API 冗余） |
| **P3** | 6 | 体验优化（代码主题、链接错误、Mock 数据、滚动重试等） |
| **合计** | **19** | |

---

## 建议修复顺序

```
P0-1 (XSS: RandomReviewCard)  ──→  P0-2 (XSS: preview.ts)  ──→  P0-3 (日志竞态)
    │
    ▼
P1-3 (主题硬编码)  ──→  P1-4 (依赖 latest)  ──→  P1-5 (脱敏遗漏)
    │
    ▼
P1-1 (N+1: notes)  ──→  P1-2 (N+1: storage)
    │
    ▼
P2-* (代码质量，可并行修复)
    │
    ▼
P3-* (体验优化，按需修复)
```

> **注意**：P0 级别问题建议立即修复；P1 级别问题建议在下一个迭代中修复；P2/P3 级别问题可在日常维护中逐步处理。
