import { addProduct, expect, openApp, test, unlockPos } from "./fixtures";

test("desktop cart starts compact, opens beside the catalog and remembers pinning", async ({
  appPage,
}) => {
  await openApp(appPage);

  const compactCart = appPage.getByRole("complementary", {
    name: "Compacte winkelwagen",
  });
  await expect(compactCart).toBeVisible();
  await expect(
    appPage.getByRole("heading", { name: "Winkelwagen" }),
  ).toBeHidden();
  const compactColumnCount = await appPage
    .locator(".pos-product-grid-layout")
    .evaluate((grid) => getComputedStyle(grid).gridTemplateColumns.split(" ").length);
  expect(compactColumnCount).toBeGreaterThanOrEqual(4);

  await addProduct(appPage, /Allen Hardware Bolts 1 inch/);
  const productFlight = appPage.locator(".pos-cart-flight");
  await expect(productFlight).toContainText("Allen Hardware Bolts 1 inch");
  await expect(productFlight).toContainText("€ 5,95");
  await expect(productFlight).toBeHidden();
  await expect(
    appPage.getByRole("button", {
      name: "Winkelwagen openen, 1 artikel, € 5,95",
    }),
  ).toBeVisible();

  const cartOpener = appPage.getByRole("button", { name: /Winkelwagen openen/ });
  const openerBox = await cartOpener.boundingBox();
  expect(openerBox).not.toBeNull();
  await cartOpener.click({ position: { x: openerBox!.width / 2, y: openerBox!.height - 18 } });
  await expect(
    appPage.getByRole("heading", { name: "Winkelwagen" }),
  ).toBeVisible();
  await expect(compactCart).toBeHidden();
  await appPage.waitForTimeout(280);
  const openColumnCount = await appPage
    .locator(".pos-product-grid-layout")
    .evaluate((grid) => getComputedStyle(grid).gridTemplateColumns.split(" ").length);
  expect(openColumnCount).toBeLessThan(compactColumnCount);
  const panelRightEdge = await appPage
    .getByRole("region", { name: "Winkelwagen" })
    .evaluate((panel) => panel.getBoundingClientRect().right);
  expect(panelRightEdge).toBe(await appPage.evaluate(() => innerWidth));

  await appPage
    .getByRole("button", { name: "Winkelwagen vastzetten" })
    .click();
  await expect(compactCart).toBeHidden();
  await expect(
    appPage.getByRole("button", { name: "Winkelwagen losmaken" }),
  ).toBeVisible();

  await appPage.reload();
  await unlockPos(appPage);
  await expect(
    appPage.getByRole("button", { name: "Winkelwagen losmaken" }),
  ).toBeVisible();

  await appPage
    .getByRole("button", { name: "Winkelwagen losmaken" })
    .click();
  await expect(compactCart).toBeHidden();
  await appPage
    .getByRole("button", { name: "Winkelwagen sluiten", exact: true })
    .click();
  await expect(
    appPage.getByRole("heading", { name: "Winkelwagen" }),
  ).toBeHidden();
  await expect(compactCart).toBeVisible();
});
