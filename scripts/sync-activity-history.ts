/**
 * 从 Git 提交历史恢复「可确认的笔记活动记录」，写入 src/content/_admin/activity-history.json。
 *
 * 为什么需要它：
 *   `src/content/_admin/logs.json` 是后台保存接口写的操作日志，但它只覆盖「日志功能上线之后」的操作
 *   （当前仓库里最早一条是 2026-07-20）。更早的历史只能从 Git 提交历史恢复。
 *
 * 数据来源的可靠性：
 *   只采集「确实改动了 src/content/docs 下 .md/.mdx 文件」的提交，并按 git 给出的 name-status
 *   （A/M/D）判定动作，不依赖提交信息文本，因此不会伪造无法确认的活动。
 *
 * 幂等 + 只增不减：
 *   以 `commit:path` 为主键合并进已有文件。GitHub / Cloudflare 上的浅克隆（shallow clone）
 *   只包含最近若干次提交，如果整体覆盖写，会丢掉更早的历史。因此这里保证旧记录永不被删除。
 *
 * 用法：npm run activity:sync
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const OUT_PATH = resolve('src/content/_admin/activity-history.json');
const DOCS_ROOT = 'src/content/docs';

export type ActivityAction = 'create' | 'update' | 'delete';

export interface ActivityEvent {
  /** 事件唯一键：git commit sha */
  commit: string;
  /** ISO8601 时间戳（含原始时区偏移，例如 2026-09-11T18:00:57+08:00） */
  ts: string;
  action: ActivityAction;
  /** 仓库内文件路径，例如 src/content/docs/mtk/physical-resolution.mdx */
  path: string;
  /** 提交时记录的标题（从提交信息推导），仅作兜底显示 */
  title: string;
  /** 提交者 */
  author: string;
}

interface HistoryFile {
  generatedAt: string;
  generator: string;
  events: ActivityEvent[];
}

/** name-status 状态码 → 活动类型 */
function statusToAction(status: string): ActivityAction | null {
  switch (status[0]) {
    case 'A':
      return 'create';
    case 'M':
      return 'update';
    case 'D':
      return 'delete';
    default:
      return null; // R/C/T/U/X 等不参与统计，避免把重命名/类型变更误算成编辑
  }
}

function isNotePath(path: string): boolean {
  return path.startsWith(`${DOCS_ROOT}/`) && /\.(md|mdx)$/.test(path);
}

/** 从提交信息里剥离 `docs: add|update|delete ` 前缀，得到标题 */
function titleFromSubject(subject: string): string {
  return subject
    .replace(/^docs:\s*(add|update|delete)\s+/i, '')
    .replace(/^docs:\s*/i, '')
    .trim();
}

/**
 * 解析 `git log --name-status` 输出。
 * 记录头以 \x01 开头，字段用 \x02 分隔；其后每行是 `状态\t路径`。
 */
function parseGitLog(raw: string): ActivityEvent[] {
  const events: ActivityEvent[] = [];
  let current: { commit: string; ts: string; author: string; title: string } | null = null;

  for (const line of raw.split(/\r?\n/)) {
    if (line.startsWith('\x01')) {
      const [commit, ts, author, ...rest] = line.slice(1).split('\x02');
      current = { commit, ts, author, title: titleFromSubject(rest.join('\x02')) };
      continue;
    }
    if (!current) continue;

    const match = line.match(/^([A-Z]\d*)\t(.+)$/);
    if (!match) continue;

    const action = statusToAction(match[1]);
    if (!action) continue;

    // 重命名会给出 `R100\t旧路径\t新路径`，取最后一个字段作为当前路径
    const parts = match[2].split('\t');
    const path = parts[parts.length - 1];
    if (!isNotePath(path)) continue;

    events.push({
      commit: current.commit,
      ts: current.ts,
      action,
      path,
      title: current.title,
      author: current.author,
    });
  }

  return events;
}

function readExisting(): ActivityEvent[] {
  if (!existsSync(OUT_PATH)) return [];
  try {
    const data = JSON.parse(readFileSync(OUT_PATH, 'utf8')) as HistoryFile;
    return Array.isArray(data.events) ? data.events : [];
  } catch {
    return [];
  }
}

function main() {
  let raw = '';
  try {
    raw = execFileSync(
      'git',
      [
        '-c',
        'core.quotepath=false',
        'log',
        '--name-status',
        '--date=iso-strict',
        '--pretty=format:\x01%H\x02%aI\x02%an\x02%s',
        '--',
        DOCS_ROOT,
      ],
      { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 },
    );
  } catch (error) {
    // 构建环境可能没有 git 或只有浅克隆：不能让日历的数据同步拖垮整站构建。
    console.warn(
      `[activity:sync] 跳过 Git 历史同步：${error instanceof Error ? error.message : String(error)}`,
    );
    return;
  }

  const fromGit = parseGitLog(raw);
  const existing = readExisting();

  // 以 commit:path 为主键合并；已有记录优先保留，git 侧只补充缺失的
  const merged = new Map<string, ActivityEvent>();
  const keyOf = (e: ActivityEvent) => `${e.commit}:${e.path}`;

  for (const event of existing) merged.set(keyOf(event), event);
  let added = 0;
  for (const event of fromGit) {
    const key = keyOf(event);
    if (merged.has(key)) continue;
    merged.set(key, event);
    added += 1;
  }

  const events = [...merged.values()].sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));

  const byAction = events.reduce<Record<string, number>>((acc, e) => {
    acc[e.action] = (acc[e.action] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`[activity:sync] git 解析到 ${fromGit.length} 条，新增 ${added} 条，合计 ${events.length} 条`);
  console.log(`[activity:sync] 动作分布：${JSON.stringify(byAction)}`);
  if (events.length > 0) {
    console.log(`[activity:sync] 时间范围：${events[0].ts} → ${events[events.length - 1].ts}`);
  }

  // 只在数据真正变化时落盘：保证在 build 阶段运行时不会产生无意义的文件改动
  if (added === 0 && existsSync(OUT_PATH)) {
    console.log('[activity:sync] 无新增记录，保持现有文件不变');
    return;
  }

  const payload: HistoryFile = {
    generatedAt: new Date().toISOString(),
    generator: 'scripts/sync-activity-history.ts',
    events,
  };

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(`[activity:sync] 已写入 ${OUT_PATH}`);
}

main();
