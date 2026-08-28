import { expect, readStore, test } from "./fixtures";
import type { Page } from "@playwright/test";

interface StoredProduct { id: string; name: string; sku?: string; barcode?: string; stockQty?: number }

test.describe.configure({ timeout: 60_000 });

const firstTrackedProduct = async (page: Parameters<typeof readStore>[0]) => {
  const products = await readStore<StoredProduct>(page, "products");
  const product = products.find((row) => row.stockQty != null && row.stockQty >= 3 && (row.barcode || row.sku));
  if (!product) throw new Error("E2E fixture mist een scanbaar voorraadproduct.");
  return product;
};

const openInventoryFixture = async (page: Page) => {
  await page.goto("/app?e2e=1");
  await expect(page.getByRole("searchbox", { name: "Scan barcode of zoek product" })).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".pos-product-card").first()).toBeVisible({ timeout: 20_000 });
};

test("inventory workspace selects a SKU and previews delivery, count and correction semantics", async ({ appPage }) => {
  await openInventoryFixture(appPage);
  const product = await firstTrackedProduct(appPage);
  await appPage.getByRole("button", { name: "Voorraad", exact: true }).click();
  await expect(appPage.getByRole("heading", { name: "Scannen, boeken, klaar" })).toBeVisible();
  const search = appPage.getByLabel("Scan barcode of zoek product");
  await search.fill(product.barcode || product.sku!);
  await search.press("Enter");
  await expect(appPage.getByRole("heading", { name: product.name })).toBeVisible();
  await expect(appPage.getByText("Nieuwe voorraad").locator("..").getByText(String(product.stockQty! + 1), { exact: true })).toBeVisible();

  await appPage.getByRole("button", { name: /Telling Werkelijk aantal/ }).click();
  await appPage.getByRole("spinbutton", { name: "Werkelijk geteld aantal" }).fill("2");
  await expect(appPage.getByText("Nieuwe voorraad").locator("..").getByText("2", { exact: true })).toBeVisible();

  await appPage.getByRole("button", { name: /Correctie Schade/ }).click();
  await appPage.getByRole("spinbutton", { name: "Correctie (+ of −)" }).fill("-2");
  await expect(appPage.getByText("Nieuwe voorraad").locator("..").getByText(String(product.stockQty! - 2), { exact: true })).toBeVisible();
});

test("owner can disable inventory and direct navigation cannot bypass the module gate", async ({ appPage }) => {
  await openInventoryFixture(appPage);
  const topNavigation = appPage.locator("nav").first();
  await expect(topNavigation.getByRole("button", { name: "Voorraad" })).toBeVisible();
  await appPage.getByRole("button", { name: "Profiel en instellingen" }).click();
  await appPage.getByRole("menuitem", { name: "Modules & navigatie" }).click();
  await appPage.getByRole("switch", { name: "Voorraad uitschakelen" }).click();
  await expect(topNavigation.getByRole("button", { name: "Voorraad" })).toHaveCount(0);

  await appPage.goto("/app?e2e=1&view=inventory");
  await expect(appPage.getByRole("heading", { name: "Scannen, boeken, klaar" })).toHaveCount(0);
  await expect(appPage.getByRole("searchbox", { name: "Scan barcode of zoek product" })).toBeVisible();

  await appPage.getByRole("button", { name: "Profiel en instellingen" }).click();
  await appPage.getByRole("menuitem", { name: "Modules & navigatie" }).click();
  await appPage.getByRole("switch", { name: "Voorraad inschakelen" }).click();
  await expect(topNavigation.getByRole("button", { name: "Voorraad" })).toBeVisible();
});

test("persistent batch session validates CSV before any stock is booked", async ({ appPage }) => {
  await openInventoryFixture(appPage);
  const product = await firstTrackedProduct(appPage);
  await appPage.getByRole("button", { name: "Voorraad", exact: true }).click();
  await appPage.getByText("CSV preview").locator("input[type=file]").setInputFiles({
    name: "telling.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(`sku;aantal;notitie\n${product.sku || product.barcode};6;cyclustelling`),
  });
  await expect(appPage.getByText(/1 regels gevalideerd/)).toBeVisible();
  await expect(appPage.getByRole("heading", { name: /Actieve sessie/ })).toBeVisible();
  await expect(appPage.getByRole("button", { name: /Verwerk 1 SKU/ })).toBeVisible();

  await appPage.reload();
  await expect(appPage.locator(".pos-product-card").first()).toBeVisible({ timeout: 20_000 });
  await appPage.getByRole("button", { name: "Voorraad", exact: true }).click();
  await expect(appPage.getByRole("heading", { name: /Actieve sessie · 1 SKU/ })).toBeVisible();
  await expect(appPage.getByRole("spinbutton", { name: new RegExp(`Sessieaantal voor ${product.name}`) })).toHaveValue("6");
});
