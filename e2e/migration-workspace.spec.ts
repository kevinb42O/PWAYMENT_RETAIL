import { expect, test, unlockPos } from "./fixtures";

test("merchant can stage catalog and customers, activate, and fully undo before a sale", async ({ appPage }) => {
  await appPage.goto("/app?e2e=1&catalog=empty");
  await unlockPos(appPage);
  await expect(appPage.getByRole("navigation", { name: "Hoofdnavigatie" })).toBeVisible();
  await appPage.getByRole("button", { name: "Integration Hub" }).click();
  await expect(appPage.getByRole("heading", { name: "Gegevens importeren" })).toBeVisible();

  await appPage.locator('input[type="file"]').nth(0).setInputFiles({
    name: "legacy-catalog.csv",
    mimeType: "text/csv",
    buffer: Buffer.from([
      "Artikelcode;Productnaam;Categorie;Verkoopprijs;BTW;Voorraad",
      "TEL-100;Telenet modem;Netwerk;99,00;21;5",
      "CAB-200;USB-C kabel;Accessoires;12,50;21;20",
    ].join("\n")),
  });
  await expect(appPage.getByText("legacy-catalog.csv · 2 rijen")).toBeVisible();

  await appPage.locator('input[type="file"]').nth(1).setInputFiles({
    name: "legacy-customers.csv",
    mimeType: "text/csv",
    buffer: Buffer.from([
      "Klant-ID;Naam;E-mail;Telefoon;Segment",
      "KL-100;Sofie Janssens;sofie@example.be;+32470123456;Telenet klant",
    ].join("\n")),
  });
  await expect(appPage.getByText("legacy-customers.csv · 1 rijen")).toBeVisible();
  await expect(appPage.getByText("3 veilige records")).toBeVisible();

  await appPage.getByRole("checkbox").check();
  await appPage.getByRole("button", { name: "Activeer 3 veilige records" }).click();
  await expect(appPage.getByText(/Veilig geactiveerd: 2 producten, 1 klanten, 2 nieuwe categorieën en 2 catalogusfamilies/)).toBeVisible();
  await expect(appPage.getByRole("heading", { name: "Uw volledige undo-venster staat nog open." })).toBeVisible();

  await appPage.getByRole("button", { name: "Alles ongedaan maken" }).click();
  await expect(appPage.getByText(/actieve migratie is volledig ongedaan gemaakt/i)).toBeVisible();
});
