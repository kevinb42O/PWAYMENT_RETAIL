import {
  addProduct,
  checkoutPin,
  closeReceipt,
  expect,
  openApp,
  openDesktopCart,
  readStore,
  test,
  unlockPos,
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
  tenderedCents?: number;
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

test("card sale is atomic, exact and visible in Historiek", async ({
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

test("cash entry accepts a hardware keyboard and confirms with Enter", async ({
  appPage,
}) => {
  await openApp(appPage);
  await addProduct(appPage, /Allen Hardware Bolts 1 inch/);
  await openDesktopCart(appPage);
  await appPage.getByRole("button", { name: "Cash", exact: true }).click();

  const dialog = appPage.getByRole("dialog", { name: "Contante betaling" });
  const amount = dialog.getByLabel("Ontvangen bedrag");
  const confirm = dialog.getByRole("button", { name: "Betaling bevestigen" });

  await expect(amount).toBeFocused();
  await amount.pressSequentially("10");
  await expect(amount).toHaveValue("10");
  await expect(dialog.getByText("€ 4,05")).toBeVisible();
  await amount.press("Backspace");
  await expect(amount).toHaveValue("1");
  await expect(confirm).toBeDisabled();
  await amount.press("0");
  await amount.press("Enter");

  await expect(appPage.getByText("Betaling gelukt")).toBeVisible();
  await expect(
    appPage.getByRole("region", { name: "Winkelwagen" }),
  ).toBeVisible();
  await expect(
    appPage.getByRole("complementary", { name: "Compacte winkelwagen" }),
  ).toBeHidden();
  const transactions = await readStore<StoredTransaction>(appPage, "transactions");
  expect(transactions[0]).toMatchObject({
    paymentMethod: "Cash",
    tenderedCents: 1_000,
  });

  await appPage.getByRole("button", { name: "Sluiten", exact: true }).click();
  await expect(
    appPage.getByRole("complementary", { name: "Compacte winkelwagen" }),
  ).toBeVisible();
});

test("POS return shortcut opens the manual transaction lookup directly", async ({
  appPage,
}) => {
  await openApp(appPage);

  await appPage.getByRole("button", { name: "Retour", exact: true }).click();

  await expect(
    appPage.getByRole("heading", { name: "Transacties & facturen" }),
  ).toBeVisible();
  await expect(
    appPage.getByRole("searchbox", { name: "Zoek transacties" }),
  ).toBeFocused();
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
  await issueDialog.getByRole("button", { name: "Naar kassa" }).click();
  await expect(issueDialog).toBeHidden();

  await openDesktopCart(appPage);
  await appPage.getByRole("button", { name: "Kaart", exact: true }).click();
  await expect(appPage.getByText("Betaling gelukt")).toBeVisible();
  await closeReceipt(appPage);

  await appPage.getByRole("button", { name: "Kassa" }).click();
  await addProduct(appPage, /Allen Hardware Bolts 1 inch/);
  await openDesktopCart(appPage);
  await appPage
    .getByRole("button", { name: "Deels betalen of cadeaubon gebruiken" })
    .click();
  await appPage
    .getByRole("button", { name: "Cadeaubon gebruiken", exact: true })
    .click();
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
  expect(transactions).toHaveLength(2);
  expect(transactions.find((transaction) => transaction.totalCents === 2500)).toMatchObject({
    paymentMethod: "PIN",
    tenders: [{ method: "PIN", amountCents: 2500 }],
  });
  expect(transactions.find((transaction) => transaction.totalCents === 595)).toMatchObject({
    totalCents: 595,
    paymentMethod: "Cadeaubon",
    tenders: [{ method: "Cadeaubon", amountCents: 595 }],
  });
});

test("cash and card split is exact and visibly explained in Historiek", async ({
  appPage,
}) => {
  await openApp(appPage);
  await addProduct(appPage, /Allen Hardware Bolts 1 inch/);
  await openDesktopCart(appPage);
  await appPage
    .getByRole("button", { name: "Deels betalen of cadeaubon gebruiken" })
    .click();
  const splitDialog = appPage.getByRole("dialog", { name: "Deels betalen" });
  await splitDialog.getByLabel("Kaart").fill("2,00");
  await splitDialog.getByRole("button", { name: "Verder met betaling" }).click();
  const cashDialog = appPage.getByRole("dialog", { name: "Contante betaling" });
  await expect(cashDialog.getByText("€ 3,95").first()).toBeVisible();
  await cashDialog.getByRole("button", { name: "Betaling bevestigen" }).click();
  await expect(appPage.getByText("Betaling gelukt")).toBeVisible();

  const transactions = await readStore<StoredTransaction>(appPage, "transactions");
  expect(transactions).toHaveLength(1);
  expect(transactions[0]).toMatchObject({
    totalCents: 595,
    paymentMethod: "Split",
    tenders: [
      { method: "PIN", amountCents: 200 },
      { method: "Cash", amountCents: 395 },
    ],
  });

  await closeReceipt(appPage);
  await appPage.getByRole("button", { name: "Historiek" }).click();
  await expect(
    appPage.getByRole("cell", {
      name: "Gesplitst Kaart € 2,00 · Cash € 3,95",
      exact: true,
    }),
  ).toBeVisible();
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
    appPage.getByRole("heading", { name: "Controleer en sluit de dag af" }),
  ).toBeVisible();
  await appPage
    .getByRole("button", { name: "Naar afsluiten", exact: true })
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
  await expect(reportDialog.getByRole("heading", { name: "Integriteit" })).toBeVisible();
  await expect(
    reportDialog.getByText(/server-authoritair|Historisch rapport/).first(),
  ).toBeVisible();

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
  await unlockPos(appPage);
  await expect(
    appPage.getByRole("searchbox", { name: "Scan barcode of zoek product" }),
  ).toBeVisible();
  await openDesktopCart(appPage);
  await expect(
    appPage.getByRole("button", { name: /Allen Hardware Bolts 1 inch € 5,95/ }),
  ).toBeVisible();
  await expect(appPage.getByText("2", { exact: true }).last()).toBeVisible();
  expect(
    await readStore<StoredTransaction>(appPage, "transactions"),
  ).toHaveLength(0);
});

test("a held cart resumes safely while the current customer is kept in the queue", async ({
  appPage,
}) => {
  await openApp(appPage);

  const firstCustomerProduct = /Allen Hardware Bolts 1 inch/;
  const nextCustomerProduct = /Phillips Hardware Bolts 7\/8 inch/;
  const stockBefore = await readStore<StoredProduct>(appPage, "products");

  await addProduct(appPage, firstCustomerProduct);
  await openDesktopCart(appPage);
  await appPage
    .getByRole("button", { name: "Winkelwagenacties" })
    .click();
  await appPage
    .getByRole("menuitem", { name: "In wachtrij zetten" })
    .click();

  await expect(
    appPage.getByRole("button", { name: /Winkelwagen openen, 0 artikelen/ }),
  ).toBeVisible();
  expect(
    await readStore<StoredTransaction>(appPage, "transactions"),
  ).toHaveLength(0);
  const stockAfterHolding = await readStore<StoredProduct>(
    appPage,
    "products",
  );
  expect(stockFor(stockAfterHolding, "Allen Hardware Bolts 1 inch")).toBe(
    stockFor(stockBefore, "Allen Hardware Bolts 1 inch"),
  );

  await addProduct(appPage, nextCustomerProduct, 2);
  await openDesktopCart(appPage);
  await expect(appPage.locator(".pos-cart-count")).toHaveText("2");

  await appPage
    .getByRole("button", { name: "Winkelwagenacties" })
    .click();
  await appPage
    .getByRole("menuitem", { name: /Wachtende klanten/ })
    .click();

  const queueDialog = appPage.getByRole("dialog", {
    name: "Wachtende klanten",
  });
  await expect(queueDialog).toBeVisible();
  await expect(
    queueDialog.getByText("€ 5,95", { exact: true }),
  ).toBeVisible();
  await queueDialog.getByRole("button", { name: "Hervatten" }).click();

  await appPage
    .getByRole("button", {
      name: /huidige winkelwagen.*parkeren.*openen/i,
    })
    .click();

  await expect(queueDialog).toBeHidden();
  await expect(
    appPage.locator(".pos-cart").getByText("Allen Hardware Bolts 1 inch"),
  ).toBeVisible();
  await expect(appPage.locator(".pos-cart-count")).toHaveText("1");
  await expect(
    appPage
      .locator(".pos-checkout")
      .getByText("€ 5,95", { exact: true })
      .last(),
  ).toBeVisible();

  await appPage
    .getByRole("button", { name: "Winkelwagenacties" })
    .click();
  await appPage
    .getByRole("menuitem", { name: /Wachtende klanten/ })
    .click();
  await expect(
    queueDialog.getByText("€ 11,90", { exact: true }),
  ).toBeVisible();

  expect(
    await readStore<StoredTransaction>(appPage, "transactions"),
  ).toHaveLength(0);
  const stockAfterSwitching = await readStore<StoredProduct>(
    appPage,
    "products",
  );
  expect(stockFor(stockAfterSwitching, "Allen Hardware Bolts 1 inch")).toBe(
    stockFor(stockBefore, "Allen Hardware Bolts 1 inch"),
  );
  expect(
    stockFor(stockAfterSwitching, "Phillips Hardware Bolts 7/8 inch"),
  ).toBe(
    stockFor(stockBefore, "Phillips Hardware Bolts 7/8 inch"),
  );
});
