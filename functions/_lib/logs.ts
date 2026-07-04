import { type Env } from './env';
import { decodeBase64Content, getFile, putFile } from './github';

/**
 * 操作日志：以 JSON 数组形式存储在仓库内 `src/content/_admin/logs.json`。
 * 限制最多保留 MAX_ENTRIES 条（按时间倒序后截断），避免无限增长。
 */

export const LOGS_PATH = 'src/content/_admin/logs.json';
const MAX_ENTRIES = 500;

export type LogAction =
  | 'note.create'
  | 'note.update'
  | 'note.delete'
  | 'image.upload'
  | 'image.delete';

export interface LogEntry {
  id: string;
  ts: string; // ISO timestamp
  action: LogAction;
  actor: string; // GitHub login
  target: string; // 受影响文件路径
  title?: string; // 笔记标题（如适用）
  details?: Record<string, unknown>; // 额外信息
  commit?: string; // git commit sha
}

export interface LogFile {
  entries: LogEntry[];
}

function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function readLogs(env: Env, token: string): Promise<LogFile> {
  try {
    const file = await getFile(env, token, LOGS_PATH);
    const text = decodeBase64Content(file.content);
    const data = JSON.parse(text) as LogFile;
    if (!Array.isArray(data.entries)) return { entries: [] };
    return data;
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('Not Found')) return { entries: [] };
    throw error;
  }
}

/**
 * 追加一条日志。失败时静默处理（不影响主操作）。
 */
export async function appendLog(
  env: Env,
  token: string,
  entry: Omit<LogEntry, 'id' | 'ts'> & { ts?: string },
): Promise<void> {
  try {
    const current = await readLogs(env, token);
    const newEntry: LogEntry = {
      id: generateId(),
      ts: entry.ts || new Date().toISOString(),
      ...entry,
    };
    const entries = [newEntry, ...current.entries].slice(0, MAX_ENTRIES);
    const next: LogFile = { entries };
    const content = JSON.stringify(next, null, 2) + '\n';
    // 复用现有 sha 以便更新
    let sha: string | undefined;
    try {
      const file = await getFile(env, token, LOGS_PATH);
      sha = file.sha;
    } catch {
      /* 新文件 */
    }
    await putFile(env, token, LOGS_PATH, content, `chore: log ${entry.action}`, sha);
  } catch {
    /* 静默：日志失败不应影响主操作 */
  }
}
