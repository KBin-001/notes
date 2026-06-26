/**
 * 笔记编辑器：上传解析 / 读取列表 / 载入 / 保存 / 图片插入 / 路径计算 / 编辑-预览-分屏切换。
 * 逻辑由原 admin.astro 内联脚本迁移而来，并扩展了三态预览。
 */
import {
  parseUpload,
  readNote,
  saveNote,
  uploadImage,
  fetchNoteList,
  type ParsedNote,
} from './api';
import {
  $,
  $$,
  escapeHtml,
  today,
  parseHash,
  navigate,
} from './shared';
import { renderMarkdown } from './preview';

interface EditorState {
  sha: string;
  path: string;
  mode: 'upload' | 'edit';
  publishIntent: boolean; // 点击的是「发布」还是「保存草稿」
}

const state: EditorState = {
  sha: '',
  path: '',
  mode: 'upload',
  publishIntent: true,
};

type FieldMap = Record<string, HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>;
let fields: FieldMap = {};

function collectFields() {
  fields = {
    title: $('#title') as HTMLInputElement,
    description: $('#description') as HTMLTextAreaElement,
    category: $('#category') as HTMLSelectElement,
    slug: $('#slug') as HTMLInputElement,
    tags: $('#tags') as HTMLInputElement,
    visibility: $('#visibility') as HTMLSelectElement,
    sensitive: $('#sensitive') as HTMLInputElement,
    status: $('#status') as HTMLSelectElement,
    date: $('#date') as HTMLInputElement,
    updated: $('#updated') as HTMLInputElement,
    body: $('#body') as HTMLTextAreaElement,
  };
}

/* ---------------- 消息 / 警告 ---------------- */
function showMessage(text: string, type: 'info' | 'success' | 'error' = 'info') {
  const el = $('#message');
  if (!el) return;
  el.innerHTML = `<span style="font-weight:700">${type === 'success' ? '✓' : type === 'error' ? '!' : 'i'}</span><span>${escapeHtml(text)}</span>`;
  el.classList.remove('admin-hidden', 'success', 'error', 'info');
  el.classList.add(type);
}

function hideMessage() {
  $('#message')?.classList.add('admin-hidden');
}

function showWarnings(warnings: string[] = []) {
  const el = $('#warnings');
  if (!el) return;
  if (!warnings.length) {
    el.classList.add('admin-hidden');
    el.innerHTML = '';
    return;
  }
  el.innerHTML = warnings.map((w) => `<div>• ${escapeHtml(w)}</div>`).join('');
  el.classList.remove('admin-hidden');
}

/* ---------------- topics ---------------- */
function setTopics(topics: string[] = []) {
  $$('input[name="topics"]').forEach((input) => {
    (input as HTMLInputElement).checked = topics.includes((input as HTMLInputElement).value);
  });
}

function getTopics(): string[] {
  return $$('input[name="topics"]:checked').map((input) => (input as HTMLInputElement).value);
}

/* ---------------- 路径 ---------------- */
function updateTargetPath() {
  const path =
    state.sha && state.path
      ? state.path
      : `src/content/docs/${(fields.category as HTMLSelectElement).value || 'mtk'}/${
          (fields.slug as HTMLInputElement).value || 'new-note'
        }.mdx`;
  const el = $('#target-path');
  if (el) el.textContent = path;
  updateImageButton();
}

function updateImageButton() {
  const button = $('#insert-image-button') as HTMLButtonElement | null;
  if (!button) return;
  const slug = (fields.slug as HTMLInputElement).value.trim();
  const slugValid = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/.test(slug);
  button.disabled = !slugValid;
  button.title = slugValid ? '上传图片并插入 Markdown 链接' : '请先填写有效的 Slug';
}

/* ---------------- 表单填充 / 收集 / 重置 ---------------- */
function fillForm(note: ParsedNote) {
  (fields.title as HTMLInputElement).value = note.title || '';
  (fields.description as HTMLTextAreaElement).value = note.description || '';
  (fields.category as HTMLSelectElement).value = note.category || 'mtk';
  (fields.slug as HTMLInputElement).value = note.slug || '';
  (fields.tags as HTMLInputElement).value = (note.tags || []).join(', ');
  (fields.visibility as HTMLSelectElement).value = note.visibility || 'public';
  (fields.sensitive as HTMLInputElement).checked = note.sensitive !== false;
  (fields.status as HTMLSelectElement).value = note.status || '整理中';
  (fields.date as HTMLInputElement).value = note.date || today();
  (fields.updated as HTMLInputElement).value = note.updated || today();
  (fields.body as HTMLTextAreaElement).value = note.body || '';
  setTopics(note.topics || []);
  showWarnings(note.warnings || []);
  updateTargetPath();
  updatePreview();
}

