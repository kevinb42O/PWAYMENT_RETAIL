import {
  CUSTOMER_DISPLAY_SESSION_STORAGE_KEY,
} from "../src/customer-display/localSession";
import { addProduct, expect, openApp, openDesktopCart, test } from "./fixtures";

const enabledConfig = {
  enabled: true,
  idleHeadline: "Welkom bij de testwinkel",
  idleMessage: "Uw aankoop verschijnt hier meteen.",
  accentColor: "#0891b2",
  showClock: true,
  showVatBreakdown: true,
  showPaymentMethods: true,
  thankYouDurationSeconds: 8,
  acceptedPaymentMethods: ["cash", "card", "gift-card"],
};

test("owner can opt in and open the module from Hardware settings", async ({
  appPage,
}) => {
  await openApp(appPage);
  await appPage
    .getByRole("button", { name: "Profiel en instellingen" })
    .click();
  await appPage.getByRole("menuitem", { name: "Instellingen" }).click();
  await appPage.getByRole("button", { name: "Hardware" }).click();
  await appPage.getByRole("button", { name: "Klantenscherm" }).click();

  await expect(
    appPage.getByRole("heading", { name: "Klantenscherm", exact: true }),
  ).toBeVisible();
  const moduleSwitch = appPage.getByRole("switch", {
    name: "Klantenscherm inschakelen",
  });
  await expect(moduleSwitch).toHaveAttribute("aria-checked", "false");
  await moduleSwitch.click();
  await expect(moduleSwitch).toHaveAttribute("aria-checked", "true");

  const popupPromise = appPage.waitForEvent("popup");
  await appPage
    .getByRole("button", { name: "Open lokaal klantenscherm" })
    .click();
  const displayPage = await popupPromise;
  await expect(
    displayPage.getByRole("heading", { name: "Welkom" }),
  ).toBeVisible();
  await expect(appPage.getByText("Live verbonden")).toBeVisible();
  await displayPage.close();
});

test("cashier can open an enabled customer display from cart actions", async ({
  appPage,
}) => {
  await appPage.addInitScript((config) => {
    localStorage.setItem(
      "pwayment:customer-display-settings-v1",
      JSON.stringify({
        state: { configsByStore: { __local__: config } },
        version: 1,
      }),
    );
  }, enabledConfig);
  await openApp(appPage);
  await openDesktopCart(appPage);

  await appPage
    .getByRole("button", { name: "Winkelwagenacties" })
    .click();
  const openDisplay = appPage.getByRole("menuitem", {
    name: "Open klantenscherm",
  });
  await expect(openDisplay).toBeEnabled();

  const popupPromise = appPage.waitForEvent("popup");
  await openDisplay.click();
  const displayPage = await popupPromise;
  await expect(
    displayPage.getByRole("heading", { name: "Welkom bij de testwinkel" }),
  ).toBeVisible();

  // The Cart action must start the same live connection that remains observable
  // in the existing hardware module; it is not a detached preview window.
  await appPage
    .getByRole("button", { name: "Profiel en instellingen" })
    .click();
  await appPage.getByRole("menuitem", { name: "Instellingen" }).click();
  await appPage.getByRole("button", { name: "Hardware" }).click();
  await appPage.getByRole("button", { name: "Klantenscherm" }).click();
  await expect(appPage.getByText("Live verbonden")).toBeVisible();

  await displayPage.close();
});

