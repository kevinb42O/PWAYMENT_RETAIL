import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const ARTIFACT_DIR = '/Users/kevin/.gemini/antigravity-ide/brain/27ea57c7-0438-494c-961e-d678ae2288b7';
const PREVIOUS_BRAIN_DIR = '/Users/kevin/.gemini/antigravity-ide/brain/46ed5fb7-a649-4b9d-a37e-8bd2568efe23';
const WORKSPACE_DIR = '/Users/kevin/PROJECTS/pwayment RETAIL';
const LOCAL_DEMO_EMAIL = 'retail-demo@pwayment.test';
const LOCAL_DEMO_PASSWORD = 'local-retail-demo-only';

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

/**
 * Saves native product screenshots for email. Screenshots are deliberately kept
 * free of decorative browser chrome, presentation headers and ultrawide collages:
 * an email should show the product clearly at a normal reading size.
 */
const renderComposedWindow = async (composeBrowser, config) => {
  const source = config.type === 'dual'
    ? (config.outputSource === 'second' ? config.img2 : config.img1)
    : config.img;
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
            <span class="badge badge-primary">${config.badge1 || 'POS TERMINAL'}</span>
            <span class="title">${config.title1}</span>
          </div>
          <div class="status-pill">${config.status1 || '● Live Cart'}</div>
        </div>
        <img class="screenshot-img" src="data:image/png;base64,${config.img1}" style="width: ${config.w1}px; height: ${config.h}px;" />
      </div>

      <div class="window" style="width: ${config.w2}px; height: ${config.h + titlebarH}px;">
        <div class="titlebar">
          <div class="traffic-lights">
            <div class="light close"></div><div class="light min"></div><div class="light max"></div>
          </div>
          <div class="title-wrap">
            <span class="badge badge-accent">${config.badge2 || 'SECOND SCREEN'}</span>
            <span class="title">${config.title2}</span>
          </div>
          <div class="status-pill sync-pill">${config.status2 || '⚡ Real-time Sync'}</div>
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
            <span class="badge badge-primary">${config.badge || 'PWAYMENT RETAIL'}</span>
            <span class="title">${config.title}</span>
          </div>
          <div class="status-pill">${config.status || '● Actief Systeem'}</div>
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
          <div class="header-meta">${config.headerMeta || 'Retail Intelligence Platform'}</div>
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
  console.log(`✅ Composed screenshot (100% natural, 0% crop): ${config.outputFilename}`);
};

