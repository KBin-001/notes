const tocLinks = Array.from(document.querySelectorAll<HTMLAnchorElement>('[data-toc-link]'));
const tocItems = tocLinks
  .map((link) => ({
    link,
    heading: document.getElementById(decodeURIComponent(link.hash.slice(1))),
  }))
  .filter((item): item is { link: HTMLAnchorElement; heading: HTMLElement } => Boolean(item.heading));

function setActiveTocLink(activeLink?: HTMLAnchorElement) {
  tocLinks.forEach((link) => {
    const active = link === activeLink;
    link.classList.toggle('bg-cyan-400/10', active);
    link.classList.toggle('text-cyan-100', active);
    link.classList.toggle('text-slate-500', !active);
    link.setAttribute('aria-current', active ? 'true' : 'false');
  });

  activeLink?.scrollIntoView({ block: 'nearest' });
}

function updateActiveHeading() {
  if (tocItems.length === 0) return;

  const offset = 104;
  let active = tocItems[0];
  for (const item of tocItems) {
    if (item.heading.getBoundingClientRect().top <= offset) {
      active = item;
    } else {
      break;
    }
  }

  setActiveTocLink(active.link);
}

updateActiveHeading();
window.addEventListener('scroll', updateActiveHeading, { passive: true });
window.addEventListener('resize', updateActiveHeading);
