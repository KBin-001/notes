/**
 * 笔记编辑器：上传解析 / 读取列表 / 载入 / 保存 / 图片插入 / 路径计算 / 编辑-预览-分屏切换。
 *
 * 状态隔离约定（用于保证「新建笔记」永远是干净表单）：
 * 1. 表单只有一份 DOM 状态：所有回填都走 fillForm()，所有清空都走 resetForm()；
 * 2. `generation` 是「表单世代」：resetForm() 和每次异步载入开始时自增，
 *    异步结果返回时若世代已变化就直接丢弃，避免旧笔记的异步回包覆盖新表单；
 * 3. enterNewMode() 是进入新建模式的唯一入口；
 * 4. 日期规则：新建时创建/更新日期都是今天；编辑旧笔记时保留原创建日期、更新日期默认今天。
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
  navigate,
  parseHash,
  setNavGuard,
  type NavGuard,
} from './shared';
import { renderMarkdown } from './preview';

interface EditorState {
  sha: string;
  path: string;
  mode: 'upload' | 'edit';
}

const state: EditorState = {
  sha: '',
  path: '',
  mode: 'upload',
};

type FieldMap = Record<string, HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>;
let fields: FieldMap = {};

/** 表单世代：任何异步回填前都要校验，防止旧请求覆盖新表单 */
let generation = 0;
/** 表单基线快照（用于「有未保存修改」判断） */
let baseline = '';
/** 是否正在提交，防止重复提交 */
let submitting = false;

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

/* ---------------- 未保存修改判断 ---------------- */
function formSnapshot(): string {
  return JSON.stringify({
    title: (fields.title as HTMLInputElement).value,
    description: (fields.description as HTMLTextAreaElement).value,
    category: (fields.category as HTMLSelectElement).value,
    slug: (fields.slug as HTMLInputElement).value,
    tags: (fields.tags as HTMLInputElement).value,
    topics: [...getTopics()].sort(),
    visibility: (fields.visibility as HTMLSelectElement).value,
    sensitive: (fields.sensitive as HTMLInputElement).checked,
    status: (fields.status as HTMLSelectElement).value,
    date: (fields.date as HTMLInputElement).value,
    updated: (fields.updated as HTMLInputElement).value,
    body: (fields.body as HTMLTextAreaElement).value,
  });
}

function markClean() {
  baseline = formSnapshot();
}

function hasUnsavedChanges(): boolean {
  return Object.keys(fields).length > 0 && formSnapshot() !== baseline;
}

/**
 * 离开编辑器（或切换编辑对象）时的守卫：
 * 当前表单有未保存修改时先让用户确认，避免误丢内容。
 */
const editorNavGuard: NavGuard = () => {
  const { route } = parseHash();
  const inEditor = route === 'new' || route === 'edit';
  if (!inEditor) return true;
  // 在编辑器里，任何跳转/切换编辑对象都可能丢改动（含「重新进入同一篇」「再来一次新建」），先确认
  if (!hasUnsavedChanges()) return true;
  return confirm('当前表单有未保存的修改，继续切换会丢失这些内容。确定继续吗？');
};

/* ---------------- 表单填充 / 收集 / 重置 ---------------- */
/** 只保留 YYYY-MM-DD，避免时间戳/时区污染 <input type="date"> */
function normalizeDateInput(value: unknown): string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : '';
}

/**
 * 回填表单。
 * @param updatedToToday 编辑已有笔记时为 true：更新日期默认今天（文件里的旧 updated 不参与回填），
 *                       创建日期始终保留原值，用户仍可手动修改。
 */
