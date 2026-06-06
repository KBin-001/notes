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
    button.textContent = '复制';
    button.addEventListener('click', async () => {
      const code = pre.querySelector('code')?.textContent ?? pre.textContent ?? '';
      try {
        await navigator.clipboard.writeText(code);
        button.textContent = '已复制';
      } catch {
        button.textContent = '失败';
      }
      window.setTimeout(() => {
        button.textContent = '复制';
      }, 1600);
    });
    wrapper.appendChild(button);
  });
}

enhanceCodeBlocks();
