/**
 * 后台 API 封装
 * 与原 admin.astro 内联脚本调用相同的端点，行为保持一致。
 * 所有方法在失败时抛出 Error(message)，由调用方处理 UI 反馈。
 */

export interface AdminUser {
  login: string;
  avatarUrl?: string;
  url?: string;
}

export interface RepoConfig {
  owner: string;
  repo: string;
  branch: string;
}

export interface AuthState {
  user: AdminUser;
  repo: RepoConfig;
}

export interface NoteListItem {
  path: string;
  category: string;
  slug: string;
  sha: string;
  title: string;
  status?: string;
  visibility?: string;
  label?: string;
}

export interface NotePayload {
  title: string;
  description: string;
  category: string;
  slug: string;
  tags: string[];
  topics: string[];
  visibility: string;
  sensitive: boolean;
  status: string;
  date: string;
  updated: string;
  body: string;
  sha?: string;
  path?: string;
}

export interface ParsedNote extends NotePayload {
  warnings?: string[];
}

export interface SaveResult {
  ok: boolean;
  path: string;
  commit?: { sha?: string };
  content?: { sha?: string };
  deploy?: {
    configured: boolean;
    ok: boolean;
    status?: number;
    statusText?: string;
    error?: string;
  };
}

/** 通用 JSON 请求，失败抛错 */
export async function api<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, options);
  const data: any = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    throw new Error(data.error || `请求失败：${response.status}`);
  }
  return data as T;
}

/** 鉴权：获取当前登录用户 */
export async function fetchCurrentUser(): Promise<AuthState> {
  return api<AuthState>('/api/auth/me');
}

/** 退出登录 */
export async function logout(): Promise<void> {
  await api('/api/auth/logout', { method: 'POST' });
}

/** 读取 GitHub 笔记列表 */
export async function fetchNoteList(): Promise<NoteListItem[]> {
  const data = await api<{ files: NoteListItem[] }>('/api/notes/list');
  return data.files;
}

/** 读取单篇笔记（编辑模式） */
export async function readNote(path: string): Promise<{ path: string; note: ParsedNote }> {
  const data = await api<{ path: string; note: ParsedNote }>(
    `/api/notes/read?path=${encodeURIComponent(path)}`,
  );
  return { path: data.path, note: data.note };
}

/** 解析上传的 Markdown 文件 */
export async function parseUpload(file: File): Promise<ParsedNote> {
  const form = new FormData();
  form.set('file', file);
  const data = await api<{ note: ParsedNote }>('/api/notes/parse', { method: 'POST', body: form });
  return data.note;
}

/** 保存（新建 / 更新）笔记 */
export async function saveNote(note: NotePayload): Promise<SaveResult> {
  return api<SaveResult>('/api/notes/save', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(note),
  });
}

/** 上传图片，返回 { path, relativePath, markdown } */
export async function uploadImage(file: File, category: string, slug: string): Promise<{
  path: string;
  relativePath: string;
  markdown: string;
}> {
  const form = new FormData();
  form.set('file', file);
  form.set('category', category);
  form.set('slug', slug);
  return api('/api/notes/upload-image', { method: 'POST', body: form });
}

/* ---------------- 存储管理 ---------------- */

export interface StorageImage {
  path: string;
  sha: string;
  size: number;
  category: string;
  name: string;
  references: number;
  referencedBy: string[];
}

export interface StorageStats {
  total: number;
  totalSize: number;
  referenced: number;
  unreferenced: number;
  unreferencedSize: number;
  byCategory: Record<string, { count: number; size: number }>;
}

export interface StorageListResponse {
  ok: boolean;
  images: StorageImage[];
  stats: StorageStats;
}

/** 拉取所有图片及引用统计 */
export async function fetchStorageList(): Promise<StorageListResponse> {
  return api<StorageListResponse>('/api/storage/list');
}

/** 删除一张图片（需要 sha） */
export async function deleteStorageImage(path: string, sha: string): Promise<{ ok: boolean; commit?: any }> {
  return api('/api/storage/delete', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path, sha }),
  });
}

/* ---------------- 操作日志 ---------------- */

export type LogAction =
  | 'note.create'
  | 'note.update'
  | 'note.delete'
  | 'image.upload'
  | 'image.delete';

export interface LogEntry {
  id: string;
  ts: string;
  action: LogAction;
  actor: string;
  target: string;
  title?: string;
  details?: Record<string, unknown>;
  commit?: string;
}

export interface LogsListResponse {
  ok: boolean;
  entries: LogEntry[];
  total: number;
  filtered: number;
  stats: Record<string, number>;
  actors: Record<string, number>;
}

/** 拉取操作日志（支持 action / actor / q 过滤） */
export async function fetchLogs(params: {
  action?: string;
  actor?: string;
  q?: string;
  limit?: number;
} = {}): Promise<LogsListResponse> {
  const qs = new URLSearchParams();
  if (params.action) qs.set('action', params.action);
  if (params.actor) qs.set('actor', params.actor);
  if (params.q) qs.set('q', params.q);
  if (params.limit) qs.set('limit', String(params.limit));
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return api<LogsListResponse>(`/api/logs/list${suffix}`);
}

/* ---------------- 站点设置 ---------------- */

export interface SiteConfig {
  siteTitle: string;
  siteDescription: string;
  heroTitle: string;
  heroSubtitle: string;
  heroPrimaryLabel: string;
  heroPrimaryHref: string;
  heroSecondaryLabel: string;
  heroSecondaryHref: string;
  sidebarTagline: string;
  sidebarSubtagline: string;
}

export interface SiteConfigResponse {
  ok: boolean;
  config: SiteConfig;
  sha: string;
}

/** 读取站点配置 */
export async function fetchSiteConfig(): Promise<SiteConfigResponse> {
  return api<SiteConfigResponse>('/api/settings/get');
}

/** 更新站点配置 */
export async function updateSiteConfig(config: SiteConfig, sha?: string): Promise<{ ok: boolean; sha: string; commit?: string }> {
  return api('/api/settings/update', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ config, sha }),
  });
}
