/**
 * 笔记管理列表：拉取 /api/notes/list、搜索、筛选、操作。
 */
import { fetchNoteList, type NoteListItem } from './api';
import {
  $,
  $$,
  copyText,
  escapeHtml,
  formatDateZh,
  navigate,
  statusBadgeClass,
  visBadgeClass,
  visLabel,
} from './shared';

let allNotes: NoteListItem[] = [];
let loaded = false;

interface Filters {
  keyword: string;
  category: string;
  status: string;
  visibility: string;
  sensitive: string;
}

function readFilters(): Filters {
  return {
    keyword: ($('#admin-notes-search') as HTMLInputElement)?.value?.trim().toLowerCase() ?? '',
    category: ($('#admin-filter-category') as HTMLSelectElement)?.value ?? '',
    status: ($('#admin-filter-status') as HTMLSelectElement)?.value ?? '',
    visibility: ($('#admin-filter-visibility') as HTMLSelectElement)?.value ?? '',
    sensitive: ($('#admin-filter-sensitive') as HTMLSelectElement)?.value ?? '',
  };
}

function showMessage(text: string, type: 'info' | 'success' | 'error' = 'info') {
  const box = $('#admin-notes-message');
  if (!box) return;
  if (!text) {
    box.innerHTML = '';
    return;
  }
  const iconMap: Record<string, string> = {
    success: '✓',
    error: '!',
    info: 'i',
  };
  box.innerHTML = `<div class="admin-message ${type}" style="margin-bottom:14px"><span style="font-weight:700">${iconMap[type] || ''}</span><span>${escapeHtml(text)}</span></div>`;
}

function rowHtml(note: NoteListItem): string {
  const category = escapeHtml(note.category);
  const title = escapeHtml(note.title || note.slug);
  const status = escapeHtml(note.status || '整理中');
  const visibility = escapeHtml(note.visibility || 'public');
  const path = escapeHtml(note.path);
  const updated = note.label?.split('·')[0]?.trim() || '';

  return `<tr data-path="${path}">
    <td class="col-title" title="${escapeHtml(note.title || '')}">${title}</td>
    <td><span class="admin-tag">${category}</span></td>
    <td><span class="status-badge kb-status-active ${statusBadgeClass(note.status || '整理中')}">${status}</span></td>
    <td><span class="admin-vis-badge ${visBadgeClass(note.visibility || 'public')}">${visLabel(note.visibility || 'public')}</span></td>
    <td class="admin-table-meta">—</td>
    <td class="admin-table-meta">—</td>
    <td>
      <div class="col-actions">
        <button class="admin-icon-btn" data-action="edit" title="编辑">
          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
        </button>
        <a class="admin-icon-btn" href="/${note.category}/${note.slug}/" target="_blank" rel="noopener" title="预览">
          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
        </a>
        <button class="admin-icon-btn" data-action="copy" title="复制路径">
          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
        </button>
        <button class="admin-icon-btn danger" data-action="delete" title="删除">
          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
        </button>
      </div>
    </td>
  </tr>`;
}

function applyFilters() {
  const f = readFilters();
  const filtered = allNotes.filter((note) => {
    if (f.keyword) {
      const hay = `${note.title} ${note.path} ${note.slug}`.toLowerCase();
      if (!hay.includes(f.keyword)) return false;
    }
    if (f.category && note.category !== f.category) return false;
    if (f.status && (note.status || '整理中') !== f.status) return false;
    if (f.visibility && (note.visibility || 'public') !== f.visibility) return false;
    // sensitive 过滤需要 frontmatter，list 接口未返回，仅作占位
    return true;
  });

  const tbody = $('#admin-notes-tbody');
  if (!tbody) return;

  const countEl = $('#admin-notes-count');
  if (countEl) countEl.textContent = `共 ${filtered.length} 篇 / 总计 ${allNotes.length} 篇`;

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="admin-empty">
      <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block;margin:0 auto 10px"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
      没有匹配的笔记
    </div></td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(rowHtml).join('');

  // 绑定行操作
  $$('#admin-notes-tbody tr[data-path]').forEach((row) => {
    const path = row.getAttribute('data-path') || '';
    $$('[data-action]', row).forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        const target = e.currentTarget as HTMLElement;
        const action = target.getAttribute('data-action');
        if (action === 'edit') {
          navigate('edit', { path });
        } else if (action === 'copy') {
          const ok = await copyText(path);
          showMessage(ok ? `已复制路径：${path}` : '复制失败', ok ? 'success' : 'error');
        } else if (action === 'delete') {
          showMessage('当前版本暂未提供删除接口，请在 GitHub 仓库手动删除该文件。', 'info');
        }
      });
    });
  });
}

export async function mountNotesManage(forceRefresh = false): Promise<void> {
  const view = $('[data-view="notes"]');
  if (!view) return;

  // 已加载过且非强制刷新：仅重算筛选
  if (loaded && !forceRefresh) {
    applyFilters();
    return;
  }

  const tbody = $('#admin-notes-tbody');
  const loading = $('#admin-notes-loading');
  if (loading) loading.textContent = '正在加载笔记列表...';
  showMessage('');

  try {
    allNotes = await fetchNoteList();
    loaded = true;
    applyFilters();
  } catch (err) {
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="7"><div class="admin-empty" style="color:var(--kb-danger)">加载失败：${escapeHtml((err as Error).message)}</div></td></tr>`;
    }
  }
}

export function bindNotesManageEvents(): void {
  const search = $('#admin-notes-search');
  const category = $('#admin-filter-category');
  const status = $('#admin-filter-status');
  const visibility = $('#admin-filter-visibility');
  const sensitive = $('#admin-filter-sensitive');
  const syncBtn = $('#admin-sync-btn');
  const batchInput = $('#admin-batch-input');

  [search, category, status, visibility, sensitive].forEach((el) => {
    el?.addEventListener('input', applyFilters);
    el?.addEventListener('change', applyFilters);
  });

  syncBtn?.addEventListener('click', async () => {
    if (syncBtn) {
      syncBtn.setAttribute('disabled', '');
      const original = syncBtn.innerHTML;
      syncBtn.innerHTML = '同步中...';
      try {
        loaded = false;
        await mountNotesManage(true);
        showMessage(`已同步 ${allNotes.length} 篇笔记`, 'success');
      } catch (err) {
        showMessage(`同步失败：${(err as Error).message}`, 'error');
      } finally {
        if (syncBtn) {
          syncBtn.removeAttribute('disabled');
          syncBtn.innerHTML = original;
        }
      }
    }
  });

  // 批量导入：逐个跳转到新建并预填（受单文件表单限制，这里给提示并跳转新建页）
  batchInput?.addEventListener('change', async (event) => {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files || []);
    if (files.length === 0) return;
    if (files.length === 1) {
      // 单文件交给编辑器处理
      sessionStorage.setItem('admin:pending-upload', await files[0].text());
      sessionStorage.setItem('admin:pending-upload-name', files[0].name);
      navigate('new');
    } else {
      showMessage(`已选择 ${files.length} 个文件，批量导入暂需逐个新建。点击「新建笔记」上传。`, 'info');
    }
    input.value = '';
  });
}
