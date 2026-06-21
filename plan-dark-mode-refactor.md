# 暗黑模式高质量重构方案

## Context

当前知识库项目暗黑模式质量差：78 个 `!important` 覆盖、107 处硬编码 Tailwind 颜色类、40+ 条属性选择器覆盖规则。根本原因是**样式架构反模式**——组件写硬编码 Tailwind 类（如 `bg-slate-950/80`），然后 global.css 用选择器覆盖，导致维护性极差且视觉效果不一致。

参考项目 fumadocs（MIT 协议）使用 CSS 变量驱动的设计体系，暗黑模式层次清晰、精致高级。本方案**保留 Astro 技术栈**，学习 fumadocs 的变量体系重构暗黑模式。

## 技术决策：方案 A — 保留 Astro，重建主题系统

| 对比项 | 当前项目 | fumadocs |
|--------|---------|----------|
| 框架 | Astro (SSG) | Next.js (React) |
| CSS | Tailwind v4 | Tailwind v4 |
| 主题 | CSS 变量 + `.dark` + `data-theme` | CSS 变量 + `.dark` |
| 组件 | Astro 组件 | React 组件 |

**不迁移的理由**：
- Astro + Tailwind v4 完全能实现 fumadocs 级别的暗黑效果
- 问题根源是 CSS 架构，不是框架限制
- 迁移 Next.js 成本极高（重写全部组件为 React、迁移内容系统、丢失 Cloudflare Functions）
- fumadocs 的暗黑精髓是 CSS 变量体系，与框架无关

---

## Task 1: 重建 CSS 变量系统 + Tailwind 语义注册

**文件**: `src/styles/global.css`

将旧的 `:root` 变量（`--bg`, `--surface` 等无前缀名）替换为 `--kb-*` 前缀，并在 `@theme` 中注册为 Tailwind 工具类。

### 暗黑主题变量（默认）

```css
:root {
  color-scheme: dark;
  --kb-bg:             #0c1017;
  --kb-surface:        #111827;
  --kb-elevated:       #182030;
  --kb-overlay:        rgba(4, 8, 20, 0.72);
  --kb-surface-glass:  rgba(17, 24, 39, 0.82);
  --kb-surface-hover:  rgba(30, 41, 59, 0.56);
  --kb-surface-active: rgba(30, 41, 59, 0.78);
  --kb-heading:        #f1f5f9;
  --kb-text:           #e2e8f0;
  --kb-muted:          #94a3b8;
  --kb-subtle:         #64748b;
  --kb-disabled:       #475569;
  --kb-accent:         #67c2de;
  --kb-accent-hover:   #7dd3fc;
  --kb-accent-soft:    rgba(103, 194, 222, 0.12);
  --kb-accent-ring:    rgba(103, 194, 222, 0.30);
  --kb-accent-2:       #a78bfa;
  --kb-border:         rgba(148, 163, 184, 0.12);
  --kb-border-subtle:  rgba(148, 163, 184, 0.07);
  --kb-border-strong:  rgba(148, 163, 184, 0.20);
  --kb-link:           #7dd3fc;
  --kb-code-bg:        #0a0f1a;
  --kb-inline-code-bg: rgba(148, 163, 184, 0.10);
  --kb-focus-ring:     rgba(103, 194, 222, 0.60);
  --kb-warning:        #f6c76f;
  --kb-danger:         #ff7d90;
  --kb-success:        #86efac;
  --kb-shadow-sm:      0 1px 3px rgba(0,0,0,0.24);
  --kb-shadow-md:      0 8px 24px rgba(0,0,0,0.20);
  --kb-shadow-lg:      0 16px 48px rgba(0,0,0,0.28);
}
```

### `@theme` 注册

```css
@theme {
  --color-kb-bg: var(--kb-bg);
  --color-kb-surface: var(--kb-surface);
  --color-kb-elevated: var(--kb-elevated);
  /* ... 所有变量注册为 Tailwind 颜色 ... */
}
```

注册后组件可直接使用 `bg-kb-surface`, `text-kb-heading`, `border-kb-border` 等语义类。

### `@utility` 定义

```css
@utility kb-card-bg {
  background: linear-gradient(180deg,
    color-mix(in srgb, var(--kb-surface) 88%, transparent),
    color-mix(in srgb, var(--kb-surface) 68%, transparent));
  backdrop-filter: blur(8px);
}
@utility kb-hero-bg { /* hero 渐变背景 */ }
@utility kb-glass { /* 毛玻璃效果 */ }
```

---

## Task 2: 逐组件替换硬编码颜色类

按以下顺序替换，每个组件替换后可独立验证：

### 2.1 简单组件（3-5 处）

| 文件 | 替换规则 |
|------|---------|
| `ThemeToggle.astro` | `border-slate-800`→`border-kb-border`, `bg-slate-900/80`→`bg-kb-surface-glass`, `text-slate-300`→`text-kb-muted`, `hover:border-cyan-400/40`→`hover:border-kb-accent-ring`, `hover:text-white`→`hover:text-kb-heading` |
| `TagBadge.astro` | 同上模式 |
| `TableOfContents.astro` | `text-slate-500`→`text-kb-subtle`, hover 类同上 |

### 2.2 Header.astro（12 处）

所有 `border-slate-800` → `border-kb-border`, `bg-slate-950/80` → `bg-kb-surface-glass`, `text-slate-400/500` → `text-kb-muted/subtle`, `text-white` → `text-kb-heading`, hover 类统一用 `kb-accent-ring` 和 `kb-heading`

### 2.3 Sidebar.astro（24 处）

