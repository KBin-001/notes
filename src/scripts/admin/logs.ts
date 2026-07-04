/**
 * 操作日志：拉取日志列表、过滤、时间线渲染。
 */
import { fetchLogs, type LogEntry } from './api';
import { $, $$, escapeHtml, relativeTime, formatDateZh } from './shared';

let allEntries: LogEntry[] = [];
let loaded = false;
let currentAction = 'all';
let currentKeyword = '';

interface ActionMeta {
  label: string;
  cssClass: string;
  icon: string;
}

const ACTION_META: Record<string, ActionMeta> = {
  'note.create': { label: '新建笔记', cssClass: 'log-create', icon: '✎' },
  'note.update': { label: '更新笔记', cssClass: 'log-update', icon: '✎' },
  'note.delete': { label: '删除笔记', cssClass: 'log-delete', icon: '✕' },
  'image.upload': { label: '上传图片', cssClass: 'log-image', icon: 'Img' },
  'image.delete': { label: '删除图片', cssClass: 'log-delete', icon: '✕' },
};

function actionMeta(action: string): ActionMeta {
  return ACTION_META[action] || { label: action, cssClass: '', icon: '·' };
}

function showMessage(text: string, type: 'info' | 'success' | 'error' = 'info'): void {
  const box = $('#logs-message');
  if (!box) return;
  if (!text) {
    box.innerHTML = '';
    return;
  }
  const iconMap: Record<string, string> = { success: '✓', error: '!', info: 'i' };
  box.innerHTML = `<div class="admin-message ${type}" style="margin-bottom:14px"><span style="font-weight:700">${iconMap[type] || ''}</span><span>${escapeHtml(text)}</span></div>`;
}

function renderStats(stats: Record<string, number>, total: number): void {
  const set = (key: string, val: string): void => {
    const el = $(`[data-log-stat="${key}"]`);
    if (el) el.textContent = val;
  };
  set('total', String(total));
  set('note.create', String(stats['note.create'] || 0));
  set('note.update', String(stats['note.update'] || 0));
  const imageTotal = (stats['image.upload'] || 0) + (stats['image.delete'] || 0);
  set('image', String(imageTotal));
}

function itemHtml(entry: LogEntry): string {
  const meta = actionMeta(entry.action);
  const ts = entry.ts;
  const time = `${formatDateZh(ts)} ${new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
  const relTime = relativeTime(ts);
  const title = escapeHtml(entry.title || '—');
  const target = escapeHtml(entry.target);
  const actor = escapeHtml(entry.actor);
  const commit = entry.commit ? `<div class="log-commit">${escapeHtml(entry.commit.slice(0, 7))}</div>` : '';

  return `<div class="log-item ${meta.cssClass}">
    <div class="log-head">
      <span class="log-action-badge ${meta.cssClass}">${escapeHtml(meta.icon)} ${escapeHtml(meta.label)}</span>
      <span class="log-time" title="${escapeHtml(time)}">${escapeHtml(relTime)}</span>
      <span class="log-actor">@${actor}</span>
    </div>
    <div class="log-title">${title}</div>
    <div class="log-target">${target}</div>
    ${commit}
  </div>`;
}

function applyFilters(): void {
  const filtered = allEntries.filter((e) => {
    if (currentAction !== 'all' && e.action !== currentAction) return false;
    if (currentKeyword) {
      const hay = `${e.target} ${e.title || ''} ${e.action} ${e.actor}`.toLowerCase();
      if (!hay.includes(currentKeyword)) return false;
    }
    return true;
  });

  const container = $('#logs-timeline');
  if (!container) return;

  if (filtered.length === 0) {
    container.innerHTML = `<div class="logs-empty">没有匹配的日志记录</div>`;
  } else {
    container.innerHTML = filtered.map(itemHtml).join('');
  }

  const countEl = $('#logs-count');
  if (countEl) countEl.textContent = `共 ${filtered.length} 条 / ${allEntries.length} 总计`;
}

export async function mountLogs(force = false): Promise<void> {
  if (loaded && !force) {
    applyFilters();
    return;
  }

  const container = $('#logs-timeline');
  if (container && !loaded) {
    container.innerHTML = `<div class="admin-loading">正在加载日志...</div>`;
  }
  showMessage('', 'info');

  try {
    const data = await fetchLogs({ limit: 200 });
    allEntries = data.entries;
    loaded = true;
    renderStats(data.stats, data.total);
    applyFilters();
  } catch (err) {
    if (container) {
      container.innerHTML = `<div class="logs-empty" style="color:var(--kb-danger)">加载失败：${escapeHtml(err instanceof Error ? err.message : String(err))}</div>`;
    }
    showMessage(err instanceof Error ? err.message : '加载失败', 'error');
  }
}

export function bindLogsEvents(): void {
  const refreshBtn = $('#logs-refresh-btn');
  refreshBtn?.addEventListener('click', () => {
    loaded = false;
    mountLogs(true);
  });

  const search = $('#logs-search') as HTMLInputElement | null;
  if (search) {
    search.addEventListener('input', () => {
      currentKeyword = search.value.trim().toLowerCase();
      applyFilters();
    });
  }

  $$('#logs-action-filter .admin-chip[data-log-filter]').forEach((chip) => {
    chip.addEventListener('click', () => {
      $$('#logs-action-filter .admin-chip[data-log-filter]').forEach((c) => c.classList.remove('is-active'));
      chip.classList.add('is-active');
      currentAction = chip.getAttribute('data-log-filter') || 'all';
      applyFilters();
    });
  });
}