function collectNote() {
  return {
    title: (fields.title as HTMLInputElement).value.trim(),
    description: (fields.description as HTMLTextAreaElement).value.trim(),
    category: (fields.category as HTMLSelectElement).value,
    slug: (fields.slug as HTMLInputElement).value.trim(),
    tags: (fields.tags as HTMLInputElement).value
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean),
    topics: getTopics(),
    visibility: (fields.visibility as HTMLSelectElement).value,
    sensitive: (fields.sensitive as HTMLInputElement).checked,
    status: (fields.status as HTMLSelectElement).value,
    date: (fields.date as HTMLInputElement).value,
    updated: (fields.updated as HTMLInputElement).value,
    body: (fields.body as HTMLTextAreaElement).value,
    sha: state.sha || undefined,
    path: state.sha ? state.path : undefined,
  };
}

function resetForm() {
  state.sha = '';
  state.path = '';
  state.mode = 'upload';
  (fields.title as HTMLInputElement).value = '';
  (fields.description as HTMLTextAreaElement).value = '';
  (fields.category as HTMLSelectElement).value = 'mtk';
  (fields.slug as HTMLInputElement).value = '';
  (fields.tags as HTMLInputElement).value = '';
  (fields.visibility as HTMLSelectElement).value = 'public';
  (fields.sensitive as HTMLInputElement).checked = true;
  (fields.status as HTMLSelectElement).value = '整理中';
  (fields.date as HTMLInputElement).value = today();
  (fields.updated as HTMLInputElement).value = today();
  (fields.body as HTMLTextAreaElement).value = '';
  setTopics([]);
  showWarnings([]);
  hideMessage();
  updateTargetPath();
  updatePreview();
  setPageTitle(true);
  resetMode();
}

/* ---------------- 页面标题 / 按钮文案 ---------------- */
function setPageTitle(isNew: boolean) {
  const t = $('#editor-page-title');
  const s = $('#editor-page-sub');
  const btn = $('#publish-button-text');
  if (isNew) {
    if (t) t.textContent = '新建笔记';
    if (s) s.textContent = '填写笔记内容与元信息，支持编辑 / 预览 / 分屏切换。';
    if (btn) btn.textContent = '发布笔记';
  } else {
    if (t) t.textContent = '编辑笔记';
    if (s) s.textContent = '修改后会更新原文件，建议保持 Slug 不变。';
    if (btn) btn.textContent = '更新笔记';
  }
}

/* ---------------- 编辑器模式：edit / split / preview ---------------- */
let currentMode: 'edit' | 'split' | 'preview' = 'edit';

function resetMode() {
  setMode('edit');
}

function setMode(mode: 'edit' | 'split' | 'preview') {
  currentMode = mode;
  const body = $('#editor-body');
  const preview = $('#editor-preview');
  const textarea = fields.body as HTMLTextAreaElement;
  if (!body || !preview) return;

  // 清掉可能存在的 split 类
  body.classList.remove('editor-split');
  textarea.classList.remove('editor-split');
  preview.classList.add('admin-hidden');

  if (mode === 'edit') {
    textarea.style.display = 'block';
  } else if (mode === 'preview') {
    textarea.style.display = 'none';
    preview.classList.remove('admin-hidden');
    updatePreview();
  } else if (mode === 'split') {
    body.classList.add('editor-split');
    textarea.style.display = 'block';
    preview.classList.remove('admin-hidden');
    updatePreview();
  }

  $$('#editor-mode-tabs .editor-mode-tab').forEach((tab) => {
    tab.classList.toggle('is-active', tab.getAttribute('data-mode') === mode);
  });
}

function updatePreview() {
  const preview = $('#editor-preview');
  if (!preview) return;
  const text = (fields.body as HTMLTextAreaElement).value;
  preview.innerHTML = renderMarkdown(text);
}

