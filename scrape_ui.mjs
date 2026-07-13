import { chromium } from 'playwright';

(async () => {
  console.log("Launching browser...");
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log("Logging in...");
  await page.goto('http://localhost:3000/login');
  await page.fill('input[type="email"]', 'testadmin1783953388152@example.com');
  await page.fill('input[type="password"]', 'password123');
  await page.click('button[type="submit"]');
  await page.waitForURL('http://localhost:3000/dashboard', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(2000); // Give it a moment to finish auth redirects

  const urls = [
    'http://localhost:3000/admin/bookings/requests/c21b5ca0-2629-4a0a-ad85-21f3570ae6d1',
    'http://localhost:3000/admin/bookings/requests/d3d61705-19bb-4cdf-97bb-78abda3a16da',
    'http://localhost:3000/admin/bookings/requests/540fb373-3632-4fff-9775-38592d388bf4'
  ];

  for (const url of urls) {
    console.log(`\nNavigating to ${url}...`);
    await page.goto(url);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    const bookingTypeCardText = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('.rounded-\\[20px\\]'));
      const typeCard = cards.find(c => c.textContent.includes('Booking Type'));
      return typeCard ? typeCard.innerText.replace(/\n/g, ' | ') : 'Not Found';
    });

    const scheduleCardText = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('.rounded-\\[20px\\]'));
      const schedCard = cards.find(c => c.textContent.includes('Schedule'));
      return schedCard ? schedCard.innerText.replace(/\n/g, ' | ') : 'Not Found';
    });

    const flightBillingText = await page.evaluate(() => {
      const panel = document.getElementById('submitted-flight-record');
      return panel ? panel.innerText.replace(/\n/g, ' | ') : 'Flight Billing Panel Not Found';
    });

    console.log(`Booking Type Card: ${bookingTypeCardText}`);
    console.log(`Schedule Card: ${scheduleCardText}`);
    console.log(`Flight Billing Panel: ${flightBillingText}`);
  }

  await browser.close();
})();
