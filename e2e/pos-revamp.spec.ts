import AxeBuilder from "@axe-core/playwright";
import { addProduct, expect, openApp, openDesktopCart, test, unlockPos } from "./fixtures";

test("catalog view, category drilldown and live cart quantities remain in sync", async ({ appPage }) => {
  await openApp(appPage);
  const product = appPage.locator(".pos-product-card").filter({ hasText: "Allen Hardware Bolts 1 inch" });
  await expect(appPage.locator(".pos-product-card svg, .pos-product-card img")).toHaveCount(0);
  await expect(appPage.locator(".pos-cart-dock")).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(appPage.locator(".pos-product-title").first()).toHaveCSS("color", "rgb(15, 23, 42)");
  await addProduct(appPage, /Allen Hardware Bolts 1 inch/, 2);
  await expect(product.locator(".pos-product-in-cart")).toHaveText("2 in mandje");
  await expect(product.locator("svg, img")).toHaveCount(0);
  await openDesktopCart(appPage);
  await appPage.getByRole("button", { name: "Aantal Allen Hardware Bolts 1 inch verhogen" }).click();
  await expect(product.locator(".pos-product-in-cart")).toHaveText("3 in mandje");

  await appPage.getByRole("button", { name: "Lijstweergave", exact: true }).click();
  await expect(appPage.locator(".pos-product-grid-layout")).toHaveClass(/--list/);
  await appPage.reload();
  await unlockPos(appPage);
  await expect(appPage.getByRole("button", { name: "Lijstweergave", exact: true })).toHaveAttribute("aria-pressed", "true");

  await appPage.locator(".pos-category-rail").getByRole("button", { name: /^Kledij/ }).click();
  const subcategories = appPage.getByRole("group", { name: "Subcategorieën" });
  await subcategories.getByRole("button", { name: /^Broeken/ }).click();
  await expect(appPage.getByRole("heading", { name: /^Broeken/ })).toBeVisible();
  await expect(appPage.locator(".pos-product-category-badge").first()).toHaveText("Broeken");
  await expect(appPage.locator(".pos-product-grid-layout")).toHaveCSS("grid-template-columns", /\d/);
});

