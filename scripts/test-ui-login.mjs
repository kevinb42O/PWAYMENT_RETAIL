import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2
  });
  const page = await context.newPage();

  page.on('console', msg => console.log('[BROWSER CONSOLE]', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('[BROWSER PAGE ERROR]', err.message));

  console.log("Navigating to http://localhost:3000/login ...");
  await page.goto("http://localhost:3000/login", { waitUntil: 'networkidle' });

  console.log("Waiting for #login-email...");
  await page.waitForSelector('#login-email', { timeout: 10000 });

  console.log("Filling credentials...");
  await page.fill('#login-email', 'kevin@webaanzee.be');
  await page.fill('#login-password', 'Pinakaaz420420');

  console.log("Clicking submit button...");
  await page.click('button[type="submit"]');

  console.log("Waiting 5 seconds for auth response...");
  await page.waitForTimeout(5000);

  const url = page.url();
  console.log("Current page URL:", url);

  const errorText = await page.evaluate(() => {
    const alerts = Array.from(document.querySelectorAll('[role="alert"], .text-rose-600, .text-rose-500, .bg-rose-50'));
    return alerts.map(a => a.textContent?.trim()).filter(Boolean);
  });
  console.log("Errors on screen:", errorText);

  const isPosVisible = await page.evaluate(() => {
    return Boolean(document.querySelector('input[placeholder*="Scan barcode"], input[placeholder*="zoek product"], .pwayment-app'));
  });
  console.log("Is POS visible?", isPosVisible);

  await page.screenshot({ path: 'login-attempt-result.png' });
  console.log("Screenshot saved to login-attempt-result.png");

  await browser.close();
})();
