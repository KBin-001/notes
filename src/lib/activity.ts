/**
 * 知识日历的活动数据层（构建期运行）。
 *
 * 数据来源（两者都是「可确认」的真实记录，不做任何推算）：
 *   1. src/content/_admin/logs.json
 *      后台保存接口在每次成功写入后追加的操作日志，字段最精确（含操作标题、精确时间、commit）。
 *   2. src/content/_admin/activity-history.json
 *      由 scripts/sync-activity-history.ts 从 Git 提交历史恢复，覆盖操作日志上线之前的历史。
 *
 * 合并规则：
 *   以 `commit:path` 为主键去重。同一条操作同时出现在两处时，优先采用操作日志（信息更完整）。
 *   这样既不会重复计数，也不会因为浅克隆等原因漏掉历史。
 *
 * 时区规则：
 *   这里只做「事实收集」，不做日期归组。每条事件保留其绝对时刻（ISO 8601，带原始时区偏移）。
 *   究竟落在哪一天，由浏览器按用户本地时区在渲染时决定 —— 避免用构建机（UTC）的日期把活动记到错误的日期上。
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export type ActivityAction = 'create' | 'update';

export interface RawLogEntry {
  id?: string;
  ts: string;
  action: string;
  actor?: string;
  /** 操作日志里的字段名 */
  target: string;
  /** Git 历史恢复时的字段名（与 target 同义） */
  path?: string;
  title?: string;
  commit?: string;
}

/** 传给浏览器的精简事件结构 */
export interface CalendarActivityEvent {
  /** ISO 8601 绝对时刻；浏览器按本地时区换算成日期 */
  ts: string;
  action: ActivityAction;
  title: string;
  /** 仓库内路径，用于与笔记实体对齐 */
  path: string;
  /** 笔记前台地址；无法解析（已删除等）时为 null */
  url: string | null;
}

export interface NoteRef {
  path: string;
  url: string;
  title: string;
}

const LOGS_PATH = resolve('src/content/_admin/logs.json');
const HISTORY_PATH = resolve('src/content/_admin/activity-history.json');

/** 上限保护：避免页面内嵌 JSON 无限膨胀；3000 条约等于 8 年每日一次操作 */
const MAX_EVENTS = 3000;

function readJson<T>(path: string, pick: (data: unknown) => T, fallback: T): T {
  if (!existsSync(path)) return fallback;
  try {
    return pick(JSON.parse(readFileSync(path, 'utf8')));
  } catch (error) {
    // 数据文件损坏时不能让整站构建失败，退化为「无历史」
    console.warn(`[activity] 解析 ${path} 失败：${error instanceof Error ? error.message : error}`);
    return fallback;
  }
}

function readLogs(): RawLogEntry[] {
  return readJson(
    LOGS_PATH,
    (data) => {
      const entries = (data as { entries?: unknown }).entries;
      return Array.isArray(entries) ? (entries as RawLogEntry[]) : [];
    },
    [],
  );
}

function readHistory(): RawLogEntry[] {
  return readJson(
    HISTORY_PATH,
    (data) => {
      const events = (data as { events?: unknown }).events;
      return Array.isArray(events) ? (events as RawLogEntry[]) : [];
    },
    [],
  );
}

/** 操作日志的动作 → 日历动作；删除不计入活跃活动 */
function normalizeAction(action: string): ActivityAction | null {
  if (action === 'note.create' || action === 'create') return 'create';
  if (action === 'note.update' || action === 'update') return 'update';
  return null; // note.delete / image.* 等不计入
}

function isNotePath(path: string): boolean {
  return path.startsWith('src/content/docs/') && /\.(md|mdx)$/.test(path);
}

/**
 * 合并操作日志与 Git 恢复的历史，产出浏览器可直接使用的活动事件列表。
 */
export function buildActivityEvents(noteRefs: NoteRef[] = []): CalendarActivityEvent[] {
  const refByPath = new Map(noteRefs.map((ref) => [ref.path, ref]));

  // 主键：优先用 commit:path（精确且能跨两个来源对齐），缺失 commit 时退化为 ts:path
  const byKey = new Map<string, CalendarActivityEvent>();

  const push = (entry: RawLogEntry, source: 'log' | 'history') => {
    const action = normalizeAction(entry.action);
    if (!action) return;
    const path = String(entry.path ?? entry.target ?? '').trim();
    if (!path || !isNotePath(path)) return;
    const ts = String(entry.ts ?? '').trim();
    if (!ts || Number.isNaN(new Date(ts).valueOf())) return;

    const commit = String(entry.commit ?? '').trim();
    const key = commit ? `${commit}:${path}` : `${ts}:${path}`;

    const ref = refByPath.get(path);
    // 标题优先取笔记当前的 frontmatter 标题：它与点击后跳转到的页面一致，
    // 也比 Git 提交信息（例如批量导入的 "content: add driver knowledge notes"）更可读。
    const title =
      ref?.title || (typeof entry.title === 'string' && entry.title.trim()) || path.split('/').pop() || path;

    const value: CalendarActivityEvent = { ts, action, title, path, url: ref?.url ?? null };

    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, value);
      return;
    }
    // 同一条记录出现在两个来源：操作日志更精确（精确时间 + 标题），优先保留
    if (source === 'log') byKey.set(key, value);
  };

  for (const entry of readHistory()) push(entry, 'history');
  for (const entry of readLogs()) push(entry, 'log');

  return [...byKey.values()]
    .sort((a, b) => new Date(a.ts).valueOf() - new Date(b.ts).valueOf())
    .slice(-MAX_EVENTS);
}
