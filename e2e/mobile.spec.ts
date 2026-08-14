import AxeBuilder from "@axe-core/playwright";
import { addProduct, expect, openApp, test } from "./fixtures";

const nextSummerMonday = (): string => {
  const date = new Date(new Date().getFullYear() + 1, 6, 1, 12, 0, 0, 0);
  date.setDate(date.getDate() + ((8 - date.getDay()) % 7));
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

test("mobile catalog, cart and navigation remain usable without page overflow", async ({
  appPage,
}) => {
  await openApp(appPage);
  await expect(appPage.locator(".pos-product-card")).toHaveCount(40);
  await expect(
    appPage.getByRole("button", { name: /Toon volgende 40 van 93 producten/ }),
  ).toBeVisible();
  await addProduct(appPage, /Allen Hardware Bolts 1 inch/);
  await appPage.getByRole("button", { name: /^Kassa 1$/ }).click();
  await expect(
    appPage.getByRole("heading", { name: "Winkelwagen" }),
  ).toBeVisible();
  await expect(
    appPage.getByRole("button", {
      name: "Aantal Allen Hardware Bolts 1 inch verlagen",
    }),
  ).toBeDisabled();
  await appPage
    .getByRole("button", {
      name: "Aantal Allen Hardware Bolts 1 inch verhogen",
    })
    .click();
  await expect(appPage.getByText("2", { exact: true }).last()).toBeVisible();

  const hasPageOverflow = await appPage.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  );
  expect(hasPageOverflow).toBe(false);

  await appPage.getByRole("button", { name: "Navigatie openen" }).click();
  await appPage.getByRole("menuitem", { name: "Historiek" }).click();
  await expect(
    appPage.getByRole("heading", { name: "Verkoopgeschiedenis" }),
  ).toBeVisible();
  await appPage.getByRole("button", { name: "Navigatie openen" }).click();
  await appPage.getByRole("menuitem", { name: "Inzichten" }).click();
  await expect(
    appPage.getByRole("heading", { name: "Acties vandaag" }),
  ).toBeVisible();

  const accessibility = await new AxeBuilder({ page: appPage })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  const serious = accessibility.violations.filter(
    (violation) =>
      violation.impact === "serious" || violation.impact === "critical",
  );
  expect(serious).toEqual([]);
});

test("mobile annual workforce planner opens a future leave request", async ({ appPage }) => {
  await openApp(appPage);
  await appPage.getByRole("button", { name: "Navigatie openen" }).click();
  await appPage.getByRole("menuitem", { name: "Personeel & verlof" }).click();
  await appPage.getByRole("button", { name: "Jaar", exact: true }).click();
  await appPage.getByRole("button", { name: "Volgende jaar" }).click();

  const start = nextSummerMonday();
  await expect(appPage.getByRole("region", { name: `Jaarplanning ${start.slice(0, 4)}` })).toBeVisible();
  await appPage.locator(`[data-date="${start}"]`).click();
  await expect(appPage.getByRole("dialog", { name: "Verlof aanvragen" }).getByLabel("Van")).toHaveValue(start);

  const hasPageOverflow = await appPage.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(hasPageOverflow).toBe(false);
});