(async () => {
  console.log("🚀 Starting Playwright capture with exact viewport fidelity...");
  const browser = await chromium.launch({ headless: true });
  const composeBrowser = await chromium.launch({ headless: true });

  const context = await browser.newContext({
    deviceScaleFactor: 2
  });

  const page = await context.newPage();

  // Helper to authenticate with an isolated local-only fixture and set up a rich retail store.
  const loginUser = async () => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.goto("http://localhost:3000/login");
    await page.waitForTimeout(1500);

    await page.evaluate(async ({ email, password }) => {
      const { db } = await import("./src/db/db.ts");
      const { hashCredential } = await import("./src/utils/credentials.ts");
      const { DEMO_ACCOUNT_ID } = await import("./src/auth/useAuth.ts");
      const { useProducts } = await import("./src/store/useProducts.ts");
      const { products: seedProducts } = await import("./src/data/products.ts");
      const { useCustomers } = await import("./src/store/useCustomers.ts");
      const { seedDemoRetailData } = await import("./src/utils/demoRetailData.ts");
      const { useStoreConfiguration } = await import("./src/store/useStoreConfiguration.ts");
      const { useEntitlements, FEATURE_KEYS } = await import("./src/billing/entitlements.ts");
      const { useCustomerDisplaySettings } = await import("./src/customer-display/settings.ts");

      const hash = await hashCredential(password, "password");
      const pinHash = await hashCredential("123456", "pin");
      await db.users.put({
        id: DEMO_ACCOUNT_ID,
        name: "Kevin · Webaanzee",
        firstName: "Kevin",
        lastName: "Webaanzee",
        role: "owner",
        email,
        passwordHash: hash,
        pinHash: pinHash,
        storeName: "PWAYMENT Skatestore",
        createdAt: new Date().toISOString()
      });

      // Populate rich products
      await db.products.bulkPut(seedProducts.map(p => ({ ...p, isActive: true })));
      await useProducts.getState().refresh();
      await seedDemoRetailData();
      await useCustomers.getState().hydrate(true);

      // Seed rich service orders with events and merchant snapshot
      await db.service_orders.clear();
      await db.service_orders.bulkPut([
        {
          id: "srv-001",
          number: "REP-2026-0819",
          trackingToken: "TRK-98421",
          createdAt: Date.now() - 3600000 * 24,
          updatedAt: Date.now() - 3600000 * 2,
          promisedAt: Date.now() + 3600000 * 24,
          status: "in-progress",
          substatus: "Griptape geplaatst, wachten op lagers",
          route: "internal-repair",
          customerId: "demo-cust-1",
          customerName: "Alex Aerts",
          customerEmail: "alex.aerts@telenet.be",
          customerPhone: "+32 470 12 34 56",
          assetType: "Complete Skateboard",
          brand: "Baker",
          model: "Rowan Pro 8.25",
          identifierType: "Serienummer",
          identifierValue: "BK-8291-ROW",
          issue: "Deck upgrade, montage Independent trucks & nieuwe Bones Reds lagers",
          warranty: false,
          noCureNoPay: false,
          diagnosisFeeCents: 0,
          laborCents: 2500,
          partsCents: 8900,
          otherCents: 0,
          depositCents: 2000,
          totalCents: 11400,
          paidCents: 2000,
          attachments: [],
          events: [
            {
              id: "evt-01",
              timestamp: Date.now() - 3600000 * 24,
              systemStatus: "open",
              substatus: "Intake voltooid",
              note: "Klant brengt skateboard binnen voor ombouw",
              actor: { userId: DEMO_ACCOUNT_ID, role: "owner", name: "Kevin · Webaanzee" }
            },
            {
              id: "evt-02",
              timestamp: Date.now() - 3600000 * 2,
              systemStatus: "in-progress",
              substatus: "Griptape geplaatst, wachten op lagers",
              note: "Trucks gemonteerd",
              actor: { userId: DEMO_ACCOUNT_ID, role: "owner", name: "Kevin · Webaanzee" }
            }
          ],
          merchantSnapshot: { name: "Pwayment Skatestore" }
        },
        {
          id: "srv-002",
          number: "REP-2026-0820",
          trackingToken: "TRK-67319",
          createdAt: Date.now() - 3600000 * 12,
          updatedAt: Date.now() - 3600000 * 1,
          promisedAt: Date.now() + 3600000 * 48,
          status: "ready",
          substatus: "Klaar voor afhaling in winkel",
          route: "internal-repair",
          customerId: "demo-cust-2",
          customerName: "Amélie Baert",
          customerEmail: "amelie.baert@gmail.com",
          customerPhone: "+32 475 98 76 54",
          assetType: "Custom Cruiser",
          brand: "Santa Cruz",
          model: "Classic Dot 8.5",
          identifierType: "Serienummer",
          identifierValue: "SC-DOT-850",
          issue: "Wielvervanging naar 60mm soft wheels + riser pads montage",
          warranty: false,
          noCureNoPay: false,
          diagnosisFeeCents: 0,
          laborCents: 1500,
          partsCents: 5400,
          otherCents: 0,
          depositCents: 0,
          totalCents: 6900,
          paidCents: 0,
          attachments: [],
          events: [
            {
              id: "evt-03",
              timestamp: Date.now() - 3600000 * 12,
              systemStatus: "ready",
              substatus: "Klaar voor afhaling in winkel",
              note: "Klant ontving SMS en email",
              actor: { userId: DEMO_ACCOUNT_ID, role: "owner", name: "Kevin · Webaanzee" }
            }
          ],
          merchantSnapshot: { name: "Pwayment Skatestore" }
        }
      ]);

      // Enable Customer Display in settings
      useCustomerDisplaySettings.getState().updateConfig(null, {
        enabled: true,
        showClock: true,
        showVatBreakdown: true,
        showPaymentMethods: true
      });

      // Unlock all modules & Enterprise tier
      useStoreConfiguration.setState({
        configuration: {
          version: 1,
          completedAt: new Date().toISOString(),
          firstRunCompleted: true,
          industry: "skate-sports",
          salesModel: "omnichannel",
          teamSize: "small",
          catalogSource: "pos",
          importTiming: "now",
          pricingModel: "retail-b2b",
          defaultVat: "21",
          serviceContactPreference: "both",
          modules: {
            catalog: true,
            customers: true,
            service: true,
            workforce: true,
            webshop: true,
            insights: true
          }
        },
        hydrated: true
      });

      const allFeatures = Object.values(FEATURE_KEYS).reduce((acc, k) => {
        acc[k] = true;
        return acc;
      }, {});

      useEntitlements.getState().applySnapshot({
        storedPlan: "enterprise",
        effectivePlan: "enterprise",
        status: "active",
        billingCycle: "yearly",
        trialStartedAt: null,
        trialEndsAt: null,
        currentPeriodEndsAt: null,
        serverNow: new Date().toISOString(),
        features: allFeatures,
        limits: {},
        canSimulateBilling: true,
        version: 1
      });
    }, { email: LOCAL_DEMO_EMAIL, password: LOCAL_DEMO_PASSWORD });

    await page.fill("#login-email", LOCAL_DEMO_EMAIL);
    await page.fill("#login-password", LOCAL_DEMO_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3500);
  };

  console.log("1️⃣ Logging in with the isolated local retail fixture...");
  await loginUser();

  // ----------------------------------------------------
  // SCREENSHOT 1: KLANTENDISPLAY (CUSTOMER DISPLAY)
  // ----------------------------------------------------
  console.log("📸 Generating Screenshot 1: Klantendisplay (Customer Display)...");
  const posW = 1440;
  const posH = 960;
  // Customer displays are normally landscape. Capturing that real-world shape
  // preserves the generous layout and prevents the footer from crowding content.
  const cdW = 1600;
  const cdH = 900;

  await page.setViewportSize({ width: posW, height: posH });
  await page.evaluate(async () => {
    const { useStore } = await import("./src/store/useStore.ts");
    const { useProducts } = await import("./src/store/useProducts.ts");
    const { useCustomers } = await import("./src/store/useCustomers.ts");
    const { useCustomerDisplaySettings } = await import("./src/customer-display/settings.ts");

    useCustomerDisplaySettings.getState().updateConfig(null, {
      enabled: true,
      showClock: true,
      showVatBreakdown: true,
      showPaymentMethods: true
    });

    const store = useStore.getState();
    const productList = useProducts.getState().list;
    const customerList = useCustomers.getState().customers;

    store.setMainView("pos");
    store.clearCart();

    if (customerList.length > 0) {
      store.linkCustomer(customerList[0].id);
    }

    if (productList.length >= 3) {
      store.addOrderItem(productList[0]);
      store.addOrderItem(productList[1]);
      store.addOrderItem(productList[2]);
    }
  });

  await page.waitForTimeout(1500);
  const sessionId = "fabrice-customer-display-20260820";

  const cdPage = await context.newPage();
  await cdPage.setViewportSize({ width: cdW, height: cdH });
  await cdPage.goto(`http://localhost:3000/customer-display#session=${sessionId}`);
  await cdPage.waitForTimeout(750);

  // First capture the idle screen: this is the polished welcome state visible
  // before a customer starts a purchase.
  await cdPage.evaluate((displaySessionId) => {
    const channel = new BroadcastChannel(`pwayment:customer-display:${displaySessionId}`);
    channel.postMessage({
      type: "SNAPSHOT",
      snapshot: {
        protocolVersion: 1,
        storeId: "pwayment-skate-store",
        registerId: "kassa-1",
        displaySessionId,
        cartSessionId: null,
        epochId: "fabrice-customer-display-epoch-20260820",
        revision: 1,
        emittedAt: Date.now(),
        phase: "idle",
        merchant: { displayName: "Pwayment Skatestore", locale: "nl-BE", currency: "EUR" },
        presentation: { idleHeadline: "Welkom", idleMessage: "We helpen je zo verder.", accentColor: "#0891b2", showClock: true, showVatBreakdown: true, showPaymentMethods: true },
        lines: [],
        totals: { subtotalCents: 0, discountCents: 0, giftCardCents: 0, totalCents: 0, remainingCents: 0, vat12Cents: 0, vat21Cents: 0 },
        acceptedPaymentMethods: ["cash", "card", "gift-card"]
      }
    });
    channel.close();
  }, sessionId);
  await cdPage.waitForTimeout(600);
  saveFileEverywhere('screenshot_1_customer_display_idle.png', await cdPage.screenshot());

  // The customer display is a separate window. Send a deterministic live cart
  // snapshot so the exported image shows the screen a shopper actually sees.
  await cdPage.evaluate((displaySessionId) => {
    const channel = new BroadcastChannel(`pwayment:customer-display:${displaySessionId}`);
    channel.postMessage({
      type: "SNAPSHOT",
      snapshot: {
        protocolVersion: 1,
        storeId: "pwayment-skate-store",
        registerId: "kassa-1",
        displaySessionId,
        cartSessionId: "demo-cart-20260820",
        epochId: "fabrice-customer-display-epoch-20260820",
        revision: 4,
        emittedAt: Date.now(),
        phase: "cart",
        merchant: { displayName: "Pwayment Skatestore", locale: "nl-BE", currency: "EUR" },
        presentation: { idleHeadline: "Welkom", idleMessage: "Fijn dat je er bent.", accentColor: "#0891b2", showClock: true, showVatBreakdown: true, showPaymentMethods: true },
        lines: [
          { lineId: "deck", name: "Santa Cruz Classic Dot", variant: "8.25 inch", modifierLabels: [], quantity: 1, unitPriceCents: 6995, lineTotalCents: 6995 },
          { lineId: "trucks", name: "Independent Stage 11", variant: "144", modifierLabels: [], quantity: 1, unitPriceCents: 7495, lineTotalCents: 7495 },
          { lineId: "wheels", name: "Bones Reds Bearings", modifierLabels: [], quantity: 1, unitPriceCents: 2495, lineTotalCents: 2495 }
        ],
        totals: { subtotalCents: 16985, discountCents: 0, giftCardCents: 0, totalCents: 16985, remainingCents: 16985, vat12Cents: 0, vat21Cents: 2948 },
        acceptedPaymentMethods: ["cash", "card", "bancontact", "visa", "mastercard", "apple-pay"]
      }
    });
    channel.close();
  }, sessionId);
  await cdPage.waitForTimeout(800);

  // Add 4th item to trigger instant sync
  await page.evaluate(async () => {
    const { useStore } = await import("./src/store/useStore.ts");
    const { useProducts } = await import("./src/store/useProducts.ts");
    const productList = useProducts.getState().list;
    if (productList.length > 3) {
      useStore.getState().addOrderItem(productList[3]);
    }
  });
  await cdPage.waitForTimeout(2000);

  const cdBuffer = await cdPage.screenshot();
  const cdBase64 = cdBuffer.toString('base64');
  await cdPage.close();

  const posBuffer = await page.screenshot();
  const posBase64 = posBuffer.toString('base64');

  await renderComposedWindow(composeBrowser, {
    type: 'dual',
    w1: posW,
    w2: cdW,
    h: posH,
    img1: posBase64,
    img2: cdBase64,
    title1: 'Pwayment POS Kassa — Verkoop, Klanten & Berekening',
    title2: 'Klantendisplay — Live Synchronisatie (2e Scherm)',
    badge1: 'POS KASSA',
    badge2: 'KLANTENDISPLAY',
    status1: '● Live Cart',
    status2: '⚡ Real-time Sync',
    headerTag: 'Punt 1 · Klantendisplay',
    headerText: 'Real-time Cart Projection & Dual-Screen Architectuur',
    headerMeta: 'Lokale WebRTC/BroadcastChannel Sync · Nul Latency',
    outputSource: 'second',
    outputFilename: 'screenshot_1_customer_display.png'
  });

  // ----------------------------------------------------
  // SCREENSHOT 2: DIRECT FACTUREREN & BARCODE SCANNEN
  // ----------------------------------------------------
  console.log("📸 Generating Screenshot 2: Direct Factureren & Barcode Scannen...");
  const invW = 1680;
  const invH = 960;
  await page.setViewportSize({ width: invW, height: invH });

  await page.evaluate(async () => {
    const { useStore } = await import("./src/store/useStore.ts");
    const { useCustomers } = await import("./src/store/useCustomers.ts");
    const { db } = await import("./src/db/db.ts");

    const store = useStore.getState();
    store.setMainView("pos");

    const b2bCustomer = {
      id: "demo-cust-b2b-01",
      name: "Skatepark De Kust BV",
      email: "boekhouding@skateparkdekust.be",
      phone: "+32 50 12 34 56",
      billingProfile: {
        type: "business",
        companyName: "Skatepark De Kust BV",
        vatNumber: "BE 0842.198.742",
        street: "Zeedijk 142",
        postalCode: "8370",
        city: "Blankenberge",
        country: "België"
      },
      loyaltyPoints: 340,
      createdAt: new Date().toISOString()
    };
    await db.customers.put(b2bCustomer);
    await useCustomers.getState().hydrate(true);
    store.linkCustomer(b2bCustomer.id);
  });

  await page.waitForTimeout(1000);
  const factuurButton = page.locator('button[title="Factuur opmaken"], button[aria-label="Factuur opmaken"]').first();
  if (await factuurButton.isVisible()) {
    await factuurButton.click();
    await page.waitForTimeout(1500);
  }

  const invoiceBuffer = await page.screenshot();
  const invoiceBase64 = invoiceBuffer.toString('base64');

  await renderComposedWindow(composeBrowser, {
    type: 'single',
    w: invW,
    h: invH,
    img: invoiceBase64,
    title: 'POS Kassa — Direct Factureren op Aanvraag & Barcode Retourflow',
    badge: 'DIRECT FACTUREREN & BARCODES',
    status: '● Instant PDF & 19-cijferige Scan',
    headerTag: 'Punt 2 · Direct Factureren & Barcode Scanner',
    headerText: 'Naadloze B2B/B2C Facturatie aan de Kassa & 19-cijferige Retourbarcodes',
    headerMeta: 'PDF Generatie On-The-Fly · Directe Klantenkoppeling',
    outputFilename: 'screenshot_2_invoicing_and_receipt_barcode.png'
  });

  // Close the invoice modal cleanly
  const closeBtn = page.locator('button:has(svg.lucide-x), button[aria-label="Sluiten"]').first();
  if (await closeBtn.isVisible()) {
    await closeBtn.click();
  } else {
    await page.keyboard.press("Escape");
  }
  await page.waitForTimeout(800);

  // ----------------------------------------------------
  // SCREENSHOT 3: SERVICE DESK & ONBOARDING WIZARD
  // ----------------------------------------------------
  console.log("📸 Generating Screenshot 3: Service Desk & Onboarding Wizard...");
  const srvW = 1440;
  const srvH = 920;
  const wizW = 880;
  const wizH = 920;

  await page.setViewportSize({ width: srvW, height: srvH });
  await page.locator('header button:has-text("Herstellingen")').click();
  await page.waitForTimeout(2000);

  const serviceDeskBuffer = await page.screenshot();
  const serviceDeskBase64 = serviceDeskBuffer.toString('base64');

  const wizardPage = await context.newPage();
  await wizardPage.setViewportSize({ width: wizW, height: wizH });
  await wizardPage.goto("http://localhost:3000/register");
  await wizardPage.waitForTimeout(2000);

  const vornameInput = wizardPage.locator('input[placeholder*="Voornaam"], input#reg-firstname, input[name="firstName"]').first();
  if (await vornameInput.isVisible()) {
    await vornameInput.fill("Kevin");
    await wizardPage.locator('input[placeholder*="Familienaam"], input#reg-lastname, input[name="lastName"]').first().fill("Webaanzee");
    await wizardPage.locator('input[placeholder*="Winkel"], input#reg-storename, input[name="storeName"]').first().fill("Pwayment Skateshop");
    await wizardPage.locator('input[type="email"]').first().fill(LOCAL_DEMO_EMAIL);
    await wizardPage.locator('input[type="password"]').first().fill(LOCAL_DEMO_PASSWORD);
    await wizardPage.locator('input[type="password"]').last().fill(LOCAL_DEMO_PASSWORD);
    const pinInput = wizardPage.locator('input[placeholder*="PIN"], input#reg-pin').first();
    if (await pinInput.isVisible()) await pinInput.fill("123456");
    const nextBtn = wizardPage.locator('button:has-text("Volgende"), button[type="submit"]').first();
    if (await nextBtn.isVisible()) await nextBtn.click();
    await wizardPage.waitForTimeout(2000);
  }

  const wizardBuffer = await wizardPage.screenshot();
  const wizardBase64 = wizardBuffer.toString('base64');
  await wizardPage.close();

  await renderComposedWindow(composeBrowser, {
    type: 'dual',
    w1: srvW,
    w2: wizW,
    h: srvH,
    img1: serviceDeskBase64,
    img2: wizardBase64,
    title1: 'Service Desk — Reparaties, Onderhoud & Order Tracking',
    title2: 'Adaptieve Onboarding Wizard — Snelle Winkelconfiguratie',
    badge1: 'SERVICE DESK',
    badge2: 'ONBOARDING WIZARD',
    status1: '● Live Reparatie Tracking',
    status2: '✨ Vraaggestuurde Setup',
    headerTag: 'Punt 3 · Service Desk & Onboarding',
    headerText: 'Werkplaats- & Reparatiebeheer gecombineerd met Vlotte Winkel-Onboarding',
    headerMeta: 'QR-Code Klanttracking · Directe Kassa-integratie',
    outputFilename: 'screenshot_3_servicedesk_and_onboarding.png'
  });

  // ----------------------------------------------------
  // SCREENSHOT 4: PERSONEELSBEHEER (WORKFORCE MANAGEMENT)
  // ----------------------------------------------------
  console.log("📸 Generating Screenshot 4: Personeelsbeheer (Workforce Management)...");
  const wfW = 1680;
  const wfH = 920;
  await page.setViewportSize({ width: wfW, height: wfH });
  await page.locator('header button:has-text("Personeel & verlof")').click();
  await page.waitForTimeout(2000);

  const workforceBuffer = await page.screenshot();
  const workforceBase64 = workforceBuffer.toString('base64');

  await renderComposedWindow(composeBrowser, {
    type: 'single',
    w: wfW,
    h: wfH,
    img: workforceBase64,
    title: 'Personeelsbeheer — Roosters, Verlof & Automatische Coverage Risico-analyse',
    badge: 'WORKFORCE & HR INTELLIGENCE',
    status: '● Live Bezetting & Competentie-check',
    headerTag: 'Punt 4 · Personeelsbeheer & Coverage Risico-analyse',
    headerText: 'Slimme Roosterplanning met Real-time Bezetting & Risico-indicatoren',
    headerMeta: 'Groen / Oranje / Rood Risico-algoritme · Kassa-competenties',
    outputFilename: 'screenshot_4_workforce_management.png'
  });

  // ----------------------------------------------------
  // SCREENSHOT 5: SUPERUSER PLATFORM ADMIN
  // ----------------------------------------------------
  console.log("📸 Generating Screenshot 5: Superuser Platform Admin...");
  const admW = 1680;
  const admH = 960;
  const adminPage = await context.newPage();
  await adminPage.setViewportSize({ width: admW, height: admH });
  await adminPage.goto("http://localhost:3000/admin");
  await adminPage.waitForTimeout(2000);

  const adminEmailInput = adminPage.locator('input[type="email"]').first();
  if (await adminEmailInput.isVisible()) {
    await adminEmailInput.fill(LOCAL_DEMO_EMAIL);
    await adminPage.locator('input[type="password"]').first().fill(LOCAL_DEMO_PASSWORD);
    await adminPage.locator('button[type="submit"]').first().click();
    await adminPage.waitForTimeout(3000);
  }

  const adminBuffer = await adminPage.screenshot();
  const adminBase64 = adminBuffer.toString('base64');
  await adminPage.close();

  await renderComposedWindow(composeBrowser, {
    type: 'single',
    w: admW,
    h: admH,
    img: adminBase64,
    title: 'Platform Console — Superuser Commandocentrale & Multi-Store Gezondheid',
    badge: 'SUPERUSER PLATFORM CONSOLE',
    status: '● Multi-Tenant Telemetrie',
    headerTag: 'Punt 5 · Superuser Platform Console',
    headerText: 'Centrale Commandocentrale voor Triage, Team Governance & Veilige Support',
    headerMeta: 'Real-time Health Monitoring · 60-minuten Read-Only Sessies',
    outputFilename: 'screenshot_5_platform_admin_console.png'
  });

  // ----------------------------------------------------
  // SCREENSHOT 6: INTEGRATION HUB & MIGRATION
  // ----------------------------------------------------
  console.log("📸 Generating Screenshot 6: Integration Hub & Autonomous Migration...");
  const intW = 1680;
  const intH = 1120;
  await page.setViewportSize({ width: intW, height: intH });
  await page.locator('header button:has-text("Integration Hub")').click();
  await page.waitForTimeout(1500);

  const testCaseBtn = page.locator('button:has-text("Laad volledige testzaak")').first();
  if (await testCaseBtn.isVisible()) {
    await testCaseBtn.click();
    await page.waitForTimeout(1500);
  }

  const integrationsBuffer = await page.screenshot();
  const integrationsBase64 = integrationsBuffer.toString('base64');

  await renderComposedWindow(composeBrowser, {
    type: 'single',
    w: intW,
    h: intH,
    img: integrationsBase64,
    title: 'Integration Hub — Universele Koppelingen voor Webshops, Boekhouding & Betalingen',
    badge: 'INTEGRATION HUB & MIGRATION',
    status: '● Universele Connectoren & Autonomous Migration',
    headerTag: 'Punt 6 · De Toekomst: Integration Hub',
    headerText: 'Naadloze Plug-and-Play Integraties zonder Technische Kennis',
    headerMeta: 'Shopify, WooCommerce, Exact, Yuki, Mollie, SumUp & Autonomous Migration',
    outputFilename: 'screenshot_6_integration_hub.png'
  });

  await browser.close();
  await composeBrowser.close();
  console.log("🎉 All 6 screenshots re-generated with 100% natural resolution and zero cropping!");
})();
