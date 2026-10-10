/**
 * 首页「知识日历」验收测试（Playwright，针对生产构建产物 dist/）。
 *
 * 运行：
 *   1) npm run build
 *   2) npx astro preview --port 4331
 *   3) node scripts/_verify-calendar.cjs http://127.0.0.1:4331
 *
 * 做法：拦截首页 HTML，把内嵌的活动 JSON 换成本用例的固定数据，
 * 从而用「真实组件 + 真实客户端脚本」验证各种统计与交互场景。
 * 不依赖 GitHub 凭据，也不会写任何远端文件。
 */
const { chromium } = require('playwright');
const fs = require('fs');

const BASE = (process.argv[2] || 'http://127.0.0.1:4331').replace(/\/$/, '');
const OUT = 'artifacts/knowledge-calendar';
const TZ = 'Asia/Shanghai';

/** 固定「今天」= 东八区 2026-10-09 10:30（周五） */
const FIXED_NOW = '2026-10-09T02:30:00.000Z';

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

/* ------------------------------------------------------------------ *
 * 固定活动数据
 * 覆盖：今天新建 / 今天更新 / 昨天更新 / 同一篇连续两天 / 同日多次 /
 *       UTC 与本地日界差 / 跨月边界 / 跨年 / 月末跨午夜
 * ------------------------------------------------------------------ */
const note = (slug, title) => ({
  path: `src/content/docs/mtk/${slug}.mdx`,
  url: `/mtk/${slug}/`,
  title,
});

const EVENTS = [
  // 今天 10-09（本地 09:00）新建
  { ts: '2026-10-09T01:00:00.000Z', action: 'create', ...note('note-a', 'A 新建于今天') },
  // 今天 10-09（本地 10:00）更新旧笔记 B
  { ts: '2026-10-09T02:00:00.000Z', action: 'update', ...note('note-b', 'B 连续两天更新') },
  // 今天 10-09（本地 10:15）再次更新同一篇 B —— 同一天多次
  { ts: '2026-10-09T02:15:00.000Z', action: 'update', ...note('note-b', 'B 连续两天更新') },
  // 昨天 10-08（本地 09:00）更新 B —— 同一篇连续两天
  { ts: '2026-10-08T01:00:00.000Z', action: 'update', ...note('note-b', 'B 连续两天更新') },
  // 昨天 10-08（本地 11:00）新建 C
  { ts: '2026-10-08T03:00:00.000Z', action: 'create', ...note('note-c', 'C 新建于昨天') },
  // UTC 10-08 17:00 = 本地 10-09 01:00 → 必须落在 10-09，不能落到 10-08
  { ts: '2026-10-08T17:00:00.000Z', action: 'update', ...note('note-d', 'D 跨 UTC 日界') },
  // UTC 09-30 16:30 = 本地 10-01 00:30 → 必须落在 10-01（跨月 + 日界）
  { ts: '2026-09-30T16:30:00.000Z', action: 'create', ...note('note-e', 'E 跨月边界') },
  // 本地 10-05（周一）单独一天，用来打断连续统计
  { ts: '2026-10-05T02:00:00.000Z', action: 'update', ...note('note-a', 'A 新建于今天') },
  // 跨年：本地 2025-12-31
  { ts: '2025-12-31T02:00:00.000Z', action: 'update', ...note('note-f', 'F 去年最后一天') },
  // 已删除/无法解析的笔记：应显示为不可点击的占位文案
  {
    ts: '2026-10-09T03:00:00.000Z',
    action: 'update',
    title: 'Z 已被删除',
    path: 'src/content/docs/mtk/note-z.mdx',
    url: null,
  },
  // 月末，用于跨午夜测试
  { ts: '2026-10-31T01:00:00.000Z', action: 'update', ...note('note-g', 'G 月末更新') },
  // 10-30 故意留空，用来验证「昨天没有记录则连续中断」
  { ts: '2026-10-29T01:00:00.000Z', action: 'update', ...note('note-h', 'H 月末前两天') },
];

const FIXTURE = JSON.stringify({ events: EVENTS }).replace(/</g, '\\u003c');

/* ---------------- 页面工具 ---------------- */

async function stubActivity(page, fixture = FIXTURE) {
  await page.route(`${BASE}/`, async (route) => {
    const response = await route.fetch();
    const body = await response.text();
    const replaced = body.replace(
      /(<script type="application\/json" data-kw-activity>)[\s\S]*?(<\/script>)/,
      (_, open, close) => `${open}${fixture}${close}`,
    );
    if (replaced === body) throw new Error('未能替换活动 JSON：页面里找不到 data-kw-activity');
    await route.fulfill({ response, body: replaced });
  });
}

async function clearDevOverlay(page) {
  await page.evaluate(() => document.querySelectorAll('vite-error-overlay').forEach((el) => el.remove()));
}

/**
 * 打开首页。
 * @param installed true 时使用 clock.install（可 fastForward 模拟跨午夜）；
 *                  否则用 setFixedTime（日期固定不变，适合普通断言）。
 */
async function openCalendar(
  browser,
  { fixedTime = FIXED_NOW, viewport = { width: 1440, height: 1000 }, fixture = FIXTURE, installed = false, stub = true } = {},
) {
  const ctx = await browser.newContext({ viewport, timezoneId: TZ });
  const page = await ctx.newPage();
  if (installed) await page.clock.install({ time: new Date(fixedTime) });
  else await page.clock.setFixedTime(new Date(fixedTime));
  if (stub) await stubActivity(page, fixture);
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-kw-grid] .mini-cal-cell:not(.is-empty)', { timeout: 15000 });
  await clearDevOverlay(page);
  await page.waitForTimeout(120);
  return { ctx, page };
}

