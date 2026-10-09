/**
 * 后台笔记编辑器验收测试（Playwright + stub API）
 *
 * 覆盖：发布按钮位置/可达性、新建表单状态隔离、日期默认规则、防重复提交。
 * 运行：node scripts/_verify-editor.cjs [baseUrl]
 *   baseUrl 默认 http://127.0.0.1:4327
 *
 * 注意：本脚本通过 page.route 拦截 /api/**，不依赖真实 GitHub 凭据，也不会写任何远端文件。
 */
const { chromium } = require('playwright');

const BASE = (process.argv[2] || 'http://127.0.0.1:4327').replace(/\/$/, '');
const ADMIN = `${BASE}/admin`;

/** 固定“现在”：UTC 2026-10-08T16:30Z = 东八区 2026-10-09 00:30（旧实现 toISOString 会算成 10-08） */
const FIXED_NOW = '2026-10-08T16:30:00.000Z';
const TZ = 'Asia/Shanghai';
const TODAY = '2026-10-09';

const NOTES = {
  'src/content/docs/audio/note-a.mdx': {
    title: 'A 笔记',
    description: 'A 的描述',
    category: 'audio',
    slug: 'note-a',
    tags: ['mtk', 'hall'],
    topics: ['audio'],
    visibility: 'public',
    sensitive: true,
    status: '已验证',
    date: '2026-06-06',
    updated: '2026-06-06',
    body: '# A 笔记\n\n## 小节\n\nA 的正文内容',
    sha: 'sha-a',
    warnings: [],
  },
  'src/content/docs/camera/note-b.mdx': {
    title: 'B 笔记',
    description: 'B 的描述',
    category: 'camera',
    slug: 'note-b',
    tags: ['camera'],
    topics: ['camera'],
    visibility: 'private',
    sensitive: false,
    status: '待验证',
    date: '2025-01-02',
    updated: '2025-03-04',
    body: '# B 笔记\n\n## 小节\n\nB 的正文内容',
    sha: 'sha-b',
    warnings: [],
  },
};

const results = [];
let failed = 0;

