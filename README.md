# kevin知识库

## 笔记上传指南

新增、导入、清洗、构建、上传 GitHub 和 Cloudflare Pages 部署流程见：[docs/NOTE_UPLOAD_GUIDE.md](docs/NOTE_UPLOAD_GUIDE.md)。

面向驱动开发、系统定制和认证问题排查的个人知识库。内容使用 MDX 文件维护，适合沉淀日志、代码路径、Diff、验证方法和最终结论。

## 技术栈

- Astro
- TypeScript
- MDX
- Tailwind CSS
- Astro Content Collections
- Pagefind 静态全文搜索
- 静态站点，无数据库、无登录、无后端

## 本地启动

```bash
npm install
npm run dev
```

默认开发地址通常是 `http://localhost:4321`。

## 新增笔记

```bash
npm run new:note -- --category mtk --title "[MTK] 霍尔驱动 hall"
```

可选参数：

```bash
npm run new:note -- --category mtk --title "屏幕亮度异常" --slug screen-brightness-debug --status 待验证
npm run new:note -- --category mtk --title "PD 充电电流异常" --topics charging
npm run new:note -- --category gms --title "Camera FOV 复测" --topics camera,sensor
```

脚本会自动创建 MDX 文件、生成 frontmatter 和正文模板。目标文件已存在时不会覆盖。

## 清洗导入笔记

从 Notion、Markdown 或 MacDown 导入内容后，可以运行：

```bash
npm run normalize:notes
```

清洗脚本会补齐 frontmatter、清理标题里的 Markdown 符号、补入 `visibility` 和 `sensitive`、转换常见中文编号标题、识别代码块语言，并把 `#mtk#hall` 这类标签写入 `tags` 数组。

## 目录规范

```text
src/content/docs/
├── index.mdx
├── mtk/
├── gms/
├── camera/
├── audio/
├── display/
├── tools/
└── templates/
```

分类首页使用 `index.mdx`，具体笔记使用短横线命名，例如 `hall-driver.mdx`。

## frontmatter 规范

```yaml
---
title: ""
description: ""
category: ""
tags: []
topics: []
visibility: "public"
sensitive: true
status: "整理中"
date: "2026-06-06"
updated: "2026-06-06"
---
```

`category` 是文章主目录，只写一个，例如 `mtk`、`gms`、`tools`。

`topics` 是复盘专题，可写多个，也可以留空。可选值：

- `charging`：充电
- `camera`：Camera
- `display_tp`：屏幕与 TP
- `audio`：音频
- `sensor`：Sensor

`visibility` 可选值：

- `public`：正常构建，出现在导航、首页和搜索索引
- `private`：保留源码内容，但不构建页面、不进入导航和搜索
- `draft`：草稿内容，不构建页面、不进入导航和搜索

`sensitive` 用于公开安全检查。新导入文章默认 `sensitive: true`，构建时如果 public 文章仍为 sensitive，会输出警告但不中断构建。

## 公开脱敏规范

公开发布前请检查：

- 删除客户名称、项目代号、设备序列号、账号、邮箱、内网地址。
- 删除完整私有仓库地址、绝对本地路径中的个人信息。
- 删除密钥、token、证书、签名文件、可复用的登录信息。
- 日志保留关键错误和调用链即可，长日志尽量裁剪。
- Diff 保留问题相关片段，避免公开未脱敏的大段私有代码。
- 确认无敏感信息后，把文章改为 `sensitive: false`。

## 部署方法

构建静态文件：

```bash
npm run build
```

构建产物位于 `dist/`，同时会生成 Pagefind 静态搜索索引。可部署到 GitHub Pages、Netlify、Vercel、Cloudflare Pages 或内部 Nginx 静态目录。

## 后续规划

- 增加标签聚合页。
- 增加状态筛选。
- 增加最近验证记录。
- 增加内容质量检查脚本。
