import { expect, test } from "./fixtures";

test.describe.configure({ timeout: 90_000 });

test("PIN-first gate identifies operators and keeps settings owner-only", async ({ appPage }) => {
  await appPage.goto("/app?e2e=1");
  const gate = appPage.getByRole("heading", { name: "Voer je PIN in" });
  await expect(gate).toBeVisible({ timeout: 20_000 });
  await expect(appPage.getByText("Voer je persoonlijke PIN van exact 6 cijfers in")).toBeVisible();
  await expect(appPage.getByRole("searchbox", { name: "Scan barcode of zoek product" })).toHaveCount(0);
  expect(await appPage.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toContain("light");

  await appPage.keyboard.type("739184");
  await expect(appPage.getByRole("alert").filter({ hasText: "PIN is niet correct" }).first()).toBeVisible();
  await appPage.keyboard.type("123456");
  await expect(appPage.getByRole("searchbox", { name: "Scan barcode of zoek product" })).toBeVisible();

  await appPage.getByRole("button", { name: "Profiel en instellingen" }).click();
  await expect(appPage.getByRole("menuitem", { name: "Instellingen" })).toBeVisible();
  await appPage.getByRole("menuitem", { name: "Vergrendel / wissel medewerker" }).click();
  await expect(gate).toBeVisible();

  for (const digit of "111111") {
    await appPage.getByRole("button", { name: `Cijfer ${digit}` }).click();
  }
  await expect(appPage.getByRole("searchbox", { name: "Scan barcode of zoek product" })).toBeVisible();
  await appPage.getByRole("button", { name: "Profiel en instellingen" }).click();
  await expect(appPage.getByRole("menuitem", { name: "Instellingen" })).toHaveCount(0);
  await expect(appPage.getByRole("menuitem", { name: "Vergrendel / wissel medewerker" })).toBeVisible();
});
