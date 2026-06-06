# kevin知识库

一个面向驱动开发、系统定制和认证问题排查的个人知识库网站。项目使用静态站点架构，内容以 MDX 文件维护，适合沉淀日志、代码路径、Diff、验证方法和最终结论。

## 技术栈

- Astro
- TypeScript
- MDX
- Tailwind CSS
- Astro Content Collections
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
status: "整理中"
date: "2026-06-06"
updated: "2026-06-06"
---
```

`category` 是文章主目录，只写一个，例如 `mtk`、`gms`、`tools`。

`topics` 是复盘专题，可写多个，也可以留空。留空时不会进入复盘专题分类。

`topics` 可选值：

- `charging`：充电
- `camera`：Camera
- `display_tp`：屏幕与 TP
- `audio`：音频
- `sensor`：Sensor

`status` 可选值：

- `整理中`
- `已验证`
- `待验证`
- `未完成`
- `废弃`

## 部署方法

构建静态文件：

```bash
npm run build
```

构建产物位于 `dist/`，可以部署到任意静态托管平台，例如 GitHub Pages、Netlify、Vercel、Cloudflare Pages 或内部 Nginx 静态目录。

## 后续规划

- 接入静态搜索索引
- 增加标签页和状态筛选
- 增加最近验证记录
- 增加代码块语言标签
- 增加内容质量检查脚本
