/**
 * 操作日志：拉取日志列表、过滤、紧凑表格渲染（分页 / 详情展开 / 复制）。
 *
 * 注意：本文件用 innerHTML 注入 DOM，LogsView.astro 里的 <style> 会被 Astro 加上
 * 作用域属性而无法命中这些节点，因此日志相关的样式统一写在 src/styles/admin.css。
 */
import { fetchLogs, type LogEntry } from './api';
import { $, $$, copyText, escapeHtml, relativeTime } from './shared';

/** 每页条数 */
const PAGE_SIZE = 15;

let allEntries: LogEntry[] = [];
let loaded = false;
let currentAction = 'all';
let currentKeyword = '';
let currentActor = '';
let currentPage = 1;
/** 已展开详情的日志 id（重渲染后保持展开状态） */
const expandedIds = new Set<string>();

interface ActionMeta {
  label: string;
  badgeClass: string;
}

const ACTION_META: Record<string, ActionMeta> = {
  'note.create': { label: '新建笔记', badgeClass: 'logs-badge-create' },
  'note.update': { label: '更新笔记', badgeClass: 'logs-badge-update' },
  'note.delete': { label: '删除笔记', badgeClass: 'logs-badge-delete' },
  'image.upload': { label: '上传图片', badgeClass: 'logs-badge-image' },
  'image.delete': { label: '删除图片', badgeClass: 'logs-badge-delete' },
};

function actionMeta(action: string): ActionMeta {
  return ACTION_META[action] || { label: action, badgeClass: 'logs-badge-default' };
}

const COPY_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
const CHEVRON_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"></polyline></svg>';

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

/* ---------------- 时间格式化（统一为本地时间 YYYY-MM-DD HH:mm） ---------------- */
const pad2 = (n: number): string => String(n).padStart(2, '0');

interface TimeParts {
  date: string;
  hm: string;
  hms: string;
}

function timeParts(ts: string): TimeParts | null {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  const date = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  return {
    date,
    hm: `${pad2(d.getHours())}:${pad2(d.getMinutes())}`,
    hms: `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`,
  };
}

/** 悬停提示：本地完整时间 + 相对时间 */
function timeTooltip(ts: string, parts: TimeParts | null): string {
  if (!parts) return ts;
  return `${parts.date} ${parts.hms}（本地时间 · ${relativeTime(ts)}）`;
}

/* ---------------- 渲染 ---------------- */
function renderStats(stats: Record<string, number>, total: number): void {
  const set = (key: string, val: string): void => {
    const el = $(`[data-log-stat="${key}"]`);
    if (el) el.textContent = val;
  };
  set('total', String(total));
  set('note.create', String(stats['note.create'] || 0));
  set('note.update', String(stats['note.update'] || 0));
  set('note.delete', String(stats['note.delete'] || 0));
  const imageTotal = (stats['image.upload'] || 0) + (stats['image.delete'] || 0);
  set('image', String(imageTotal));
}

/** 用后端返回的 actors 统计填充操作者下拉 */
function populateActorFilter(actors: Record<string, number>): void {
  const select = $('#logs-actor-filter') as HTMLSelectElement | null;
  if (!select) return;
  // 保留当前选中值（若有）
  const prev = select.value;
  // 保留「全部操作者」占位项
  select.innerHTML = `<option value="">全部操作者</option>`;
  Object.entries(actors)
    .sort((a, b) => b[1] - a[1])
    .forEach(([actor, count]) => {
      const opt = document.createElement('option');
      opt.value = actor;
      opt.textContent = `@${actor} (${count})`;
      select.appendChild(opt);
    });
  // 恢复选中
  if (prev && Array.from(select.options).some((o) => o.value === prev)) {
    select.value = prev;
  }
}

/** 分割路径，便于「目录可省略、文件名始终完整」的展示 */
function splitPath(target: string): { dir: string; file: string } {
  const slash = target.lastIndexOf('/');
  return slash >= 0
    ? { dir: target.slice(0, slash + 1), file: target.slice(slash + 1) }
    : { dir: '', file: target };
}

function copyButtonHtml(value: string): string {
  return `<button class="logs-copy-btn" type="button" data-copy-value="${escapeHtml(value)}" title="复制">${COPY_ICON}<span>复制</span></button>`;
}

/** 展开后的技术信息（默认隐藏，点击「详情」才出现） */
function detailRowHtml(entry: LogEntry): string {
  const parts = timeParts(entry.ts);
  const items: Array<{ label: string; value: string; copy: boolean }> = [
    { label: '文件路径', value: entry.target, copy: true },
    ...(entry.commit ? [{ label: 'Commit', value: entry.commit, copy: true }] : []),
    { label: '操作类型', value: entry.action, copy: false },
    { label: '完整时间', value: parts ? `${parts.date} ${parts.hms}` : entry.ts, copy: false },
    { label: '日志 ID', value: entry.id, copy: true },
  ];
  for (const [key, value] of Object.entries(entry.details || {})) {
    items.push({
      label: key,
      value: typeof value === 'string' ? value : JSON.stringify(value),
      copy: typeof value === 'string' && value.length > 12,
    });
  }

  return `<tr class="logs-detail-row" id="log-detail-${escapeHtml(entry.id)}">
    <td colspan="5">
      <div class="logs-detail">
        ${items
          .map(
            (item) => `<div class="logs-detail-item">
          <span class="logs-detail-label">${escapeHtml(item.label)}</span>
          <span class="logs-detail-value">${escapeHtml(item.value)}</span>
          ${item.copy ? copyButtonHtml(item.value) : ''}
        </div>`,
          )
          .join('')}
      </div>
    </td>
  </tr>`;
}