function check(name, condition, detail) {
  const ok = !!condition;
  if (!ok) failed++;
  results.push({ name, ok, detail });
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${ok || detail === undefined ? '' : ` — ${detail}`}`);
  if (!ok) console.log(`     实际：${JSON.stringify(detail)}`);
  return ok;
}

function section(title) {
  console.log(`\n=== ${title} ===`);
}

/** 读取编辑表单的全部可见状态 */
async function readForm(page) {
  return page.evaluate(() => {
    const val = (sel) => {
      const el = document.querySelector(sel);
      return el ? el.value : null;
    };
    const topics = Array.from(document.querySelectorAll('input[name="topics"]:checked')).map((i) => i.value);
    return {
      title: val('#title'),
      slug: val('#slug'),
      description: val('#description'),
      tags: val('#tags'),
      body: val('#body'),
      category: val('#category'),
      status: val('#status'),
      visibility: val('#visibility'),
      sensitive: document.querySelector('#sensitive').checked,
      date: val('#date'),
      updated: val('#updated'),
      topics,
      topicsCount: document.querySelectorAll('input[name="topics"]:checked').length,
      noteList: val('#note-list'),
      fileSourceName: document.querySelector('#file-source-name').textContent.trim(),
      targetPath: document.querySelector('#target-path').textContent.trim(),
      pageTitle: document.querySelector('#editor-page-title').textContent.trim(),
      publishLabel: document.querySelector('#publish-button-text').textContent.trim(),
      previewHidden: document.querySelector('#editor-preview').classList.contains('admin-hidden'),
      activeMode: (document.querySelector('.editor-mode-tab.is-active') || {}).getAttribute
        ? document.querySelector('.editor-mode-tab.is-active').getAttribute('data-mode')
        : null,
    };
  });
}

/** 安装 API stub；返回记录容器 */
async function stubApi(page, state) {
  await page.route('**/api/auth/me', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ user: { login: 'tester' }, repo: { owner: 'o', repo: 'r', branch: 'main' } }),
    }),
  );

  await page.route('**/api/notes/list', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        files: Object.entries(NOTES).map(([path, note]) => ({
          path,
          category: note.category,
          slug: note.slug,
          sha: note.sha,
          title: note.title,
          status: note.status,
          visibility: note.visibility,
          tags: note.tags,
          updated: note.updated,
        })),
      }),
    }),
  );

  await page.route('**/api/notes/read**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.searchParams.get('path');
    state.readCalls.push(path);
    const delay = state.readDelay[path] || 0;
    if (delay) await new Promise((r) => setTimeout(r, delay));
    const note = NOTES[path];
    if (!note) {
      return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: '读取失败' }) });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, path, note }),
    });
  });

  await page.route('**/api/notes/save', async (route) => {
    const payload = JSON.parse(route.request().postData() || '{}');
    state.saveCalls.push(payload);
    const delay = state.saveDelay || 0;
    if (delay) await new Promise((r) => setTimeout(r, delay));
    if (state.saveFail) {
      return route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: '模拟保存失败' }),
      });
    }
    const path = payload.sha && payload.path
      ? payload.path
      : `src/content/docs/${payload.category}/${payload.slug}.mdx`;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        path,
        commit: { sha: 'commit-1' },
        content: { sha: `sha-${payload.slug}` },
        deploy: { configured: false, ok: false },
      }),
    });
  });
}

async function newPage(browser, state, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: TZ });
  const page = await ctx.newPage();
  page.on('dialog', async (dialog) => {
    state.dialogs.push({ type: dialog.type(), message: dialog.message() });
    if (state.dialogAnswer === 'accept') await dialog.accept();
    else await dialog.dismiss();
  });
  await page.clock.setFixedTime(new Date(FIXED_NOW));
  await stubApi(page, state);
  if (opts.beforeGoto) await opts.beforeGoto(page);
  await page.goto(opts.hash ? `${ADMIN}${opts.hash}` : ADMIN, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.admin-layout:not(.admin-hidden)', { timeout: 15000 });
  return { ctx, page };
}

const freshState = (over = {}) => ({
  readCalls: [],
  saveCalls: [],
  dialogs: [],
  dialogAnswer: 'accept',
  readDelay: {},
  saveDelay: 0,
  saveFail: false,
  ...over,
});

const clickNav = async (page, route) => {
  await page.click(`.admin-nav-item[data-nav-route="${route}"]`);
  await page.waitForTimeout(150);
};

(async () => {
  const browser = await chromium.launch();

  /* ---------------------------------------------------------------
   * 场景 1：直接打开新建笔记 → 内容为空，日期均为今天（本地时区）
   * --------------------------------------------------------------- */
  section('场景 1：直接打开新建笔记');
  {
    const state = freshState();
    const { ctx, page } = await newPage(browser, state, { hash: '#/new' });
    const f = await readForm(page);
    check('标题为空', f.title === '', f.title);
    check('Slug 为空', f.slug === '', f.slug);
    check('描述为空', f.description === '', f.description);
    check('正文为空', f.body === '', f.body);
    check('标签为空', f.tags === '', f.tags);
    check('专题未勾选', f.topicsCount === 0, f.topics);
    check('创建日期 = 今天（本地时区）', f.date === TODAY, f.date);
    check('更新日期 = 今天（本地时区）', f.updated === TODAY, f.updated);
    check('分类为默认 mtk', f.category === 'mtk', f.category);
    check('状态为默认 整理中', f.status === '整理中', f.status);
    check('公开状态为默认 public', f.visibility === 'public', f.visibility);
    check('sensitive 默认勾选', f.sensitive === true, f.sensitive);
    check('按钮文案为「发布笔记」', f.publishLabel === '发布笔记', f.publishLabel);
    check('标题为「新建笔记」', f.pageTitle === '新建笔记', f.pageTitle);
    await ctx.close();
  }

  /* ---------------------------------------------------------------
   * 场景 2：编辑 A 后点击新建 → 全部清空且解除文件绑定
   * --------------------------------------------------------------- */
  section('场景 2：编辑 A → 点击「新建笔记」');
  {
    const state = freshState();
    const { ctx, page } = await newPage(browser, state, { hash: '#/edit?path=src/content/docs/audio/note-a.mdx' });
    await page.waitForFunction(() => document.querySelector('#title').value === 'A 笔记', null, { timeout: 10000 });
    const a = await readForm(page);
    check('A 已载入（标题）', a.title === 'A 笔记', a.title);
    check('A 创建日期保留原值 2026-06-06', a.date === '2026-06-06', a.date);
    check('A 更新日期默认今天', a.updated === TODAY, a.updated);
    check('A 专题已勾选', a.topics.includes('audio'), a.topics);
    check('编辑态按钮文案为「保存修改」', a.publishLabel === '保存修改', a.publishLabel);
    check('路径显示原文件', a.targetPath === 'src/content/docs/audio/note-a.mdx', a.targetPath);

    await clickNav(page, 'new');
    await page.waitForTimeout(400);
    const n = await readForm(page);
    check('新建：标题清空', n.title === '', n.title);
    check('新建：Slug 清空', n.slug === '', n.slug);
    check('新建：描述清空', n.description === '', n.description);
    check('新建：正文清空', n.body === '', n.body);
    check('新建：标签清空', n.tags === '', n.tags);
    check('新建：专题取消勾选', n.topicsCount === 0, n.topics);
    check('新建：分类回默认', n.category === 'mtk', n.category);
    check('新建：状态回默认', n.status === '整理中', n.status);
    check('新建：公开状态回默认', n.visibility === 'public', n.visibility);
    check('新建：创建日期=今天', n.date === TODAY, n.date);
    check('新建：更新日期=今天', n.updated === TODAY, n.updated);
    check('新建：路径解除绑定（按分类/slug 生成）', n.targetPath === 'src/content/docs/mtk/new-note.mdx', n.targetPath);
    check('新建：按钮回到「发布笔记」', n.publishLabel === '发布笔记', n.publishLabel);

    // 关键安全项：新建后提交不能带旧笔记的 sha/path
    await page.fill('#title', '全新笔记');
    await page.fill('#slug', 'brand-new');
    await page.click('#publish-button');
    await page.waitForTimeout(300);
    const payload = state.saveCalls[state.saveCalls.length - 1];
    check('新建发布：只请求一次', state.saveCalls.length === 1, state.saveCalls.length);
    check('新建发布：payload 无 sha', payload && payload.sha === undefined, payload && payload.sha);
    check('新建发布：payload 无 path', payload && payload.path === undefined, payload && payload.path);
    check('新建发布：创建新文件路径', payload && payload.slug === 'brand-new', payload && payload.slug);
    await ctx.close();
  }

  /* ---------------------------------------------------------------
   * 场景 3：A → B → 新建，不残留任何字段
   * --------------------------------------------------------------- */
  section('场景 3：编辑 A → 编辑 B → 新建');
  {
    const state = freshState();
    const { ctx, page } = await newPage(browser, state, { hash: '#/edit?path=src/content/docs/audio/note-a.mdx' });
    await page.waitForFunction(() => document.querySelector('#title').value === 'A 笔记', null, { timeout: 10000 });
    await page.goto(`${ADMIN}#/edit?path=src/content/docs/camera/note-b.mdx`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelector('#title').value === 'B 笔记', null, { timeout: 10000 });
    const b = await readForm(page);
    check('B 已载入', b.title === 'B 笔记', b.title);
    check('B 创建日期保留 2025-01-02', b.date === '2025-01-02', b.date);
    check('B 更新日期默认今天', b.updated === TODAY, b.updated);
    check('B 分类正确', b.category === 'camera', b.category);
    check('B 未残留 A 的标签', b.tags === 'camera', b.tags);
    check('B 未残留 A 的专题', b.topics.includes('camera') && !b.topics.includes('audio'), b.topics);

    await clickNav(page, 'new');
    await page.waitForTimeout(400);
    const n = await readForm(page);
    const residue = Object.entries(n).filter(([k, v]) => {
      if (['date', 'updated'].includes(k)) return v !== TODAY;
      if (k === 'category') return v !== 'mtk';
      if (k === 'status') return v !== '整理中';
      if (k === 'visibility') return v !== 'public';
      if (k === 'sensitive') return v !== true;
      if (['pageTitle'].includes(k)) return v !== '新建笔记';
      if (['publishLabel'].includes(k)) return v !== '发布笔记';
      if (['previewHidden', 'activeMode'].includes(k)) return false;
      if (k === 'noteList') return v !== '';
      if (k === 'fileSourceName') return v !== '未选择文件';
      if (k === 'targetPath') return v !== 'src/content/docs/mtk/new-note.mdx';
      if (k === 'topicsCount') return v !== 0;
      return v !== '' && !Array.isArray(v);
    });
    check('新建：无任何 A/B 残留字段', residue.length === 0, residue);
    await ctx.close();
  }

  /* ---------------------------------------------------------------
   * 场景 4：异步竞态 —— A 的读取还没回来就点了「新建」
   * --------------------------------------------------------------- */
  section('场景 4：异步竞态（慢读取 vs 新建）');
  {
    const state = freshState({ readDelay: { 'src/content/docs/audio/note-a.mdx': 1500 } });
    const { ctx, page } = await newPage(browser, state, { hash: '#/edit?path=src/content/docs/audio/note-a.mdx' });
    await page.waitForTimeout(200);
    await clickNav(page, 'new');
    await page.waitForTimeout(1800); // 等 A 的响应回来（必须被丢弃）
    const f = await readForm(page);
    check('竞态：A 的迟到响应没有覆盖新建表单', f.title === '' && f.body === '', { title: f.title, body: f.body });
    check('竞态：分类仍为默认', f.category === 'mtk', f.category);
    check('竞态：创建日期仍为今天', f.date === TODAY, f.date);
    check('竞态：更新日期仍为今天', f.updated === TODAY, f.updated);
    await ctx.close();
  }

  /* ---------------------------------------------------------------
   * 场景 5：GitHub 下拉列表载入 A 后立刻新建（另一条异步路径）
   * --------------------------------------------------------------- */
  section('场景 5：下拉列表载入 A → 立刻新建');
  {
    const state = freshState({ readDelay: { 'src/content/docs/audio/note-a.mdx': 1200 } });
    const { ctx, page } = await newPage(browser, state, { hash: '#/new' });
    await page.click('#load-list-button');
    await page.waitForSelector('#note-list option[value="src/content/docs/audio/note-a.mdx"]', {
      state: 'attached',
      timeout: 10000,
    });
    await page.selectOption('#note-list', 'src/content/docs/audio/note-a.mdx');
    await page.waitForTimeout(100);
    await clickNav(page, 'new');
    await page.waitForTimeout(1600);
    const f = await readForm(page);
    check('下拉竞态：表单保持干净', f.title === '' && f.body === '' && f.slug === '', f);
    check('下拉竞态：下拉选中项已清空', f.noteList === '', f.noteList);
    await ctx.close();
  }

  /* ---------------------------------------------------------------
   * 场景 6：编辑旧笔记保存 → 更新原文件；不保存 → 无写请求
   * --------------------------------------------------------------- */
  section('场景 6：编辑旧笔记保存 / 不保存');
  {
    const state = freshState();
    const { ctx, page } = await newPage(browser, state, { hash: '#/edit?path=src/content/docs/audio/note-a.mdx' });
    await page.waitForFunction(() => document.querySelector('#title').value === 'A 笔记', null, { timeout: 10000 });
    await page.click('#publish-button');
    await page.waitForTimeout(300);
    const payload = state.saveCalls[state.saveCalls.length - 1];
    check('编辑保存：带原文件 sha', payload.sha === 'sha-a', payload.sha);
    check('编辑保存：带原文件 path', payload.path === 'src/content/docs/audio/note-a.mdx', payload.path);
    check('编辑保存：创建日期未被改成今天', payload.date === '2026-06-06', payload.date);
    check('编辑保存：更新日期为今天', payload.updated === TODAY, payload.updated);
    await ctx.close();
  }
  {
    const state = freshState();
    const { ctx, page } = await newPage(browser, state, { hash: '#/edit?path=src/content/docs/audio/note-a.mdx' });
    await page.waitForFunction(() => document.querySelector('#title').value === 'A 笔记', null, { timeout: 10000 });
    await page.fill('#body', '# A 笔记\n\n改了一点点但不保存');
    await page.click('#editor-back-link');
    await page.waitForTimeout(500);
    const onNotes = await page.evaluate(() => !document.querySelector('[data-view="notes"]').classList.contains('admin-hidden'));
    check('未保存返回列表：切换成功', onNotes === true, onNotes);
    check('未保存返回列表：有未保存修改提示', state.dialogs.length === 1, state.dialogs.length);
    check('未保存返回列表：没有任何写请求', state.saveCalls.length === 0, state.saveCalls.length);
    await ctx.close();
  }

  /* ---------------------------------------------------------------
   * 场景 7：手动改日期不被无关重渲染覆盖 + 失败不误报
   * --------------------------------------------------------------- */
  section('场景 7：手动日期 / 保存失败反馈');
  {
    const state = freshState();
    const { ctx, page } = await newPage(browser, state, { hash: '#/edit?path=src/content/docs/audio/note-a.mdx' });
    await page.waitForFunction(() => document.querySelector('#title').value === 'A 笔记', null, { timeout: 10000 });
    await page.fill('#date', '2026-01-15');
    await page.fill('#updated', '2026-02-20');
    // 触发各种无关交互：切模式、改标题、填标签、读取列表
    await page.click('.editor-mode-tab[data-mode="split"]');
    await page.fill('#title', 'A 笔记（改）');
    await page.click('.editor-mode-tab[data-mode="preview"]');
    await page.click('.editor-mode-tab[data-mode="edit"]');
    await page.click('#load-list-button');
    await page.waitForTimeout(300);
    const f = await readForm(page);
    check('手动创建日期未被覆盖', f.date === '2026-01-15', f.date);
    check('手动更新日期未被覆盖', f.updated === '2026-02-20', f.updated);
    await ctx.close();
  }
  {
    const state = freshState({ saveFail: true });
    const { ctx, page } = await newPage(browser, state, { hash: '#/edit?path=src/content/docs/audio/note-a.mdx' });
    await page.waitForFunction(() => document.querySelector('#title').value === 'A 笔记', null, { timeout: 10000 });
    await page.click('#publish-button');
    await page.waitForTimeout(400);
    const msg = await page.evaluate(() => {
      const el = document.querySelector('#message');
      return { text: el.textContent, cls: el.className, hidden: el.classList.contains('admin-hidden') };
    });
    check('保存失败：显示错误提示', msg.text.includes('模拟保存失败') && msg.cls.includes('error'), msg);
    check('保存失败：未提示成功', !msg.text.includes('提交成功'), msg.text);
    const label = await page.textContent('#publish-button-text');
    check('保存失败：按钮恢复可点', label === '保存修改', label);
    await ctx.close();
  }

  /* ---------------------------------------------------------------
   * 场景 7b：批量导入暂存内容不能被重置逻辑吃掉 + 元信息面板不被顶部操作区遮住
   * --------------------------------------------------------------- */
  section('场景 7b：批量导入暂存 / 面板遮挡');
  {
    // (1) 首次进入编辑器时消费暂存内容（编辑器未挂载）
    const state = freshState();
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: TZ });
    const page = await ctx.newPage();
    await page.clock.setFixedTime(new Date(FIXED_NOW));
    await page.addInitScript(() => {
      sessionStorage.setItem('admin:pending-upload', '---\ntitle: 导入的笔记\ncategory: mtk\n---\n\n# 导入的笔记\n\n正文来自批量导入');
      sessionStorage.setItem('admin:pending-upload-name', 'imported.md');
    });
    await stubApi(page, state);
    await page.goto(`${ADMIN}#/new`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.admin-layout:not(.admin-hidden)', { timeout: 15000 });
    await page.waitForTimeout(400);
    const imported = await readForm(page);
    check('批量导入①：首次挂载即载入暂存内容', imported.title === '导入的笔记', imported.title);
    check('批量导入①：正文已载入', imported.body.includes('正文来自批量导入'), imported.body);
    check('批量导入①：仍是新建（可发布）', imported.publishLabel === '发布笔记', imported.publishLabel);
    check('批量导入①：暂存已消费', (await page.evaluate(() => sessionStorage.getItem('admin:pending-upload'))) === null);

    // (2) 编辑器已挂载时再点「新建笔记」，暂存内容同样要载入
    await page.click('.admin-nav-item[data-nav-route="dashboard"]');
    await page.waitForTimeout(200);
    await page.evaluate(() => {
      sessionStorage.setItem('admin:pending-upload', '---\ntitle: 第二次导入\n---\n\n# 第二次导入\n\n内容B');
      sessionStorage.setItem('admin:pending-upload-name', 'second.md');
    });
    await clickNav(page, 'new');
    await page.waitForTimeout(400);
    const second = await readForm(page);
    check('批量导入②：编辑器已挂载时也能载入暂存内容', second.title === '第二次导入', second.title);
    check('批量导入②：文件来源名已更新', second.fileSourceName === 'second.md', second.fileSourceName);

    // (3) 元信息面板不能被顶部操作区（含提示信息行）遮住
    const geo = await page.evaluate(() => {
      const head = document.querySelector('.admin-page-head--sticky').getBoundingClientRect();
      const side = document.querySelector('.editor-side').getBoundingClientRect();
      const firstCard = document.querySelector('.editor-side .admin-card').getBoundingClientRect();
      return { headBottom: head.bottom, sideTop: side.top, cardTop: firstCard.top, headH: head.height };
    });
    check('面板遮挡：元信息面板在顶部操作区下方', geo.sideTop >= geo.headBottom - 1, geo);
    check('面板遮挡：第一张卡片完整可见', geo.cardTop >= geo.headBottom - 1, geo);
    await ctx.close();
  }

  /* ---------------------------------------------------------------
   * 场景 8：顶部操作区在长文章中始终可达 + 防重复提交
   * --------------------------------------------------------------- */
  section('场景 8：顶部操作区可达性 / 防重复提交');
  {
    const state = freshState({ saveDelay: 800 });
    const { ctx, page } = await newPage(browser, state, { hash: '#/new' });
    await page.fill('#title', '长文章');
    await page.fill('#slug', 'long-note');
    await page.fill('#body', Array.from({ length: 200 }, (_, i) => `第 ${i + 1} 行内容`).join('\n'));
    // 模拟一篇很长的正文：把编辑器拉高，制造需要长距离滚动的页面
    await page.addStyleTag({ content: '.editor-textarea { min-height: 2400px !important; }' });
    await page.evaluate(() =>
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }),
    );
    await page.waitForTimeout(300);

    const pos = await page.evaluate(() => {
      const btn = document.querySelector('#publish-button');
      const draft = document.querySelector('#save-draft-button');
      const r = btn.getBoundingClientRect();
      const d = draft.getBoundingClientRect();
      return {
        top: r.top,
        bottom: r.bottom,
        draftTop: d.top,
        viewportH: window.innerHeight,
        clientY: r.top + r.height / 2,
        x: r.left + r.width / 2,
        scrollY: window.scrollY,
      };
    });
    check('长文章滚动后：页面确实滚动了', pos.scrollY > 1500, pos.scrollY);
    check(
      '长文章滚动后：发布按钮仍在视口内（sticky）',
      pos.top >= 0 && pos.bottom <= pos.viewportH,
      pos,
    );
    check('长文章滚动后：保存草稿按钮仍在视口内', pos.draftTop >= 0 && pos.draftTop < pos.viewportH, pos);

    // 用真实点击（会因遮挡而失败）验证按钮真的可点，而不是被别的元素盖住
    await page.click('#publish-button', { timeout: 5000 });
    await page.click('#publish-button', { timeout: 5000, force: true }).catch(() => {});
    await page.click('#publish-button', { timeout: 5000, force: true }).catch(() => {});
    await page.waitForTimeout(1600);
    check('防重复提交：只产生一次保存请求', state.saveCalls.length === 1, state.saveCalls.length);

    // 根因回归：若把 .admin-main 改回 overflow-x:hidden，它会变成滚动容器，sticky 立刻失效
    await page.addStyleTag({ content: '.admin-main { overflow-x: hidden !important; }' });
    await page.evaluate(() =>
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }),
    );
    await page.waitForTimeout(200);
    const broken = await page.evaluate(() => {
      const r = document.querySelector('#publish-button').getBoundingClientRect();
      return { top: r.top, scrollY: window.scrollY };
    });
    check(
      '根因确认：overflow-x:hidden 会让顶部操作区随页面滚走（故必须用 clip）',
      broken.scrollY > 1500 && broken.top < 0,
      broken,
    );
    await ctx.close();
  }

  /* ---------------------------------------------------------------
   * 场景 9：移动端宽度下顶部操作区不遮挡编辑内容
   * --------------------------------------------------------------- */
  section('场景 9：窄屏（390px）');
  {
    const state = freshState();
    const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, timezoneId: TZ });
    const page = await ctx.newPage();
    await page.clock.setFixedTime(new Date(FIXED_NOW));
    await stubApi(page, state);
    await page.goto(`${ADMIN}#/new`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.admin-layout:not(.admin-hidden)', { timeout: 15000 });
    await page.fill('#title', '窄屏');
    await page.evaluate(() => window.scrollTo({ top: 1200, behavior: 'instant' }));
    await page.waitForTimeout(200);
    const m = await page.evaluate(() => {
      const head = document.querySelector('.admin-page-head--sticky');
      const hr = head.getBoundingClientRect();
      const btn = document.querySelector('#publish-button').getBoundingClientRect();
      const draft = document.querySelector('#save-draft-button').getBoundingClientRect();
      return {
        headTop: hr.top,
        headBottom: hr.bottom,
        headWidth: hr.width,
        viewportW: window.innerWidth,
        publish: { left: btn.left, right: btn.right, top: btn.top, bottom: btn.bottom },
        draft: { left: draft.left, right: draft.right },
        scrollWidth: document.documentElement.scrollWidth,
        bodyScrollWidth: document.body.scrollWidth,
      };
    });
    check('窄屏：顶部操作区贴合顶栏', m.headTop >= 0 && m.headTop <= 62, m.headTop);
    check('窄屏：顶部操作区宽度不超出视口', m.headWidth <= m.viewportW, m);
    check(
      '窄屏：发布按钮完整可见（未被裁掉）',
      m.publish.left >= 0 && m.publish.right <= m.viewportW,
      m.publish,
    );
    check(
      '窄屏：保存草稿按钮完整可见',
      m.draft.left >= 0 && m.draft.right <= m.viewportW,
      m.draft,
    );
    check('窄屏：没有横向滚动', m.scrollWidth <= m.viewportW + 1 && m.bodyScrollWidth <= m.viewportW + 1, m);
    await ctx.close();
  }

  await browser.close();

  console.log(`\n${'='.repeat(56)}`);
  console.log(`通过 ${results.length - failed} / ${results.length} 项断言`);
  if (failed) {
    console.log('失败项：');
    results.filter((r) => !r.ok).forEach((r) => console.log(`  - ${r.name}: ${JSON.stringify(r.detail)}`));
  }
  console.log('='.repeat(56));
  process.exit(failed ? 1 : 0);
})().catch((error) => {
  console.error('验收脚本异常：', error);
  process.exit(1);
});
