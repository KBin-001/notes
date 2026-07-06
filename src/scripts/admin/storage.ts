/**
 * 存储管理：拉取图片清单、引用统计、过滤、删除无引用图片。
 */
import { fetchStorageList, deleteStorageImage, fetchCurrentUser, type StorageImage, type RepoConfig } from './api';
import { $, $$, escapeHtml } from './shared';

let allImages: StorageImage[] = [];
let loaded = false;
let currentFilter: 'all' | 'referenced' | 'unreferenced' = 'all';
let currentKeyword = '';
let repoInfo: RepoConfig | null = null;

/** 拼接图片在 GitHub raw 的可访问 URL */
function buildRawUrl(path: string): string {
  if (!repoInfo) return '#';
  const { owner, repo, branch } = repoInfo;
  return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/src/content/docs/${path}`;
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes < 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

function showMessage(text: string, type: 'info' | 'success' | 'error' = 'info'): void {
  const box = $('#storage-message');
  if (!box) return;
  if (!text) {
    box.innerHTML = '';
    return;
  }
  const iconMap: Record<string, string> = { success: '✓', error: '!', info: 'i' };
  box.innerHTML = `<div class="admin-message ${type}" style="margin-bottom:14px"><span style="font-weight:700">${iconMap[type] || ''}</span><span>${escapeHtml(text)}</span></div>`;
}

function renderStats(stats: {
  total: number;
  totalSize: number;
  referenced: number;
  unreferenced: number;
  unreferencedSize: number;
}): void {
  const set = (key: string, val: string): void => {
    const el = $(`[data-stat="${key}"]`);
    if (el) el.textContent = val;
  };
  set('total', String(stats.total));
  set('totalSize', formatBytes(stats.totalSize));
  set('unreferenced', String(stats.unreferenced));
  set('unreferencedSize', `占用 ${formatBytes(stats.unreferencedSize)}`);
}

function rowHtml(img: StorageImage): string {
  const path = escapeHtml(img.path);
  const name = escapeHtml(img.name);
  const category = escapeHtml(img.category || '—');
  const refs = img.references;
  const size = formatBytes(img.size);
  const refClass = refs === 0 ? 'storage-ref-zero' : 'storage-ref-ok';
  const refBadge = `<span class="admin-tag ${refClass}" title="${escapeHtml(img.referencedBy.join(', ') || '无引用')}">${refs}</span>`;
  const canDelete = refs === 0;

  return `<tr data-path="${path}" data-sha="${escapeHtml(img.sha)}">
    <td class="col-title" title="${path}">
      <span class="storage-row-name">${name}</span>
      <span class="storage-row-path admin-text-xs admin-subtle admin-mono">${path}</span>
    </td>
    <td><span class="admin-tag">${category}</span></td>
    <td>${refBadge}</td>
    <td class="admin-table-meta">${size}</td>
    <td>
      <div class="col-actions">
        <a class="admin-icon-btn" href="${escapeHtml(buildRawUrl(img.path))}" target="_blank" rel="noopener" title="预览">
          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
        </a>
        <button class="admin-icon-btn danger" data-action="delete" ${canDelete ? '' : 'disabled style="opacity:0.4;cursor:not-allowed"'} title="${canDelete ? '删除（无引用）' : '已被引用，不能删除'}">
          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
        </button>
      </div>
    </td>
  </tr>`;
}

function applyFilters(): void {
  const filtered = allImages.filter((img) => {
    if (currentFilter === 'referenced' && img.references === 0) return false;
    if (currentFilter === 'unreferenced' && img.references > 0) return false;
    if (currentKeyword) {
      const hay = `${img.path} ${img.name} ${img.category}`.toLowerCase();
      if (!hay.includes(currentKeyword)) return false;
    }
    return true;
  });

  const tbody = $('#storage-tbody');
  if (!tbody) return;

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5"><div class="admin-empty">没有匹配的图片</div></td></tr>`;
  } else {
    tbody.innerHTML = filtered.map(rowHtml).join('');
    $$('tr[data-path]', tbody).forEach((row) => bindRow(row));
  }

  const countEl = $('#storage-count');
  if (countEl) countEl.textContent = `共 ${filtered.length} 项`;
}

function bindRow(row: HTMLTableRowElement): void {
  const path = row.getAttribute('data-path') || '';
  const sha = row.getAttribute('data-sha') || '';
  const delBtn = $('[data-action="delete"]', row) as HTMLButtonElement | null;
  if (delBtn && !delBtn.disabled) {
    delBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await handleDelete(path, sha, row);
    });
  }
}

async function handleDelete(path: string, sha: string, row: HTMLTableRowElement): Promise<void> {
  if (!confirm(`确认删除图片？\n\n${path}\n\n该图片无引用，删除后无法恢复。`)) return;
  showMessage('正在删除...', 'info');
  try {
    await deleteStorageImage(path, sha);
    // 从内存中移除
    allImages = allImages.filter((i) => i.path !== path);
    row.remove();
    // 重新计算统计
    const stats = computeStats(allImages);
    renderStats(stats);
    const countEl = $('#storage-count');
    if (countEl) {
      const cur = parseInt(countEl.textContent?.replace(/[^0-9]/g, '') || '0', 10);
      countEl.textContent = `共 ${Math.max(0, cur - 1)} 项`;
    }
    showMessage(`已删除 ${path}`, 'success');
  } catch (err) {
    showMessage(err instanceof Error ? err.message : '删除失败', 'error');
  }
}

function computeStats(images: StorageImage[]) {
  return {
    total: images.length,
    totalSize: images.reduce((s, i) => s + i.size, 0),
    referenced: images.filter((i) => i.references > 0).length,
    unreferenced: images.filter((i) => i.references === 0).length,
    unreferencedSize: images.filter((i) => i.references === 0).reduce((s, i) => s + i.size, 0),
  };
}

export async function mountStorage(force = false): Promise<void> {
  if (loaded && !force) {
    applyFilters();
    return;
  }

  const tbody = $('#storage-tbody');
  const loading = $('#storage-loading');
  if (tbody && !loaded) {
    tbody.innerHTML = `<tr><td colspan="5"><div class="admin-loading">正在加载存储清单...</div></td></tr>`;
  }
  showMessage('', 'info');

  try {
    // 并行加载图片清单和 repo 信息（用于生成预览 URL）
    const [data, auth] = await Promise.all([fetchStorageList(), fetchCurrentUser()]);
    repoInfo = auth.repo;
    allImages = data.images;
    loaded = true;
    renderStats(data.stats);
    applyFilters();
  } catch (err) {
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="5"><div class="admin-empty" style="color:var(--kb-danger)">加载失败：${escapeHtml(err instanceof Error ? err.message : String(err))}</div></td></tr>`;
    }
    showMessage(err instanceof Error ? err.message : '加载失败', 'error');
  }
}

export function bindStorageEvents(): void {
  const refreshBtn = $('#storage-refresh-btn');
  refreshBtn?.addEventListener('click', () => {
    loaded = false;
    mountStorage(true);
  });

  const search = $('#storage-search') as HTMLInputElement | null;
  if (search) {
    search.addEventListener('input', () => {
      currentKeyword = search.value.trim().toLowerCase();
      applyFilters();
    });
  }

  $$('.admin-filter-group .admin-chip[data-storage-filter]').forEach((chip) => {
    chip.addEventListener('click', () => {
      $$('.admin-filter-group .admin-chip[data-storage-filter]').forEach((c) => c.classList.remove('is-active'));
      chip.classList.add('is-active');
      currentFilter = (chip.getAttribute('data-storage-filter') as any) || 'all';
      applyFilters();
    });
  });
}
