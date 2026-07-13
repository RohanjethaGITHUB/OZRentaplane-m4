import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log("Logging in...");
  await page.goto('http://localhost:3000/login');
  
  await page.locator('input[type="email"]').first().fill('testadmin1783953388152@example.com');
  await page.locator('input[type="password"]').first().fill('password123');
  await page.getByRole('button', { name: 'SIGN IN' }).click();
  
  await page.waitForURL('**/dashboard', { timeout: 10000 }).catch(e => console.log("Did not reach dashboard"));
  
  console.log("URL after submit:", page.url());

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

    const html = await page.content();
    const hasBookingType = html.includes('Booking Type');
    const hasSchedule = html.includes('Schedule');
    const hasFlightBilling = html.includes('Flight Billing') || html.includes('Calculated VDO total') || html.includes('Aircraft hire') || html.includes('Block time deduction');

    if (hasBookingType) {
      const match = html.match(/Booking Type.*?<p[^>]*>([^<]+)<\/p>.*?<p[^>]*>([^<]+)<\/p>/s);
      if (match) console.log(`Parsed Booking Type: ${match[1].trim()} | ${match[2].trim()}`);
    }
    
    if (hasSchedule) {
      const match = html.match(/Schedule.*?Cessna 172N.*?VH-KZG/s);
      if (match) console.log(`Schedule contains Aircraft info: true`);
    }

    if (hasFlightBilling) {
      const match1 = html.match(/Block time deduction[^<]*<[^>]+>\s*([^<]+)\s*<\/[^>]+>\s*<[^>]+>\s*(Covered)\s*<\/[^>]+>/s);
      if (match1) console.log(`Flight Billing Block Time: true | Covered`);

      const match2 = html.match(/Overage[^<]*<[^>]+>\s*([^<]+)\s*<\/[^>]+>\s*<[^>]+>\s*(\$\d+(?:,\d+)*(?:\.\d+)?)\s*<\/[^>]+>/s);
      if (match2) console.log(`Flight Billing Overage: true | ${match2[2]}`);
      
      const match3 = html.match(/Aircraft hire.*?(\$\d+(?:,\d+)*(?:\.\d+)?)/s);
      if (match3) console.log(`Flight Billing Aircraft Hire: ${match3[1]}`);
    }
  }

  await browser.close();
})();
