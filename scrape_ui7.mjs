import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

(async () => {
  console.log("Logging in via Supabase Auth API...");
  const { data, error } = await supabase.auth.signInWithPassword({
    email: 'testadmin1783953388152@example.com',
    password: 'password123',
  });
  
  if (error) {
    console.error("Auth error:", error.message);
    process.exit(1);
  }
  
  console.log("Auth success! Token:", data.session.access_token.substring(0, 20) + "...");

  const browser = await chromium.launch();
  const context = await browser.newContext();
  
  // Set the Supabase auth cookies. Next.js Supabase SSR usually relies on sb-[project]-auth-token
  // It's an array of chunks in modern @supabase/ssr. Let's just set the token in localStorage and see if the client refreshes it, or set the cookie.
  // Actually, easiest way is to intercept the page and run a script to set localStorage.
  
  const page = await context.newPage();
  
  await page.goto('http://localhost:3000');
  
  await page.evaluate((session) => {
    const projectId = 'buxyryemjrtnngldewyq'; // Or we can just guess from url, wait, local supabase is usually random or 127.0.0.1
    // Actually, local supabase has no project id in the cookie, it's `sb-127-auth-token` or similar.
    // Let's just set the entire session into localStorage keys that Supabase uses.
    // The default key is `sb-${projectId}-auth-token`.
    // But since we are local, it's usually `sb-127-auth-token` or similar.
    // Let's just iterate over all localStorage to find the key, or just set it blindly.
  }, data.session);

  // An easier way is just to type in the login form again but see WHY it failed. 
  // Let's take a screenshot!
  await page.goto('http://localhost:3000/login');
  await page.fill('input[type="email"]', 'testadmin1783953388152@example.com');
  await page.fill('input[type="password"]', 'password123');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);
  
  const errText = await page.evaluate(() => document.body.innerText);
  console.log("Error text after login:", errText.substring(0, 500).replace(/\n/g, ' '));
  
  await browser.close();
})();
