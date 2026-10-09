/**
 * 后台「操作日志」页验收测试（Playwright + stub /api/logs/list）
 *
 * 运行：node scripts/_verify-logs.cjs [baseUrl]
 * 不依赖真实 GitHub 凭据，也不会写任何远端文件。
 */
const { chromium } = require('playwright');
const fs = require('fs');

const BASE = (process.argv[2] || 'http://127.0.0.1:4327').replace(/\/$/, '');
const ADMIN = `${BASE}/admin`;
const OUT = 'artifacts/logs-after';
const TZ = 'Asia/Shanghai';
const FIXED_NOW = '2026-10-09T02:30:00.000Z'; // 东八区 2026-10-09 10:30

let failed = 0;
const results = [];

function check(name, condition, detail) {
  const ok = !!condition;
  if (!ok) failed++;
  results.push({ name, ok, detail });
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${ok || detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`);
}

function section(title) {
  console.log(`\n=== ${title} ===`);
}

/* ---------------- 造日志数据（覆盖 5 种操作、多操作者、长路径、缺字段） ---------------- */
const ACTIONS = ['note.create', 'note.update', 'note.delete', 'image.upload', 'image.delete'];
const ACTORS = ['KBin-001', 'kevin-audit', 'translate-bot'];
const TITLES = ['[MTK]屏幕帧率精确匹配', '[GMS]解决 Multichannel Mixdown Test fail', '[Audio]音量键波形异常排查'];

function buildEntries(n) {
  const entries = [];
  for (let i = 0; i < n; i++) {
    const action = ACTIONS[i % ACTIONS.length];
    const actor = ACTORS[i % ACTORS.length];
    const isImage = action.startsWith('image.');
    const target = isImage
      ? `src/content/docs/mtk/images/very-long-image-directory-name/another-level/screenshot-${i}.png`
      : `src/content/docs/mtk/very-long-note-slug-name-to-test-ellipsis-${i}.mdx`;
    const basename = target.split('/').pop();
    const entry = {
      id: `log-${String(i).padStart(3, '0')}`,
      ts: new Date(Date.parse(FIXED_NOW) - i * 3600 * 1000 * 7).toISOString(),
      action,
      actor,
      target,
      // 真实后端：图片操作 title = 文件名（functions/api/notes/upload-image.ts），笔记则用笔记标题
      title: isImage ? basename : i % 7 === 3 ? undefined : `${TITLES[i % TITLES.length]} #${i}`,
      commit: i % 11 === 5 ? undefined : `${(i + 1).toString(16).padStart(7, 'a')}${'0123456789abcdef'.repeat(2)}`.slice(0, 40),
    };
    if (i === 1) entry.details = { size: 204800, source: 'admin-upload' };
    entries.push(entry);
  }
  return entries;
}

const ENTRIES = buildEntries(42);

function statsOf(entries) {
  return entries.reduce((acc, e) => {
    acc[e.action] = (acc[e.action] || 0) + 1;
    return acc;
  }, {});
}

function actorsOf(entries) {
  return entries.reduce((acc, e) => {
    acc[e.actor] = (acc[e.actor] || 0) + 1;
    return acc;
  }, {});
}

async function stub(page, state = {}) {
  await page.route('**/api/auth/me', (r) =>
    r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ user: { login: 'tester' }, repo: { owner: 'o', repo: 'r', branch: 'main' } }),
    }),
  );
  await page.route('**/api/logs/list**', (r) => {
    state.requestUrl = r.request().url();
    return r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        entries: ENTRIES,
        total: ENTRIES.length,
        filtered: ENTRIES.length,
        stats: statsOf(ENTRIES),
        actors: actorsOf(ENTRIES),
      }),
    });
  });
}

/** 开发服务器在文件被外部工具占用时可能弹出 vite 错误遮罩，测试前移除（不影响生产构建） */
async function clearDevOverlay(page) {
  await page.evaluate(() => document.querySelectorAll('vite-error-overlay').forEach((el) => el.remove()));
}

