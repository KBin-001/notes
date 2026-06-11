function enhanceCodeBlocks() {
  document.querySelectorAll('pre').forEach((pre) => {
    if (pre.parentElement?.classList.contains('code-shell')) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'code-shell';
    pre.parentNode?.insertBefore(wrapper, pre);
    wrapper.appendChild(pre);

    const button = document.createElement('button');
    button.className = 'code-copy';
    button.type = 'button';
    button.setAttribute('aria-label', '复制代码');
    button.textContent = '复制';
    button.addEventListener('click', async () => {
      const code = pre.querySelector('code')?.textContent ?? pre.textContent ?? '';
      try {
        await navigator.clipboard.writeText(code);
        button.dataset.copied = 'true';
        button.textContent = '已复制';
      } catch {
        button.dataset.copied = 'false';
        button.textContent = '失败';
      }
      window.setTimeout(() => {
        delete button.dataset.copied;
        button.textContent = '复制';
      }, 1600);
    });
    wrapper.appendChild(button);
  });
}

enhanceCodeBlocks();
