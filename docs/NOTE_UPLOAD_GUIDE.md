# 笔记上传与发布指南

这份文档说明如何把一篇新的驱动排查笔记加入 kevin 知识库，并完成本地检查、搜索索引生成、Git 上传和线上部署。

## 1. 笔记放在哪里

所有文章都放在：

```text
src/content/docs/
```

常用一级分类：

```text
src/content/docs/mtk/        MTK 平台类问题
src/content/docs/gms/        GMS / CTS / 认证类问题
src/content/docs/camera/     Camera 专项
src/content/docs/audio/      Audio 专项
src/content/docs/display/    Display 专项
src/content/docs/tools/      工具、命令、调试方法
src/content/docs/templates/  模板
```

文件名建议使用英文短横线，例如：

```text
hall-driver.mdx
usb-pd-high-current.mdx
camera-power-sequence.mdx
```

文章 URL 会根据路径生成：

```text
src/content/docs/mtk/hall-driver.mdx
=> /mtk/hall-driver/
```

## 2. 推荐方式：用脚本新建笔记

进入项目目录：

```bash
cd C:\Users\24786\Desktop\kb\driver-knowledge-base
```

新建一篇 MTK 笔记：

```bash
npm run new:note -- --category mtk --title "[MTK] 霍尔驱动 hall"
```

指定 URL 文件名：

```bash
npm run new:note -- --category mtk --title "[MTK] 霍尔驱动 hall" --slug hall-driver
```

指定复盘专题：

```bash
npm run new:note -- --category mtk --title "[MTK] 充电电流异常" --slug charging-current-debug --topics charging
```

多个专题用英文逗号：

```bash
npm run new:note -- --category mtk --title "[MTK] 屏幕触摸异常" --slug display-tp-debug --topics display_tp,sensor
```

脚本会自动生成：

- MDX 文件
- frontmatter
- 标准正文模板
- 默认 `visibility: "public"`
- 默认 `sensitive: true`

如果目标文件已经存在，脚本不会覆盖。

## 3. 手动新增笔记

也可以直接新建 `.mdx` 文件，例如：

```text
src/content/docs/mtk/hall-driver.mdx
```

最小模板：

````mdx
---
title: "[MTK] 霍尔驱动 hall"
description: "记录霍尔驱动问题现象、排查过程、修改方案和验证方法。"
category: "mtk"
tags: ["mtk", "hall", "sensor"]
topics: ["sensor"]
visibility: "public"
sensitive: true
status: "整理中"
date: "2026-06-10"
updated: "2026-06-10"
---

# [MTK] 霍尔驱动 hall

## 1. 问题现象

## 2. 平台信息

## 3. 相关日志

```log
粘贴关键日志
```

## 4. 相关代码路径

```text
kernel_device_modules/...
vendor/...
```

## 5. 排查过程

## 6. 修改方案

## 7. Diff 记录

```diff
diff --git a/example b/example
```

## 8. 验证方法

## 9. 最终结论

## 10. 快速判断
````

## 4. frontmatter 字段说明

```yaml
title: "文章标题"
description: "文章摘要"
category: "mtk"
tags: ["mtk", "hall"]
topics: ["sensor"]
visibility: "public"
sensitive: true
status: "整理中"
date: "2026-06-10"
updated: "2026-06-10"
```

字段说明：

- `category`：主分类，只写一个。常用值：`mtk`、`gms`、`camera`、`audio`、`display`、`tools`、`templates`。
- `tags`：文章标签，用于细分问题，例如 `mtk`、`hall`、`camera`、`charging`。
- `topics`：复盘专题，可以写多个。可选值：`charging`、`camera`、`display_tp`、`audio`、`sensor`。
- `visibility`：公开状态。`public` 会发布，`private` 和 `draft` 不进入导航、首页、搜索索引。
- `sensitive`：是否仍包含敏感信息。新文章默认 `true`，公开前建议确认脱敏后改为 `false`。
- `status`：整理状态。可选值：`整理中`、`已验证`、`待验证`、`未完成`、`废弃`。
- `date`：创建日期。
- `updated`：最后更新日期。