test("customer display follows the local cart and committed payment", async ({
  appPage,
  context,
}) => {
  await appPage.addInitScript((config) => {
    localStorage.setItem(
      "pwayment:customer-display-settings-v1",
      JSON.stringify({
        state: { configsByStore: { __local__: config } },
        version: 1,
      }),
    );
  }, enabledConfig);
  await openApp(appPage);

  const sessionId = await appPage.evaluate(
    (storageKey) => sessionStorage.getItem(storageKey),
    CUSTOMER_DISPLAY_SESSION_STORAGE_KEY,
  );
  expect(sessionId).toBeTruthy();

  const displayPage = await context.newPage();
  await displayPage.goto(`/customer-display#session=${sessionId}`);
  await expect(
    displayPage.getByRole("heading", { name: "Welkom bij de testwinkel" }),
  ).toBeVisible();
  await expect(displayPage.getByText("Kaart")).toBeVisible();
  await expect(displayPage.locator(".customer-display-idle-card")).toHaveCSS(
    "color",
    "rgb(255, 255, 255)",
  );
  await expect(
    displayPage.locator(".customer-display-payment-method").first(),
  ).toHaveCSS("border-radius", "0px");

  await addProduct(appPage, /Allen Hardware Bolts 1 inch/);
  await expect(
    displayPage.getByRole("heading", {
      name: "Allen Hardware Bolts 1 inch",
    }),
  ).toBeVisible();
  await expect(displayPage.getByText("€ 5,95").last()).toBeVisible();

  await openDesktopCart(appPage);
  await appPage.getByRole("button", { name: "Kaart", exact: true }).click();
  await expect(
    displayPage.getByRole("heading", { name: "Bedankt voor je aankoop" }),
  ).toBeVisible();
  await expect(displayPage.getByText("€ 5,95")).toBeVisible();

  await displayPage.close();
});

test("customer display keeps the amount due visible and rejects inconsistent money", async ({
  context,
}) => {
  const sessionId = "financial-display-session-123456";
  const displayPage = await context.newPage();
  await displayPage.goto(`/customer-display#session=${sessionId}`);
  await expect(
    displayPage.getByRole("heading", { name: "Klantenscherm wordt gestart" }),
  ).toBeVisible();
  await displayPage.waitForTimeout(100);

  const snapshot = {
    protocolVersion: 1,
    storeId: "store-test",
    registerId: "register-test",
    displaySessionId: sessionId,
    cartSessionId: "cart-session-1234567890",
    epochId: "display-epoch-1234567890",
    revision: 1,
    emittedAt: Date.now(),
    phase: "payment-pending",
    merchant: { displayName: "Testwinkel", locale: "nl-BE", currency: "EUR" },
    presentation: {
      idleHeadline: "Welkom",
      idleMessage: "",
      accentColor: "#ffff00",
      showClock: false,
      showVatBreakdown: false,
      showPaymentMethods: false,
    },
    lines: [{
      lineId: "line-1",
      name: "Testproduct",
      modifierLabels: [],
      quantity: 1,
      unitPriceCents: 595,
      lineTotalCents: 595,
    }],
    totals: {
      subtotalCents: 595,
      discountCents: 0,
      giftCardCents: 0,
      totalCents: 595,
      remainingCents: 595,
      vat12Cents: 0,
      vat21Cents: 103,
      vatBreakdown: [{ rate: 21, vatCents: 103 }],
    },
    payment: { method: "card", messageCode: "follow-terminal" },
    acceptedPaymentMethods: [],
  };

  await displayPage.evaluate(async ({ channelName, value }) => {
    const channel = new BroadcastChannel(channelName);
    channel.postMessage({ type: "SNAPSHOT", snapshot: value });
    await new Promise((resolve) => setTimeout(resolve, 100));
    channel.close();
  }, {
    channelName: `pwayment:customer-display:${sessionId}`,
    value: snapshot,
  });

  await expect(displayPage.getByText("Nog te betalen")).toBeVisible();
  await expect(displayPage.getByText("€ 5,95").last()).toBeVisible();
  await expect(displayPage.getByText("Volg de betaalterminal")).toBeVisible();

  await displayPage.evaluate(async ({ channelName, value }) => {
    const channel = new BroadcastChannel(channelName);
    channel.postMessage({
      type: "SNAPSHOT",
      snapshot: {
        ...value,
        revision: 2,
        totals: { ...value.totals, subtotalCents: 594 },
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    channel.close();
  }, {
    channelName: `pwayment:customer-display:${sessionId}`,
    value: snapshot,
  });

  await expect(
    displayPage.getByRole("heading", { name: "We controleren de kassabedragen" }),
  ).toBeVisible();
  await expect(displayPage.getByText("€ 5,95")).toHaveCount(0);
});
