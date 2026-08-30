import { expect, test as base, type Page } from "@playwright/test";

type AppFixtures = {
  appPage: Page;
};

export const test = base.extend<AppFixtures>({
  appPage: async ({ page }, use) => {
    const browserIssues: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error" || message.type() === "warning") {
        browserIssues.push(`${message.type()}: ${message.text()}`);
      }
    });
    page.on("pageerror", (error) =>
      browserIssues.push(`pageerror: ${error.message}`),
    );

    await use(page);

    expect(browserIssues, "browser console/page errors").toEqual([]);
  },
});

export { expect } from "@playwright/test";

export const openApp = async (page: Page): Promise<void> => {
  await page.goto("/app?e2e=1");
  await expect(
    page.getByRole("searchbox", { name: "Scan barcode of zoek product" }),
  ).toBeVisible();
  await expect(page.locator(".pos-product-card").first()).toBeVisible();
};

export const addProduct = async (
  page: Page,
  accessibleName: RegExp,
  quantity = 1,
): Promise<void> => {
  const product = page.getByRole("button", { name: accessibleName }).first();
  await expect(product).toBeEnabled();
  for (let index = 0; index < quantity; index += 1) await product.click();
};

export const openDesktopCart = async (page: Page): Promise<void> => {
  const opener = page.getByRole("button", { name: /Winkelwagen openen/ });
  if (await opener.isVisible()) await opener.click();
  await expect(page.getByRole("heading", { name: "Winkelwagen" })).toBeVisible();
};

export const checkoutPin = async (page: Page): Promise<void> => {
  await openDesktopCart(page);
  await page.getByRole("button", { name: "Kaart", exact: true }).click();
  await expect(page.getByText("Betaling gelukt")).toBeVisible();
};

export const closeReceipt = async (page: Page): Promise<void> => {
  await page.getByRole("button", { name: "Sluiten", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /Winkelwagen openen, 0 artikelen/ }),
  ).toBeVisible();
};

export const readStore = async <T>(
  page: Page,
  storeName: string,
): Promise<T[]> =>
  page.evaluate(
    ({ databaseName, targetStore }) =>
      new Promise<T[]>((resolve, reject) => {
        const request = indexedDB.open(databaseName);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction(targetStore, "readonly");
          const all = transaction.objectStore(targetStore).getAll();
          all.onerror = () => reject(all.error);
          all.onsuccess = () => resolve(all.result as T[]);
          transaction.oncomplete = () => database.close();
        };
      }),
    { databaseName: "PwaymentRetailPOS", targetStore: storeName },
  );