/** 读取日历当前状态 */
async function readState(page) {
  return page.evaluate(() => {
    const root = document.querySelector('[data-kw-calendar]');
    const text = (sel) => {
      const el = root.querySelector(sel);
      return el ? el.textContent.trim() : null;
    };
    return {
      todayDate: text('[data-kw-today-date]'),
      todayWeek: text('[data-kw-today-week]'),
      streakChip: text('[data-kw-streak]'),
      statToday: text('[data-kw-stat-today]'),
      statWeek: text('[data-kw-stat-week]'),
      statStreak: text('[data-kw-stat-streak]'),
      month: text('[data-kw-month]'),
      weekdayLabels: [...root.querySelectorAll('.mini-cal-weekday')].map((c) => c.textContent.trim()),
      dayCells: [...root.querySelectorAll('.mini-cal-cell')].map((c) => ({
        day: c.dataset.day || null,
        empty: c.classList.contains('is-empty'),
        active: c.classList.contains('is-active'),
        today: c.classList.contains('is-today'),
        selected: c.classList.contains('is-selected'),
        clickable: c.classList.contains('is-clickable'),
        title: c.getAttribute('title'),
        text: c.textContent.trim(),
      })),
      detailHidden: root.querySelector('[data-kw-detail]').hidden,
      detailText: root.querySelector('[data-kw-detail]').textContent.replace(/\s+/g, ' ').trim(),
      detailItems: [...root.querySelectorAll('.mini-cal-detail-item')].map((li) => ({
        badge: li.querySelector('.mini-cal-detail-badge').textContent.trim(),
        time: li.querySelector('.mini-cal-detail-time').textContent.trim(),
        title: li.querySelector('.mini-cal-detail-title').textContent.trim(),
        href: li.querySelector('.mini-cal-detail-title').getAttribute('href'),
      })),
      detailCounts: (root.querySelector('.mini-cal-detail-counts') || {}).textContent || null,
    };
  });
}

const dayOf = (state, key) => state.dayCells.find((c) => c.day === key);
const daysIn = (state) => state.dayCells.filter((c) => c.day).length;

