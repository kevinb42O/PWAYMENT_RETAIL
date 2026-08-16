import {
  CUSTOMER_DISPLAY_SESSION_STORAGE_KEY,
} from "../src/customer-display/localSession";
import { addProduct, expect, openApp, test } from "./fixtures";

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

  await addProduct(appPage, /Allen Hardware Bolts 1 inch/);
  await expect(
    displayPage.getByRole("heading", {
      name: "Allen Hardware Bolts 1 inch",
    }),
  ).toBeVisible();
  await expect(displayPage.getByText("€ 5,95").last()).toBeVisible();

  await appPage.getByRole("button", { name: "Kaart", exact: true }).click();
  await expect(
    displayPage.getByRole("heading", { name: "Bedankt voor je aankoop" }),
  ).toBeVisible();
  await expect(displayPage.getByText("€ 5,95")).toBeVisible();

  await displayPage.close();
});
