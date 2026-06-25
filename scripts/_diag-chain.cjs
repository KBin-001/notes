// Trace matched CSS color rules on the primary button via the browser only.
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    colorScheme: 'dark',
  });
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('driver-kb-theme', 'dark');
      document.documentElement.dataset.theme = 'dark';
      document.documentElement.classList.add('dark');
    } catch (e) {}
  });
  const page = await ctx.newPage();
  await page.goto('http://localhost:4321/', { waitUntil: 'domcontentloaded' });

  const rules = await page.evaluate(() => {
    const el = document.querySelector('.kb-button-primary');
    const out = [];
    for (const sheet of document.styleSheets) {
      let list;
      try { list = sheet.cssRules; } catch (e) { continue; }
      const walk = (rules) => {
        for (const r of rules) {
          if (r.cssRules) walk(r.cssRules);
          if (!r.selectorText || !r.style) continue;
          if (r.style.color && r.style.color !== '') {
            try { if (el.matches(r.selectorText)) out.push({ selector: r.selectorText, color: r.style.color }); } catch (e) {}
          }
        }
      };
      walk(list);
    }
    return {
      bodyColor: getComputedStyle(document.body).color,
      elColor: getComputedStyle(el).color,
      rules: out,
    };
  });
  console.log(JSON.stringify(rules, null, 2));
  await browser.close();
})();
