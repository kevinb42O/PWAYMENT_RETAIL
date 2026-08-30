import { expect, openApp, openDesktopCart, test } from "./fixtures";

test("customer context stays inside Pace and never covers the cart", async ({ appPage }) => {
  await openApp(appPage);
  await appPage.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("PwaymentRetailPOS");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    const tx = database.transaction(["products", "customers", "transactions"], "readwrite");
    const products = await new Promise<any[]>((resolve, reject) => {
      const request = tx.objectStore("products").getAll();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    const product = products.find((row) => row.brand && (row.productType ?? "merchandise") === "merchandise");
    if (!product) throw new Error("E2E catalog has no branded merchandise product.");
    const customerId = "e2e-pace-customer";
    tx.objectStore("customers").put({
      id: customerId,
      name: "Annekee Pace",
      totalSpentCents: product.priceCents * 2,
      visitCount: 2,
      lastVisitAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      isActive: true,
    });
    const policy = {
      enabled: true,
      windowDays: 14,
      reminderLeadDays: 2,
      excludedProductTypes: ["service", "gift-card"],
      excludedCategoryIds: [],
      effectiveFrom: "2026-01-01T00:00:00.000Z",
    };
    const makeSale = (id: number, timestamp: number) => ({
      id,
      clientRequestId: `e2e-pace-sale-${id}`,
      tableId: 1,
      items: [{ lineId: `e2e-line-${id}`, product, quantity: 1 }],
      subtotalCents: product.priceCents,
      vat12Cents: 0,
      vat21Cents: 0,
      totalCents: product.priceCents,
      discountCents: 0,
      paymentMethod: "PIN",
      timestamp,
      isFinalized: 1,
      customerId,
      source: "live",
      kind: "sale",
      merchantSnapshot: {
        name: "PWAYMENT",
        addressLine1: "Teststraat 1",
        addressLine2: "9000 Gent",
        vatNumber: "BE0123456789",
        commercialReturnPolicy: policy,
      },
    });
    const day = 86_400_000;
    tx.objectStore("transactions").put(makeSale(91001, Date.now() - 14 * day));
    tx.objectStore("transactions").put(makeSale(91002, Date.now() - 60 * day));
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    database.close();
  });

  await appPage.reload();
  await openDesktopCart(appPage);
  await appPage.getByRole("button", { name: "Klant koppelen", exact: true }).click();
  await appPage.getByRole("button", { name: /Annekee Pace/ }).click();

  const edge = appPage.getByRole("button", { name: "Open Pace-klantcontext" });
  await expect(edge).toBeVisible();
  await edge.click();
  await expect(appPage.getByRole("dialog", { name: "Pace operationele assistent" })).toBeVisible();
  await expect(appPage.getByText("Retourtermijn eindigt vandaag")).toBeVisible();

  const geometry = await appPage.evaluate(() => {
    const panel = document.querySelector(".pace-panel")!.getBoundingClientRect();
    const cart = document.querySelector(".pos-cart")!.getBoundingClientRect();
    return {
      overlaps: panel.left < cart.right && panel.right > cart.left && panel.top < cart.bottom && panel.bottom > cart.top,
      backdropDisplay: getComputedStyle(document.querySelector(".pace-backdrop")!).display,
    };
  });
  expect(geometry).toEqual({ overlaps: false, backdropDisplay: "none" });
});
