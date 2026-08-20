import { chromium } from 'playwright';
import fs from 'fs';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 3440, height: 1440 },
    deviceScaleFactor: 2
  });
  const page = await context.newPage();

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
          }
          iframe { border: none; flex: 1; width: 100%; background: #fff; }
          .pos-container { flex: 1.8; }
          .cd-container { flex: 1; }
        </style>
      </head>
      <body>
        <div class="window pos-container">
          <iframe class="pos" name="pos" src="http://localhost:3000/login"></iframe>
        </div>
        <div class="window cd-container">
          <iframe class="cd" id="cd" name="cd" src="about:blank"></iframe>
        </div>
      </body>
    </html>
  `;

  await page.setContent(html);

  console.log("Waiting 15 seconds for POS to settle...");
  await page.waitForTimeout(15000);

  const posLocator = page.frameLocator('.pos');

  const posUrl = await posLocator.locator('body').evaluate(() => window.location.href);
  console.log("POS URL:", posUrl);

  const posHtml = await posLocator.locator('body').innerHTML();
  fs.writeFileSync('/Users/kevin/.gemini/antigravity-ide/brain/46ed5fb7-a649-4b9d-a37e-8bd2568efe23/pos-html-dump.txt', posHtml);
  console.log("Dumped POS HTML");

  await browser.close();
})();
