/**
 * 后台共享工具
 * 与原 admin.astro 内联脚本保持一致的行为，便于复用现有 API。
 */

export const $ = <T extends Element = HTMLElement>(selector: string, root: ParentNode = document): T | null =>
  root.querySelector<T>(selector);

export const $$ = <T extends Element = HTMLElement>(selector: string, root: ParentNode = document): T[] =>
  Array.from(root.querySelectorAll<T>(selector));

/**
 * 今天的日期（YYYY-MM-DD），使用**本地时区**。
 * 不能用 toISOString()：它按 UTC 计算，东八区凌晨 0:00–8:00 会得到昨天，导致日期提前一天。
 */
export const today = () => toDateString(new Date());

/** 格式化日期为 YYYY-MM-DD（按本地时区，兼容 Date 或字符串） */
export function toDateString(value: Date | string | number): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#039;';
    }
  });
}

/** 中文短日期，例：2024/03/01 */
export function formatDateZh(date: Date | string): string {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '—';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}/${m}/${day}`;
}

/** 相对时间（刚刚 / x 分钟前 / x 小时前 / x 天前 / 日期） */
export function relativeTime(date: Date | string): string {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '—';
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min} 分钟前`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  return formatDateZh(d);
}

/** 防抖 */
export function debounce<T extends (...args: any[]) => void>(fn: T, wait = 200): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

/** 解析 hash 路由：#/edit?path=xxx → { route: 'edit', query: { path: 'xxx' } } */
export interface ParsedHash {
  route: string;
  query: Record<string, string>;
}

export function parseHash(hash: string = location.hash): ParsedHash {
  const raw = hash.replace(/^#\/?/, '');
  if (!raw) return { route: 'dashboard', query: {} };
  const [route, queryString] = raw.split('?');
  const query: Record<string, string> = {};
  if (queryString) {
    for (const pair of queryString.split('&')) {
      const [key, value] = pair.split('=');
      if (key) query[decodeURIComponent(key)] = decodeURIComponent(value ?? '');
    }
  }
  return { route: route || 'dashboard', query };
}

/** 生成 hash */
export function buildHash(route: string, query: Record<string, string> = {}): string {
  const qs = Object.entries(query)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  return `#/${route}${qs ? `?${qs}` : ''}`;
}

/**
 * 导航守卫：注册后，navigate() 在真正跳转前会先询问它。
 * 返回 false 表示取消本次跳转（例如表单有未保存修改、用户点了「取消」）。
 */
export type NavGuard = () => boolean;

let navGuard: NavGuard | null = null;

export function setNavGuard(guard: NavGuard | null): void {
  navGuard = guard;
}

/** 跳转 hash 路由（经过导航守卫） */
export function navigate(route: string, query: Record<string, string> = {}): void {
  const next = buildHash(route, query);
  if (navGuard && navGuard() === false) return;
  if (location.hash === next) {
    // hash 没变化时浏览器不会触发 hashchange，但「点击当前所在的菜单」仍需重新初始化视图
    // （例：停在 #/new 时用下拉载入了某篇旧笔记，再点「新建笔记」必须回到干净表单）
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    return;
  }
  location.hash = next;
}

/** 复制文本到剪贴板，兼容降级 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fallback below */
  }
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

/** 已知菜单路由集合（用于校验） */
export const ROUTES = [
  'dashboard',
  'notes',
  'new',
  'edit',
  'categories',
  'tags',
  'topics',
  'topic',
  'storage',
  'settings',
  'logs',
] as const;

export type RouteName = (typeof ROUTES)[number];

/** 状态 → 颜色 class（与 StatusBadge 一致） */
export const STATUS_BADGE_CLASS: Record<string, string> = {
  整理中: 'kb-status-active',
  已验证: 'kb-status-verified',
  待验证: 'kb-status-pending',
  未完成: 'kb-status-incomplete',
  废弃: 'kb-status-deprecated',
};

export function statusBadgeClass(status: string): string {
  return STATUS_BADGE_CLASS[status] ?? 'kb-status-pending';
}

/** 公开状态徽章 */
export const VIS_BADGE_CLASS: Record<string, string> = {
  public: 'public',
  private: 'private',
  draft: 'draft',
};

export function visBadgeClass(visibility: string): string {
  return VIS_BADGE_CLASS[visibility] ?? 'draft';
}

export function visLabel(visibility: string): string {
  return { public: '公开', private: '私密', draft: '草稿' }[visibility] ?? visibility;
}
