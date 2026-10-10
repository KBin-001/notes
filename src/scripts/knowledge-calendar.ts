/**
 * 知识日历（首页右下角）的浏览器端逻辑。
 *
 * 设计要点：
 *   1. 一切以「真实活动事件」为准，不再用笔记的 updated 字段推算历史。
 *      数据在构建期由 src/lib/activity.ts 从操作日志 + Git 提交历史恢复，内嵌为 JSON。
 *   2. 事件只存绝对时刻（ISO 8601）；落在哪一天由浏览器按本地时区换算。
 *      这样既不会因构建机/服务器是 UTC 而把深夜的操作记到前一天，
 *      也能在用户切换时区、跨月、跨年时始终保持日期正确。
 *   3. 页面保持打开跨过午夜时，用定时器检测本地日期变化并重新渲染统计。
 */

export type ActivityAction = 'create' | 'update';

export interface ActivityEvent {
  /** ISO 8601 绝对时刻 */
  ts: string;
  action: ActivityAction;
  title: string;
  path: string;
  /** 笔记前台地址；无法解析时为 null（例如已删除的笔记） */
  url: string | null;
}

interface CalendarPayload {
  events: ActivityEvent[];
}

const WEEKDAY_SHORT = ['一', '二', '三', '四', '五', '六', '日'];
const WEEKDAY_FULL = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

