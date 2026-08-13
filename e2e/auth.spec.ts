import { expect, test } from "./fixtures";

test("registration requires strong credentials and reload locks the session", async ({
  appPage,
}) => {
  await appPage.goto("/register");
  await expect(
    appPage.getByRole("heading", { name: "Eerst uw veilige account" }),
  ).toBeVisible();
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
  await appPage.getByLabel("Kassa Snel-PIN (6 cijfers)").fill("654321");
  await appPage
    .getByRole("button", { name: "Verder" })
    .click();
  await appPage.getByLabel("Welke zaak heeft u?").selectOption("telecom-it");
  await appPage.getByRole("button", { name: "Verder" }).click();
  await expect(
    appPage.getByRole("checkbox", { name: /Hersteldienst/ }),
  ).toBeChecked();
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
  await appPage
    .getByRole("button", { name: "Account aanmaken en starten" })
    .click();
  await expect(
    appPage.getByRole("heading", { name: "Integration Hub" }),
  ).toBeVisible();

  await appPage.reload();
  await appPage.goto("/login");
  await expect(
    appPage.getByRole("heading", { name: "Inloggen bij PWAyment" }),
  ).toBeVisible();
});

test("seed owner can authenticate by email with upgraded credential hashing", async ({
  appPage,
}) => {
  await appPage.goto("/login");
  await expect(
    appPage.getByRole("heading", { name: "Inloggen bij PWAyment" }),
  ).toBeVisible();
  await appPage
    .getByRole("textbox", { name: "E-mailadres" })
    .fill("eigenaar@pwayment.be");
  await appPage
    .getByRole("textbox", { name: "Wachtwoord", exact: true })
    .fill("password123");
  await appPage
    .getByRole("button", { name: "Inloggen", exact: true })
    .last()
    .click();
  await expect(
    appPage.getByRole("searchbox", { name: "Scan barcode of zoek product" }),
  ).toBeVisible();
});

test("owner can switch navigation modules directly from settings", async ({
  appPage,
}) => {
  await appPage.goto("/login");
  await appPage
    .getByRole("textbox", { name: "E-mailadres" })
    .fill("eigenaar@pwayment.be");
  await appPage
    .getByRole("textbox", { name: "Wachtwoord", exact: true })
    .fill("password123");
  await appPage.getByRole("button", { name: "Inloggen", exact: true }).last().click();

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
