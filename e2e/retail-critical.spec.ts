import {
  addProduct,
  checkoutPin,
  closeReceipt,
  expect,
  openApp,
  readStore,
  test,
} from "./fixtures";

interface StoredTransaction {
  id: number;
  totalCents: number;
  vat21Cents: number;
  paymentMethod: string;
  tenders: Array<{ method: string; amountCents: number }>;
  kind?: string;
  originalTransactionId?: number;
  isFinalized: number;
}

interface StoredProduct {
  id: string;
  name: string;
  stockQty?: number;
}

const stockFor = (
  products: StoredProduct[],
  name: string,
): number | undefined =>
  products.find((product) => product.name === name)?.stockQty;

test("PIN sale is atomic, exact and visible in Historiek", async ({
  appPage,
}) => {
  await openApp(appPage);
  await addProduct(appPage, /Allen Hardware Bolts 1 inch/);
  await checkoutPin(appPage);

  const transactions = await readStore<StoredTransaction>(
    appPage,
    "transactions",
  );
  expect(transactions).toHaveLength(1);
  expect(transactions[0]).toMatchObject({
    totalCents: 595,
    vat21Cents: 103,
    paymentMethod: "PIN",
    tenders: [{ method: "PIN", amountCents: 595 }],
    kind: "sale",
    isFinalized: 0,
  });
  const products = await readStore<StoredProduct>(appPage, "products");
  expect(stockFor(products, "Allen Hardware Bolts 1 inch")).toBe(34);

  await closeReceipt(appPage);
  await appPage.getByRole("button", { name: "Historiek" }).click();
  await expect(
    appPage.getByRole("heading", { name: "Verkoopgeschiedenis" }),
  ).toBeVisible();
  await expect(appPage.getByText("€ 5,95").first()).toBeVisible();
  await expect(appPage.getByText("Kaart").first()).toBeVisible();
});

test("partial refund creates a linked negative correction and restores stock", async ({
  appPage,
}) => {
  await openApp(appPage);
  await addProduct(appPage, /Allen Hardware Bolts 1 inch/, 2);
  await checkoutPin(appPage);
  await closeReceipt(appPage);

  await appPage.getByRole("button", { name: "Historiek" }).click();
  await expect(
    appPage.getByRole("heading", { name: "Verkoopgeschiedenis" }),
  ).toBeVisible();
  await appPage.getByRole("button", { name: "Retour", exact: true }).click();
  const dialog = appPage.getByRole("dialog", { name: /Retour boeken/ });
  await dialog.getByLabel("Retouraantal Allen Hardware Bolts 1 inch").fill("1");
  await dialog
    .getByRole("textbox", { name: "Retourreden" })
    .fill("Ongebruikt retourartikel");
  await dialog
    .getByRole("button", { name: "Retour definitief boeken" })
    .click();
  await expect(dialog).toBeHidden();

  const transactions = await readStore<StoredTransaction>(
    appPage,
    "transactions",
  );
  expect(transactions).toHaveLength(2);
  const sale = transactions.find((transaction) => transaction.kind === "sale")!;
  const refund = transactions.find(
    (transaction) => transaction.kind === "refund",
  )!;
  expect(refund).toMatchObject({
    totalCents: -595,
    vat21Cents: -103,
    originalTransactionId: sale.id,
    paymentMethod: "PIN",
  });
  const products = await readStore<StoredProduct>(appPage, "products");
  expect(stockFor(products, "Allen Hardware Bolts 1 inch")).toBe(34);
  await expect(appPage.getByRole("cell", { name: "€ -5,95" })).toBeVisible();
});

test("gift-card issuance is a liability and redemption uses its own tender", async ({
  appPage,
}) => {
  await openApp(appPage);
  await appPage.getByRole("button", { name: "Klanten" }).click();
  await expect(
    appPage.getByRole("heading", { name: "Klantenbeheer" }),
  ).toBeVisible();
  await appPage
    .getByRole("button", { name: "Cadeaubonnen", exact: true })
    .click();
  await appPage.getByRole("button", { name: "Nieuwe cadeaubon" }).click();

  const issueDialog = appPage.getByRole("dialog", { name: "Nieuwe cadeaubon" });
  const issueInputs = issueDialog.getByRole("textbox");
  await issueInputs.nth(0).fill("E2E-GIFT-0001");
  await issueInputs.nth(1).fill("25,00");
  await issueDialog
    .getByRole("combobox", { name: /Ontvangen via/ })
    .selectOption("PIN");
  await issueDialog.getByRole("button", { name: "Uitgeven" }).click();
  await expect(issueDialog).toBeHidden();

  await appPage.getByRole("button", { name: "Kassa" }).click();
  await addProduct(appPage, /Allen Hardware Bolts 1 inch/);
  await appPage.getByRole("button", { name: "Cadeaubon", exact: true }).click();
  const paymentDialog = appPage.getByRole("dialog", {
    name: "Cadeaubonbetaling",
  });
  await paymentDialog.getByPlaceholder("ABCD-1234-EFGH").fill("E2E-GIFT-0001");
  await paymentDialog
    .getByRole("button", { name: /Toepassen \(€ 5,95\)/ })
    .click();
  await expect(appPage.getByText("Betaling gelukt")).toBeVisible();

  const cards = await readStore<{
    code: string;
    initialCents: number;
    balanceCents: number;
  }>(appPage, "gift_cards");
  expect(cards.find((card) => card.code === "E2E-GIFT-0001")).toMatchObject({
    initialCents: 2500,
    balanceCents: 1905,
  });
  const transactions = await readStore<StoredTransaction>(
    appPage,
    "transactions",
  );
  expect(transactions[0]).toMatchObject({
    totalCents: 595,
    paymentMethod: "Cadeaubon",
    tenders: [{ method: "Cadeaubon", amountCents: 595 }],
  });
});

