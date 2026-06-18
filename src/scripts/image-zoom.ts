function initImageZoom() {
  const prose = document.querySelector('.doc-prose');
  if (!prose) return;

  const images = prose.querySelectorAll<HTMLImageElement>('img');
  if (!images.length) return;

  // Wrap images in <figure> and add <figcaption> from alt text
  images.forEach((img) => {
    const alt = img.getAttribute('alt')?.trim() || '';

    const figure = document.createElement('figure');
    img.parentNode?.insertBefore(figure, img);
    figure.appendChild(img);

    if (alt) {
      const caption = document.createElement('figcaption');
      caption.textContent = alt;
      figure.appendChild(caption);
    }
  });

  // Create reusable overlay
  const overlay = document.createElement('div');
  overlay.className = 'image-zoom-overlay';
  overlay.setAttribute('aria-hidden', 'true');

  const overlayImg = document.createElement('img');
  overlayImg.alt = '';

  const overlayCaption = document.createElement('div');
  overlayCaption.className = 'image-zoom-caption';

  overlay.appendChild(overlayImg);
  overlay.appendChild(overlayCaption);
  document.body.appendChild(overlay);

  let isOpen = false;

  function openZoom(src: string, alt: string) {
    overlayImg.src = src;
    overlayImg.alt = alt;
    overlayCaption.textContent = alt;
    overlayCaption.style.display = alt ? '' : 'none';
    overlay.style.display = 'flex';
    overlay.setAttribute('aria-hidden', 'false');
    isOpen = true;

    // Force reflow then animate in
    void overlay.offsetHeight;
    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeZoom() {
    if (!isOpen) return;
    isOpen = false;
    overlay.classList.remove('active');
    document.body.style.overflow = '';

    const onEnd = () => {
      overlay.style.display = 'none';
      overlayImg.src = '';
      overlay.removeEventListener('transitionend', onEnd);
    };
    overlay.addEventListener('transitionend', onEnd);
  }

  // Click on image to open
  images.forEach((img) => {
    img.addEventListener('click', (e) => {
      e.preventDefault();
      openZoom(img.src, img.getAttribute('alt')?.trim() || '');
    });
  });

  // Click overlay or press ESC to close
  overlay.addEventListener('click', closeZoom);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen) closeZoom();
  });
}

initImageZoom();