/** 反复点击上一月/下一月直到月份标题匹配（避免用固定点击次数算错年份） */
async function gotoMonth(page, target) {
  for (let i = 0; i < 60; i += 1) {
    const current = await page.textContent('[data-kw-month]');
    if (current.trim() === target) return true;
    const [cy, cm] = current.trim().replace(' 年 ', '-').replace(' 月', '').split('-').map(Number);
    const [ty, tm] = target.replace(' 年 ', '-').replace(' 月', '').split('-').map(Number);
    await page.click(cy * 12 + cm < ty * 12 + tm ? '[data-kw-next]' : '[data-kw-prev]');
    await page.waitForTimeout(35);
  }
  return false;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();

  /* ================= 1. 基础渲染 / 今天 ================= */
  {
    const { ctx, page } = await openCalendar(browser);
    const s = await readState(page);

    section('一、今天：动态日期 + 连续天数 + 统计');
    check('今天日期来自浏览器本地时区（2026-10-09）', s.todayDate === '2026-10-09', s.todayDate);
    check('星期与日期对应（周五）', s.todayWeek === '周五', s.todayWeek);
    check('月份标题正确', s.month === '2026 年 10 月', s.month);
    check('今天有活动标记', dayOf(s, '2026-10-09')?.active === true, dayOf(s, '2026-10-09'));
    check('今天是橙色实心圆', dayOf(s, '2026-10-09')?.today === true, dayOf(s, '2026-10-09'));
    // 10-09 共 5 条：新建 A、更新 B×2、更新 D（UTC 日界）、更新 Z（已删除）
    check('今天统计为 5 条', s.statToday === '5', s.statToday);
    check('连续天数为 2（10-09、10-08；10-07 无记录即中断）', s.statStreak === '2', s.statStreak);
    check('连续天数徽标同步', s.streakChip === '连续 2 天', s.streakChip);
    // 本周（周一 10-05 起）：10-05(1) + 10-08(2) + 10-09(5) = 8
    check('本周整理计数为 8（周一 10-05 起）', s.statWeek === '8', s.statWeek);

    section('二、昨天与历史：活动被保留');
    check('昨天 10-08 保留活动标记', dayOf(s, '2026-10-08')?.active === true, dayOf(s, '2026-10-08'));
    check('同一篇笔记连续两天：10-08 与 10-09 均有记录', dayOf(s, '2026-10-08')?.active === true && dayOf(s, '2026-10-09')?.active === true);
    check('10-05 也有记录（但不算入连续）', dayOf(s, '2026-10-05')?.active === true, dayOf(s, '2026-10-05'));
    check('无记录日期不显示圆点', dayOf(s, '2026-10-07')?.active === false, dayOf(s, '2026-10-07'));

    section('三、时区：UTC 与本地日界');
    check('UTC 10-08T17:00Z 归到本地 10-09（未错位到 10-08）', dayOf(s, '2026-10-09')?.active === true);
    check(
      '10-08 只统计本地属于 10-08 的 2 条（未被 17:00Z 那条污染）',
      /新建 1/.test(dayOf(s, '2026-10-08')?.title || '') && /共 2 条/.test(dayOf(s, '2026-10-08')?.title || ''),
      dayOf(s, '2026-10-08')?.title,
    );
    check('UTC 09-30T16:30Z 归到本地 10-01（跨月 + 日界）', dayOf(s, '2026-10-01')?.active === true, dayOf(s, '2026-10-01'));
    check('10-01 的 tooltip 显示 1 条', /共 1 条/.test(dayOf(s, '2026-10-01')?.title || ''), dayOf(s, '2026-10-01')?.title);

    section('四、网格：星期对齐与天数');
    check('星期表头为周一起始', JSON.stringify(s.weekdayLabels) === JSON.stringify(['一', '二', '三', '四', '五', '六', '日']), s.weekdayLabels);
    check('10 月共 35 格（3 前导空 + 31 天，补齐整周）', s.dayCells.length === 35, s.dayCells.length);
    check('前 3 格为空（10-01 是周四）', s.dayCells.slice(0, 3).every((c) => c.empty === true), s.dayCells.slice(0, 3));
    check('第 4 格是 10-01', s.dayCells[3].day === '2026-10-01', s.dayCells[3]);
    check(
      '1→31 全部存在、顺序正确且不重复',
      JSON.stringify(s.dayCells.filter((c) => c.day).map((c) => Number(c.day.slice(-2)))) ===
        JSON.stringify(Array.from({ length: 31 }, (_, i) => i + 1)),
      daysIn(s),
    );
    check('日期未错位：10-09 落在第 12 格（周五）', s.dayCells[11].day === '2026-10-09' && s.dayCells[11].today === true, s.dayCells[11]);

    section('五、Tooltip：同一天多条记录显示数量');
    const t09 = dayOf(s, '2026-10-09')?.title || '';
    check('10-09 tooltip 含 新建 1 / 更新 4 / 共 5 条', /新建 1/.test(t09) && /更新 4/.test(t09) && /共 5 条/.test(t09), t09);

    await page.screenshot({ path: `${OUT}/calendar-default-1440.png` });
    await ctx.close();
  }

  /* ================= 2. 点击日期查看明细 ================= */
  {
    const { ctx, page } = await openCalendar(browser);

    section('六、点击有活动的日期 → 明细');
    await page.click('.mini-cal-cell[data-day="2026-10-09"]');
    await page.waitForTimeout(120);
    let s = await readState(page);

    check('明细面板展开', s.detailHidden === false);
    check('明细标题为 2026-10-09 周五', /2026-10-09 周五/.test(s.detailText), s.detailText.slice(0, 60));
    check('当天新增 1 / 更新 4', /新建 1/.test(s.detailCounts) && /更新 4/.test(s.detailCounts), s.detailCounts);
    check('明细列出 5 条操作', s.detailItems.length === 5, s.detailItems.length);
    check('每条的徽标为 新建/更新', s.detailItems.every((i) => ['新建', '更新'].includes(i.badge)), s.detailItems.map((i) => i.badge));
    check('每条含本地时间 HH:MM', s.detailItems.every((i) => /^\d{2}:\d{2}$/.test(i.time)), s.detailItems.map((i) => i.time));
    check('时间按本地时区换算（UTC 01:00Z → 09:00）', s.detailItems.some((i) => i.time === '09:00'), s.detailItems.map((i) => i.time));
    check('跨 UTC 日界的那条显示为本地 01:00', s.detailItems.some((i) => i.time === '01:00'), s.detailItems.map((i) => i.time));
    check(
      '时间升序排列',
      JSON.stringify(s.detailItems.map((i) => i.time)) === JSON.stringify([...s.detailItems.map((i) => i.time)].sort()),
      s.detailItems.map((i) => i.time),
    );
    check('文章标题可点击跳转（href 正确）', s.detailItems.some((i) => i.href === '/mtk/note-b/'), s.detailItems.map((i) => i.href));
    check('同一篇更新两次 → 明细出现两条 B', s.detailItems.filter((i) => i.title === 'B 连续两天更新').length === 2, s.detailItems.map((i) => i.title));
    check('未公开/已删除的笔记不可点击', s.detailItems.some((i) => i.href === null && i.title === '未公开或已删除的笔记'), s.detailItems.map((i) => i.title));
    check('选中日期有 is-selected 样式', dayOf(s, '2026-10-09')?.selected === true);
    check('选中态与今天态可共存', dayOf(s, '2026-10-09')?.today === true && dayOf(s, '2026-10-09')?.selected === true);

    section('七、点击无记录日期 → 空状态');
    check('有记录日期可点击', dayOf(s, '2026-10-09')?.clickable === true);
    check('无记录日期同样可点击', dayOf(s, '2026-10-07')?.clickable === true, dayOf(s, '2026-10-07'));
    await page.click('.mini-cal-cell[data-day="2026-10-07"]');
    await page.waitForTimeout(120);
    s = await readState(page);
    check('显示「当天暂无笔记活动」', /当天暂无笔记活动/.test(s.detailText), s.detailText);
    check('明细标题为所选日期 2026-10-07 周三', /2026-10-07 周三/.test(s.detailText), s.detailText.slice(0, 40));
    check('无记录的日期没有明细条目', s.detailItems.length === 0, s.detailItems.length);
    check('无记录日期显示为选中态', dayOf(s, '2026-10-07')?.selected === true);
    check('原选中日期取消选中', dayOf(s, '2026-10-09')?.selected === false);
    check('无记录日期不显示活动圆点', dayOf(s, '2026-10-07')?.active === false);

    section('八、切换选中日期');
    await page.click('.mini-cal-cell[data-day="2026-10-01"]');
    await page.waitForTimeout(120);
    s = await readState(page);
    check('10-01 明细：新建 1、无更新', /新建 1/.test(s.detailCounts) && s.detailItems.length === 1, s.detailCounts);
    check('10-01 选中态生效', dayOf(s, '2026-10-01')?.selected === true);
    check('原选中日期取消选中', dayOf(s, '2026-10-09')?.selected === false);

    await page.click('.mini-cal-cell[data-day="2026-10-01"]');
    await page.waitForTimeout(120);
    s = await readState(page);
    check('再次点击同一日期取消选中，明细收起', s.detailHidden === true, s.detailHidden);

    section('九、键盘操作');
    await page.evaluate(() => document.querySelector('.mini-cal-cell[data-day="2026-10-08"]').focus());
    await page.keyboard.press('Enter');
    await page.waitForTimeout(120);
    s = await readState(page);
    check('键盘 Enter 可选中日期并展开明细', dayOf(s, '2026-10-08')?.selected === true && s.detailItems.length === 2, s.detailItems.length);

    await page.screenshot({ path: `${OUT}/calendar-detail-1440.png` });
    await ctx.close();
  }

  /* ================= 3. 空状态（无任何活动） ================= */
  {
    const { ctx, page } = await openCalendar(browser, { fixture: JSON.stringify({ events: [] }) });

    section('十、无任何活动数据');
    const s = await readState(page);
    check('日期仍按本地时区显示', s.todayDate === '2026-10-09', s.todayDate);
    check('连续天数为 0', s.statStreak === '0', s.statStreak);
    check('今日笔记为 0', s.statToday === '0', s.statToday);
    check('无任何活动圆点', s.dayCells.filter((c) => c.active).length === 0);
    check('网格仍完整渲染 31 天', daysIn(s) === 31, daysIn(s));
    check('月份标题正常（脚本未报错）', s.month === '2026 年 10 月', s.month);
    check('无活动时日期仍可点击', s.dayCells.filter((c) => c.clickable).length === 31, s.dayCells.filter((c) => c.clickable).length);
    await page.click('.mini-cal-cell[data-day="2026-10-09"]');
    await page.waitForTimeout(120);
    const s2 = await readState(page);
    check('无活动时点击任意日期显示「当天暂无笔记活动」', /当天暂无笔记活动/.test(s2.detailText), s2.detailText);
    await ctx.close();
  }

  /* ================= 4. 月份切换（含跨年 / 闰年） ================= */
  {
    const { ctx, page } = await openCalendar(browser);

    section('十一、月份切换');
    let s = await readState(page);
    check('初始为 2026 年 10 月', s.month === '2026 年 10 月', s.month);

    // 先选中今天，验证切月会收起明细
    await page.click('.mini-cal-cell[data-day="2026-10-09"]');
    await page.waitForTimeout(110);
    s = await readState(page);
    check('切月前：明细已展开', s.detailHidden === false && s.detailItems.length === 5, s.detailItems.length);

    await page.click('[data-kw-prev]');
    await page.waitForTimeout(90);
    s = await readState(page);
    check('上一月 → 2026 年 9 月', s.month === '2026 年 9 月', s.month);
    check('9 月共 30 天', daysIn(s) === 30, daysIn(s));
    check('切月后今天仍是 2026-10-09（真实今日不变）', s.todayDate === '2026-10-09', s.todayDate);
    check('切月后统计不丢失（今日 5 条）', s.statToday === '5', s.statToday);
    check('切月后连续天数不丢失', s.statStreak === '2', s.statStreak);
    check('非当月不显示今天高亮', s.dayCells.filter((c) => c.today).length === 0);
    check('切月后明细收起（明细只属于被浏览的月份）', s.detailHidden === true, s.detailHidden);

    await page.click('[data-kw-next]');
    await page.waitForTimeout(90);
    s = await readState(page);
    check('下一月 → 回到 2026 年 10 月', s.month === '2026 年 10 月', s.month);
    check('回到当月后今天高亮恢复', dayOf(s, '2026-10-09')?.today === true);

    await page.click('[data-kw-next]');
    await page.waitForTimeout(90);
    s = await readState(page);
    check('下一月 → 2026 年 11 月', s.month === '2026 年 11 月', s.month);
    check('11 月共 30 天、网格 42 格', daysIn(s) === 30 && s.dayCells.length === 42, { days: daysIn(s), cells: s.dayCells.length });
    check('11-01 是周日 → 6 个前导空格', s.dayCells.slice(0, 6).every((c) => c.empty) && s.dayCells[6].day === '2026-11-01', s.dayCells.slice(0, 7));

    section('十二、跨年切换');
    check('可定位到 2026 年 1 月', await gotoMonth(page, '2026 年 1 月'));
    s = await readState(page);
    check('2026-01 共 31 天', daysIn(s) === 31, daysIn(s));
    check('2026-01-01 是周四 → 3 个前导空格', s.dayCells.slice(0, 3).every((c) => c.empty) && s.dayCells[3].day === '2026-01-01', s.dayCells.slice(0, 4));

    await page.click('[data-kw-prev]');
    await page.waitForTimeout(120);
    s = await readState(page);
    check('2026 年 1 月 → 2025 年 12 月（跨年正确）', s.month === '2025 年 12 月', s.month);
    check('2025-12 共 31 天', daysIn(s) === 31, daysIn(s));
    check('2025-12-01 是周一 → 无前导空格', s.dayCells[0].day === '2025-12-01', s.dayCells[0]);
    check('历史月份显示当月活动（2025-12-31 有记录）', dayOf(s, '2025-12-31')?.active === true, dayOf(s, '2025-12-31'));
    check('跨年切月后今天日期仍不变', s.todayDate === '2026-10-09', s.todayDate);

    await page.click('[data-kw-next]');
    await page.waitForTimeout(90);
    s = await readState(page);
    check('2025 年 12 月 → 2026 年 1 月（反向跨年）', s.month === '2026 年 1 月', s.month);

    section('十三、闰年与月份天数');
    check('可定位到 2026 年 2 月', await gotoMonth(page, '2026 年 2 月'));
    s = await readState(page);
    check('2026 年 2 月 = 28 天（平年）', daysIn(s) === 28, daysIn(s));

    check('可定位到 2027 年 2 月', await gotoMonth(page, '2027 年 2 月'));
    s = await readState(page);
    check('2027 年 2 月 = 28 天（平年）', daysIn(s) === 28, daysIn(s));

    check('可定位到 2028 年 2 月', await gotoMonth(page, '2028 年 2 月'));
    s = await readState(page);
    check('2028 年 2 月 = 29 天（闰年）', daysIn(s) === 29, daysIn(s));
    check('2028-02-29 存在且对齐（2/1 是周二 → 1 前导空格）', s.dayCells[1].day === '2028-02-01' && s.dayCells[29].day === '2028-02-29', [s.dayCells[1], s.dayCells[29]]);

    section('十四、「今天」按钮返回当前月');
    await page.click('[data-kw-today-btn]');
    await page.waitForTimeout(120);
    s = await readState(page);
    check('回到 2026 年 10 月', s.month === '2026 年 10 月', s.month);
    check('今天仍被标记', dayOf(s, '2026-10-09')?.today === true);
    check('今天被选中并展示明细', s.detailHidden === false && /2026-10-09/.test(s.detailText), s.detailText.slice(0, 40));
    check('今天统计未因翻月而改变', s.statToday === '5', s.statToday);

    await ctx.close();
  }

  /* ================= 5. 跨过午夜 ================= */
  {
    // 本地 2026-10-31 23:59（10-31 有记录、10-30 无记录）
    const { ctx, page } = await openCalendar(browser, {
      fixedTime: '2026-10-31T15:59:00.000Z',
      installed: true,
    });

    section('十五、跨过午夜：日期与统计自动刷新');
    let s = await readState(page);
    check('跨日前：今天 = 2026-10-31、月份 = 2026 年 10 月', s.todayDate === '2026-10-31' && s.month === '2026 年 10 月', { d: s.todayDate, m: s.month });
    check('跨日前：10-31 是周六', s.todayWeek === '周六', s.todayWeek);
    check('跨日前：10-31 有活动', dayOf(s, '2026-10-31')?.active === true);
    check('跨日前：连续天数 = 1（10-31 有、10-30 无）', s.statStreak === '1', s.statStreak);

    await page.clock.fastForward('00:02:30');
    await page.waitForTimeout(250);
    s = await readState(page);

    check('跨日后：今天更新为 2026-11-01', s.todayDate === '2026-11-01', s.todayDate);
    check('跨日后：星期更新为周日', s.todayWeek === '周日', s.todayWeek);
    check('跨日后：月份自动跟随到 2026 年 11 月', s.month === '2026 年 11 月', s.month);
    check('跨日后：11 月网格正确（30 天）', daysIn(s) === 30, daysIn(s));
    check('跨日后：今天无操作 → 今日笔记归零', s.statToday === '0', s.statToday);
    check('跨日后：昨天(10-31)有记录 → 连续天数保留为 1（不因今天无操作而归零）', s.statStreak === '1', s.statStreak);
    check('跨日后：新月份无历史活动 → 无圆点', s.dayCells.filter((c) => c.active).length === 0, s.dayCells.filter((c) => c.active).length);
    check('跨日后：今天高亮落在 11-01', dayOf(s, '2026-11-01')?.today === true);

    await ctx.close();
  }

  /* ================= 6. 连续中断 ================= */
  {
    // 本地 2026-11-02：今天(11-02)与昨天(11-01)都没有记录 → 必须中断为 0
    const { ctx, page } = await openCalendar(browser, { fixedTime: '2026-11-02T02:00:00.000Z' });
    section('十六、连续统计中断');
    const s = await readState(page);
    check('今天与昨天均无记录 → 连续天数为 0', s.statStreak === '0', s.statStreak);
    check('今天日期正确', s.todayDate === '2026-11-02', s.todayDate);
    await ctx.close();
  }

  /* ================= 7. 用户翻月后午夜不夺回视图 ================= */
  {
    const { ctx, page } = await openCalendar(browser, { fixedTime: '2026-10-31T15:59:00.000Z', installed: true });
    await gotoMonth(page, '2026 年 8 月');

    section('十七、用户已翻月时，午夜不强行跳回');
    let s = await readState(page);
    check('用户翻到 2026 年 8 月', s.month === '2026 年 8 月', s.month);
    await page.clock.fastForward('00:02:30');
    await page.waitForTimeout(250);
    s = await readState(page);
    check('午夜后用户视图保持在 2026 年 8 月', s.month === '2026 年 8 月', s.month);
    check('午夜后今天日期已更新为 2026-11-01', s.todayDate === '2026-11-01', s.todayDate);
    check('午夜后统计已更新（今日 0 条）', s.statToday === '0', s.statToday);
    await ctx.close();
  }

  /* ================= 8. 刷新后不丢失 ================= */
  {
    const { ctx, page } = await openCalendar(browser);
    section('十八、刷新后历史记录不丢失');
    const before = await readState(page);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-kw-grid] .mini-cal-cell:not(.is-empty)', { timeout: 15000 });
    await page.waitForTimeout(180);
    const after = await readState(page);
    check('刷新后今天日期一致', before.todayDate === after.todayDate, { before: before.todayDate, after: after.todayDate });
    check('刷新后连续天数一致', before.statStreak === after.statStreak, { before: before.statStreak, after: after.statStreak });
    check('刷新后今日统计一致', before.statToday === after.statToday, { before: before.statToday, after: after.statToday });
    check(
      '刷新后有活动的日期集合完全一致',
      JSON.stringify(before.dayCells.filter((c) => c.active).map((c) => c.day)) === JSON.stringify(after.dayCells.filter((c) => c.active).map((c) => c.day)),
    );
    check('刷新后月份视图一致', before.month === after.month, { before: before.month, after: after.month });
    await ctx.close();
  }

  /* ================= 9. 真实构建数据（不打桩） ================= */
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: TZ });
    const page = await ctx.newPage();
    await page.clock.setFixedTime(new Date(FIXED_NOW));
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-kw-grid] .mini-cal-cell:not(.is-empty)', { timeout: 15000 });
    await page.waitForTimeout(180);

    section('十九、真实构建数据（未打桩）');
    const raw = await page.evaluate(() => {
      const el = document.querySelector('[data-kw-activity]');
      return el ? el.textContent : null;
    });
    const payload = JSON.parse(raw || '{}');
    const s = await readState(page);
    check('内嵌活动事件来自真实数据（≥200 条）', (payload.events || []).length >= 200, (payload.events || []).length);
    check('真实数据：所有事件均可解析出本地日期', (payload.events || []).every((e) => !Number.isNaN(new Date(e.ts).valueOf())));
    check('真实数据：分类动作只有 create/update（删除不计入）', (payload.events || []).every((e) => ['create', 'update'].includes(e.action)));
    check('真实数据：页面渲染 2026 年 10 月', s.month === '2026 年 10 月', s.month);
    check('真实数据：10-09 无活动 → 无圆点', dayOf(s, '2026-10-09')?.active === false, dayOf(s, '2026-10-09'));
    check('真实数据：10 月无任何活动圆点（最后一次编辑在 9 月）', s.dayCells.filter((c) => c.active).length === 0, s.dayCells.filter((c) => c.active).map((c) => c.day));

    await gotoMonth(page, '2026 年 9 月');
    const s9 = await readState(page);
    check('真实数据：2026 年 9 月仅 09-11 一天有记录', s9.dayCells.filter((c) => c.active).map((c) => c.day).join() === '2026-09-11', s9.dayCells.filter((c) => c.active).map((c) => c.day));
    // 真实历史：同一天对同一篇笔记保存了两次（两次独立提交），因此是 2 条操作、1 个活跃日
    check('真实数据：09-11 当天 2 条操作（同一天多次修改）', /共 2 条/.test(dayOf(s9, '2026-09-11')?.title || ''), dayOf(s9, '2026-09-11')?.title);

    await gotoMonth(page, '2026 年 7 月');
    const s7 = await readState(page);
    const julyActive = s7.dayCells.filter((c) => c.active).map((c) => c.day);
    check('真实数据：7 月有多天活动（来自 Git 历史恢复）', julyActive.length >= 2, julyActive);

    // 点击 9 月 11 日：应能跳到对应笔记
    await gotoMonth(page, '2026 年 9 月');
    await page.click('.mini-cal-cell[data-day="2026-09-11"]');
    await page.waitForTimeout(120);
    const s9b = await readState(page);
    check(
      '真实数据：点击历史日期可查看对应文章（2 条更新，均指向同一篇）',
      s9b.detailItems.length === 2 && s9b.detailItems.every((i) => i.href === '/mtk/physical-resolution/' && i.badge === '更新'),
      s9b.detailItems,
    );
    check('真实数据：明细标题为真实笔记标题', s9b.detailItems[0]?.title === '[MTK]屏幕帧率精确匹配', s9b.detailItems[0]?.title);
    check('真实数据：明细时间为本地时区（17:56 / 18:00）', JSON.stringify(s9b.detailItems.map((i) => i.time)) === JSON.stringify(['17:56', '18:00']), s9b.detailItems.map((i) => i.time));

    await page.screenshot({ path: `${OUT}/calendar-real-1440.png` });
    await ctx.close();
  }

  /* ================= 10. 视觉与紧凑性 ================= */
  {
    const { ctx, page } = await openCalendar(browser);
    section('二十、视觉与紧凑性');
    const layout = await page.evaluate(() => {
      const card = document.querySelector('.kw-today-card').getBoundingClientRect();
      const grid = document.querySelector('[data-kw-grid]').getBoundingClientRect();
      const today = document.querySelector('.mini-cal-cell.is-today');
      const cs = getComputedStyle(today);
      const dot = getComputedStyle(today, '::after');
      const circle = getComputedStyle(today, '::before');
      return {
        cardW: Math.round(card.width),
        cardH: Math.round(card.height),
        gridH: Math.round(grid.height),
        todayBg: circle.backgroundColor,
        todayColor: cs.color,
        todayRadius: circle.borderRadius,
        circleW: circle.width,
        circleH: circle.height,
        dotBg: dot.backgroundColor,
      };
    });
    check('卡片宽度不超过工作台宽度 320px', layout.cardW <= 320 && layout.cardW >= 300, layout.cardW);
    check('日历网格高度紧凑（≤ 210px）', layout.gridH <= 210, layout.gridH);
    check('卡片整体高度可控（≤ 600px）', layout.cardH <= 600, layout.cardH);
    check('今天是橙色实心圆（有背景色 + 50% 圆角 + 圆形）', layout.todayBg !== 'rgba(0, 0, 0, 0)' && layout.todayRadius === '50%' && layout.circleW === layout.circleH, layout);
    check('今天上的活动圆点使用对比色以保证可见', layout.dotBg !== 'rgba(0, 0, 0, 0)' && layout.dotBg !== layout.todayBg, { dot: layout.dotBg, today: layout.todayBg });
    check('今天数字与实心圆有对比（文字色 ≠ 圆底色）', layout.todayColor !== layout.todayBg, { color: layout.todayColor, bg: layout.todayBg });

    // 悬停反馈
    await page.hover('.mini-cal-cell[data-day="2026-10-15"]');
    await page.waitForTimeout(180);
    const hovered = await page.evaluate(() => {
      const cell = document.querySelector('.mini-cal-cell[data-day="2026-10-15"]');
      return { bg: getComputedStyle(cell).backgroundColor };
    });
    check('日期悬停有背景反馈', hovered.bg !== 'rgba(0, 0, 0, 0)', hovered);

    // 键盘可达性 + 键盘激活
    const kb = await page.evaluate(() => {
      const cell = document.querySelector('.mini-cal-cell[data-day="2026-10-09"]');
      return { tabIndex: cell.tabIndex, role: cell.getAttribute('role') };
    });
    check('有活动的日期可键盘聚焦（tabindex=0, role=button）', kb.tabIndex === 0 && kb.role === 'button', kb);

    await page.evaluate(() => {
      document.querySelector('.mini-cal-cell[data-day="2026-10-09"]').focus();
    });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(120);
    const s = await readState(page);
    check('键盘 Enter 可展开当天明细', s.detailHidden === false && s.detailItems.length === 5, s.detailItems.length);

    // 月份切换按钮有 aria-label
    const navA11y = await page.evaluate(() => ({
      prev: document.querySelector('[data-kw-prev]').getAttribute('aria-label'),
      next: document.querySelector('[data-kw-next]').getAttribute('aria-label'),
    }));
    check('切换按钮带可访问名称', navA11y.prev === '上一月' && navA11y.next === '下一月', navA11y);

    await page.screenshot({ path: `${OUT}/calendar-hover-1440.png` });
    await ctx.close();
  }

  /* ================= 11. 双主题可用性 ================= */
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: TZ });
    const page = await ctx.newPage();
    await page.clock.setFixedTime(new Date(FIXED_NOW));
    await stubActivity(page);
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-kw-grid] .mini-cal-cell:not(.is-empty)', { timeout: 15000 });

    section('二十一、深色 / 浅色主题下的可读性');
    for (const theme of ['dark', 'claude']) {
      await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
      await page.waitForTimeout(180);
      // 先回到「今天」（选中今天），再点历史日期，确保每次都是「选中」而不是「取消选中」
      await page.click('[data-kw-today-btn]');
      await page.waitForTimeout(100);
      await page.click('.mini-cal-cell[data-day="2026-10-05"]');
      await page.waitForTimeout(150);

      const r = await page.evaluate(() => {
        // WCAG 相对亮度（含 sRGB 反伽马），比直接取均值准确
        const relLum = (css) => {
          const [r, g, b] = css.match(/[\d.]+/g).slice(0, 3).map(Number);
          const f = (v) => {
            const s = v / 255;
            return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
          };
          return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
        };
        const contrast = (a, b) => {
          const l1 = Math.max(relLum(a), relLum(b));
          const l2 = Math.min(relLum(a), relLum(b));
          return (l1 + 0.05) / (l2 + 0.05);
        };
        const today = document.querySelector('.mini-cal-cell.is-today');
        const sel = document.querySelector('.mini-cal-cell.is-selected');
        const tcs = getComputedStyle(today);
        const circle = getComputedStyle(today, '::before');
        const scs = getComputedStyle(sel);
        return {
          todayBg: circle.backgroundColor,
          todayColor: tcs.color,
          todayContrast: contrast(circle.backgroundColor, tcs.color),
          selBg: scs.backgroundColor,
          selShadow: scs.boxShadow,
          selIsSoft: scs.backgroundColor !== circle.backgroundColor,
          todayRadius: circle.borderRadius,
          overflowX: document.documentElement.scrollWidth - window.innerWidth,
        };
      });
      check(`[${theme}] 今天数字在实心圆上可辨认（对比度 ≥2.5）`, r.todayContrast >= 2.5, { ratio: Number(r.todayContrast.toFixed(2)), bg: r.todayBg, color: r.todayColor });
      check(`[${theme}] 今天仍是圆形实心块`, r.todayRadius === '50%', r.todayRadius);
      check(`[${theme}] 历史日期选中态用浅橙色背景（区别于今天实心圆）`, r.selIsSoft === true, { selBg: r.selBg, todayBg: r.todayBg });
      check(`[${theme}] 历史日期选中态有边框描边`, /inset|rgb/.test(r.selShadow), r.selShadow);
      check(`[${theme}] 页面无横向溢出`, r.overflowX <= 0, r.overflowX);
      await page.locator('.kw-today-card').screenshot({ path: `${OUT}/card-${theme}.png` });
    }
    await ctx.close();
  }

  /* ================= 12. 几何对齐 ================= */
  {
    const { ctx, page } = await openCalendar(browser);
    await page.click('.mini-cal-cell[data-day="2026-10-09"]');
    await page.waitForTimeout(200);

    section('二十二、几何对齐（不依赖像素肉眼的排版校验）');
    const geo = await page.evaluate(() => {
      const grid = document.querySelector('[data-kw-grid]');
      const rect = (el) => {
        const r = el.getBoundingClientRect();
        return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), bottom: Math.round(r.bottom), right: Math.round(r.right) };
      };
      const cells = [...grid.querySelectorAll('.mini-cal-cell:not(.is-empty)')].map((c) => ({
        day: Number(c.dataset.day.slice(-2)),
        ...rect(c),
      }));
      const labels = [...grid.querySelectorAll('.mini-cal-weekday')].map((l) => ({ text: l.textContent.trim(), ...rect(l) }));
      const byDay = new Map(cells.map((c) => [c.day, c]));
      return {
        cells,
        labels,
        byDay: [...byDay.entries()],
        grid: rect(grid),
        card: rect(document.querySelector('.kw-today-card')),
        detail: rect(document.querySelector('[data-kw-detail]')),
        today: rect(document.querySelector('.mini-cal-cell.is-today')),
        dotBox: (() => {
          const c = document.querySelector('.mini-cal-cell[data-day="2026-10-09"]');
          const cs = getComputedStyle(c, '::after');
          return { bottom: cs.bottom, width: cs.width, height: cs.height, left: cs.left };
        })(),
        todayCircle: (() => {
          const c = document.querySelector('.mini-cal-cell.is-today');
          const cs = getComputedStyle(c, '::before');
          return { width: cs.width, height: cs.height, radius: cs.borderRadius, bg: cs.backgroundColor, zIndex: cs.zIndex };
        })(),
        nav: {
          prev: rect(document.querySelector('[data-kw-prev]')),
          month: rect(document.querySelector('[data-kw-month]')),
          next: rect(document.querySelector('[data-kw-next]')),
          today: rect(document.querySelector('[data-kw-today-btn]')),
        },
      };
    });

    const g = geo;
    const days = g.cells.map((c) => c.day);

    // 列对齐：同一列（相差 7 天）的水平位置一致
    const colDiffs = [];
    for (let d = 1; d <= 24; d += 1) {
      const a = g.cells.find((c) => c.day === d);
      const b = g.cells.find((c) => c.day === d + 7);
      if (a && b) colDiffs.push(Math.abs(a.x - b.x));
    }
    check('同一列日期水平对齐（误差 ≤1px）', Math.max(...colDiffs) <= 1, Math.max(...colDiffs));

    // 行对齐：同一周（相差 1 天且同周）的垂直位置一致
    const rowDiffs = [];
    for (let d = 1; d <= 30; d += 1) {
      const a = g.cells.find((c) => c.day === d);
      const b = g.cells.find((c) => c.day === d + 1);
      if (a && b && a.y === b.y) rowDiffs.push(Math.abs(a.x - b.x));
    }
    check('同一周日期水平等距排列', rowDiffs.length >= 20 && new Set(rowDiffs).size <= 2, { samples: rowDiffs.length, distinctGaps: [...new Set(rowDiffs)] });

    // 表头与列对齐：把格子几何列号与「该日期真实星期」对应的列号比对
    const colWidth = g.grid.w / 7;
    const colOfX = (x) => Math.round((x - g.grid.x) / colWidth);
    const lead = (new Date(2026, 9, 1).getDay() + 6) % 7; // 2026-10-01 是周四 → 3
    const badCols = g.cells.filter((c) => {
      const expected = (lead + c.day - 1) % 7;
      return colOfX(c.x) !== expected;
    });
    check('每个日期都落在其真实星期对应的列上', badCols.length === 0, badCols.map((c) => ({ day: c.day, col: colOfX(c.x) })));
    const labelCols = g.labels.map((l) => colOfX(l.x));
    check('星期表头列顺序为 一…日', JSON.stringify(labelCols) === JSON.stringify([0, 1, 2, 3, 4, 5, 6]), labelCols);

    // 无重叠：所有格子两两不重叠
    let overlaps = 0;
    for (let i = 0; i < g.cells.length; i += 1) {
      for (let j = i + 1; j < g.cells.length; j += 1) {
        const a = g.cells[i];
        const b = g.cells[j];
        if (a.x < b.right && b.x < a.right && a.y < b.bottom && b.y < a.bottom) overlaps += 1;
      }
    }
    check('日期格子互不重叠', overlaps === 0, overlaps);

    check('31 天全部落在网格范围内', g.cells.every((c) => c.x >= g.grid.x - 1 && c.right <= g.grid.right + 1 && c.bottom <= g.grid.bottom + 1), { grid: g.grid, first: g.cells[0], last: g.cells[g.cells.length - 1] });
    check('日期按 7 列排列且顺序连续', JSON.stringify(days) === JSON.stringify(Array.from({ length: 31 }, (_, i) => i + 1)), days.length);
    check('今天是真正的圆（圆形伪元素宽高相等 + 50% 圆角）', g.todayCircle.width === g.todayCircle.height && g.todayCircle.radius === '50%', g.todayCircle);
    check('今天的圆是实心橙色块', g.todayCircle.bg !== 'rgba(0, 0, 0, 0)', g.todayCircle);
    check('今天的圆绘制在数字下方（z-index 为负）', g.todayCircle.zIndex === '-1', g.todayCircle.zIndex);
    check('今天格子的点击区域不小于圆（整列宽度）', g.today.w >= 30, { cellW: g.today.w, circleW: g.todayCircle.width });
    check('活动圆点位于格子底部内', g.dotBox.bottom !== 'auto' && parseFloat(g.dotBox.bottom) >= 0 && parseFloat(g.dotBox.bottom) <= 6, g.dotBox);
    check('活动圆点尺寸可见（4px）', g.dotBox.width === '4px' && g.dotBox.height === '4px', g.dotBox);

    // 头部导航顺序与包含关系
    check('切换按钮顺序：上一月 < 月份 < 下一月', g.nav.prev.x < g.nav.month.x && g.nav.month.x < g.nav.next.x, g.nav);
    check('「今天」按钮在标题区右侧且不重叠', g.nav.today.x >= g.nav.next.right, g.nav);
    check('头部控件都在卡片宽度内', [g.nav.prev, g.nav.month, g.nav.next, g.nav.today].every((n) => n.x >= g.card.x && n.right <= g.card.right + 1), { card: g.card, nav: g.nav });

    // 明细面板
    check('明细面板位于网格下方且不出卡片', g.detail.y >= g.grid.bottom - 1 && g.detail.right <= g.card.right + 1, { detail: g.detail, grid: g.grid, card: g.card });
    check('展开明细后卡片仍是紧凑的（≤ 620px）', g.card.h <= 620, g.card.h);
    check('明细列表可滚动（不会无限撑高卡片）', g.detail.h <= 210, g.detail.h);

    await page.locator('.kw-today-card').screenshot({ path: `${OUT}/card-detail.png` });
    await ctx.close();
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