## 5. 分类与专题怎么选

`category` 决定文章主目录。例如 MTK 平台问题放到 `mtk`：

```yaml
category: "mtk"
```

`topics` 决定文章是否额外进入复盘专题。例如一篇 MTK 文章同时涉及相机：

```yaml
category: "mtk"
topics: ["camera"]
```

常见选择：

```yaml
topics: ["charging"]    # 充电
topics: ["camera"]      # 相机
topics: ["display_tp"]  # 屏幕 / TP
topics: ["audio"]       # 音频
topics: ["sensor"]      # 传感器
topics: []              # 不明确，不放入专题
```

## 6. 从 Notion / Markdown 导入

把导出的 Markdown 内容整理成 `.mdx` 文件后，放入对应目录，例如：

```text
src/content/docs/mtk/new-debug-note.mdx
```

然后运行清洗脚本：

```bash
npm run normalize:notes
```

清洗脚本会尝试：

- 补齐 frontmatter
- 清理标题里的 Markdown 符号
- 把 `#mtk#hall` 这类标签整理进 `tags`
- 补齐 `visibility` 和 `sensitive`
- 对没有代码围栏的新导入稿，保守识别 bash、diff、log、dts、xml、makefile、c、cpp 等代码片段

注意：导入后一定要自己打开文章检查一遍，尤其是日志、diff 和代码块。

## 7. 代码块写法

日志：

````mdx
```log
[  12.345678] hall: probe ok
```
````

bash 命令：

````mdx
```bash
adb shell getprop
adb shell dmesg | grep -i hall
```
````

diff：

````mdx
```diff
+ status = "okay";
- status = "disabled";
```
````

DTS：

````mdx
```dts
hall_sensor: hall@0 {
    status = "okay";
};
```
````

Makefile / Kconfig：

````mdx
```makefile
obj-$(CONFIG_HALL) += hall.o
```
````

## 8. MDX 组件

文章里可以使用这些组件增强阅读体验。

提示框：

```mdx
<Callout type="tip" title="快速判断">
优先确认节点是否存在，再看驱动是否 probe。
</Callout>
```

状态或关键词标签：

```mdx
<Badge tone="info">MTK</Badge>
<Badge tone="warning">待验证</Badge>
```

折叠面板：

````mdx
<Collapse title="展开查看完整日志">

```log
粘贴较长日志
```

</Collapse>
````

代码切换：

```mdx
<CodeTabs
  tabs={[
    { label: 'adb', lang: 'bash', code: 'adb shell getprop' },
    { label: 'logcat', lang: 'bash', code: 'adb logcat -b all' },
  ]}
/>
```

## 9. 本地预览

安装依赖：

```bash
npm install
```

启动开发服务器：

```bash
npm run dev
```

浏览器打开：

```text
http://localhost:4321
```

如果已经有服务占用端口，可以换端口：

```bash
npm run dev -- --port 4322
```

## 10. 构建检查

上传前建议运行：

```bash
npm run normalize:notes
npm run build
```

`npm run build` 会做三件事：

1. 检查 public 且 `sensitive: true` 的文章并输出提醒。
2. 构建 Astro 静态站点到 `dist/`。
3. 生成 Pagefind 搜索索引。

如果看到 sensitive 提醒，说明还有文章标记为敏感。确认脱敏后，把文章改为：

```yaml
sensitive: false
```

## 11. 上传到 GitHub

查看改动：

```bash
git status
git diff
```

提交：

```bash
git add .
git commit -m "docs: add new knowledge notes"
```

推送：

```bash
git push
```

如果是第一次推送当前分支：

```bash
git push -u origin main
```

## 12. Cloudflare Pages 部署配置

当前项目是 Astro 静态站点，Cloudflare Pages 通常这样填：

```text
Framework preset: None 或 Astro
Build command: npm run build
Build output directory: dist
Root directory: /
Production branch: main
```

如果项目不是放在仓库根目录，而是子目录，需要把 Root directory 改成项目所在目录。

## 13. 推荐上传流程

