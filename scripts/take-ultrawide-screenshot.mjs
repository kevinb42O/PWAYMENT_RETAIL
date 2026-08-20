import { chromium } from 'playwright';
import fs from 'fs';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    deviceScaleFactor: 2
  });

  // 1. Take POS Screenshot
  const posPage = await context.newPage();
  await posPage.setViewportSize({ width: 1440, height: 1080 });

  console.log("Loading POS...");
  await posPage.goto("http://localhost:3000/login");

  await posPage.locator('input[type="email"]').waitFor({ timeout: 25000 });
  await posPage.fill('input[type="email"]', 'eigenaar@pwayment.be');
  await posPage.fill('input[type="password"]', 'password123');
  await posPage.click('button:has-text("Inloggen")');

  await posPage.locator('input[placeholder="Scan barcode of zoek product"]').waitFor({ timeout: 25000 });
  await posPage.waitForTimeout(3000);

  console.log("Clicking products...");
  await posPage.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button')).filter(b => b.textContent && b.textContent.includes('€') && !b.textContent.includes('Totaal'));
    if (buttons.length > 0) buttons[0].click();
    if (buttons.length > 1) setTimeout(() => buttons[1].click(), 500);
  });
  await posPage.waitForTimeout(1000);

  await posPage.screenshot({ path: 'pos.png' });

  const sessionId = await posPage.evaluate(() => sessionStorage.getItem("pwayment:customer-display-session-v1"));
  console.log("Session ID:", sessionId);

  // 2. Take CD Screenshot in same context so BroadcastChannel works!
  const cdPage = await context.newPage();
  await cdPage.setViewportSize({ width: 1000, height: 1080 });
  console.log("Loading CD...");
  await cdPage.goto("http://localhost:3000/customer-display#session=" + sessionId);
  await cdPage.waitForTimeout(5000); // Give it time to sync over BroadcastChannel

  await cdPage.screenshot({ path: 'cd.png' });

  await browser.close();

  // 3. Compose them using a simple HTML wrapper that we screenshot!
  console.log("Composing...");
  const composeBrowser = await chromium.launch({ headless: true });
  const composePage = await composeBrowser.newPage();
  await composePage.setViewportSize({ width: 3440, height: 1440 });

  const posBase64 = fs.readFileSync('pos.png').toString('base64');
  const cdBase64 = fs.readFileSync('cd.png').toString('base64');

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body {
            margin: 0;
            padding: 80px;
            background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%);
            display: flex;
            gap: 60px;
            height: 100vh;
            box-sizing: border-box;
            font-family: sans-serif;
          }
          .window {
            display: flex;
            flex-direction: column;
            border-radius: 12px;
            box-shadow: 0 40px 100px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.1) inset;
            background: #ffffff;
            overflow: hidden;
          }
          .titlebar {
            height: 48px;
            background: #f6f6f6;
            border-bottom: 1px solid #e5e5e5;
            display: flex;
            align-items: center;
            padding: 0 20px;
            gap: 10px;
          }
          .traffic-lights {
            display: flex;
            gap: 10px;
          }
          .traffic-lights div {
            width: 14px;
            height: 14px;
            border-radius: 50%;
          }
          .close { background: #ff5f56; }
          .min { background: #ffbd2e; }
          .max { background: #27c93f; }
          .title {
            flex: 1;
            text-align: center;
            font-size: 15px;
            font-weight: 600;
            color: #4a4a4a;
            margin-right: 60px;
          }
          img { border: none; flex: 1; width: 100%; object-fit: cover; object-position: top left; }

          .pos-container { flex: 1.5; }
          .cd-container { flex: 1; }
        </style>
      </head>
      <body>
        <div class="window pos-container">
          <div class="titlebar">
            <div class="traffic-lights">
              <div class="close"></div><div class="min"></div><div class="max"></div>
            </div>
            <div class="title">Pwayment POS</div>
          </div>
          <img src="data:image/png;base64,\${posBase64}" />
        </div>

        <div class="window cd-container">
          <div class="titlebar">
            <div class="traffic-lights">
              <div class="close"></div><div class="min"></div><div class="max"></div>
            </div>
            <div class="title">Customer Display</div>
          </div>
          <img src="data:image/png;base64,\${cdBase64}" />
        </div>
      </body>
    </html>
  `;

  await composePage.setContent(html);

  const outputPath = '/Users/kevin/.gemini/antigravity-ide/brain/46ed5fb7-a649-4b9d-a37e-8bd2568efe23/real_ultrawide_screenshot.png';
  await composePage.screenshot({ path: outputPath });
  await composeBrowser.close();
  console.log("Screenshot saved to", outputPath);
})();
