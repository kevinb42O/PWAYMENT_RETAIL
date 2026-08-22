import { chromium } from 'playwright';

const testEmail = process.env.PWAYMENT_TEST_EMAIL;
const testPassword = process.env.PWAYMENT_TEST_PASSWORD;

if (!testEmail || !testPassword) {
  throw new Error('Set PWAYMENT_TEST_EMAIL and PWAYMENT_TEST_PASSWORD before running this script.');
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2
  });
  const page = await context.newPage();

  console.log("Navigating to login...");
  await page.goto("http://localhost:3000/login");

  await page.waitForSelector('input[type="email"]', { timeout: 15000 });
  await page.fill('input[type="email"]', testEmail);
  await page.fill('input[type="password"]', testPassword);

  console.log("Clicking login button...");
  await page.click('button:has-text("Inloggen")');

  await page.waitForTimeout(4000);
  console.log("Current URL:", page.url());
  const bodyText = await page.evaluate(() => document.body.innerText);
  console.log("Page snippet:", bodyText.slice(0, 300));

  await page.screenshot({ path: 'test-login-result.png' });
  console.log("Screenshot saved to test-login-result.png");

  await browser.close();
})();
