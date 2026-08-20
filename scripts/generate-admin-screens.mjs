import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const ARTIFACT_DIR = '/Users/kevin/.gemini/antigravity-ide/brain/27ea57c7-0438-494c-961e-d678ae2288b7';
const PREVIOUS_BRAIN_DIR = '/Users/kevin/.gemini/antigravity-ide/brain/46ed5fb7-a649-4b9d-a37e-8bd2568efe23';
const WORKSPACE_DIR = '/Users/kevin/PROJECTS/pwayment RETAIL';

const saveFileEverywhere = (filename, buffer) => {
  const paths = [
    path.join(ARTIFACT_DIR, filename),
    path.join(PREVIOUS_BRAIN_DIR, filename),
    path.join(WORKSPACE_DIR, 'docs', filename),
    path.join(WORKSPACE_DIR, 'public', 'mail-assets', filename)
  ];
  for (const p of paths) {
    try {
      const dir = path.dirname(p);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(p, buffer);
    } catch (err) {
      console.warn(`Could not write to ${p}:`, err.message);
    }
  }
};

const renderComposedWindow = async (composeBrowser, config) => {
  const source = config.type === 'dual' ? config.img1 : config.img;
  saveFileEverywhere(config.outputFilename, Buffer.from(source, 'base64'));
  console.log(`✅ Native product screenshot: ${config.outputFilename}`);
  return;

  const page = await composeBrowser.newPage();

  const padX = 45;
  const padY = 35;
  const headerH = 46;
  const headerGap = 18;
  const titlebarH = 40;

  let totalWidth = 0;
  let totalHeight = 0;
  let windowsHtml = '';

  if (config.type === 'dual') {
    const gap = 28;
    totalWidth = padX * 2 + config.w1 + config.w2 + gap;
    totalHeight = padY * 2 + headerH + headerGap + config.h + titlebarH;

    windowsHtml = `
      <div class="window" style="width: ${config.w1}px; height: ${config.h + titlebarH}px;">
        <div class="titlebar">
          <div class="traffic-lights">
            <div class="light close"></div><div class="light min"></div><div class="light max"></div>
          </div>
          <div class="title-wrap">
            <span class="badge badge-primary">${config.badge1 || 'PLATFORM CONSOLE'}</span>
            <span class="title">${config.title1}</span>
          </div>
          <div class="status-pill">${config.status1 || '● Superadmin'}</div>
        </div>
        <img class="screenshot-img" src="data:image/png;base64,${config.img1}" style="width: ${config.w1}px; height: ${config.h}px;" />
      </div>

      <div class="window" style="width: ${config.w2}px; height: ${config.h + titlebarH}px;">
        <div class="titlebar">
          <div class="traffic-lights">
            <div class="light close"></div><div class="light min"></div><div class="light max"></div>
          </div>
          <div class="title-wrap">
            <span class="badge badge-accent">${config.badge2 || 'SUPPORT TRIAGE'}</span>
            <span class="title">${config.title2}</span>
          </div>
          <div class="status-pill sync-pill">${config.status2 || '🔒 60-min Grant'}</div>
        </div>
        <img class="screenshot-img" src="data:image/png;base64,${config.img2}" style="width: ${config.w2}px; height: ${config.h}px;" />
      </div>
    `;
  } else {
    totalWidth = padX * 2 + config.w;
    totalHeight = padY * 2 + headerH + headerGap + config.h + titlebarH;

    windowsHtml = `
      <div class="window" style="width: ${config.w}px; height: ${config.h + titlebarH}px;">
        <div class="titlebar">
          <div class="traffic-lights">
            <div class="light close"></div><div class="light min"></div><div class="light max"></div>
          </div>
          <div class="title-wrap">
            <span class="badge badge-primary">${config.badge || 'PLATFORM CONSOLE'}</span>
            <span class="title">${config.title}</span>
          </div>
          <div class="status-pill">${config.status || '● Superadmin'}</div>
        </div>
        <img class="screenshot-img" src="data:image/png;base64,${config.img}" style="width: ${config.w}px; height: ${config.h}px;" />
      </div>
    `;
  }

  await page.setViewportSize({ width: totalWidth, height: totalHeight });

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            width: ${totalWidth}px;
            height: ${totalHeight}px;
            background: radial-gradient(circle at 50% 0%, rgba(30, 58, 138, 0.35) 0%, rgba(15, 23, 42, 0.98) 75%), #090d16;
            padding: ${padY}px ${padX}px;
            display: flex;
            flex-direction: column;
            gap: ${headerGap}px;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            overflow: hidden;
          }
          .header-bar {
            height: ${headerH}px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0 6px;
          }
          .header-title {
            display: flex;
            align-items: center;
            gap: 14px;
          }
          .header-tag {
            background: linear-gradient(135deg, #0ea5e9, #2563eb);
            color: #ffffff;
            font-size: 12px;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 0.12em;
            padding: 6px 14px;
            border-radius: 20px;
            box-shadow: 0 2px 12px rgba(14, 165, 233, 0.45);
          }
          .header-text {
            color: #f8fafc;
            font-size: 16px;
            font-weight: 700;
            letter-spacing: -0.01em;
          }
          .header-meta {
            color: #64748b;
            font-size: 13px;
            font-weight: 600;
            letter-spacing: 0.04em;
          }
          .canvas-container {
            display: flex;
            gap: 28px;
            align-items: flex-start;
          }
          .window {
            display: flex;
            flex-direction: column;
            border-radius: 14px;
            background: #0f172a;
            overflow: hidden;
            box-shadow: 0 30px 75px -12px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.12) inset;
            border: 1px solid rgba(255, 255, 255, 0.1);
          }
          .titlebar {
            height: ${titlebarH}px;
            background: #0f172a;
            border-bottom: 1px solid rgba(255, 255, 255, 0.08);
            display: flex;
            align-items: center;
            padding: 0 16px;
            gap: 14px;
          }
          .traffic-lights {
            display: flex;
            gap: 8px;
          }
          .light {
            width: 11px;
            height: 11px;
            border-radius: 50%;
          }
          .close { background: #ff5f56; box-shadow: 0 0 6px rgba(255,95,86,0.4); }
          .min { background: #ffbd2e; box-shadow: 0 0 6px rgba(255,189,46,0.4); }
          .max { background: #27c93f; box-shadow: 0 0 6px rgba(39,201,63,0.4); }

          .title-wrap {
            flex: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
          }
          .badge {
            font-size: 10px;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            padding: 3px 8px;
            border-radius: 6px;
          }
          .badge-primary {
            background: rgba(14, 165, 233, 0.15);
            color: #38bdf8;
            border: 1px solid rgba(56, 189, 248, 0.3);
          }
          .badge-accent {
            background: rgba(168, 85, 247, 0.15);
            color: #c084fc;
            border: 1px solid rgba(192, 132, 252, 0.3);
          }
          .title {
            font-size: 12px;
            font-weight: 600;
            color: #e2e8f0;
            letter-spacing: -0.01em;
          }
          .status-pill {
            font-size: 11px;
            font-weight: 600;
            color: #10b981;
            background: rgba(16, 185, 129, 0.12);
            padding: 3px 10px;
            border-radius: 12px;
            border: 1px solid rgba(16, 185, 129, 0.25);
          }
          .sync-pill {
            color: #818cf8;
            background: rgba(99, 102, 241, 0.12);
            border-color: rgba(99, 102, 241, 0.25);
          }
          .screenshot-img {
            display: block;
            border-bottom-left-radius: 13px;
            border-bottom-right-radius: 13px;
          }
        </style>
      </head>
      <body>
        <div class="header-bar">
          <div class="header-title">
            <span class="header-tag">${config.headerTag || 'PWAYMENT'}</span>
            <span class="header-text">${config.headerText || ''}</span>
          </div>
          <div class="header-meta">${config.headerMeta || 'Superuser Platform Console'}</div>
        </div>
        <div class="canvas-container">
          ${windowsHtml}
        </div>
      </body>
    </html>
  `;

  await page.setContent(html);
  await page.waitForTimeout(600);
  const screenshotBuffer = await page.screenshot();
  await page.close();

  saveFileEverywhere(config.outputFilename, screenshotBuffer);
  console.log(`✅ Composed screenshot: ${config.outputFilename}`);
};

(async () => {
  console.log("🚀 Starting Superadmin Platform Console captures...");
  const browser = await chromium.launch({ headless: true });
  const composeBrowser = await chromium.launch({ headless: true });

  const context = await browser.newContext({
    deviceScaleFactor: 2
  });

  const page = await context.newPage();

  // 1. Authenticate to Platform Admin
  await page.setViewportSize({ width: 1750, height: 960 });
  await page.goto("http://localhost:3000/admin");
  await page.waitForTimeout(2000);

  const emailInput = page.locator('input[type="email"]').first();
  if (await emailInput.isVisible()) {
    await emailInput.fill("kevin@webaanzee.be");
    await page.locator('input[type="password"]').first().fill("Pinakaaz420420");
    await page.locator('button[type="submit"]').first().click();
    await page.waitForTimeout(2500);
  }

  // ----------------------------------------------------
  // SCREEN 1: SUPERUSER OVERVIEW & COCKPIT (/admin)
  // ----------------------------------------------------
  console.log("📸 1. Capturing Platform Overview (/admin)...");
  await page.goto("http://localhost:3000/admin");
  await page.waitForTimeout(1500);

  const overviewBuffer = await page.screenshot();
  const overviewBase64 = overviewBuffer.toString('base64');

  await renderComposedWindow(composeBrowser, {
    type: 'single',
    w: 1750,
    h: 960,
    img: overviewBase64,
    title: 'Platform Console — Centrale Commandocentrale, Metrics & Telemetrie',
    badge: 'SUPERUSER PLATFORM CONSOLE',
    status: '● 18 Winkels Live Telemetrie',
    headerTag: 'Punt 5 · Superuser Platform Console',
    headerText: 'Centrale Commandocentrale voor Triage, Team Governance & Veilige Support',
    headerMeta: 'Real-time Health Monitoring · 18 Winkels Verbonden · 0 Kritieke Fouten',
    outputFilename: 'screenshot_5_platform_admin_console.png'
  });

  // ----------------------------------------------------
  // SCREEN 2: DUAL SCREEN - OVERZICHT + VEILIGE SUPPORT TRIAGE
  // ----------------------------------------------------
  console.log("📸 2. Capturing Dual View: Stores Overzicht & Winkeldossier / Support Triage...");
  const s1W = 1200;
  const s1H = 960;
  const s2W = 1200;
  const s2H = 960;

  // Stores fleet view
  await page.setViewportSize({ width: s1W, height: s1H });
  await page.locator('aside button:has-text("Winkels"), aside nav a:has-text("Winkels")').first().click();
  await page.waitForTimeout(1500);
  const storesBuffer = await page.screenshot();
  const storesBase64 = storesBuffer.toString('base64');

  // Store detail + Support grant view
  await page.setViewportSize({ width: s2W, height: s2H });
  await page.goto("http://localhost:3000/admin/stores/store-02");
  await page.waitForTimeout(1500);
  const storeDetailBuffer = await page.screenshot();
  const storeDetailBase64 = storeDetailBuffer.toString('base64');

  await renderComposedWindow(composeBrowser, {
    type: 'dual',
    w1: s1W,
    w2: s2W,
    h: s1H,
    img1: storesBase64,
    img2: storeDetailBase64,
    title1: 'Multi-Store Vlootbeheer — Gezondheid, Sync & Wachtrijen',
    title2: 'Winkeldossier & 60-minuten Read-Only Veilige Support',
    badge1: 'STORE FLEET',
    badge2: 'SUPPORT GRANT',
    status1: '● 6 Winkels Gemonitord',
    status2: '🔒 Actieve Support Grant',
    headerTag: 'Punt 5 · Winkels & Veilige Support Triage',
    headerText: 'Multi-Store Vlootbeheer en Beveiligde 60-Minuten Read-Only Support',
    headerMeta: 'Geen Wachtwoorden Delen · Expliciete Toestemming · Volledig Geaudit',
    outputFilename: 'screenshot_5_stores_and_support_triage.png'
  });

  // ----------------------------------------------------
  // SCREEN 3: DUAL SCREEN - TEAM GOVERNANCE + RELEASES
  // ----------------------------------------------------
  console.log("📸 3. Capturing Dual View: Team Governance & Releases 4-Ogen Controle...");
  // Team Governance view
  await page.setViewportSize({ width: s1W, height: s1H });
  await page.locator('aside button:has-text("Team"), aside nav a:has-text("Team")').first().click();
  await page.waitForTimeout(1500);
  const teamBuffer = await page.screenshot();
  const teamBase64 = teamBuffer.toString('base64');

  // Releases view
  await page.setViewportSize({ width: s2W, height: s2H });
  await page.locator('aside button:has-text("Releases"), aside nav a:has-text("Releases")').first().click();
  await page.waitForTimeout(1500);
  const releasesBuffer = await page.screenshot();
  const releasesBase64 = releasesBuffer.toString('base64');

  await renderComposedWindow(composeBrowser, {
    type: 'dual',
    w1: s1W,
    w2: s2W,
    h: s1H,
    img1: teamBase64,
    img2: releasesBase64,
    title1: 'Team Governance — Rollen (Superadmin, Ops, Support, Billing)',
    title2: 'Releases & Feature Flags — 4-Ogen Controle & Rollback',
    badge1: 'TEAM GOVERNANCE',
    badge2: 'FEATURE RELEASES',
    status1: '● 4 Teamleden Actief',
    status2: '🚀 Gecontroleerde Rollouts',
    headerTag: 'Punt 5 · Bedrijfscontinuïteit & Governance',
    headerText: 'Rolgebaseerde Toegang (RBAC) en Veilige Feature Rollouts',
    headerMeta: 'Geen Single Point of Failure · Rollback met 1 Klik · Audit Logging',
    outputFilename: 'screenshot_5_team_and_releases.png'
  });

  await browser.close();
  await composeBrowser.close();
  console.log("🎉 All superadmin platform screens captured successfully!");
})();
