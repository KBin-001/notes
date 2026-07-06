const validTopics = new Set(['charging', 'camera', 'display_tp', 'audio', 'sensor']);
const topic = new URLSearchParams(window.location.search).get('topic');

function setActiveLink(link: Element) {
  link.classList.add('is-active', 'bg-kb-accent-soft', 'text-kb-heading');
  link.classList.remove('text-kb-muted');
}

function setInactiveSummary(summary: Element) {
  summary.classList.remove('is-active', 'bg-kb-surface-active', 'text-kb-heading');
  summary.classList.add('text-kb-subtle');
}

function setActiveSummary(summary: Element) {
  summary.classList.add('is-active', 'bg-kb-surface-active', 'text-kb-heading');
  summary.classList.remove('text-kb-subtle', 'text-kb-muted');
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
