import { expect, openApp, test } from "./fixtures";

const nextMondayAndTuesday = (): { start: string; end: string } => {
  const start = new Date();
  start.setHours(12, 0, 0, 0);
  const daysUntilMonday = ((8 - start.getDay()) % 7) || 7;
  start.setDate(start.getDate() + daysUntilMonday);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
};

const openWorkforce = async (page: Parameters<typeof openApp>[0]) => {
  await openApp(page);
  await page.getByRole("button", { name: "Personeel & verlof", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Rooster", exact: true })).toBeVisible();
};

test("roster is the compact light-mode default and navigates by week and date", async ({ appPage }) => {
  await openWorkforce(appPage);
  const grid = appPage.getByRole("region", { name: /^Rooster / });
  await expect(grid.getByText("Kevin · Demo", { exact: true })).toBeVisible();
  await expect(grid.getByText("Robin Janssens", { exact: true })).toBeVisible();
  const pattern = appPage.getByRole("button", { name: /Kevin · Demo.*normaal werkpatroon/ }).first();
  await expect(pattern).toBeVisible();
  await pattern.hover();
  await expect(appPage.getByRole("tooltip")).toContainText("Normaal werkpatroon");

  await appPage.getByRole("button", { name: "Volgende week" }).click();
  await expect(grid.getByText("Kevin · Demo", { exact: true })).toBeVisible();
  await appPage.getByRole("button", { name: "Dag", exact: true }).click();
  await expect(appPage.getByLabel("Roosterdatum")).toBeVisible();

  const forbiddenThemeClasses = await appPage.getByTestId("workforce-root").locator("button").evaluateAll((buttons) =>
    buttons.flatMap((button) => [...button.classList].filter((name) => /^(bg-(sky|cyan|slate)-(600|700|800|900|950)|text-white)$/.test(name))),
  );
  expect(forbiddenThemeClasses).toEqual([]);
});

test("manager materializes patterns, edits a shift and publishes the week", async ({ appPage }) => {
  await openWorkforce(appPage);
  await appPage.getByRole("button", { name: "Roosteracties" }).click();
  await appPage.getByRole("menuitem", { name: "Werkpatronen toepassen" }).click();
  await expect(appPage.getByText("Werkpatronen op deze week toegepast.")).toBeVisible();

  const shift = appPage.getByRole("button", { name: /Kevin · Demo.*openen/ }).first();
  await shift.click();
  const editor = appPage.getByRole("dialog", { name: "Shift bewerken" });
  await editor.getByLabel("Functie").fill("Kassa & verkoop");
  await editor.getByRole("button", { name: "Bewaren" }).click();
  await expect(editor).toHaveCount(0);

  await appPage.getByRole("button", { name: "Roosteracties" }).click();
  await appPage.getByRole("menuitem", { name: "Week publiceren" }).click();
  await expect(appPage.getByText("Rooster gepubliceerd.")).toBeVisible();
  await expect(appPage.getByText("Gepubliceerd", { exact: true })).toBeVisible();
});

test("employee submits exact leave dates and sees the canonical duration", async ({ appPage }) => {
  await openWorkforce(appPage);
  const dates = nextMondayAndTuesday();
  await appPage.getByRole("button", { name: "Verlof aanvragen" }).click();
  const dialog = appPage.getByRole("dialog", { name: "Verlof aanvragen" });
  await dialog.getByLabel("Van").fill(dates.start);
  await dialog.getByLabel("Tot en met").fill(dates.end);
  await dialog.getByLabel("Toelichting").fill("E2E verloftest");
  await dialog.getByRole("button", { name: "Aanvraag indienen" }).click();
  await expect(appPage.getByText("Verlofaanvraag ingediend.")).toBeVisible();
  await expect(appPage.getByText("E2E verloftest", { exact: false })).toHaveCount(0);
  await expect(appPage.getByText("15 u 12 min", { exact: true })).toBeVisible();
});