function rowHtml(entry: LogEntry): string {
  const meta = actionMeta(entry.action);
  const parts = timeParts(entry.ts);
  const isOpen = expandedIds.has(entry.id);
  const { dir, file } = splitPath(entry.target);
  const ownTitle = (entry.title || '').trim();
  const titleText = ownTitle || file || '—';
  // 标题与文件名相同（图片操作）时，次级信息只显示目录，避免文件名重复出现
  const fileIsTitle = ownTitle === '' || ownTitle === file;
  const pathHtml =
    fileIsTitle && !dir
      ? ''
      : `<span class="logs-object-path" title="${escapeHtml(entry.target)}"><span class="logs-path-dir">${escapeHtml(
          dir,
        )}</span>${fileIsTitle ? '' : `<span class="logs-path-file">${escapeHtml(file)}</span>`}</span>`;

  return `<tr class="logs-row${isOpen ? ' is-open' : ''}" data-log-id="${escapeHtml(entry.id)}">
    <td class="logs-cell-object">
      <span class="logs-object-title" title="${escapeHtml(titleText)}">${escapeHtml(titleText)}</span>
      ${pathHtml}
    </td>
    <td class="logs-cell-type"><span class="logs-badge ${meta.badgeClass}">${escapeHtml(meta.label)}</span></td>
    <td class="logs-cell-actor"><span class="logs-actor" title="${escapeHtml(entry.actor)}">@${escapeHtml(entry.actor)}</span></td>
    <td class="logs-cell-time">
      <time class="logs-time" datetime="${escapeHtml(entry.ts)}" title="${escapeHtml(timeTooltip(entry.ts, parts))}">${
        parts ? `${parts.date} ${parts.hm}` : escapeHtml(entry.ts)
      }</time>
    </td>
    <td class="logs-cell-detail">
      <button class="logs-detail-btn" type="button" data-log-toggle="${escapeHtml(entry.id)}" aria-expanded="${isOpen}" aria-controls="log-detail-${escapeHtml(
        entry.id,
      )}">
        ${CHEVRON_ICON}<span>${isOpen ? '收起' : '详情'}</span>
      </button>
    </td>
  </tr>
  ${isOpen ? detailRowHtml(entry) : ''}`;
}

function emptyRowHtml(hasAnyEntries: boolean): string {
  const text = hasAnyEntries ? '没有匹配的日志记录' : '还没有任何操作记录';
  const hint = hasAnyEntries
    ? '试试调整搜索关键词、类型或操作者筛选'
    : '后台的新建 / 更新 / 删除等写操作会自动记录在这里';
  return `<tr><td colspan="5"><div class="admin-empty">
    <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block;margin:0 auto 10px"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>
    ${text}
    <div class="admin-text-xs admin-subtle admin-mt-2">${hint}</div>
  </div></td></tr>`;
}

function filteredEntries(): LogEntry[] {
  return allEntries.filter((e) => {
    if (currentAction !== 'all' && e.action !== currentAction) return false;
    if (currentActor && e.actor !== currentActor) return false;
    if (currentKeyword) {
      const hay = `${e.target} ${e.title || ''} ${e.action} ${e.actor}`.toLowerCase();
      if (!hay.includes(currentKeyword)) return false;
    }
    return true;
  });
}

/** 分页按钮：上一页 / 页码窗口 / 下一页 */
function renderPagination(totalFiltered: number): void {
  const wrap = $('#logs-pagination');
  const info = $('#logs-page-info');
  const btns = $('#logs-page-btns');
  if (!wrap || !info || !btns) return;

  const totalPages = Math.max(1, Math.ceil(totalFiltered / PAGE_SIZE));
  if (totalFiltered <= PAGE_SIZE) {
    wrap.classList.add('admin-hidden');
    info.textContent = '';
    btns.innerHTML = '';
    return;
  }

  wrap.classList.remove('admin-hidden');
  info.textContent = `第 ${currentPage} / ${totalPages} 页 · 每页 ${PAGE_SIZE} 条`;

  const pageBtn = (page: number, label: string, opts: { active?: boolean; disabled?: boolean } = {}): string =>
    `<button type="button" class="logs-page-btn${opts.active ? ' is-active' : ''}" data-log-page="${page}"${
      opts.disabled ? ' disabled' : ''
    }>${label}</button>`;

  const windowSize = 5;
  let start = Math.max(1, currentPage - Math.floor(windowSize / 2));
  const end = Math.min(totalPages, start + windowSize - 1);
  start = Math.max(1, end - windowSize + 1);

  const numbers: string[] = [];
  if (start > 1) numbers.push(pageBtn(1, '1'), '<span class="logs-page-gap">…</span>');
  for (let p = start; p <= end; p++) numbers.push(pageBtn(p, String(p), { active: p === currentPage }));
  if (end < totalPages) numbers.push('<span class="logs-page-gap">…</span>', pageBtn(totalPages, String(totalPages)));

  btns.innerHTML = [
    pageBtn(currentPage - 1, '上一页', { disabled: currentPage <= 1 }),
    ...numbers,
    pageBtn(currentPage + 1, '下一页', { disabled: currentPage >= totalPages }),
  ].join('');
}