active: `bg-cyan-400/10 text-cyan-100 ring-cyan-400/20` → `bg-kb-accent-soft text-kb-accent ring-kb-accent-ring`  
normal: `text-slate-400 hover:bg-slate-900 hover:text-slate-100` → `text-kb-muted hover:bg-kb-surface-hover hover:text-kb-heading`  
open: `bg-slate-900 text-white` → `bg-kb-surface-active text-kb-heading`  
count: `text-slate-600` → `text-kb-disabled`

### 2.4 SearchDialog.astro（16 处，含 JS 动态生成 4 处）

HTML 和 JS 中的 `className` 字符串都替换为语义类。

### 2.5 MobileNav.astro（20 处）

模式与 Sidebar 完全一致。`bg-black/60` → `bg-kb-overlay`

### 2.6 CategoryCard.astro（8 处）

`border-slate-800/90 bg-slate-950/35` → `border-kb-border kb-card-bg`  
保留 `accentClass` 装饰性渐变（`from-cyan-400/12` 等）不变

### 2.7 页面文件

- `index.astro`（18 处）
- `[...slug].astro`（12 处）
- `[topic].astro`（10 处）

---

## Task 3: 清理 global.css

删除所有覆盖规则（约 300 行），重写保留规则（不使用 `!important`）：

### 删除（~300 行）

- 所有 `.dark [class~="..."]` 属性选择器覆盖（~40 条）
- 所有重复选择器（`.kb-card.kb-card.kb-card` 等）
- 旧的 `:root` 变量定义

### 保留并清理（去掉 `!important`）

```css
/* Header */
.site-header { background: var(--kb-surface-glass); backdrop-filter: blur(18px) saturate(140%); }

/* 搜索面板 */
.search-panel { background: linear-gradient(180deg, var(--kb-elevated), var(--kb-surface)); }

/* 卡片系统 */
.kb-card:hover { transform: translateY(-1px); box-shadow: var(--kb-shadow-md); }

/* 侧边栏 active 指示条 */
.sidebar-link.is-active::before { background: var(--kb-accent); }
```

**预计**: global.css 从 711 行减至 ~400 行

---

## Task 4: 重构 prose.css

将所有硬编码颜色替换为 CSS 变量引用：

| 当前值 | 替换为 |
|--------|--------|
| `rgba(56, 189, 248, 0.38)` | `color-mix(in srgb, var(--kb-accent) 38%, transparent)` |
| `#7dd3fc` | `var(--kb-accent-hover)` |
| `#cbd5e1` | `var(--kb-muted)` |
| `rgba(15, 23, 42, 0.76)` | `color-mix(in srgb, var(--kb-surface) 76%, transparent)` |
| `#dbeafe` | `var(--kb-heading)` |
| `#aebdd0` | `var(--kb-muted)` |

精简 Claude 主题覆盖（~130 行 → ~50 行），因为变量切换后大部分自动适配。

---

## Task 5: Claude 浅色主题适配

在 `html[data-theme="claude"]` 中重新定义所有 `--kb-*` 变量：

```css
html[data-theme="claude"] {
  color-scheme: light;
  --kb-bg: #f5f4ed;
  --kb-surface: #fbfaf5;
  --kb-heading: #141413;
  --kb-text: #30302e;
  --kb-muted: #696861;
  --kb-accent: #d97757;
  --kb-border: rgba(201, 197, 184, 0.60);
  /* ... 所有变量覆盖 ... */
}
```

仅保留少量 Claude 特有样式（~30 行）：
- `backdrop-filter: none`（浅色不需要毛玻璃）
- body 背景渐变
- 滚动条颜色
- `::selection` 颜色

---

## Task 6: 验证

1. `npm run dev` 启动开发服务器
2. 暗黑模式验证：首页 → 分类页 → 文章详情页 → 搜索 → 移动端
3. Claude 模式验证：同上
4. 主题切换测试：确认无 FOUC 闪烁
5. 确认 0 个 `!important`
6. 检查 Tailwind v4 是否正确生成所有 `kb-*` 工具类

---

## 关键文件清单

| 文件 | 操作 |
|------|------|
| `src/styles/global.css` | 大幅重构（711→~400 行） |
| `src/styles/prose.css` | 中度重构（561→~430 行） |
| `src/components/Header.astro` | 替换 12 处类名 |
| `src/components/Sidebar.astro` | 替换 24 处类名 |
| `src/components/MobileNav.astro` | 替换 20 处类名 |
| `src/components/SearchDialog.astro` | 替换 16 处类名（含 JS） |
| `src/components/TableOfContents.astro` | 替换 4 处类名 |
| `src/components/CategoryCard.astro` | 替换 8 处类名 |
| `src/components/ThemeToggle.astro` | 替换 5 处类名 |
| `src/components/TagBadge.astro` | 替换 3 处类名 |
| `src/components/StatusBadge.astro` | 替换 1 处类名 |
| `src/pages/index.astro` | 替换 18 处类名 |
| `src/pages/[...slug].astro` | 替换 12 处类名 |
| `src/pages/topics/[topic].astro` | 替换 10 处类名 |
| `src/scripts/theme.ts` | 不修改 |
| `astro.config.mjs` | 不修改 |

## 预期成果

| 指标 | 重构前 | 重构后 |
|------|--------|--------|
| `!important` | 78 | 0 |
| 硬编码颜色类 | 107 | 0 |
| 属性选择器覆盖 | ~40 | 0 |
| 特异性 hack | 6 | 0 |
| global.css 行数 | 711 | ~400 |
