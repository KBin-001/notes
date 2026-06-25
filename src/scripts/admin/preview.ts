/**
 * 简易 Markdown → HTML 渲染器
 * 仅供编辑器右侧"预览/分屏"使用，提供排版参考。
 * 最终保存的始终是 Markdown 原文，不经过此渲染。
 *
 * 支持：标题、段落、列表、代码块、行内代码、引用、链接、图片、
 *       水平线、粗体/斜体/删除线、转义保护。
 * 不追求 100% GFM 兼容，以"够用、零依赖、安全"为目标。
 */

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#039;';
    }
  });
}

/** 行内格式：粗体/斜体/删除线/行内代码/链接/图片 */
function renderInline(text: string): string {
  let out = escapeHtml(text);

  // 图片 ![alt](url)
  out = out.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g, (_, alt, url, title) => {
    const t = title ? ` title="${title}"` : '';
    return `<img src="${url}" alt="${alt}"${t} />`;
  });

  // 链接 [text](url)
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g, (_, label, url, title) => {
    const t = title ? ` title="${title}"` : '';
    return `<a href="${url}"${t} target="_blank" rel="noopener noreferrer">${label}</a>`;
  });

  // 行内代码 `code`
  out = out.replace(/`([^`]+)`/g, (_, code) => `<code>${code}</code>`);

  // 粗体 **text**
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // 斜体 *text* / _text_
  out = out.replace(/(^|[^*])\*([^*\s][^*]*?)\*(?!\*)/g, '$1<em>$2</em>');
  out = out.replace(/(^|\W)_([^_]+)_(?!\w)/g, '$1<em>$2</em>');
  // 删除线 ~~text~~
  out = out.replace(/~~([^~]+)~~/g, '<del>$1</del>');

  return out;
}

export function renderMarkdown(source: string): string {
  if (!source?.trim()) {
    return '<p style="color:var(--kb-subtle)">还没有内容，开始写点什么吧。</p>';
  }

  // 按行处理，保留代码块整体
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const html: string[] = [];

  let i = 0;
  let inCode = false;
  let codeLang = '';
  let codeBuffer: string[] = [];

  const flushParagraph = (buf: string[]) => {
    if (!buf.length) return;
    const text = buf.join(' ').trim();
    if (text) html.push(`<p>${renderInline(text)}</p>`);
  };

  const paragraphBuf: string[] = [];

  while (i < lines.length) {
    const line = lines[i];

    // 代码块围栏 ```
    const fence = line.match(/^(\s*)(```|~~~)(.*)$/);
    if (fence) {
      // 先把累积的段落冲掉
      flushParagraph(paragraphBuf);
      paragraphBuf.length = 0;

      if (!inCode) {
        inCode = true;
        codeLang = fence[3].trim();
        codeBuffer = [];
      } else {
        inCode = false;
        const code = escapeHtml(codeBuffer.join('\n'));
        const langAttr = codeLang ? ` class="language-${codeLang}"` : '';
        html.push(`<pre><code${langAttr}>${code}</code></pre>`);
      }
      i++;
      continue;
    }

    if (inCode) {
      codeBuffer.push(line);
      i++;
      continue;
    }

    // 空行 → 段落分隔
    if (line.trim() === '') {
      flushParagraph(paragraphBuf);
      paragraphBuf.length = 0;
      i++;
      continue;
    }

    // 标题
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      flushParagraph(paragraphBuf);
      paragraphBuf.length = 0;
      const level = heading[1].length;
      html.push(`<h${level}>${renderInline(heading[2].trim())}</h${level}>`);
      i++;
      continue;
    }

    // 水平线
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      flushParagraph(paragraphBuf);
      paragraphBuf.length = 0;
      html.push('<hr />');
      i++;
      continue;
    }

    // 引用 >
    if (/^\s*>\s?/.test(line)) {
      flushParagraph(paragraphBuf);
      paragraphBuf.length = 0;
      const quoteBuf: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        quoteBuf.push(lines[i].replace(/^\s*>\s?/, ''));
        i++;
      }
      html.push(`<blockquote>${renderInline(quoteBuf.join(' '))}</blockquote>`);
      continue;
    }

    // 无序列表
    if (/^\s*[-*+]\s+/.test(line)) {
      flushParagraph(paragraphBuf);
      paragraphBuf.length = 0;
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        items.push(`<li>${renderInline(lines[i].replace(/^\s*[-*+]\s+/, ''))}</li>`);
        i++;
      }
      html.push(`<ul>${items.join('')}</ul>`);
      continue;
    }

    // 有序列表
    if (/^\s*\d+\.\s+/.test(line)) {
      flushParagraph(paragraphBuf);
      paragraphBuf.length = 0;
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(`<li>${renderInline(lines[i].replace(/^\s*\d+\.\s+/, ''))}</li>`);
        i++;
      }
      html.push(`<ol>${items.join('')}</ol>`);
      continue;
    }

    // 普通段落行
    paragraphBuf.push(line.trim());
    i++;
  }

  // 末尾冲刷
  if (inCode) {
    const code = escapeHtml(codeBuffer.join('\n'));
    html.push(`<pre><code>${code}</code></pre>`);
  }
  flushParagraph(paragraphBuf);

  return html.join('\n');
}
