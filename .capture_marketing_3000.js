const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const base = 'http://localhost:3000';
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 2200 } });
  const shots = [
    ['home', '/'],
    ['cessna-172', '/cessna-172'],
    ['checkout-process', '/checkout-process'],
    ['safety', '/safety'],
    ['pricing', '/pricing'],
    ['resources', '/resources'],
    ['contact-us', '/contact-us'],
  ];

  fs.mkdirSync('screenshots', { recursive: true });

  for (const [name, path] of shots) {
    await page.goto(base + path + '?screenshotMode=1', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1400);

    if (name === 'home') {
      await page.evaluate(() => window.scrollTo(0, Math.max(window.innerHeight, 1200)));
      await page.waitForTimeout(700);
    }

    await page.screenshot({ path: `screenshots/${name}.png`, fullPage: true });
  }

  await browser.close();
})();
