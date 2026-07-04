import { requireAdmin } from '../../_lib/auth';
import { type Env } from '../../_lib/env';
import { json, serverError } from '../../_lib/http';
import { readLogs, type LogAction } from '../../_lib/logs';

interface Query {
  action?: LogAction | '';
  actor?: string;
  keyword?: string;
  limit?: number;
}

function parseQuery(url: URL): Query {
  const action = url.searchParams.get('action') as LogAction | '' | null;
  const actor = url.searchParams.get('actor') || '';
  const keyword = url.searchParams.get('q') || '';
  const limitRaw = parseInt(url.searchParams.get('limit') || '200', 10);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 500) : 200;
  return {
    action: action || undefined,
    actor: actor || undefined,
    keyword: keyword.toLowerCase() || undefined,
    limit,
  };
}

export async function onRequestGet(context: { request: Request; env: Env }) {
  try {
    const auth = await requireAdmin(context.request, context.env);
    if (auth.response) return auth.response;

    const url = new URL(context.request.url);
    const q = parseQuery(url);

    const { entries } = await readLogs(context.env, auth.session!.token);

    let filtered = entries;
    if (q.action) filtered = filtered.filter((e) => e.action === q.action);
    if (q.actor) filtered = filtered.filter((e) => e.actor === q.actor);
    if (q.keyword) {
      filtered = filtered.filter((e) => {
        const hay = `${e.target} ${e.title || ''} ${e.action} ${e.actor}`.toLowerCase();
        return hay.includes(q.keyword!);
      });
    }

    const limited = filtered.slice(0, q.limit);

    // 统计各操作次数
    const stats = entries.reduce<Record<string, number>>((acc, e) => {
      acc[e.action] = (acc[e.action] || 0) + 1;
      return acc;
    }, {});

    // 统计活跃用户
    const actors = entries.reduce<Record<string, number>>((acc, e) => {
      acc[e.actor] = (acc[e.actor] || 0) + 1;
      return acc;
    }, {});

    return json({
      ok: true,
      entries: limited,
      total: entries.length,
      filtered: filtered.length,
      stats,
      actors,
    });
  } catch (error) {
    return serverError(error instanceof Error ? error.message : 'Logs list failed');
  }
}
