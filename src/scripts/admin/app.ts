/**
 * 后台应用入口：鉴权 + hash 路由 + 视图切换 + Sidebar 联动。
 */
import { fetchCurrentUser, logout } from './api';
import { $, $$, parseHash, ROUTES } from './shared';
import { mountNotesManage, bindNotesManageEvents } from './notes-manage';
import { mountEditor, loadNoteByHash } from './note-editor';

/** 路由 → 视图 data-view 映射（new/edit 共用 editor 视图） */
const ROUTE_TO_VIEW: Record<string, string> = {
  dashboard: 'dashboard',
  notes: 'notes',
  new: 'editor',
  edit: 'editor',
  categories: 'categories',
  tags: 'tags',
  topics: 'topics',
  storage: 'storage',
  settings: 'settings',
  logs: 'logs',
};

let authed = false;
let editorMounted = false;
let notesEventsBound = false;

/* ---------------- 鉴权 ---------------- */
async function checkAuth(): Promise<boolean> {
  const gateStatus = $('#admin-gate-status');
  try {
    const auth = await fetchCurrentUser();
    const { user, repo } = auth;
    authed = true;

    // 用户信息
    const userEl = $('#admin-user');
    const nameEl = $('#admin-user-name');
    const avatarEl = $('#admin-user-avatar');
    if (nameEl) nameEl.textContent = user.login;
    if (avatarEl) avatarEl.textContent = (user.login || 'K').slice(0, 1).toUpperCase();
    if (userEl) userEl.hidden = false;
    const branchEl = $('#admin-repo-branch');
    if (branchEl) {
      branchEl.textContent = `${repo.owner}/${repo.repo}@${repo.branch}`;
      branchEl.removeAttribute('hidden');
    }

    // 隐藏登录按钮，显示退出
    $('#admin-login-link')?.setAttribute('hidden', '');
    $('#admin-logout-btn')?.removeAttribute('hidden');

    // 显示主布局
    $('[data-admin-layout]')?.classList.remove('admin-hidden');
    $('#admin-gate')?.classList.add('admin-hidden');

    return true;
  } catch {
    const host = window.location.hostname;
    const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '::1';
    if (isLocal) {
      authed = true;
      const userEl = $('#admin-user');
      const nameEl = $('#admin-user-name');
      const avatarEl = $('#admin-user-avatar');
      if (nameEl) nameEl.textContent = 'local-dev';
      if (avatarEl) avatarEl.textContent = 'L';
      if (userEl) userEl.hidden = false;
      const branchEl = $('#admin-repo-branch');
      if (branchEl) {
        branchEl.textContent = 'local preview';
        branchEl.removeAttribute('hidden');
      }
      $('#admin-login-link')?.setAttribute('hidden', '');
      $('#admin-logout-btn')?.setAttribute('hidden', '');
      $('[data-admin-layout]')?.classList.remove('admin-hidden');
      $('#admin-gate')?.classList.add('admin-hidden');
      return true;
    }

    authed = false;
    if (gateStatus) gateStatus.textContent = '检测到未登录，请使用 GitHub 登录。';
    $('[data-admin-layout]')?.classList.add('admin-hidden');
    $('#admin-gate')?.classList.remove('admin-hidden');
    $('#admin-login-link')?.removeAttribute('hidden');
    $('#admin-user')?.setAttribute('hidden', '');
    $('#admin-repo-branch')?.setAttribute('hidden', '');
    $('#admin-logout-btn')?.setAttribute('hidden', '');
    return false;
  }
}

/* ---------------- 视图切换 ---------------- */
function showView(view: string) {
  $$('.admin-view').forEach((el) => {
    el.classList.toggle('admin-hidden', el.getAttribute('data-view') !== view);
  });
}

function highlightNav(route: string) {
  $$('.admin-nav-item[data-nav-route]').forEach((item) => {
    item.classList.toggle('is-active', item.getAttribute('data-nav-route') === route);
  });
}

async function handleRoute() {
  const { route: rawRoute } = parseHash();
  // 规范化路由
  const route = ROUTES.includes(rawRoute as any) ? rawRoute : 'dashboard';
  const view = ROUTE_TO_VIEW[route] || 'dashboard';

  showView(view);
  highlightNav(route);

  // 视图懒加载钩子
  if (route === 'notes') {
    if (!notesEventsBound) {
      bindNotesManageEvents();
      notesEventsBound = true;
    }
    await mountNotesManage();
  } else if (route === 'new' || route === 'edit') {
    if (!editorMounted) {
      mountEditor();
      editorMounted = true;
    } else {
      // 切回新建视图时清空（除非带 path 进入 edit）
      const { query } = parseHash();
      if (route === 'new' && !query.path) {
        // 不强制清空，保留用户输入；只在首次进入 new 时清空
      }
    }
    if (route === 'edit') {
      await loadNoteByHash();
    }
  }

  // 移动端关闭抽屉
  closeSidebar();
}

/* ---------------- 移动端 Sidebar ---------------- */
function openSidebar() {
  $('#admin-sidebar')?.classList.add('is-open');
  $('#admin-sidebar-backdrop')?.classList.add('is-open');
}
function closeSidebar() {
  $('#admin-sidebar')?.classList.remove('is-open');
  $('#admin-sidebar-backdrop')?.classList.remove('is-open');
}

/* ---------------- 启动 ---------------- */
async function bootstrap() {
  const ok = await checkAuth();
  if (!ok) return;

  // 绑定导航点击
  $$('.admin-nav-item[data-nav-route]').forEach((item) => {
    item.addEventListener('click', () => {
      const route = item.getAttribute('data-nav-route') || 'dashboard';
      location.hash = `#/${route}`;
    });
  });

  // 移动端菜单
  $('#admin-menu-toggle')?.addEventListener('click', openSidebar);
  $('#admin-sidebar-backdrop')?.addEventListener('click', closeSidebar);

  // 退出
  $('#admin-logout-btn')?.addEventListener('click', async () => {
    try {
      await logout();
    } catch {
      /* ignore */
    }
    window.location.reload();
  });

  // 路由
  window.addEventListener('hashchange', handleRoute);

  // 默认路由
  if (!location.hash) {
    location.hash = '#/dashboard';
  } else {
    await handleRoute();
  }
}

bootstrap();