test("availability filter removes sold-out items without changing search or cart", async ({ appPage }) => {
  await openApp(appPage);
  await appPage.getByRole("button", { name: /Toon volgende/ }).click();
  await appPage.getByRole("button", { name: /Toon volgende/ }).click();
  const allCount = await appPage.locator(".pos-product-card").count();
  const unavailableCount = await appPage.locator(".pos-product-card:disabled").count();
  await appPage.getByRole("button", { name: "Op voorraad", exact: true }).click();
  await expect(appPage.getByRole("button", { name: "Op voorraad", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(appPage.locator(".pos-product-card:disabled")).toHaveCount(0);
  await expect(appPage.locator(".pos-result-count")).toHaveText(String(allCount - unavailableCount));
  await appPage.getByRole("searchbox", { name: "Scan barcode of zoek product" }).fill("Allen Hardware Bolts");
  await expect(appPage.locator(".pos-product-card")).toHaveCount(1);
  await appPage.locator(".pos-product-card").click();
  await expect(appPage.locator(".pos-product-in-cart")).toHaveText("1 in mandje");
});

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }, { width: 768, height: 600 }]) {
  test(`catalog fits and stays accessible at ${viewport.width} × ${viewport.height}`, async ({ appPage }) => {
    await appPage.setViewportSize(viewport);
    await openApp(appPage);
    const toolbarHeight = await appPage.locator(".pos-catalog-toolbar").evaluate((toolbar) => toolbar.getBoundingClientRect().height);
    expect(toolbarHeight).toBeLessThanOrEqual(viewport.width >= 1440 ? 64 : 104);
    // Baseline before the visual simplification: never trade product density for whitespace.
    const minimumVisibleProducts = viewport.width === 1440 ? 20 : viewport.width === 390 ? 6 : 3;
    await expect.poll(() => appPage.locator(".pos-product-grid").evaluate((grid) => {
      const viewport = grid.getBoundingClientRect();
      return Array.from(grid.querySelectorAll(".pos-product-card")).filter((card) => {
        const rect = card.getBoundingClientRect();
        return rect.height > 0 && rect.top >= viewport.top && rect.bottom <= viewport.bottom;
      }).length;
    })).toBeGreaterThanOrEqual(minimumVisibleProducts);
    await expect(appPage.locator(".pos-product-card svg, .pos-product-card img")).toHaveCount(0);
    expect(await appPage.locator(".pos-category-rail .pos-rail-icon").count()).toBeGreaterThan(1);
    await expect(appPage.locator(".pos-product-title").first()).toHaveCSS("font-size", viewport.width < 640 ? "16px" : "18px");
    await expect(appPage.locator(".pos-product-price").first()).toHaveCSS("font-size", viewport.width < 640 ? "19px" : "20px");
    await expect(appPage.locator(".pos-product-price").first()).toHaveCSS("font-weight", "750");
    await expect(appPage.locator(".pos-product-meta").first()).toHaveCSS("font-size", "13px");
    await expect(appPage.locator(".pos-product-stock").first()).toHaveCSS("font-size", "12px");
    await expect(appPage.locator(".pos-product-category-badge").first()).toHaveCSS("font-size", "12px");
    await expect(appPage.locator(".pos-product-category-badge").first()).toHaveCSS("text-transform", "uppercase");
    await expect(appPage.locator(".pos-product-footer").first()).toHaveCSS("border-top-color", "rgb(226, 232, 240)");
    for (const view of ["Rasterweergave", "Lijstweergave"]) {
      await appPage.getByRole("button", { name: view, exact: true }).click();
      const geometry = await appPage.locator(".pos-product-card").first().evaluate((card) => {
        const footer = card.querySelector(".pos-product-footer")!;
        const category = card.querySelector(".pos-product-category-badge")!;
        const title = card.querySelector(".pos-product-title")!;
        return {
          documentFits: document.documentElement.scrollWidth <= innerWidth,
          cardFits: card.scrollWidth <= card.clientWidth,
          footerFits: footer.scrollWidth <= footer.clientWidth,
          categoryFits: category.scrollWidth <= category.clientWidth,
          categoryAboveTitle: category.getBoundingClientRect().bottom <= title.getBoundingClientRect().top,
        };
      });
      expect(geometry).toEqual({ documentFits: true, cardFits: true, footerFits: true, categoryFits: true, categoryAboveTitle: true });
      const namesFit = await appPage.locator(".pos-product-title").evaluateAll((names) => names.every((name) => name.scrollWidth <= name.clientWidth && name.scrollHeight <= name.clientHeight + 1 && getComputedStyle(name).webkitLineClamp === "none"));
      expect(namesFit, "Product names remain fully readable without clipping or line clamping").toBe(true);
    }
    const accessibility = await new AxeBuilder({ page: appPage }).include(".pos-catalog").withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(accessibility.violations).toEqual([]);
    await appPage.getByRole("button", { name: "Profiel en instellingen" }).click();
    await appPage.getByRole("switch", { name: "Schakel naar donkere modus" }).click();
    await appPage.getByRole("button", { name: "Profiel en instellingen" }).click();
    await appPage.getByRole("button", { name: "Rasterweergave", exact: true }).click();
    const darkAccessibility = await new AxeBuilder({ page: appPage }).include(".pos-catalog").withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(darkAccessibility.violations).toEqual([]);
  });
}

