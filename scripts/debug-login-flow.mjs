import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2
  });
  const page = await context.newPage();

  console.log("Navigating to /login...");
  await page.goto("http://localhost:3000/login");
  await page.screenshot({ path: 'step1-login-form.png' });
  console.log("Screenshot step1 saved.");

  await page.waitForSelector('input[type="email"]', { timeout: 10000 });
  await page.fill('input[type="email"]', 'kevin@webaanzee.be');
  await page.fill('input[type="password"]', 'Pinakaaz420420');
  await page.screenshot({ path: 'step2-filled.png' });
  console.log("Screenshot step2 saved.");

  console.log("Submitting login form...");
  await page.click('button[type="submit"], button:has-text("Inloggen")');

  await page.waitForTimeout(5000);
  console.log("URL after login:", page.url());
  await page.screenshot({ path: 'step3-after-login.png' });
  console.log("Screenshot step3 saved.");

  // Check auth store state
  const authState = await page.evaluate(() => {
    return {
      session: window.localStorage.getItem('pwayment-auth') || window.sessionStorage.getItem('pwayment-auth'),
      bodyText: document.body.innerText.slice(0, 500)
    };
  });
  console.log("Auth state:", authState);

  await browser.close();
})();
