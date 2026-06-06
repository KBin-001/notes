const tocLinks = Array.from(document.querySelectorAll<HTMLAnchorElement>('[data-toc-link]'));
const headings = tocLinks
  .map((link) => document.getElementById(link.hash.slice(1)))
  .filter((heading): heading is HTMLElement => Boolean(heading));

if (headings.length > 0) {
  const observer = new IntersectionObserver(
    (entries) => {
      const visible = entries.find((entry) => entry.isIntersecting);
      if (!visible) return;

      tocLinks.forEach((link) => {
        const active = link.hash === `#${visible.target.id}`;
        link.classList.toggle('bg-cyan-400/10', active);
        link.classList.toggle('text-cyan-100', active);
        link.classList.toggle('text-slate-500', !active);
      });
    },
    { rootMargin: '-90px 0px -62% 0px', threshold: 0 }
  );

  headings.forEach((heading) => observer.observe(heading));
}
