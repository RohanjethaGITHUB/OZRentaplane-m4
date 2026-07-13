import { chromium } from 'playwright';
import fs from 'fs';

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log("Logging in...");
  await page.goto('http://localhost:3000/login');
  await page.fill('input[type="email"]', 'testadmin1783953388152@example.com');
  await page.fill('input[type="password"]', 'password123');
  await page.click('button[type="submit"]');
  await page.waitForURL('http://localhost:3000/dashboard', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(2000);

  console.log("Current URL after login:", page.url());

  const urls = [
    'http://localhost:3000/admin/bookings/requests/c21b5ca0-2629-4a0a-ad85-21f3570ae6d1',
    'http://localhost:3000/admin/bookings/requests/d3d61705-19bb-4cdf-97bb-78abda3a16da',
    'http://localhost:3000/admin/bookings/requests/540fb373-3632-4fff-9775-38592d388bf4'
  ];

  for (let i = 0; i < urls.length; i++) {
    console.log(`\nNavigating to ${urls[i]}...`);
    await page.goto(urls[i]);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    const text = await page.evaluate(() => document.body.innerText);
    console.log(`Page Text [${i}]:`, text.substring(0, 500).replace(/\n/g, ' | '));
  }

  await browser.close();
})();
