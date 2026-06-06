const validTopics = new Set(['charging', 'camera', 'display_tp', 'audio', 'sensor']);
const topic = new URLSearchParams(window.location.search).get('topic');

function setActiveLink(link: Element) {
  link.classList.add('bg-cyan-400/10', 'text-cyan-100', 'ring-1', 'ring-cyan-400/20');
  link.classList.remove('text-slate-400');
}

function setInactiveSummary(summary: Element) {
  summary.classList.remove('bg-slate-900', 'text-white', 'text-slate-100');
  summary.classList.add('text-slate-500');
}

function setActiveSummary(summary: Element) {
  summary.classList.add('bg-slate-900', 'text-white');
  summary.classList.remove('text-slate-500', 'text-slate-400');
}

if (topic && validTopics.has(topic)) {
  document.querySelectorAll<HTMLDetailsElement>('[data-category-section]').forEach((details) => {
    details.open = false;
  });

  document.querySelectorAll('[data-category-summary]').forEach(setInactiveSummary);

  document.querySelectorAll<HTMLDetailsElement>('[data-topic-section]').forEach((details) => {
    details.open = details.dataset.topicSection === topic;
  });

  document.querySelectorAll('[data-topic-summary]').forEach((summary) => {
    if (summary instanceof HTMLElement && summary.dataset.topicSummary === topic) {
      setActiveSummary(summary);
    }
  });

  document.querySelectorAll<HTMLAnchorElement>('[data-topic-doc-link]').forEach((link) => {
    if (link.dataset.topicDocLink === topic && link.pathname === window.location.pathname) {
      setActiveLink(link);
    }
  });
}