for (const theme of ["light", "dark"]) {
  test(`product hover uses the existing brand accent in ${theme} mode`, async ({ appPage }) => {
    await openApp(appPage);
    if (theme === "dark") {
      await appPage.getByRole("button", { name: "Profiel en instellingen" }).click();
      await appPage.getByRole("switch", { name: "Schakel naar donkere modus" }).click();
      await appPage.getByRole("button", { name: "Profiel en instellingen" }).click();
    }
    const product = appPage.locator(".pos-product-card:not(:disabled)").first();
    const background = theme === "dark" ? "rgb(16, 57, 92)" : "rgb(240, 249, 255)";
    const border = theme === "dark" ? "rgb(35, 113, 170)" : "rgb(186, 230, 253)";
    for (const view of ["Rasterweergave", "Lijstweergave"]) {
      await appPage.getByRole("button", { name: view, exact: true }).click();
      const restingBackground = await product.evaluate((element) => getComputedStyle(element).backgroundColor);
      const restingGeometry = await product.boundingBox();
      await product.hover();
      await expect(product).toHaveCSS("background-color", background);
      await expect(product).toHaveCSS("border-color", border);
      expect(await product.boundingBox()).toEqual(restingGeometry);
      await expect(product.locator("svg, img")).toHaveCount(0);
      await appPage.getByRole("searchbox", { name: "Scan barcode of zoek product" }).hover();
      await expect(product).toHaveCSS("background-color", restingBackground);
    }
  });

  test(`compact checkout has a centered basket and full-rail brand hover in ${theme} mode`, async ({ appPage }) => {
    await openApp(appPage);
    if (theme === "dark") {
      await appPage.getByRole("button", { name: "Profiel en instellingen" }).click();
      await appPage.getByRole("switch", { name: "Schakel naar donkere modus" }).click();
      await appPage.getByRole("button", { name: "Profiel en instellingen" }).click();
    }
    const opener = appPage.getByRole("button", { name: /Winkelwagen openen/ });
    const summary = opener.locator(".pos-cart-dock-summary");
    const background = theme === "dark" ? "rgb(16, 57, 92)" : "rgb(240, 249, 255)";
    await expect(summary).toBeVisible();
    await expect(opener.locator(".pos-cart-dock-handle")).toHaveCount(0);
    await expect(opener.locator(".pos-cart-dock-count")).toHaveText("0 items");
    const expectCenteredBasket = async () => {
      const rail = (await opener.boundingBox())!;
      const basket = (await summary.boundingBox())!;
      expect(Math.abs(basket.x + basket.width / 2 - rail.x - rail.width / 2)).toBeLessThan(1);
      expect(Math.abs(basket.y + basket.height / 2 - rail.y - rail.height / 2)).toBeLessThan(1);
      await expect(summary.locator("svg")).toHaveCount(1);
    };
    await expectCenteredBasket();
    await addProduct(appPage, /Allen Hardware Bolts 1 inch/);
    await expect(opener.locator(".pos-cart-dock-count")).toHaveText("1 item");
    await addProduct(appPage, /Allen Hardware Bolts 1 inch/);
    await expect(appPage.locator(".pos-cart-flight")).toHaveCount(0);
    await expect(opener.locator(".pos-cart-dock-count")).toHaveText("2 items");
    await expectCenteredBasket();
    const product = appPage.locator(".pos-product-card").filter({ hasText: "Allen Hardware Bolts 1 inch" });
    await expect(product.locator(".pos-product-title")).toHaveText("Allen Hardware Bolts 1 inch");
    await expect(product.locator(".pos-product-context .pos-product-in-cart")).toHaveText("2 in mandje");

    const stillSurfaces = opener.locator(".pos-cart-dock-summary, .pos-cart-dock-total, .pos-cart-dock-total-value");
    const readAppearance = () => stillSurfaces.evaluateAll((elements) => elements.map((element) => {
      const css = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return { color: css.color, background: css.background, shadow: css.boxShadow, transform: css.transform, x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    }));
    const before = await readAppearance();
    // Empty top, central basket and total all activate the same full-height surface.
    const rail = (await opener.boundingBox())!;
    for (const y of [8, rail.height / 2, rail.height - 8]) {
      await opener.hover({ position: { x: rail.width / 2, y } });
      await expect(opener).toHaveCSS("background-color", background);
    }
    await expect(opener).toHaveCSS("box-shadow", "none");
    expect(await readAppearance()).toEqual(before);
    for (const surface of await stillSurfaces.all()) await expect(surface).toHaveCSS("transform", "none");

    await appPage.getByRole("searchbox", { name: "Scan barcode of zoek product" }).hover();
    await expect(opener).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    // Switch to keyboard modality: programmatic focus after a click is not :focus-visible.
    await appPage.keyboard.press("Tab");
    await opener.focus();
    await expect(opener).toHaveCSS("background-color", background);
    await expect(opener).toHaveCSS("outline-style", "solid");
    await appPage.emulateMedia({ reducedMotion: "reduce" });
    await expect(opener).toHaveCSS("transition-duration", "0s");
    await expect(summary.locator("svg")).toHaveCSS("transform", "none");
    const accessibility = await new AxeBuilder({ page: appPage }).include(".pos-cart-dock").withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(accessibility.violations).toEqual([]);
    await appPage.keyboard.press("Enter");
    await expect(appPage.getByRole("heading", { name: "Winkelwagen" })).toBeVisible();
    await expect(opener).toBeHidden();
  });
}