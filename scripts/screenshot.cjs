// Screenshot capture for dark theme verification.
// Usage: node scripts/screenshot.cjs <base-url> <out-dir> <label>
//   e.g. node scripts/screenshot.cjs http://localhost:4321 artifacts/theme-after after
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const baseUrl = process.argv[2] || 'http://localhost:4321';
const outDir = process.argv[3] || 'artifacts/theme-after';
const label = process.argv[4] || 'shot';
const forceDark = (process.argv[5] || 'dark') === 'dark';

const viewports = [
  { name: '1440x1000', width: 1440, height: 1000 },
  { name: '1280x800', width: 1280, height: 800 },
  { name: '768x1024', width: 768, height: 1024 },
  { name: '390x844', width: 390, height: 844 },
];

// Pages relative to baseUrl. Each can declare what to wait for.
const pages = [
  { path: '/', name: 'home' },
  { path: '/mtk/disable-platform-audio-effect/', name: 'article-image', wait: 'img' },
  { path: '/mtk/brightness-curve-adjustment/', name: 'article-code' },
  { path: '/camera/camera-knowledge/', name: 'article-table' },
  { path: '/audio/', name: 'topic' },
];

const SEARCHABLE = ['home', 'article-code'];

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();

  for (const p of pages) {
    const url = baseUrl.replace(/\/$/, '') + p.path;
    const canSearch = SEARCHABLE.includes(p.name);

    for (const vp of viewports) {
      const ctx = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 2,
      });
      // Force dark theme before page scripts run to avoid FOUC.
      if (forceDark) {
        await ctx.addInitScript(() => {
          try { localStorage.setItem('driver-kb-theme', 'dark'); } catch (e) {}
        });
      }
      const page = await ctx.newPage();
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      } catch (e) {
        console.warn(`  ! goto failed for ${p.path} @ ${vp.name}: ${e.message}`);
      }
      // Wait for the layout to be present, then settle.
      try {
        await page.waitForSelector('.site-header, article, main', { timeout: 15000 });
      } catch (e) {}
      if (p.wait === 'img') {
        try { await page.waitForSelector('main img', { timeout: 10000 }); } catch (e) {}
      }
      // Stabilize fonts / images / lazy paints.
      try { await page.waitForTimeout(1200); } catch (e) {}
      try { await page.evaluate(() => document.fonts && document.fonts.ready); } catch (e) {}

      const file = path.join(outDir, `${label}-${p.name}-${vp.name}.png`);
      await page.screenshot({ path: file, fullPage: false });
      console.log(`✓ ${p.name} @ ${vp.name} → ${file}`);

      // Search dialog capture on the home + article-code at desktop width only.
      if (canSearch && vp.name === '1440x1000') {
        try {
          await page.keyboard.press('Control+KeyK');
          await page.waitForTimeout(500);
          const searchFile = path.join(outDir, `${label}-search-${vp.name}.png`);
          await page.screenshot({ path: searchFile, fullPage: false });
          console.log(`✓ search @ ${vp.name} → ${searchFile}`);
          await page.keyboard.press('Escape');
        } catch (e) {
          console.warn(`  ! search capture failed: ${e.message}`);
        }
      }

      // Mobile menu capture on the mobile viewport only.
      if (p.name === 'home' && vp.name === '390x844') {
        try {
          const btn = page.locator('#mobile-nav-open');
          if (await btn.count()) {
            await btn.click();
            await page.waitForTimeout(500);
            const mobileFile = path.join(outDir, `${label}-mobilenav-${vp.name}.png`);
            await page.screenshot({ path: mobileFile, fullPage: false });
            console.log(`✓ mobilenav @ ${vp.name} → ${mobileFile}`);
          }
        } catch (e) {
          console.warn(`  ! mobilenav capture failed: ${e.message}`);
        }
      }

      await ctx.close();
    }
  }

  await browser.close();
  console.log(`\nDone. Screenshots in: ${outDir}`);
})().catch((e) => {
  console.error('Screenshot script failed:', e);
  process.exit(1);
});
