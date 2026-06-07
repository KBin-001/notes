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

window.addEventListener('DOMContentLoaded', () => {
  scrollToHashTarget('auto');
  window.setTimeout(() => scrollToHashTarget('auto'), 120);
  window.setTimeout(() => scrollToHashTarget('auto'), 360);
});

window.addEventListener('hashchange', () => scrollToHashTarget('smooth'));