日常新增一篇笔记时，按这个顺序做：

```bash
cd C:\Users\24786\Desktop\kb\driver-knowledge-base
npm run new:note -- --category mtk --title "[MTK] 新问题标题" --slug new-note-slug --topics camera
npm run dev
npm run normalize:notes
npm run build
git status
git add .
git commit -m "docs: add mtk debug note"
git push
```

## 14. 常见问题

### 新文章没有出现在导航里

检查：

- 文件是否放在 `src/content/docs/` 下。
- `visibility` 是否为 `public`。
- frontmatter 是否完整。
- 是否运行过 `npm run build` 或重新启动 `npm run dev`。

### 搜索不到新文章

搜索索引只在 build 后生成，运行：

```bash
npm run build
```

### 页面右侧没有目录

正文需要有 `##` 或 `###` 标题，例如：

```mdx
## 问题现象
### 关键日志
```

### Cloudflare 部署失败

优先检查 Cloudflare Pages 配置：

```text
Build command: npm run build
Build output directory: dist
```

如果日志提示 `Missing script: "build"`，通常说明 Root directory 填错了，Cloudflare 没有进入真正的项目目录。

## 15. 后台上传系统配置

后台入口：

```text
https://note.kbinx.com/admin
```

本项目已经内置同站后台，功能包括：

- GitHub OAuth 登录
- 上传 `.md` / `.mdx` 文件
- 自动解析 frontmatter 和正文
- 填写标题、分类、标签、专题、状态、公开状态、敏感标记
- 在线编辑 Markdown / MDX 正文
- 读取并编辑 GitHub 上已有笔记
- 保存后通过 GitHub API 提交到 `main` 分支
- Cloudflare Pages 自动重新构建站点

### GitHub OAuth App

在 GitHub 创建 OAuth App：

```text
Homepage URL:
https://note.kbinx.com

Authorization callback URL:
https://note.kbinx.com/api/auth/callback
```

创建后复制：

```text
Client ID
Client Secret
```

### Cloudflare Pages 环境变量

在 Cloudflare Pages 项目中添加这些环境变量：

```text
GITHUB_CLIENT_ID=你的 GitHub OAuth Client ID
GITHUB_CLIENT_SECRET=你的 GitHub OAuth Client Secret
SESSION_SECRET=一段足够长的随机字符串
ADMIN_GITHUB_USERS=KBin-001
GITHUB_OWNER=KBin-001
GITHUB_REPO=notes
GITHUB_BRANCH=kb
```

本地预览时，可以复制 `.dev.vars.example` 为 `.dev.vars` 并填入自己的测试配置；`.dev.vars` 已被 `.gitignore` 忽略，不要提交真实密钥。

如果仓库是公开仓库，默认 OAuth scope 使用：

```text
public_repo read:user
```

如果以后改成私有仓库，需要额外添加：

```text
GITHUB_OAUTH_SCOPE=repo read:user
```

### Cloudflare Pages 构建配置

保持：

```text
Build command: npm run build
Build output directory: dist
Production branch: main
```

项目根目录有 `wrangler.toml`，其中包含：

```text
pages_build_output_dir = "dist"
compatibility_flags = ["nodejs_compat"]
```

### 后台使用流程

1. 打开 `/admin`。
2. 点击 GitHub 登录。
3. 上传 Markdown / MDX 文件。
4. 检查解析出来的字段和正文。
5. 补充 `category`、`tags`、`topics`、`status`。
6. 确认脱敏后把 `sensitive` 取消勾选；未脱敏则保持勾选。
7. 点击“提交到 GitHub”。
8. 等 Cloudflare Pages 自动构建完成。

### 安全注意

- 只有 `ADMIN_GITHUB_USERS` 中的 GitHub 用户可以保存。
- session cookie 使用 `SESSION_SECRET` 加密，并设置为 HttpOnly。
- 后台只允许写入 `src/content/docs/` 下的 `.md` / `.mdx` 文件。
- 新建文章如果目标文件已存在，会被阻止覆盖。
- 编辑已有文章会更新原文件路径，不会自动改 URL。