/* ---------------- 编辑器事件 ---------------- */
function bindEditorEvents() {
  // 模式切换
  $$('#editor-mode-tabs .editor-mode-tab').forEach((tab) => {
    tab.addEventListener('click', () => setMode(tab.getAttribute('data-mode') as any));
  });

  // 正文变化 → 实时预览
  (fields.body as HTMLTextAreaElement).addEventListener('input', () => {
    if (currentMode !== 'edit') updatePreview();
  });

  // 路径联动
  $('#note-form')?.addEventListener('input', updateTargetPath);

  // 文件上传解析
  $('#file-input')?.addEventListener('change', async (event) => {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const nameEl = $('#file-source-name');
    if (nameEl) nameEl.textContent = file.name;
    const form = new FormData();
    form.set('file', file);
    showMessage('正在解析文件...');
    try {
      const note = await parseUpload(file);
      state.sha = '';
      state.path = '';
      state.mode = 'upload';
      fillForm(note);
      setPageTitle(true);
      showMessage('解析完成，可以调整字段后提交。', 'success');
    } catch (err) {
      showMessage((err as Error).message, 'error');
    }
    input.value = '';
  });

  // 读取 GitHub 列表
  $('#load-list-button')?.addEventListener('click', async () => {
    showMessage('正在读取 GitHub 笔记列表...');
    try {
      const files = await fetchNoteList();
      const select = $('#note-list') as HTMLSelectElement;
      select.innerHTML =
        '<option value="">请选择文章</option>' +
        files
          .map(
            (file) =>
              `<option value="${escapeHtml(file.path)}" title="${escapeHtml(file.path)}">${escapeHtml(file.label || file.title || file.path)}</option>`,
          )
          .join('');
      showMessage(`已读取 ${files.length} 篇笔记。`, 'success');
    } catch (err) {
      showMessage((err as Error).message, 'error');
    }
  });

  // 选择已有文章
  $('#note-list')?.addEventListener('change', async (event) => {
    const path = (event.target as HTMLSelectElement).value;
    if (!path) return;
    showMessage('正在读取文章...');
    try {
      const { path: realPath, note } = await readNote(path);
      state.sha = note.sha || '';
      state.path = realPath;
      state.mode = 'edit';
      fillForm(note);
      setPageTitle(false);
      showMessage('文章已载入，编辑后会更新原文件。', 'success');
    } catch (err) {
      showMessage((err as Error).message, 'error');
    }
  });

  // 插入图片
  $('#insert-image-button')?.addEventListener('click', () => {
    $('#image-input')?.click();
  });

  $('#image-input')?.addEventListener('change', async (event) => {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files || []);
    if (!files.length) return;

    const button = $('#insert-image-button') as HTMLButtonElement;
    const original = button.innerHTML;
    button.disabled = true;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      button.innerHTML = `上传中 (${i + 1}/${files.length})...`;
      showMessage(`正在上传图片：${file.name}`);
      try {
        const data = await uploadImage(
          file,
          (fields.category as HTMLSelectElement).value,
          (fields.slug as HTMLInputElement).value.trim(),
        );
        const textarea = fields.body as HTMLTextAreaElement;
        const pos = textarea.selectionStart;
        const before = textarea.value.substring(0, pos);
        const after = textarea.value.substring(pos);
        const prefix = before.length > 0 && !before.endsWith('\n') ? '\n' : '';
        const suffix = after.length > 0 && !after.startsWith('\n') ? '\n' : '';
        textarea.value = before + prefix + data.markdown + suffix + after;
        textarea.selectionStart = textarea.selectionEnd =
          pos + prefix.length + data.markdown.length + suffix.length;
        textarea.focus();
        updatePreview();
        showMessage(`图片已上传：${file.name}`, 'success');
      } catch (err) {
        showMessage(`图片上传失败 (${file.name}): ${(err as Error).message}`, 'error');
      }
    }

    button.innerHTML = original;
    updateImageButton();
    input.value = '';
  });

  // 清空
  $('#reset-button')?.addEventListener('click', () => {
    if (confirm('确定清空当前表单吗？未保存的内容将丢失。')) resetForm();
  });

  // 保存草稿（不发布：状态置为整理中 / 公开状态保持，但通常建议 draft）
  $('#save-draft-button')?.addEventListener('click', async () => {
    state.publishIntent = false;
    await submitNote(true);
  });

  // 提交（发布）
  $('#note-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    state.publishIntent = true;
    await submitNote(false);
  });
}