/** 跨过午夜后自动刷新今天日期的检测间隔 */
const MIDNIGHT_POLL_MS = 30_000;

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** 按「浏览器本地时区」把 Date 归到某一天 */
function dayKeyOf(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** 0-based 月份版本的 dayKey */
function dayKeyOfParts(year: number, monthIndex: number, day: number): string {
  return `${year}-${pad2(monthIndex + 1)}-${pad2(day)}`;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function parseDayKey(key: string): { year: number; monthIndex: number; day: number } {
  const [year, month, day] = key.split('-').map(Number);
  return { year, monthIndex: month - 1, day };
}

function timeTextOf(date: Date): string {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

/** 事件按本地日期归组，组内按时间升序 */
function groupByDay(events: ActivityEvent[]): Map<string, ActivityEvent[]> {
  const map = new Map<string, ActivityEvent[]>();
  for (const event of events) {
    const at = new Date(event.ts);
    if (Number.isNaN(at.valueOf())) continue;
    const key = dayKeyOf(at);
    const list = map.get(key);
    if (list) list.push(event);
    else map.set(key, [event]);
  }
  for (const list of map.values()) {
    list.sort((a, b) => new Date(a.ts).valueOf() - new Date(b.ts).valueOf());
  }
  return map;
}

/**
 * 连续活跃天数：只依据「实际有记录的日期」。
 * - 今天有记录：从今天往前连续计数。
 * - 今天没有、昨天有：保留截至昨天的连续记录（产品定义）。
 * - 今天、昨天都没有：连续中断，计 0。
 */
function computeStreak(byDay: Map<string, ActivityEvent[]>, today: Date): number {
  const cursor = startOfDay(today);
  if (!byDay.has(dayKeyOf(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
    if (!byDay.has(dayKeyOf(cursor))) return 0;
  }

  let streak = 0;
  while (byDay.has(dayKeyOf(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

/** 本周起点（周一），与日历网格的周一起始保持一致 */
function startOfWeekMonday(date: Date): Date {
  const start = startOfDay(date);
  const offset = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - offset);
  return start;
}

function countInRange(byDay: Map<string, ActivityEvent[]>, fromKey: string, toKey: string): number {
  let total = 0;
  for (const [key, list] of byDay) {
    if (key >= fromKey && key <= toKey) total += list.length;
  }
  return total;
}

interface Cell {
  key: string | null;
  day: number | null;
}

/** 生成某年某月的网格：周一起始，前后补齐整周，闰年与大小月由 Date 天然处理 */
function buildCells(year: number, monthIndex: number): Cell[] {
  const firstWeekday = (new Date(year, monthIndex, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const totalCells = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;

  const cells: Cell[] = [];
  for (let index = 0; index < totalCells; index += 1) {
    const day = index - firstWeekday + 1;
    if (day < 1 || day > daysInMonth) cells.push({ key: null, day: null });
    else cells.push({ key: dayKeyOfParts(year, monthIndex, day), day });
  }
  return cells;
}

export function mountKnowledgeCalendar(): void {
  const root = document.querySelector<HTMLElement>('[data-kw-calendar]');
  if (!root) return;

  const payloadEl = root.querySelector<HTMLScriptElement>('[data-kw-activity]');
  let events: ActivityEvent[] = [];
  try {
    const parsed = payloadEl?.textContent ? (JSON.parse(payloadEl.textContent) as CalendarPayload) : null;
    events = Array.isArray(parsed?.events) ? parsed!.events : [];
  } catch {
    events = [];
  }

  const byDay = groupByDay(events);

  const todayEl = root.querySelector<HTMLElement>('[data-kw-today-date]');
  const weekEl = root.querySelector<HTMLElement>('[data-kw-today-week]');
  const streakChip = root.querySelector<HTMLElement>('[data-kw-streak]');
  const statToday = root.querySelector<HTMLElement>('[data-kw-stat-today]');
  const statWeek = root.querySelector<HTMLElement>('[data-kw-stat-week]');
  const statStreak = root.querySelector<HTMLElement>('[data-kw-stat-streak]');
  const monthLabel = root.querySelector<HTMLElement>('[data-kw-month]');
  const grid = root.querySelector<HTMLElement>('[data-kw-grid]');
  const detail = root.querySelector<HTMLElement>('[data-kw-detail]');
  const prevBtn = root.querySelector<HTMLButtonElement>('[data-kw-prev]');
  const nextBtn = root.querySelector<HTMLButtonElement>('[data-kw-next]');
  const todayBtn = root.querySelector<HTMLButtonElement>('[data-kw-today-btn]');

  // 真实「今天」——只由浏览器本地时钟决定，不受浏览月份影响
  let today = new Date();
  const initial = startOfDay(today);
  let viewYear = initial.getFullYear();
  let viewMonthIndex = initial.getMonth();
  let selectedKey: string | null = null;
  /** 用户是否停留在「今天所在月」；一旦手动翻月就停止自动跟随 */
  let followToday = true;

  function renderHeader(): void {
    today = new Date();
    const todayKey = dayKeyOf(today);

    if (todayEl) todayEl.textContent = todayKey;
    if (weekEl) weekEl.textContent = WEEKDAY_FULL[(today.getDay() + 6) % 7];

    const streak = computeStreak(byDay, today);
    if (streakChip) streakChip.textContent = `连续 ${streak} 天`;
    if (statStreak) statStreak.textContent = String(streak);
    if (statToday) statToday.textContent = String(byDay.get(todayKey)?.length ?? 0);

    const weekStart = startOfWeekMonday(today);
    if (statWeek) {
      statWeek.textContent = String(countInRange(byDay, dayKeyOf(weekStart), todayKey));
    }
  }

  function renderGrid(): void {
    if (!grid) return;
    if (monthLabel) monthLabel.textContent = `${viewYear} 年 ${viewMonthIndex + 1} 月`;

    const todayKey = dayKeyOf(today);
    const cells = buildCells(viewYear, viewMonthIndex);
    const fragment = document.createDocumentFragment();

    for (const label of WEEKDAY_SHORT) {
      const span = document.createElement('span');
      span.className = 'mini-cal-weekday';
      span.textContent = label;
      fragment.append(span);
    }

    for (const cell of cells) {
      const span = document.createElement('span');
      span.className = 'mini-cal-cell';

      if (cell.key === null) {
        span.classList.add('is-empty');
        span.setAttribute('aria-hidden', 'true');
        fragment.append(span);
        continue;
      }

      const list = byDay.get(cell.key);
      const isToday = cell.key === todayKey;
      const isActive = Boolean(list && list.length > 0);
      const isSelected = cell.key === selectedKey;

      span.dataset.day = cell.key;
      span.textContent = String(cell.day);

      if (isToday) span.classList.add('is-today');
      if (isActive) span.classList.add('is-active');
      if (isSelected) span.classList.add('is-selected');

      // 所有日期都可点击：有记录时展示操作明细，没有记录时展示「当天暂无笔记活动」
      span.classList.add('is-clickable');
      span.tabIndex = 0;
      span.setAttribute('role', 'button');

      // Tooltip：同一天多条记录时显示数量明细
      if (isActive && list) {
        const creates = list.filter((event) => event.action === 'create').length;
        const updates = list.length - creates;
        const parts: string[] = [];
        if (creates > 0) parts.push(`新建 ${creates}`);
        if (updates > 0) parts.push(`更新 ${updates}`);
        span.title = `${cell.key} · ${parts.join(' · ')}（共 ${list.length} 条）`;
      } else {
        span.title = cell.key;
      }

      span.setAttribute(
        'aria-label',
        `${cell.key}${isActive && list ? `，${list.length} 条笔记活动` : '，无活动'}`,
      );
      fragment.append(span);
    }

    grid.replaceChildren(fragment);
  }

  function renderDetail(): void {
    if (!detail) return;

    if (!selectedKey) {
      detail.hidden = true;
      detail.replaceChildren();
      return;
    }

    detail.hidden = false;

    const { year, monthIndex, day } = parseDayKey(selectedKey);
    const weekday = WEEKDAY_FULL[(new Date(year, monthIndex, day).getDay() + 6) % 7];
    const list = byDay.get(selectedKey) ?? [];
    const creates = list.filter((event) => event.action === 'create');
    const updates = list.filter((event) => event.action === 'update');

    const header = document.createElement('div');
    header.className = 'mini-cal-detail-head';

    const dateLabel = document.createElement('span');
    dateLabel.className = 'mini-cal-detail-date';
    dateLabel.textContent = `${selectedKey} ${weekday}`;

    const counts = document.createElement('span');
    counts.className = 'mini-cal-detail-counts';
    if (list.length === 0) {
      counts.textContent = '无记录';
    } else {
      const parts: string[] = [];
      if (creates.length > 0) parts.push(`新建 ${creates.length}`);
      if (updates.length > 0) parts.push(`更新 ${updates.length}`);
      counts.textContent = parts.join(' · ');
    }

    header.append(dateLabel, counts);
    detail.replaceChildren(header);

    if (list.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'mini-cal-detail-empty';
      empty.textContent = '当天暂无笔记活动';
      detail.append(empty);
      return;
    }

    const ul = document.createElement('ul');
    ul.className = 'mini-cal-detail-list';

    for (const event of list) {
      const li = document.createElement('li');
      li.className = 'mini-cal-detail-item';

      const badge = document.createElement('span');
      badge.className = `mini-cal-detail-badge is-${event.action}`;
      badge.textContent = event.action === 'create' ? '新建' : '更新';

      const time = document.createElement('span');
      time.className = 'mini-cal-detail-time';
      time.textContent = timeTextOf(new Date(event.ts));

      // 标题：可解析到前台页面时渲染为链接，否则退化为纯文本（已删除/未公开的笔记不暴露标题）
      let titleEl: HTMLElement;
      if (event.url) {
        const link = document.createElement('a');
        link.className = 'mini-cal-detail-title is-link';
        link.href = event.url;
        link.textContent = event.title;
        titleEl = link;
      } else {
        titleEl = document.createElement('span');
        titleEl.className = 'mini-cal-detail-title';
        titleEl.textContent = '未公开或已删除的笔记';
      }

      li.append(badge, time, titleEl);
      ul.append(li);
    }

    detail.append(ul);
  }

  function renderAll(): void {
    renderHeader();
    renderGrid();
    renderDetail();
  }

  function selectDay(key: string | null): void {
    selectedKey = key && selectedKey !== key ? key : null;
    renderGrid();
    renderDetail();
  }

  grid?.addEventListener('click', (event) => {
    const cell = (event.target as HTMLElement).closest<HTMLElement>('.mini-cal-cell.is-clickable');
    if (!cell?.dataset.day) return;
    selectDay(cell.dataset.day);
  });

  grid?.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const cell = (event.target as HTMLElement).closest<HTMLElement>('.mini-cal-cell.is-clickable');
    if (!cell?.dataset.day) return;
    event.preventDefault();
    selectDay(cell.dataset.day);
  });

  function shiftMonth(delta: number): void {
    const next = new Date(viewYear, viewMonthIndex + delta, 1);
    viewYear = next.getFullYear();
    viewMonthIndex = next.getMonth();
    followToday = false;
    // 明细属于被浏览的月份：切月后清空选中，避免「看着 9 月、明细却是 10 月某天」
    selectedKey = null;
    renderGrid();
    renderDetail();
  }

  prevBtn?.addEventListener('click', () => shiftMonth(-1));
  nextBtn?.addEventListener('click', () => shiftMonth(1));

  todayBtn?.addEventListener('click', () => {
    const now = new Date();
    today = now;
    viewYear = now.getFullYear();
    viewMonthIndex = now.getMonth();
    followToday = true;
    selectedKey = dayKeyOf(now);
    renderAll();
  });

  // 跨过午夜：日期、周次、连续天数、今天高亮都需要刷新
  let lastRenderedDay = dayKeyOf(today);
  window.setInterval(() => {
    const now = new Date();
    const nowKey = dayKeyOf(now);
    if (nowKey === lastRenderedDay) return;

    lastRenderedDay = nowKey;
    today = now;
    if (followToday) {
      viewYear = now.getFullYear();
      viewMonthIndex = now.getMonth();
    }
    renderAll();
  }, MIDNIGHT_POLL_MS);

  renderAll();
}