async function openLogs(browser, viewport = { width: 1440, height: 900 }) {
  const ctx = await browser.newContext({ viewport, timezoneId: TZ });
  const page = await ctx.newPage();
  await page.clock.setFixedTime(new Date(FIXED_NOW));
  const state = {};
  await stub(page, state);
  await page.goto(`${ADMIN}#/logs`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.admin-layout:not(.admin-hidden)', { timeout: 15000 });
  await page.waitForSelector('#logs-tbody tr.logs-row', { timeout: 15000 });
  await clearDevOverlay(page);
  await page.waitForTimeout(200);
  return { ctx, page, state };
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();

  /* ---------------- 桌面 ---------------- */
  const { ctx, page } = await openLogs(browser);

  section('结构：紧凑表格 5 列');
  const head = await page.$$eval('.logs-table thead th', (ths) => ths.map((t) => t.textContent.trim()));
  check('表头为 5 列且文案正确', JSON.stringify(head) === JSON.stringify(['操作对象', '操作类型', '操作人', '操作时间', '操作详情']), head);

  const layout = await page.evaluate(() => {
    const wrap = document.querySelector('.logs-table-wrap').getBoundingClientRect();
    const table = document.querySelector('.logs-table').getBoundingClientRect();
    const vw = window.innerWidth;
    return { wrapW: wrap.width, tableW: table.width, vw };
  });
  check('桌面：表格填满横向空间（占容器 ≥95%）', layout.tableW / layout.wrapW >= 0.95, layout);

  section('每行内容：标题为主 + 路径为次级');
  const firstRow = await page.evaluate(() => {
    const row = document.querySelector('#logs-tbody tr.logs-row');
    const t = row.querySelector('.logs-object-title');
    const p = row.querySelector('.logs-object-path');
    const file = row.querySelector('.logs-path-file');
    const cs = (el) => getComputedStyle(el);
    return {
      title: t.textContent.trim(),
      path: p.textContent.trim(),
      file: file.textContent.trim(),
      fileClipped: file.scrollWidth > file.clientWidth + 1,
      titleWeight: cs(t).fontWeight,
      titleColor: cs(t).color,
      pathColor: cs(p).color,
      pathFont: cs(p).fontFamily,
      sameColor: cs(t).color === cs(p).color,
    };
  });
  check('标题非空', firstRow.title.length > 0, firstRow.title);
  check('路径为完整文件路径', firstRow.path.startsWith('src/content/docs/'), firstRow.path);
  check('路径拆出文件名且完整可见（未被省略）', firstRow.file.endsWith('.mdx') && !firstRow.fileClipped, firstRow);
  check('标题与路径视觉层级不同（颜色不同）', firstRow.sameColor === false, firstRow);
  check('路径使用等宽字体', /mono|Menlo|Consolas|ui-monospace/i.test(firstRow.pathFont), firstRow.pathFont);

  // 图片操作：title 就是文件名，次级信息只显示目录，不能重复出现同一个文件名
  const imageRow = await page.evaluate(() => {
    const row = Array.from(document.querySelectorAll('#logs-tbody tr.logs-row')).find((r) =>
      /上传图片|删除图片/.test(r.querySelector('.logs-badge').textContent),
    );
    if (!row) return null;
    const title = row.querySelector('.logs-object-title').textContent.trim();
    const pathEl = row.querySelector('.logs-object-path');
    return { title, path: pathEl ? pathEl.textContent.trim() : '', pathCount: row.querySelectorAll('.logs-object-path').length };
  });
  check('图片行：存在图片类操作行', imageRow !== null, imageRow);
  check('图片行：文件名不与路径重复', imageRow && !imageRow.path.includes(imageRow.title), imageRow);
  check('图片行：仍保留所在目录', imageRow && imageRow.path.startsWith('src/content/docs/'), imageRow);

  section('操作类型：不同颜色的轻量 Badge');
  const badges = await page.evaluate(() => {
    const out = {};
    document.querySelectorAll('#logs-tbody tr.logs-row').forEach((row) => {
      const b = row.querySelector('.logs-badge');
      const cls = b.className.replace('logs-badge ', '');
      if (!out[cls]) {
        const cs = getComputedStyle(b);
        out[cls] = { label: b.textContent.trim(), color: cs.color, bg: cs.backgroundColor, radius: cs.borderRadius };
      }
    });
    return out;
  });
  const badgeKeys = Object.keys(badges);
  check('存在 4 类 Badge 样式', ['logs-badge-create', 'logs-badge-update', 'logs-badge-image', 'logs-badge-delete'].every((k) => badgeKeys.includes(k)), badgeKeys);
  const colors = new Set(badgeKeys.map((k) => badges[k].color));
  check('不同类别使用不同颜色', colors.size >= 3, [...colors]);
  check('Badge 样式真实生效（有背景色+圆角）', Object.values(badges).every((b) => b.bg !== 'rgba(0, 0, 0, 0)' && b.radius !== '0px'), badges['logs-badge-create']);
  check('新建/更新/图片 Badge 文案正确', ['新建笔记', '更新笔记'].every((l) => Object.values(badges).some((b) => b.label === l)), Object.values(badges).map((b) => b.label));

  section('时间：统一格式 + 悬停完整时间');
  const times = await page.$$eval('#logs-tbody tr.logs-row time.logs-time', (els) =>
    els.map((el) => ({ text: el.textContent.trim(), title: el.getAttribute('title'), dt: el.getAttribute('datetime') })),
  );
  check('时间格式统一为 YYYY-MM-DD HH:mm', times.every((t) => /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(t.text)), times[0]);
  check('首行按本地时区（东八区）渲染 10:30', times[0].text.endsWith('10:30'), times[0]);
  check('悬停标题含秒级完整时间', /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}（本地时间/.test(times[0].title), times[0].title);
  check('datetime 属性保留原始 ISO', /^\d{4}-\d{2}-\d{2}T/.test(times[0].dt), times[0].dt);

  section('技术信息默认隐藏，点详情展开 + 复制');
  const commitVisibleBefore = await page.evaluate(
    (sha) => document.body.innerText.includes(sha),
    ENTRIES[0].commit,
  );
  check('默认不显示 Commit hash', commitVisibleBefore === false, commitVisibleBefore);

  await page.click('#logs-tbody tr.logs-row:first-child [data-log-toggle]');
  await page.waitForTimeout(150);
  const detail = await page.evaluate(() => {
    const row = document.querySelector('#logs-tbody tr.logs-detail-row');
    if (!row) return null;
    const items = Array.from(row.querySelectorAll('.logs-detail-item')).map((it) => ({
      label: it.querySelector('.logs-detail-label').textContent.trim(),
      value: it.querySelector('.logs-detail-value').textContent.trim(),
    }));
    return {
      labels: items.map((i) => i.label),
      items,
      copyBtns: row.querySelectorAll('[data-copy-value]').length,
      hasCommit: row.innerText.includes('Commit'),
    };
  });
  check('详情行已展开', detail !== null, detail);
  check('详情包含 Commit 字段', detail && detail.hasCommit, detail && detail.labels);
  check('详情含文件路径/时间/ID 等字段', detail && ['文件路径', '操作类型', '完整时间', '日志 ID'].every((l) => detail.labels.includes(l)), detail && detail.labels);
  const commitValue = detail && (detail.items.find((i) => i.label === 'Commit') || {}).value;
  check('详情值完整展示 commit sha（未截断）', commitValue === ENTRIES[0].commit, commitValue);
  check('详情提供复制按钮', detail && detail.copyBtns >= 2, detail && detail.copyBtns);
  check('展开后展开按钮变为「收起」', (await page.textContent('#logs-tbody tr.logs-row:first-child .logs-detail-btn')).includes('收起'));

  await ctx.close();

  /* ---------------- 复制 ---------------- */
  section('复制 Commit');
  {
    const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: TZ, permissions: ['clipboard-read', 'clipboard-write'] });
    const p2 = await ctx2.newPage();
    await p2.clock.setFixedTime(new Date(FIXED_NOW));
    await stub(p2);
    await p2.goto(`${ADMIN}#/logs`, { waitUntil: 'domcontentloaded' });
    await p2.waitForSelector('#logs-tbody tr.logs-row', { timeout: 15000 });
    await clearDevOverlay(p2);
    await p2.click('#logs-tbody tr.logs-row:first-child [data-log-toggle]');
    await p2.waitForTimeout(150);
    const copyBtn = p2.locator('#logs-tbody tr.logs-detail-row [data-copy-value]').first();
    await copyBtn.click();
    await p2.waitForTimeout(250);
    const msg = await p2.textContent('#logs-message');
    check('复制后给出反馈提示', /已复制/.test(msg || ''), msg);
    const inline = await copyBtn.textContent();
    check('复制按钮就地显示「已复制」', /已复制/.test(inline || ''), inline);
    check('日志行本身仍保持不变', (await p2.locator('#logs-tbody tr.logs-row').count()) >= 1);
    await ctx2.close();
  }

  /* ---------------- 分页 / 筛选 / 空状态 ---------------- */
  section('分页、筛选与空状态');
  {
    const { ctx: c3, page: p3, state: s3 } = await openLogs(browser);

    check('请求覆盖后端全部保留日志（limit=500）', /limit=500/.test(s3.requestUrl || ''), s3.requestUrl);
    const pageRows = await p3.locator('#logs-tbody tr.logs-row').count();
    check('第一页 15 行', pageRows === 15, pageRows);
    const pagVisible = await p3.evaluate(() => !document.querySelector('#logs-pagination').classList.contains('admin-hidden'));
    check('分页条可见', pagVisible === true);
    const info = await p3.textContent('#logs-page-info');
    check('分页信息含总页数', /第 1 \/ 3 页/.test(info || ''), info);

    const firstIdPage1 = await p3.getAttribute('#logs-tbody tr.logs-row:first-child', 'data-log-id');
    await p3.click('[data-log-page="2"]');
    await p3.waitForTimeout(200);
    const firstIdPage2 = await p3.getAttribute('#logs-tbody tr.logs-row:first-child', 'data-log-id');
    check('切到第 2 页数据变化', firstIdPage1 !== firstIdPage2, { firstIdPage1, firstIdPage2 });
    check('第 2 页仍有 15 行', (await p3.locator('#logs-tbody tr.logs-row').count()) === 15);

    // 类型筛选
    await p3.click('#logs-action-filter [data-log-filter="note.create"]');
    await p3.waitForTimeout(200);
    const onlyCreate = await p3.$$eval('#logs-tbody tr.logs-row .logs-badge', (els) => els.map((e) => e.textContent.trim()));
    check('类型筛选只保留「新建笔记」', onlyCreate.length > 0 && onlyCreate.every((l) => l === '新建笔记'), onlyCreate.slice(0, 3));
    check('筛选后回到第 1 页', /第 1 \//.test((await p3.textContent('#logs-page-info')) || '第 1 / 1 页'));

    // 搜索（命中标题或路径）
    await p3.click('#logs-action-filter [data-log-filter="all"]');
    await p3.fill('#logs-search', 'screenshot-3');
    await p3.waitForTimeout(250);
    const hitRows = await p3.$$eval('#logs-tbody tr.logs-row', (trs) =>
      trs.map((tr) => tr.querySelector('.logs-cell-object').textContent.trim()),
    );
    check(
      '搜索命中文件名（图片行以文件名为主标题）',
      hitRows.length > 0 && hitRows.every((t) => t.includes('screenshot-3')),
      hitRows,
    );
    await p3.fill('#logs-search', 'very-long-note-slug-name-to-test-ellipsis-1');
    await p3.waitForTimeout(250);
    const hitNotes = await p3.$$eval('#logs-tbody tr.logs-row', (trs) =>
      trs.map((tr) => ({
        object: tr.querySelector('.logs-cell-object').textContent.replace(/\s+/g, ' ').trim(),
        title: tr.querySelector('.logs-object-title').textContent.trim(),
      })),
    );
    check(
      '搜索命中笔记（无标题的行用文件名作主标题，不重复展示）',
      hitNotes.length > 0 && hitNotes.every((r) => r.object.includes('very-long-note-slug-name-to-test-ellipsis-1')),
      hitNotes,
    );
    check(
      '搜索命中的笔记行标题为笔记标题',
      hitNotes.some((r) => r.title.startsWith('[GMS]解决 Multichannel Mixdown Test fail #1')),
      hitNotes.map((r) => r.title),
    );

    await p3.fill('#logs-search', 'zzz-不存在的关键词');
    await p3.waitForTimeout(250);
    const empty = await p3.textContent('#logs-tbody');
    check('无结果时显示空状态', /没有匹配的日志记录/.test(empty || ''), empty && empty.slice(0, 80));
    const pagHidden = await p3.evaluate(() => document.querySelector('#logs-pagination').classList.contains('admin-hidden'));
    check('空状态时分页条隐藏', pagHidden === true);

    // 操作者筛选
    await p3.fill('#logs-search', '');
    await p3.selectOption('#logs-actor-filter', 'translate-bot');
    await p3.waitForTimeout(250);
    const actors = await p3.$$eval('#logs-tbody tr.logs-row .logs-actor', (els) => els.map((e) => e.textContent.trim()));
    check('操作者筛选生效', actors.length > 0 && actors.every((a) => a === '@translate-bot'), actors.slice(0, 3));

    await p3.screenshot({ path: `${OUT}/logs-1440.png`, fullPage: false });
    await c3.close();
  }

  /* ---------------- 移动端 ---------------- */
  section('移动端（390px）不横向溢出');
  {
    const { ctx: c4, page: p4 } = await openLogs(browser, { width: 390, height: 780 });
    const m = await p4.evaluate(() => {
      const wrap = document.querySelector('.logs-table-wrap');
      const table = document.querySelector('.logs-table');
      const row = document.querySelector('#logs-tbody tr.logs-row');
      const cs = getComputedStyle(row);
      return {
        vw: window.innerWidth,
        docScrollW: document.documentElement.scrollWidth,
        bodyScrollW: document.body.scrollWidth,
        wrapScrollW: wrap.scrollWidth,
        wrapClientW: wrap.clientWidth,
        tableW: table.getBoundingClientRect().width,
        rowDisplay: cs.display,
        theadDisplay: getComputedStyle(document.querySelector('.logs-table thead')).display,
      };
    });
    check('移动端：页面无横向滚动', m.docScrollW <= m.vw + 1 && m.bodyScrollW <= m.vw + 1, m);
    check('移动端：表格不超出容器', m.tableW <= m.wrapClientW + 1, m);
    check('移动端：表头隐藏、行改为堆叠布局', m.theadDisplay === 'none' && m.rowDisplay === 'grid', m);
    check('移动端：容器内无横向溢出', m.wrapScrollW <= m.wrapClientW + 1, m);

    // 展开详情在移动端也不溢出
    await p4.click('#logs-tbody tr.logs-row:first-child [data-log-toggle]');
    await p4.waitForTimeout(200);
    const m2 = await p4.evaluate(() => ({
      docScrollW: document.documentElement.scrollWidth,
      vw: window.innerWidth,
      detailExists: !!document.querySelector('#logs-tbody tr.logs-detail-row'),
    }));
    check('移动端：展开详情后仍无横向溢出', m2.detailExists && m2.docScrollW <= m2.vw + 1, m2);

    await p4.screenshot({ path: `${OUT}/logs-390.png` });
    await c4.close();
  }

  /* ---------------- 统计卡片保留 ---------------- */
  section('统计卡片 + 刷新');
  {
    const { ctx: c5, page: p5 } = await openLogs(browser);
    const stats = await p5.$$eval('[data-log-stat]', (els) => els.map((e) => ({ k: e.getAttribute('data-log-stat'), v: e.textContent.trim() })));
    check('统计卡片保留且已填数', stats.length === 5 && stats.every((s) => s.v !== '—'), stats);
    await p5.click('#logs-refresh-btn');
    await p5.waitForTimeout(400);
    check('刷新后仍正常渲染', (await p5.locator('#logs-tbody tr.logs-row').count()) > 0);
    await c5.close();
  }

  await browser.close();
  console.log(`\n${'='.repeat(52)}`);
  console.log(`通过 ${results.length - failed} / ${results.length} 项断言`);
  if (failed) results.filter((r) => !r.ok).forEach((r) => console.log(`  - ${r.name}: ${JSON.stringify(r.detail)}`));
  console.log('='.repeat(52));
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error('验收脚本异常：', e);
  process.exit(1);
});
