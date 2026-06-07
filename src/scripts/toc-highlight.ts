const tocLinks = Array.from(document.querySelectorAll<HTMLAnchorElement>('[data-toc-link]'));
const tocItems = tocLinks
  .map((link) => ({
    link,
    heading: document.getElementById(decodeURIComponent(link.hash.slice(1))),
  }))
  .filter((item): item is { link: HTMLAnchorElement; heading: HTMLElement } => Boolean(item.heading));

let currentLink: HTMLAnchorElement | undefined;

function setActiveTocLink(activeLink?: HTMLAnchorElement) {
  if (currentLink === activeLink) return;
  currentLink = activeLink;

  tocLinks.forEach((link) => {
    const active = link === activeLink;
    link.classList.toggle('bg-cyan-400/8', active);
    link.classList.toggle('text-cyan-100', active);
    link.classList.toggle('text-slate-500', !active);
    link.setAttribute('aria-current', active ? 'true' : 'false');
  });

  activeLink?.scrollIntoView({ block: 'nearest' });
}

function nearestHeading() {
  const offset = 112;
  let active = tocItems[0];
  for (const item of tocItems) {
    if (item.heading.getBoundingClientRect().top <= offset) {
      active = item;
    } else {
      break;
    }
  }
  return active;
}

if (tocItems.length > 0) {
  const observer = new IntersectionObserver(
    () => setActiveTocLink(nearestHeading()?.link),
    {
      rootMargin: '-18% 0px -68% 0px',
      threshold: [0, 1],
    },
  );

  tocItems.forEach((item) => observer.observe(item.heading));
  setActiveTocLink(nearestHeading()?.link);
  window.addEventListener('scroll', () => setActiveTocLink(nearestHeading()?.link), { passive: true });
  window.addEventListener('resize', () => setActiveTocLink(nearestHeading()?.link));
}
