import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, openApp, test } from "./fixtures";

const expectNoSeriousAccessibilityViolations = async (
  page: Page,
  viewName: string,
): Promise<void> => {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  const blocking = result.violations.filter(
    (violation) =>
      violation.impact === "serious" || violation.impact === "critical",
  );
  expect(blocking, `${viewName}: serious/critical WCAG violations`).toEqual([]);
};

test("primary desktop views have no serious or critical WCAG violations", async ({
  appPage,
}) => {
  await openApp(appPage);
  await expectNoSeriousAccessibilityViolations(appPage, "Kassa");

  const views = [
    { navigation: "Dagafsluiting", heading: "Alles is bijgewerkt" },
    { navigation: "Historiek", heading: "Verkoopgeschiedenis" },
    { navigation: "Klanten", heading: "Klantenbeheer" },
    { navigation: "Inzichten", heading: "Acties vandaag" },
  ];

  for (const view of views) {
    await appPage
      .getByRole("button", { name: view.navigation, exact: true })
      .click();
    await expect(
      appPage.getByRole("heading", { name: view.heading }),
    ).toBeVisible();
    await expectNoSeriousAccessibilityViolations(appPage, view.navigation);
  }
});

test("customer modal traps focus, closes with Escape and restores focus", async ({
  appPage,
}) => {
  await openApp(appPage);
  await appPage.getByRole("button", { name: "Klanten", exact: true }).click();
  const trigger = appPage.getByRole("button", {
    name: "Nieuwe klant",
    exact: true,
  });
  await trigger.click();

  const dialog = appPage.getByRole("dialog", { name: "Nieuwe klant" });
  await expect(dialog).toBeVisible();
  await expect
    .poll(() =>
      appPage.evaluate(() =>
        Boolean(
          document
            .querySelector('[role="dialog"]')
            ?.contains(document.activeElement),
        ),
      ),
    )
    .toBe(true);

  for (let index = 0; index < 12; index += 1) {
    await appPage.keyboard.press("Tab");
    expect(
      await appPage.evaluate(() =>
        Boolean(
          document
            .querySelector('[role="dialog"]')
            ?.contains(document.activeElement),
        ),
      ),
    ).toBe(true);
  }

  await appPage.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});