function fillForm(note: ParsedNote, options: { updatedToToday?: boolean } = {}) {
  (fields.title as HTMLInputElement).value = note.title || '';
  (fields.description as HTMLTextAreaElement).value = note.description || '';
  (fields.category as HTMLSelectElement).value = note.category || 'mtk';
  (fields.slug as HTMLInputElement).value = note.slug || '';
  (fields.tags as HTMLInputElement).value = (note.tags || []).join(', ');
  (fields.visibility as HTMLSelectElement).value = note.visibility || 'public';
  (fields.sensitive as HTMLInputElement).checked = note.sensitive !== false;
  (fields.status as HTMLSelectElement).value = note.status || '整理中';
  (fields.date as HTMLInputElement).value = normalizeDateInput(note.date) || today();
  (fields.updated as HTMLInputElement).value = options.updatedToToday
    ? today()
    : normalizeDateInput(note.updated) || today();
  (fields.body as HTMLTextAreaElement).value = note.body || '';
  setTopics(note.topics || []);
  showWarnings(note.warnings || []);
  updateTargetPath();
  updatePreview();
  markClean();
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

/** 重置「外部来源选择器」：GitHub 列表选中项、文件选择、图片选择 */
function resetSourcePickers() {
  const list = $('#note-list') as HTMLSelectElement | null;
  if (list) list.value = '';
  const fileInput = $('#file-input') as HTMLInputElement | null;
  if (fileInput) fileInput.value = '';
  const imageInput = $('#image-input') as HTMLInputElement | null;
  if (imageInput) imageInput.value = '';
  const nameEl = $('#file-source-name');
  if (nameEl) nameEl.textContent = '未选择文件';
}

/** 进入新建模式的唯一入口：清空全部字段 + 解除与旧 GitHub 文件的绑定 */
export function enterNewMode(): void {
  if (!Object.keys(fields).length) collectFields();
  resetForm();
  consumePendingUpload();
}

function resetForm() {
  generation++; // 让所有在途的异步载入结果作废
  state.sha = '';
  state.path = '';
  state.mode = 'upload';

  const todayValue = today();
  (fields.title as HTMLInputElement).value = '';
  (fields.description as HTMLTextAreaElement).value = '';
  (fields.category as HTMLSelectElement).value = 'mtk';
  (fields.slug as HTMLInputElement).value = '';
  (fields.tags as HTMLInputElement).value = '';
  (fields.visibility as HTMLSelectElement).value = 'public';
  (fields.sensitive as HTMLInputElement).checked = true;
  (fields.status as HTMLSelectElement).value = '整理中';
  (fields.date as HTMLInputElement).value = todayValue;
  (fields.updated as HTMLInputElement).value = todayValue;
  (fields.body as HTMLTextAreaElement).value = '';
  setTopics([]);
  resetSourcePickers();
  showWarnings([]);
  hideMessage();
  updateTargetPath();
  updatePreview();
  setPageTitle(true);
  resetMode();
  markClean();
}

/* ---------------- 页面标题 / 按钮文案 ---------------- */
let publishLabelText = '发布笔记';

function setPageTitle(isNew: boolean) {
  const t = $('#editor-page-title');
  const s = $('#editor-page-sub');
  publishLabelText = isNew ? '发布笔记' : '保存修改';
  if (isNew) {
    if (t) t.textContent = '新建笔记';
    if (s) s.textContent = '填写笔记内容与元信息，支持编辑 / 预览 / 分屏切换。';
  } else {
    if (t) t.textContent = '编辑笔记';
    if (s) s.textContent = '修改后会更新原文件，建议保持 Slug 不变。';
  }
  const btn = $('#publish-button-text');
  if (btn && !submitting) btn.textContent = publishLabelText;
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

  // 返回列表（走导航守卫，有未保存修改时先确认）
  $('#editor-back-link')?.addEventListener('click', (event) => {
    event.preventDefault();
    navigate('notes');
  });

  // 文件上传解析
  $('#file-input')?.addEventListener('change', async (event) => {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // 立即清空，方便再次选择同一个文件
    if (!file) return;
    const nameEl = $('#file-source-name');
    if (nameEl) nameEl.textContent = file.name;
    const token = beginLoad();
    showMessage('正在解析文件...');
    try {
      const note = await parseUpload(file);
      if (token !== generation) return; // 表单已被重置/切换，丢弃结果
      state.sha = '';
      state.path = '';
      state.mode = 'upload';
      fillForm(note);
      setPageTitle(true);
      showMessage('解析完成，可以调整字段后提交。', 'success');
    } catch (err) {
      if (token !== generation) return;
      showMessage((err as Error).message, 'error');
    }
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
    const select = event.target as HTMLSelectElement;
    const path = select.value;
    if (!path) return;
    if (hasUnsavedChanges() && !confirm('当前表单有未保存的修改，载入其它笔记会丢失这些内容。确定继续吗？')) {
      select.value = '';
      return;
    }
    const token = beginLoad();
    showMessage('正在读取文章...');
    try {
      const { path: realPath, note } = await readNote(path);
      if (token !== generation) return; // 期间已重置/切换，丢弃
      state.sha = note.sha || '';
      state.path = realPath;
      state.mode = 'edit';
      // 编辑旧笔记：创建日期保留原值，更新日期默认今天
      fillForm(note, { updatedToToday: true });
      setPageTitle(false);
      showMessage('文章已载入，编辑后会更新原文件。', 'success');
    } catch (err) {
      if (token !== generation) return;
      select.value = '';
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
    const token = generation;
    button.disabled = true;

    try {
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
          if (token !== generation) {
            showMessage('表单已切换，图片已上传但未插入正文。', 'info');
            break;
          }
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
    } finally {
      button.innerHTML = original;
      updateImageButton();
      input.value = '';
    }
  });

  // 清空
  $('#reset-button')?.addEventListener('click', () => {
    if (confirm('确定清空当前表单吗？未保存的内容将丢失。')) resetForm();
  });

  // 保存草稿（不发布：状态置为整理中 / 公开状态保持，但通常建议 draft）
  $('#save-draft-button')?.addEventListener('click', async () => {
    await submitNote(true);
  });

  // 提交（发布 / 保存修改）
  $('#note-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    await submitNote(false);
  });
}

/* ---------------- 提交 ---------------- */
function setSubmitting(on: boolean, asDraft: boolean) {
  submitting = on;
  const publish = $('#publish-button') as HTMLButtonElement | null;
  const draft = $('#save-draft-button') as HTMLButtonElement | null;
  const reset = $('#reset-button') as HTMLButtonElement | null;
  const label = $('#publish-button-text');
  if (publish) publish.disabled = on;
  if (draft) draft.disabled = on;
  if (reset) reset.disabled = on;
  if (label) label.textContent = on ? (asDraft ? '保存中...' : '提交中...') : publishLabelText;
}

async function submitNote(asDraft: boolean) {
  if (submitting) return; // 防重复提交
  const note = collectNote();
  if (asDraft) {
    // 草稿：状态强制为「整理中」，公开状态不动（用户可后续切换）
    note.status = '整理中';
  }
  setSubmitting(true, asDraft);
  showMessage(asDraft ? '正在保存草稿...' : '正在提交到 GitHub...');
  try {
    const data = await saveNote(note);
    // 只有真正写入成功才绑定/更新文件 sha 与路径，失败时保持原状（新建失败不会误覆盖旧文件）
    state.sha = data.content?.sha || state.sha;
    state.path = data.path || state.path;
    state.mode = 'edit';
    setPageTitle(false);
    updateTargetPath();
    markClean();
    const deployText = data.deploy?.configured
      ? data.deploy.ok
        ? '，已触发网站重新部署'
        : `，但触发部署失败${data.deploy.status ? ` (${data.deploy.status})` : ''}`
      : '，未配置部署 Hook，前台需等待手动部署';
    showMessage(`${asDraft ? '草稿已保存' : '提交成功'}：${data.path}${deployText}`, 'success');
  } catch (err) {
    showMessage((err as Error).message, 'error');
  } finally {
    setSubmitting(false, asDraft);
  }
}

/* ---------------- 外部入口：进入编辑/新建视图时调用 ---------------- */
export function mountEditor(): void {
  collectFields();
  bindEditorEvents();
  setNavGuard(editorNavGuard);
  resetForm();
  trackActionBarHeight();
  consumePendingUpload();
}

/**
 * 顶部操作区高度是变化的（有消息/警告时会多出一行），
 * 把它实时写入 CSS 变量，右侧元信息面板才能精确停靠在它下方而不被遮住。
 */
function trackActionBarHeight() {
  const head = $('.admin-page-head--sticky');
  if (!head) return;
  const apply = () => {
    const height = Math.round(head.getBoundingClientRect().height);
    if (height > 0) document.documentElement.style.setProperty('--editor-head-h', `${height}px`);
  };
  apply();
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(apply).observe(head);
}

/** 开始一次异步载入：作废之前所有在途请求，并返回本次的世代号 */
function beginLoad(): number {
  return ++generation;
}

/** 消费「批量导入」暂存的文件内容（仅在新建模式下生效） */
function consumePendingUpload() {
  try {
    const pending = sessionStorage.getItem('admin:pending-upload');
    if (!pending) return;
    const name = sessionStorage.getItem('admin:pending-upload-name') || 'imported.md';
    sessionStorage.removeItem('admin:pending-upload');
    sessionStorage.removeItem('admin:pending-upload-name');
    const nameEl = $('#file-source-name');
    if (nameEl) nameEl.textContent = name;
    fillForm(parseTextInline(pending, name));
    state.sha = '';
    state.path = '';
    state.mode = 'upload';
    setPageTitle(true);
    showMessage('已载入待导入文件内容，确认后即可发布。', 'info');
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
          val = val.slice(1, -1).split(',').map((s: string) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
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
    const target = query.path;
    const token = beginLoad();
    try {
      showMessage('正在读取文章...');
      const { path, note } = await readNote(target);
      // 期间已经重置/切换了表单或路由，丢弃这次结果
      if (token !== generation) return;
      if (parseHash().query.path !== target) return;
      state.sha = note.sha || '';
      state.path = path;
      state.mode = 'edit';
      // 编辑旧笔记：创建日期保留原值，更新日期默认今天
      fillForm(note, { updatedToToday: true });
      setPageTitle(false);
      showMessage('文章已载入，编辑后会更新原文件。', 'success');
    } catch (err) {
      if (token !== generation) return;
      showMessage((err as Error).message, 'error');
    }
  }
}