function applyFilters(): void {
  const filtered = filteredEntries();
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  if (currentPage > totalPages) currentPage = totalPages;
  if (currentPage < 1) currentPage = 1;

  const tbody = $('#logs-tbody');
  if (!tbody) return;

  if (filtered.length === 0) {
    tbody.innerHTML = emptyRowHtml(allEntries.length > 0);
  } else {
    const start = (currentPage - 1) * PAGE_SIZE;
    tbody.innerHTML = filtered.slice(start, start + PAGE_SIZE).map(rowHtml).join('');
  }

  renderPagination(filtered.length);

  const countEl = $('#logs-count');
  if (countEl) {
    countEl.textContent =
      filtered.length === allEntries.length
        ? `共 ${allEntries.length} 条`
        : `${filtered.length} / ${allEntries.length} 条`;
  }
}

function toggleDetail(id: string): void {
  if (expandedIds.has(id)) expandedIds.delete(id);
  else expandedIds.add(id);
  applyFilters();
}

export async function mountLogs(force = false): Promise<void> {
  if (loaded && !force) {
    applyFilters();
    return;
  }

  const tbody = $('#logs-tbody');
  if (tbody && !loaded) {
    tbody.innerHTML = `<tr><td colspan="5"><div class="admin-loading">正在加载日志...</div></td></tr>`;
  }
  showMessage('', 'info');

  try {
    // limit 取后端保留上限（functions/_lib/logs.ts MAX_ENTRIES = 500），保证分页能覆盖全部日志
    const data = await fetchLogs({ limit: 500 });
    allEntries = data.entries;
    loaded = true;
    renderStats(data.stats, data.total);
    populateActorFilter(data.actors || {});
    applyFilters();
  } catch (err) {
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="5"><div class="admin-empty" style="color:var(--kb-danger)">加载失败：${escapeHtml(
        err instanceof Error ? err.message : String(err),
      )}</div></td></tr>`;
    }
    $('#logs-pagination')?.classList.add('admin-hidden');
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
      currentPage = 1;
      applyFilters();
    });
  }

  const actorSelect = $('#logs-actor-filter') as HTMLSelectElement | null;
  if (actorSelect) {
    actorSelect.addEventListener('change', () => {
      currentActor = actorSelect.value.trim();
      currentPage = 1;
      applyFilters();
    });
  }

  $$('#logs-action-filter .admin-chip[data-log-filter]').forEach((chip) => {
    chip.addEventListener('click', () => {
      $$('#logs-action-filter .admin-chip[data-log-filter]').forEach((c) => c.classList.remove('is-active'));
      chip.classList.add('is-active');
      currentAction = chip.getAttribute('data-log-filter') || 'all';
      currentPage = 1;
      applyFilters();
    });
  });

  // 表格内交互：详情展开 / 复制（事件委托，行是动态渲染的）
  $('#logs-tbody')?.addEventListener('click', async (event) => {
    const target = event.target as HTMLElement;

    const copyBtn = target.closest('[data-copy-value]') as HTMLElement | null;
    if (copyBtn) {
      const value = copyBtn.getAttribute('data-copy-value') || '';
      const ok = await copyText(value);
      // 复制反馈就地显示在按钮上：顶部消息条可能在滚动后不可见
      const labelEl = copyBtn.querySelector('span');
      if (ok && labelEl && !copyBtn.classList.contains('is-copied')) {
        labelEl.textContent = '已复制';
        copyBtn.classList.add('is-copied');
        setTimeout(() => {
          labelEl.textContent = '复制';
          copyBtn.classList.remove('is-copied');
        }, 1400);
      }
      showMessage(ok ? `已复制：${value.length > 60 ? `${value.slice(0, 60)}…` : value}` : '复制失败，请手动选择文本复制', ok ? 'success' : 'error');
      return;
    }

    const toggleBtn = target.closest('[data-log-toggle]') as HTMLElement | null;
    if (toggleBtn) {
      const id = toggleBtn.getAttribute('data-log-toggle') || '';
      if (id) toggleDetail(id);
    }
  });

  // 分页
  $('#logs-page-btns')?.addEventListener('click', (event) => {
    const btn = (event.target as HTMLElement).closest('[data-log-page]') as HTMLButtonElement | null;
    if (!btn || btn.disabled) return;
    const page = Number(btn.getAttribute('data-log-page'));
    if (!Number.isFinite(page) || page === currentPage) return;
    currentPage = page;
    applyFilters();
    document.querySelector('.logs-table-wrap')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
}
