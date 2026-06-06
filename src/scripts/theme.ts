type ThemeName = 'dark' | 'claude';

const storageKey = 'driver-kb-theme';

function getStoredTheme(): ThemeName {
  try {
    return localStorage.getItem(storageKey) === 'claude' ? 'claude' : 'dark';
  } catch {
    return 'dark';
  }
}

function applyTheme(theme: ThemeName) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.querySelectorAll<HTMLElement>('[data-theme-icon]').forEach((icon) => {
    icon.classList.toggle('hidden', icon.dataset.themeIcon !== theme);
  });

  const toggle = document.getElementById('theme-toggle');
  if (toggle) {
    toggle.setAttribute('aria-label', theme === 'claude' ? '切换到暗色主题' : '切换到 Claude 浅色主题');
    toggle.setAttribute('title', theme === 'claude' ? '切换到暗色主题' : '切换到 Claude 浅色主题');
  }
}

applyTheme(getStoredTheme());

document.getElementById('theme-toggle')?.addEventListener('click', () => {
  const nextTheme: ThemeName = document.documentElement.dataset.theme === 'claude' ? 'dark' : 'claude';
  try {
    localStorage.setItem(storageKey, nextTheme);
  } catch {
    // Theme still changes for the current page even when storage is unavailable.
  }
  applyTheme(nextTheme);
});
