function getHashTarget() {
  if (!window.location.hash) return undefined;
  const id = decodeURIComponent(window.location.hash.slice(1));
  return document.getElementById(id);
}

function scrollToHashTarget(behavior: ScrollBehavior = 'auto') {
  const target = getHashTarget();
  if (!target) return;
  window.requestAnimationFrame(() => {
    target.scrollIntoView({ behavior, block: 'start' });
  });
}

/** 使用 ResizeObserver 监听目标元素出现后再滚动，替代脆弱的超时重试 */
function scrollToHashWhenReady(behavior: ScrollBehavior = 'auto') {
  const target = getHashTarget();
  if (!target) return;

  // 元素已可见，直接滚动
  if (target.offsetHeight > 0) {
    scrollToHashTarget(behavior);
    return;
  }

  // 监听元素尺寸变化（从 0 变为非 0 表示已渲染）
  const observer = new ResizeObserver((entries) => {
    for (const entry of entries) {
      if (entry.target.offsetHeight > 0) {
        observer.disconnect();
        target.scrollIntoView({ behavior, block: 'start' });
        break;
      }
    }
  });
  observer.observe(target);

  // 兜底：1.5 秒后强制清理 observer
  window.setTimeout(() => observer.disconnect(), 1500);
}

window.addEventListener('DOMContentLoaded', () => {
  scrollToHashWhenReady('auto');
});

window.addEventListener('hashchange', () => scrollToHashTarget('smooth'));
