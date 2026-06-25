// Diagnostic: capture Hero + inspect computed styles on primary button.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

(async () => {
  const outDir = 'artifacts/diag';
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();

  for (const theme of ['dark', 'claude']) {
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      deviceScaleFactor: 2,
      colorScheme: theme === 'dark' ? 'dark' : 'light',
    });
    await ctx.addInitScript((t) => {
      try {
        localStorage.setItem('driver-kb-theme', t);
        document.documentElement.dataset.theme = t;
        document.documentElement.classList.toggle('dark', t === 'dark');
      } catch (e) {}
    }, theme);
    const page = await ctx.newPage();
    await page.goto('http://localhost:4321/', { waitUntil: 'domcontentloaded' });

    const info = await page.evaluate(() => {
      const btn = document.querySelector('.kb-button-primary');
      if (!btn) return { error: 'no .kb-button-primary' };
      const cs = getComputedStyle(btn);
      return {
        text: cs.color,
        bg: cs.backgroundColor,
        bgImage: cs.backgroundImage,
        tag: btn.tagName,
        className: btn.className,
        rect: btn.getBoundingClientRect(),
        textContent: btn.textContent.trim(),
      };
    });

    await page.screenshot({ path: path.join(outDir, `home-${theme}.png`), fullPage: false });
    const hero = await page.$('.kb-hero');
    if (hero) await hero.screenshot({ path: path.join(outDir, `hero-${theme}.png`) });

    console.log(`\n=== theme=${theme} ===`);
    console.log(JSON.stringify(info, null, 2));
    await ctx.close();
  }
  await browser.close();
})();
