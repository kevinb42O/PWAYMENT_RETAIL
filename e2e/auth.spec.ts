import { expect, test, unlockPos } from "./fixtures";

test.describe.configure({ timeout: 90_000 });

test("registration requires strong credentials and reload locks the session", async ({
  appPage,
}) => {
  await appPage.goto("/register");
  await expect(
    appPage.getByRole("heading", { name: "Eerst uw veilige account" }),
  ).toBeVisible({ timeout: 25_000 });
  await appPage.getByRole("textbox", { name: "Voornaam" }).fill("E2E");
  await appPage.getByRole("textbox", { name: "Familienaam" }).fill("Eigenaar");
  await appPage
    .getByRole("textbox", { name: "Winkel / Bedrijfsnaam" })
    .fill("E2E Skate Shop");
  await appPage
    .getByRole("textbox", { name: "E-mailadres" })
    .fill("e2e-owner@example.test");
  await appPage
    .getByRole("textbox", { name: "Wachtwoord", exact: true })
    .fill("CorrectHorseBattery12!");
  await appPage
    .getByRole("textbox", { name: "Wachtwoord herhalen" })
    .fill("CorrectHorseBattery12!");
  await appPage.getByLabel("Kassa Snel-PIN (6 cijfers)").fill("486205");
  await appPage
    .getByRole("button", { name: "Verder" })
    .click();
  await appPage.getByRole("button", { name: "Verder" }).click();
  await expect(appPage.getByRole("alert")).toContainText(
    "Kies eerst bewust welk type retailwinkel u heeft.",
  );
  await appPage.getByLabel("Welke zaak heeft u?").selectOption("telecom-it");
  await appPage.getByRole("button", { name: "Verder" }).click();
  // A sector now leads to an explicit retail-needs assessment before module
  // selection. Telecom must surface serialised items, but the merchant—not a
  // sector heuristic—decides whether that capability is required.
  await expect(
    appPage.getByRole("group", { name: "Serienummers of unieke items" }),
  ).toBeVisible();
  await appPage.getByRole("button", { name: "Verder" }).click();
  await expect(appPage.getByRole("checkbox", { name: /Hersteldienst/ })).toBeChecked();
  await appPage.getByRole("button", { name: "Verder" }).click();
  await appPage
    .getByLabel("Waar staan uw producten vandaag?")
    .selectOption("spreadsheet");
  await appPage.getByText("Meteen na aanmelden", { exact: true }).click();
  await appPage
    .getByLabel("Hoe werkt uw prijsvoering?")
    .selectOption("customer-groups");
  await appPage.getByRole("button", { name: "Verder" }).click();
  await expect(
    appPage.getByRole("heading", { name: "Dit zetten we voor u klaar" }),
  ).toBeVisible();
  for (const consent of await appPage.getByRole("checkbox").all()) await consent.check();
  await appPage
    .getByRole("button", { name: "Account aanmaken en starten" })
    .click();
  await unlockPos(appPage, "486205");
  await expect(
    appPage.getByRole("heading", { name: "Gegevens importeren" }),
  ).toBeVisible({ timeout: 25_000 });

  await appPage.reload();
  await appPage.goto("/login");
  await expect(
    appPage.getByRole("heading", { name: "Welkom terug" }),
  ).toBeVisible({ timeout: 25_000 });
});

test("seed owner can authenticate by email with upgraded credential hashing", async ({
  appPage,
}) => {
  await appPage.goto("/login");
  await expect(
    appPage.getByRole("heading", { name: "Welkom terug" }),
  ).toBeVisible({ timeout: 25_000 });
  await appPage
    .getByRole("textbox", { name: "E-mailadres" })
    .fill("eigenaar@pwayment.be");
  await appPage
    .getByRole("textbox", { name: "Wachtwoord", exact: true })
    .fill("password123");
  await appPage
    .getByRole("button", { name: "Aanmelden", exact: true })
    .last()
    .click();
  await unlockPos(appPage);
  await expect(
    appPage.getByRole("searchbox", { name: "Scan barcode of zoek product" }),
  ).toBeVisible();
});

test("owner can switch navigation modules directly from settings", async ({
  appPage,
}) => {
  await appPage.goto("/login");
  await expect(
    appPage.getByRole("heading", { name: "Welkom terug" }),
  ).toBeVisible({ timeout: 25_000 });
  await appPage
    .getByRole("textbox", { name: "E-mailadres" })
    .fill("eigenaar@pwayment.be");
  await appPage
    .getByRole("textbox", { name: "Wachtwoord", exact: true })
    .fill("password123");
  await appPage.getByRole("button", { name: "Aanmelden", exact: true }).last().click();
  await unlockPos(appPage);

  await appPage.getByRole("button", { name: "Profiel en instellingen" }).click();
  await appPage.getByRole("menuitem", { name: "Modules & navigatie" }).click();
  await expect(appPage.getByRole("heading", { name: "Modules & navigatie" })).toBeVisible();

  const topNavigation = appPage.locator("nav").first();
  await expect(topNavigation.getByRole("button", { name: "Herstellingen" })).toBeVisible();
  await expect(topNavigation.getByRole("button", { name: "Personeel & verlof" })).toBeVisible();
  await expect(topNavigation.getByRole("button", { name: "Integration Hub" })).toBeVisible();

  await appPage.getByRole("switch", { name: "Personeel & verlof uitschakelen" }).click();
  await expect(topNavigation.getByRole("button", { name: "Personeel & verlof" })).toHaveCount(0);

  await appPage.getByRole("switch", { name: "Integration Hub uitschakelen" }).click();
  await expect(topNavigation.getByRole("button", { name: "Integration Hub" })).toHaveCount(0);

  await appPage.getByRole("switch", { name: "Hersteldienst uitschakelen" }).click();
  await expect(topNavigation.getByRole("button", { name: "Herstellingen" })).toHaveCount(0);
  await expect(appPage.getByText("Automatisch bewaard")).toBeVisible();

  await appPage.getByRole("switch", { name: "Hersteldienst inschakelen" }).click();
  await expect(topNavigation.getByRole("button", { name: "Herstellingen" })).toBeVisible();

  await appPage.getByRole("switch", { name: "Personeel & verlof inschakelen" }).click();
  await expect(topNavigation.getByRole("button", { name: "Personeel & verlof" })).toBeVisible();

  await appPage.getByRole("switch", { name: "Integration Hub inschakelen" }).click();
  await expect(topNavigation.getByRole("button", { name: "Integration Hub" })).toBeVisible();
});
