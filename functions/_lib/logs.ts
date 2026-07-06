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

/** readLogs 的返回类型，额外携带文件 sha 供写入时复用 */
export interface LogFileWithSha extends LogFile {
  sha?: string;
}

function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function readLogs(env: Env, token: string): Promise<LogFileWithSha> {
  try {
    const file = await getFile(env, token, LOGS_PATH);
    const text = decodeBase64Content(file.content);
    const data = JSON.parse(text) as LogFile;
    if (!Array.isArray(data.entries)) return { entries: [] };
    return { entries: data.entries, sha: file.sha };
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('Not Found')) return { entries: [] };
    throw error;
  }
}

/**
 * 追加一条日志。失败时静默处理（不影响主操作）。
 *
 * 防御 TOCTOU 竞态：
 * - readLogs 返回 sha，复用该 sha 写入，消除冗余 getFile 调用
 * - 遇到 409 冲突时，重新读取最新 entries + sha 后指数退避重试（最多 3 次）
 */
const MAX_RETRIES = 3;

function isConflictError(error: unknown): boolean {
  return (
    error instanceof Error &&
    'status' in error &&
    (error as Error & { status?: number }).status === 409
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function appendLog(
  env: Env,
  token: string,
  entry: Omit<LogEntry, 'id' | 'ts'> & { ts?: string },
): Promise<void> {
  try {
    const newEntry: LogEntry = {
      id: generateId(),
      ts: entry.ts || new Date().toISOString(),
      ...entry,
    };

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      // 每次尝试都重新读取，确保拿到最新 entries + sha
      const current = await readLogs(env, token);
      const entries = [newEntry, ...current.entries].slice(0, MAX_ENTRIES);
      const next: LogFile = { entries };
      const content = JSON.stringify(next, null, 2) + '\n';

      try {
        await putFile(env, token, LOGS_PATH, content, `chore: log ${entry.action}`, current.sha);
        return; // 写入成功
      } catch (error) {
        if (isConflictError(error) && attempt < MAX_RETRIES) {
          // 409 冲突：指数退避后重试（200ms → 400ms → 800ms）
          await sleep(200 * Math.pow(2, attempt));
          continue;
        }
        throw error; // 非冲突错误或重试次数耗尽，向上抛出
      }
    }
  } catch {
    /* 静默：日志失败不应影响主操作 */
  }
}
