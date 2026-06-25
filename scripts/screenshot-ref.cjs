// Reference capture for fumadocs.dev (external live site).
// Uses domcontentloaded + explicit waits, fumadocs-specific paths & selectors.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const baseUrl = 'https://fumadocs.dev';
const outDir = process.argv[2] || 'artifacts/theme-reference';
const label = process.argv[3] || 'ref';

const viewports = [
  { name: '1440x1000', width: 1440, height: 1000 },
  { name: '1280x800', width: 1280, height: 800 },
  { name: '768x1024', width: 768, height: 1024 },
  { name: '390x844', width: 390, height: 844 },
];

// fumadocs.dev pages: home, a docs page with code, a docs page with table.
const pages = [
  { path: '/', name: 'home', sel: 'main' },
  { path: '/docs/ui', name: 'docs-index', sel: 'article, main' },
  { path: '/docs/ui/layouts/docs', name: 'docs-code', sel: 'article, main' },
  { path: '/docs/ui/themes', name: 'docs-theme', sel: 'article, main' },
];

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();

  for (const p of pages) {
    const url = baseUrl + p.path;
    for (const vp of viewports) {
      const ctx = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 2,
        colorScheme: 'dark',
      });
      // Force dark theme via localStorage (fumadocs uses theme key).
      await ctx.addInitScript(() => {
        try {
          localStorage.setItem('theme', 'dark');
          localStorage.setItem('fuma-theme', 'dark');
        } catch (e) {}
        try {
          document.documentElement.classList.add('dark');
          document.documentElement.dataset.theme = 'dark';
        } catch (e) {}
      });
      const page = await ctx.newPage();
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      } catch (e) {
        console.warn(`  ! goto failed for ${p.path} @ ${vp.name}: ${e.message.split('\n')[0]}`);
      }
      try {
        await page.waitForSelector(p.sel, { timeout: 15000 });
      } catch (e) {}
      // Ensure dark class sticks after client theme init.
      try {
        await page.evaluate(() => {
          document.documentElement.classList.add('dark');
        });
      } catch (e) {}
      try { await page.waitForTimeout(1500); } catch (e) {}
      try { await page.evaluate(() => document.fonts && document.fonts.ready); } catch (e) {}

      const file = path.join(outDir, `${label}-${p.name}-${vp.name}.png`);
      try {
        await page.screenshot({ path: file, fullPage: false });
        console.log(`✓ ${p.name} @ ${vp.name} → ${file}`);
      } catch (e) {
        console.warn(`  ! screenshot failed ${p.name} @ ${vp.name}: ${e.message.split('\n')[0]}`);
      }

      // Search dialog at desktop.
      if (p.name === 'home' && vp.name === '1440x1000') {
        try {
          await page.keyboard.press('Control+KeyK');
          await page.waitForTimeout(800);
          const sf = path.join(outDir, `${label}-search-${vp.name}.png`);
          await page.screenshot({ path: sf, fullPage: false });
          console.log(`✓ search @ ${vp.name} → ${sf}`);
          await page.keyboard.press('Escape');
        } catch (e) {
          console.warn(`  ! search capture failed: ${e.message.split('\n')[0]}`);
        }
      }
      await ctx.close();
    }
  }
  await browser.close();
  console.log(`\nDone. Reference screenshots in: ${outDir}`);
})().catch((e) => {
  console.error('Reference screenshot script failed:', e);
  process.exit(1);
});