test("Z-closing finalizes the sale and records cash reconciliation", async ({
  appPage,
}) => {
  await openApp(appPage);
  await addProduct(appPage, /Allen Hardware Bolts 1 inch/);
  await checkoutPin(appPage);
  await closeReceipt(appPage);

  await appPage.getByRole("button", { name: "Dagafsluiting" }).click();
  await expect(
    appPage.getByRole("heading", { name: "Klaar om de dag af te sluiten" }),
  ).toBeVisible();
  await appPage
    .getByRole("button", { name: "Dag afsluiten", exact: true })
    .click();
  const dialog = appPage.getByRole("dialog", {
    name: "Dag definitief afsluiten",
  });
  await dialog
    .getByRole("textbox", { name: "Startbedrag kassalade" })
    .fill("0,00");
  await dialog.getByRole("textbox", { name: "Geteld bedrag" }).fill("0,00");
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "Definitief afsluiten" }).click();

  await expect(
    appPage.getByRole("heading", { name: "Dag succesvol afgesloten" }),
  ).toBeVisible();
  const reports = await readStore<{
    reportNumber: number;
    countedCashCents: number;
    expectedCashCents: number;
    cashDifferenceCents: number;
    hash: string;
  }>(appPage, "daily_reports");
  expect(reports).toHaveLength(1);
  expect(reports[0]).toMatchObject({
    reportNumber: 1,
    countedCashCents: 0,
    expectedCashCents: 0,
    cashDifferenceCents: 0,
  });
  expect(reports[0].hash).toMatch(/^[a-f0-9]{64}$/);
  expect(
    (await readStore<StoredTransaction>(appPage, "transactions"))[0]
      .isFinalized,
  ).toBe(1);

  await appPage.getByRole("button", { name: "Historiek" }).click();
  await appPage.getByRole("button", { name: /^Z-rapporten/ }).click();
  await expect(appPage.getByText("#1", { exact: true })).toBeVisible();
  await appPage.getByRole("button", { name: "Bekijk Z-rapport 1" }).click();

  const reportDialog = appPage.getByRole("dialog", { name: "Z-rapport 1" });
  await expect(reportDialog).toBeVisible();
  await expect(reportDialog.getByRole("heading", { name: /Wat werd er verkocht/ })).toBeVisible();
  await expect(reportDialog.getByText("Allen Hardware Bolts 1 inch").first()).toBeVisible();
  await expect(reportDialog.getByText(/Historisch rapport/).first()).toBeVisible();

  await reportDialog
    .locator("section")
    .filter({ hasText: "Transacties in dit Z-rapport" })
    .getByRole("button")
    .first()
    .click();
  await expect(reportDialog.getByRole("button", { name: "Open verkoopdocument" })).toBeVisible();

  const pdfDownload = appPage.waitForEvent("download");
  await reportDialog.getByRole("button", { name: "A4 PDF" }).click();
  expect((await pdfDownload).suggestedFilename()).toMatch(/^Z-rapport-0001-.*\.pdf$/);

  await reportDialog.getByRole("button", { name: "Terug naar historiek" }).click();
  await appPage.getByRole("button", { name: "Dagtotalen" }).click();
  await expect(appPage.getByRole("cell", { name: "1", exact: true }).first()).toBeVisible();
});

test("open cart survives a full reload without duplicating lines", async ({
  appPage,
}) => {
  await openApp(appPage);
  await addProduct(appPage, /Allen Hardware Bolts 1 inch/, 2);
  await appPage.reload();
  await expect(
    appPage.getByRole("searchbox", { name: "Scan barcode of zoek product" }),
  ).toBeVisible();
  await expect(
    appPage.getByRole("button", { name: /Allen Hardware Bolts 1 inch € 5,95/ }),
  ).toBeVisible();
  await expect(appPage.getByText("2", { exact: true }).last()).toBeVisible();
  expect(
    await readStore<StoredTransaction>(appPage, "transactions"),
  ).toHaveLength(0);
});