async function submitNote(asDraft: boolean) {
  const note = collectNote();
  if (asDraft) {
    // 草稿：状态强制为「整理中」，公开状态不动（用户可后续切换）
    note.status = '整理中';
  }
  showMessage(asDraft ? '正在保存草稿...' : '正在提交到 GitHub...');
  try {
    const data = await saveNote(note);
    state.sha = data.content?.sha || state.sha;
    state.path = data.path || state.path;
    state.mode = 'edit';
    setPageTitle(false);
    updateTargetPath();
    const deployText = data.deploy?.configured
      ? data.deploy.ok
        ? '，已触发网站重新部署'
        : `，但触发部署失败${data.deploy.status ? ` (${data.deploy.status})` : ''}`
      : '，未配置部署 Hook，前台需等待手动部署';
    showMessage(`${asDraft ? '草稿已保存' : '提交成功'}：${data.path}${deployText}`, 'success');
  } catch (err) {
    showMessage((err as Error).message, 'error');
  }
}

/* ---------------- 外部入口：进入编辑/新建视图时调用 ---------------- */
export function mountEditor(): void {
  collectFields();
  resetForm();
  bindEditorEvents();
  bindOnce();
}

let eventsBound = false;
function bindOnce() {
  if (eventsBound) return;
  eventsBound = true;
  // 处理"批量导入"暂存的上传
  try {
    const pending = sessionStorage.getItem('admin:pending-upload');
    if (pending) {
      const name = sessionStorage.getItem('admin:pending-upload-name') || 'imported.md';
      sessionStorage.removeItem('admin:pending-upload');
      sessionStorage.removeItem('admin:pending-upload-name');
      const nameEl = $('#file-source-name');
      if (nameEl) nameEl.textContent = name;
      const note = parseTextInline(pending, name);
      fillForm(note);
      setPageTitle(true);
    }
  } catch {
    /* ignore */
  }
}

/** 极简的客户端解析：用于"批量导入"暂存文本（无 gray-matter 时退化为纯正文） */
function parseTextInline(text: string, filename: string): ParsedNote {
  // 复用 /api/notes/parse 不便（需要 File），这里做轻量解析
  const fmMatch = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  const data: Record<string, any> = {};
  let body = text;
  if (fmMatch) {
    body = fmMatch[2];
    for (const line of fmMatch[1].split('\n')) {
      const m = line.match(/^([a-zA-Z_]+):\s*(.*)$/);
      if (m) {
        let val: any = m[2].trim();
        if (val.startsWith('[') && val.endsWith(']')) {
          val = val.slice(1, -1).split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
        } else {
          val = String(val).replace(/^["']|["']$/g, '');
        }
        data[m[1]] = val;
      }
    }
  }
  const heading = body.match(/^#\s+(.+)$/m)?.[1] || filename.replace(/\.(md|mdx)$/i, '');
  return {
    title: data.title || heading,
    description: data.description || '',
    category: ['mtk', 'gms', 'camera', 'audio', 'display', 'tools'].includes(data.category)
      ? data.category
      : 'mtk',
    slug: data.slug || String(heading).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    tags: Array.isArray(data.tags) ? data.tags : [],
    topics: Array.isArray(data.topics) ? data.topics : [],
    visibility: ['public', 'private', 'draft'].includes(data.visibility) ? data.visibility : 'public',
    sensitive: typeof data.sensitive === 'boolean' ? data.sensitive : true,
    status: ['整理中', '已验证', '待验证', '未完成', '废弃'].includes(data.status) ? data.status : '整理中',
    date: /^\d{4}-\d{2}-\d{2}/.test(data.date) ? String(data.date).slice(0, 10) : today(),
    updated: /^\d{4}-\d{2}-\d{2}/.test(data.updated) ? String(data.updated).slice(0, 10) : today(),
    body,
    warnings: [],
  };
}

/** 进入「编辑」路由且带 path 时，自动载入该笔记 */
export async function loadNoteByHash(): Promise<void> {
  const { route, query } = parseHash();
  if ((route === 'edit' || route === 'new') && query.path) {
    try {
      showMessage('正在读取文章...');
      const { path, note } = await readNote(query.path);
      state.sha = note.sha || '';
      state.path = path;
      state.mode = 'edit';
      fillForm(note);
      setPageTitle(false);
      showMessage('文章已载入，编辑后会更新原文件。', 'success');
    } catch (err) {
      showMessage((err as Error).message, 'error');
    }
  }
}
