/**
 * 专题详情视图：根据 hash 中的 id 渲染对应专题的笔记列表。
 */
import { $, $$, escapeHtml, formatDateZh, statusBadgeClass, navigate } from './shared';

interface TopicDoc {
  id: string;
  title: string;
  status: string;
  updated: string;
}
interface TopicRow {
  topic: string;
  meta: { title: string; description: string };
  docs: TopicDoc[];
  statusCount: Record<string, number>;
}

function loadTopic(topicId: string): TopicRow | null {
  const node = $(`#topic-notes-data script[data-topic="${topicId}"]`);
  if (!node) return null;
  try {
    return JSON.parse(node.textContent || '{}');
  } catch {
    return null;
  }
}

function rowHtml(doc: TopicDoc): string {
  const title = escapeHtml(doc.title || '(未命名)');
  const status = escapeHtml(doc.status || '整理中');
  const updated = escapeHtml(formatDateZh(doc.updated));
  const path = escapeHtml(doc.id);
  const previewSlug = doc.id.includes('/') ? doc.id.replace(/\/index$/, '') : doc.id;
  return `<tr data-path="${path}">
    <td class="col-title" title="${escapeHtml(doc.title || '')}">${title}</td>
    <td><span class="status-badge kb-status-active ${statusBadgeClass(doc.status || '整理中')}">${status}</span></td>
    <td class="admin-table-meta">${updated}</td>
    <td>
      <div class="col-actions">
        <button class="admin-icon-btn" data-action="edit" title="编辑">
          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
        </button>
        <a class="admin-icon-btn" href="/${previewSlug}/" target="_blank" rel="noopener" title="预览">
          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
        </a>
      </div>
    </td>
  </tr>`;
}

function renderTopic(topicId: string): void {
  const data = loadTopic(topicId);
  const titleEl = $('[data-topic-title]');
  const descEl = $('[data-topic-desc]');
  const idEl = $('[data-topic-id]');
  const statusEl = $('[data-topic-status]');
  const countEl = $('[data-topic-count]');
  const tbody = $('#topic-notes-tbody');

  if (!data) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="4"><div class="admin-empty">未找到专题：${escapeHtml(topicId)}</div></td></tr>`;
    return;
  }

  if (titleEl) titleEl.textContent = data.meta.title;
  if (descEl) descEl.textContent = data.meta.description;
  if (idEl) idEl.textContent = topicId;
  if (countEl) countEl.textContent = String(data.docs.length);

  if (statusEl) {
    statusEl.innerHTML = Object.entries(data.statusCount)
      .map(([s, n]) => `<span style="display:inline-flex;align-items:center;gap:4px">
        <span class="status-badge kb-status-active ${statusBadgeClass(s || '整理中')}">${escapeHtml(s)}</span>
        <span class="admin-text-xs admin-subtle">${n}</span>
      </span>`)
      .join('');
  }

  if (!tbody) return;

  if (data.docs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4"><div class="admin-empty">该专题暂无笔记</div></td></tr>`;
    return;
  }

  tbody.innerHTML = data.docs.map(rowHtml).join('');

  // 行点击进入编辑 + 操作按钮
  $$('tr[data-path]', tbody).forEach((row) => {
    const path = row.getAttribute('data-path') || '';
    row.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.closest('.col-actions')) return;
      navigate('edit', { path });
    });
    $$('[data-action]', row).forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = btn.getAttribute('data-action');
        if (action === 'edit') navigate('edit', { path });
      });
    });
  });
}

/** 由 app.ts 路由钩子调用 */
export function mountTopicDetail(): void {
  const hash = location.hash;
  const queryIndex = hash.indexOf('?');
  const queryStr = queryIndex >= 0 ? hash.slice(queryIndex + 1) : '';
  const params = new URLSearchParams(queryStr);
  const topicId = params.get('id') || '';
  if (!topicId) {
    location.hash = '#/topics';
    return;
  }
  renderTopic(topicId);
}
