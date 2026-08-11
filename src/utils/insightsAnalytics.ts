import { Customer, Product, Transaction } from "../types";
import { allocateCents } from "./money";
import { isGiftCardProduct } from "./financial";
import { calendarDayDifference, getZonedDateParts } from "./time";

export interface ProductInsightRow {
  productId: string;
  name: string;
  category: string;
  revenueCents: number;
  grossProfitCents: number;
  units: number;
  previousRevenueCents: number;
  changePercent: number | null;
  missingCostLines: number;
}

export interface StoreMomentRow {
  key: string;
  label: string;
  revenueCents: number;
  transactionCount: number;
  averageSaleCents: number;
}

export interface CustomerInsightSnapshot {
  recognizedCustomers: number;
  oneTimeCustomers: number;
  returningCustomers: number;
  loyalCustomers: number;
  repeatRate: number;
  averageCustomerValueCents: number;
  averageDaysToSecondPurchase: number | null;
  returnBuckets: Array<{ label: string; customers: number }>;
  valueBuckets: Array<{
    label: string;
    customers: number;
    revenueCents: number;
  }>;
  gatewayProducts: Array<{
    productName: string;
    customers: number;
    returned: number;
    returnRate: number;
  }>;
  customerRows: Array<{
    customerId: string;
    customerName: string;
    purchases: number;
    revenueCents: number;
    lastPurchaseAt: number;
  }>;
}

export interface DataQualitySnapshot {
  costPriceCoverage: number;
  stockCoverage: number;
  categoryCoverage: number;
  customerLinkCoverage: number;
  employeeLinkCoverage: number;
  sources: Array<{
    key: string;
    label: string;
    complete: number;
    total: number;
    coverage: number;
  }>;
}

export interface DiscountInsightRow {
  key: string;
  label: string;
  discountCents: number;
  netRevenueCents: number;
  grossProfitCents: number;
  marginPercent: number | null;
  transactionCount: number;
  missingCostLines: number;
}

export interface DiscountInsightSnapshot {
  discountCents: number;
  discountedTransactionCount: number;
  grossSalesBeforeDiscountCents: number;
  discountRate: number;
  grossProfitAfterDiscountCents: number;
  marginAfterDiscountPercent: number | null;
  missingCostLines: number;
  categoryRows: DiscountInsightRow[];
  productRows: DiscountInsightRow[];
}

export const buildProductInsights = (
  transactions: Transaction[],
  previousTransactions: Transaction[] = [],
): ProductInsightRow[] => {
  const aggregate = (rows: Transaction[]) => {
    const products = new Map<
      string,
      Omit<ProductInsightRow, "previousRevenueCents" | "changePercent">
    >();
    for (const transaction of rows.filter((row) => row.isFinalized)) {
      const grossLines = transaction.items.map((item) => {
        const modifiers = (item.modifiers ?? []).reduce(
          (sum, modifier) => sum + modifier.deltaCents,
          0,
        );
        return (item.product.priceCents + modifiers) * item.quantity;
      });
      const revenues = allocateCents(transaction.totalCents, grossLines);
      for (const [index, item] of transaction.items.entries()) {
        if (isGiftCardProduct(item.product)) continue;
        const revenueCents = revenues[index] ?? 0;
        const current = products.get(item.product.id) ?? {
          productId: item.product.id,
          name: item.product.name,
          category: item.product.category || "Ongecategoriseerd",
          revenueCents: 0,
          grossProfitCents: 0,
          units: 0,
          missingCostLines: 0,
        };
        current.revenueCents += revenueCents;
        current.grossProfitCents +=
          revenueCents - (item.product.costPriceCents ?? 0) * item.quantity;
        if (item.product.costPriceCents == null) current.missingCostLines += 1;
        current.units += item.quantity;
        products.set(item.product.id, current);
      }
    }
    return products;
  };

  const current = aggregate(transactions);
  const previous = aggregate(previousTransactions);
  return [...current.values()]
    .map((row) => {
      const previousRevenueCents =
        previous.get(row.productId)?.revenueCents ?? 0;
      return {
        ...row,
        previousRevenueCents,
        changePercent:
          previousRevenueCents > 0
            ? ((row.revenueCents - previousRevenueCents) /
                previousRevenueCents) *
              100
            : null,
      };
    })
    .sort((a, b) => b.revenueCents - a.revenueCents);
};

export const buildDiscountInsights = (
  transactions: Transaction[],
): DiscountInsightSnapshot => {
  const discountedTransactions = transactions.filter(
    (transaction) => transaction.isFinalized && transaction.discountCents > 0,
  );
  const categoryRows = new Map<string, DiscountInsightRow>();
  const productRows = new Map<string, DiscountInsightRow>();
  let discountCents = 0;
  let netRevenueCents = 0;
  let totalCostCents = 0;
  let missingCostLines = 0;

  for (const transaction of discountedTransactions) {
    const grossLines = transaction.items.map((item) => {
      const modifiers = (item.modifiers ?? []).reduce(
        (sum, modifier) => sum + modifier.deltaCents,
        0,
      );
      return (item.product.priceCents + modifiers) * item.quantity;
    });
    const discounts = allocateCents(transaction.discountCents, grossLines);
    const revenues = allocateCents(transaction.totalCents, grossLines);

    const categoriesSeen = new Set<string>();
    const productsSeen = new Set<string>();
    for (const [index, item] of transaction.items.entries()) {
      if (isGiftCardProduct(item.product)) continue;
      const allocatedDiscountCents = discounts[index] ?? 0;
      const allocatedNetRevenueCents = revenues[index] ?? 0;
      discountCents += allocatedDiscountCents;
      netRevenueCents += allocatedNetRevenueCents;
      const hasCost = item.product.costPriceCents != null;
      const costCents = (item.product.costPriceCents ?? 0) * item.quantity;
      totalCostCents += costCents;
      if (!hasCost) missingCostLines += 1;

      const add = (
        map: Map<string, DiscountInsightRow>,
        key: string,
        label: string,
        seen: Set<string>,
      ) => {
        const current = map.get(key) ?? {
          key,
          label,
          discountCents: 0,
          netRevenueCents: 0,
          grossProfitCents: 0,
          marginPercent: null,
          transactionCount: 0,
          missingCostLines: 0,
        };
        current.discountCents += allocatedDiscountCents;
        current.netRevenueCents += allocatedNetRevenueCents;
        current.grossProfitCents += allocatedNetRevenueCents - costCents;
        if (!hasCost) current.missingCostLines += 1;
        if (!seen.has(key)) current.transactionCount += 1;
        seen.add(key);
        map.set(key, current);
      };

      const category = item.product.category || "Ongecategoriseerd";
      add(categoryRows, category, category, categoriesSeen);
      add(
        productRows,
        item.product.name.trim().toLocaleLowerCase("nl-BE"),
        item.product.name,
        productsSeen,
      );
    }
  }

  const finalize = (rows: Map<string, DiscountInsightRow>) =>
    [...rows.values()]
      .map((row) => ({
        ...row,
        marginPercent:
          row.netRevenueCents > 0 && row.missingCostLines === 0
            ? (row.grossProfitCents / row.netRevenueCents) * 100
            : null,
      }))
      .sort((a, b) => b.discountCents - a.discountCents);
  const grossSalesBeforeDiscountCents = netRevenueCents + discountCents;
  const grossProfitAfterDiscountCents = netRevenueCents - totalCostCents;

  return {
    discountCents,
    discountedTransactionCount: discountedTransactions.length,
    grossSalesBeforeDiscountCents,
    discountRate:
      grossSalesBeforeDiscountCents > 0
        ? (discountCents / grossSalesBeforeDiscountCents) * 100
        : 0,
    grossProfitAfterDiscountCents,
    marginAfterDiscountPercent:
      netRevenueCents > 0 && missingCostLines === 0
        ? (grossProfitAfterDiscountCents / netRevenueCents) * 100
        : null,
    missingCostLines,
    categoryRows: finalize(categoryRows),
    productRows: finalize(productRows),
  };
};

const weekdayLabels = ["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"];

export const buildWeekdayInsights = (
  transactions: Transaction[],
): StoreMomentRow[] => {
  const rows = weekdayLabels.map((label, index) => ({
    key: String(index),
    label,
    revenueCents: 0,
    transactionCount: 0,
    averageSaleCents: 0,
  }));
  for (const transaction of transactions.filter((row) => row.isFinalized)) {
    const parts = getZonedDateParts(transaction.timestamp);
    const sundayFirst = new Date(
      Date.UTC(parts.year, parts.month - 1, parts.day),
    ).getUTCDay();
    const index = sundayFirst === 0 ? 6 : sundayFirst - 1;
    rows[index].revenueCents += transaction.totalCents;
    rows[index].transactionCount += 1;
  }
  return rows.map((row) => ({
    ...row,
    averageSaleCents:
      row.transactionCount > 0
        ? Math.round(row.revenueCents / row.transactionCount)
        : 0,
  }));
};

export const buildHourlyInsights = (
  transactions: Transaction[],
): StoreMomentRow[] => {
  const buckets = new Map<number, StoreMomentRow>();
  for (const transaction of transactions.filter((row) => row.isFinalized)) {
    const hour = getZonedDateParts(transaction.timestamp).hour;
    const current = buckets.get(hour) ?? {
      key: String(hour),
      label: `${String(hour).padStart(2, "0")}u`,
      revenueCents: 0,
      transactionCount: 0,
      averageSaleCents: 0,
    };
    current.revenueCents += transaction.totalCents;
    current.transactionCount += 1;
    buckets.set(hour, current);
  }
  if (buckets.size === 0) return [];
  const hours = [...buckets.keys()];
  const start = Math.min(...hours);
  const end = Math.max(...hours);
  return Array.from({ length: end - start + 1 }, (_, index) => {
    const hour = start + index;
    const row = buckets.get(hour) ?? {
      key: String(hour),
      label: `${String(hour).padStart(2, "0")}u`,
      revenueCents: 0,
      transactionCount: 0,
      averageSaleCents: 0,
    };
    return {
      ...row,
      averageSaleCents:
        row.transactionCount > 0
          ? Math.round(row.revenueCents / row.transactionCount)
          : 0,
    };
  });
};

export const buildCustomerInsights = (
  transactions: Transaction[],
  customers: Customer[] = [],
): CustomerInsightSnapshot => {
  const customerNames = new Map(
    customers.map((customer) => [customer.id, customer.name]),
  );
  const customerSales = new Map<string, Transaction[]>();
  for (const transaction of transactions.filter(
    (row) => row.isFinalized && row.customerId,
  )) {
    const rows = customerSales.get(transaction.customerId!) ?? [];
    rows.push(transaction);
    customerSales.set(transaction.customerId!, rows);
  }
  customerSales.forEach((rows) =>
    rows.sort((a, b) => a.timestamp - b.timestamp),
  );

  let oneTimeCustomers = 0;
  let returningCustomers = 0;
  let loyalCustomers = 0;
  let totalCustomerRevenueCents = 0;
  const secondPurchaseDays: number[] = [];
  const returnBuckets = [
    { label: "Binnen 30 dagen", customers: 0 },
    { label: "Na 31–60 dagen", customers: 0 },
    { label: "Na 61–90 dagen", customers: 0 },
    { label: "Na meer dan 90 dagen", customers: 0 },
  ];
  const valueRows: Array<{ revenueCents: number; purchases: number }> = [];
  const gateway = new Map<
    string,
    { productName: string; customers: number; returned: number }
  >();
  const customerRows: CustomerInsightSnapshot["customerRows"] = [];

  customerSales.forEach((sales, customerId) => {
    const revenueCents = sales.reduce((sum, sale) => sum + sale.totalCents, 0);
    totalCustomerRevenueCents += revenueCents;
    valueRows.push({ revenueCents, purchases: sales.length });
    customerRows.push({
      customerId,
      customerName: customerNames.get(customerId) ?? "Onbekende klant",
      purchases: sales.length,
      revenueCents,
      lastPurchaseAt: sales[sales.length - 1].timestamp,
    });
    if (sales.length === 1) oneTimeCustomers += 1;
    if (sales.length >= 2) returningCustomers += 1;
    if (sales.length >= 3) loyalCustomers += 1;

    const firstProducts = new Set(
      sales[0]?.items
        .filter((item) => !isGiftCardProduct(item.product))
        .map((item) => item.product.name) ?? [],
    );
    firstProducts.forEach((productName) => {
      const current = gateway.get(productName) ?? {
        productName,
        customers: 0,
        returned: 0,
      };
      current.customers += 1;
      if (sales.length >= 2) current.returned += 1;
      gateway.set(productName, current);
    });

    if (sales.length < 2) return;
    const days = Math.max(
      0,
      calendarDayDifference(sales[1].timestamp, sales[0].timestamp),
    );
    secondPurchaseDays.push(days);
    const bucket = days <= 30 ? 0 : days <= 60 ? 1 : days <= 90 ? 2 : 3;
    returnBuckets[bucket].customers += 1;
  });

  const recognizedCustomers = customerSales.size;
  const valueBuckets = [
    { label: "1 aankoop", customers: 0, revenueCents: 0 },
    { label: "2 aankopen", customers: 0, revenueCents: 0 },
    { label: "3–4 aankopen", customers: 0, revenueCents: 0 },
    { label: "5+ aankopen", customers: 0, revenueCents: 0 },
  ];
  valueRows.forEach((row) => {
    const index =
      row.purchases >= 5
        ? 3
        : row.purchases >= 3
          ? 2
          : row.purchases === 2
            ? 1
            : 0;
    valueBuckets[index].customers += 1;
    valueBuckets[index].revenueCents += row.revenueCents;
  });

  return {
    recognizedCustomers,
    oneTimeCustomers,
    returningCustomers,
    loyalCustomers,
    repeatRate:
      recognizedCustomers > 0
        ? (returningCustomers / recognizedCustomers) * 100
        : 0,
    averageCustomerValueCents:
      recognizedCustomers > 0
        ? Math.round(totalCustomerRevenueCents / recognizedCustomers)
        : 0,
    averageDaysToSecondPurchase:
      secondPurchaseDays.length > 0
        ? Math.round(
            secondPurchaseDays.reduce((sum, value) => sum + value, 0) /
              secondPurchaseDays.length,
          )
        : null,
    returnBuckets,
    valueBuckets,
    gatewayProducts: [...gateway.values()]
      .filter((row) => row.customers >= 5)
      .map((row) => ({
        ...row,
        returnRate:
          row.customers > 0 ? (row.returned / row.customers) * 100 : 0,
      }))
      .sort(
        (a, b) =>
          b.returned - a.returned ||
          b.returnRate - a.returnRate ||
          b.customers - a.customers,
      )
      .slice(0, 8),
    customerRows: customerRows.sort((a, b) => b.revenueCents - a.revenueCents),
  };
};


const percentage = (value: number, total: number) =>
  total > 0 ? Math.round((value / total) * 100) : 0;

export const buildDataQuality = (
  products: Product[],
  transactions: Transaction[],
  customers: Customer[],
): DataQualitySnapshot => {
  const activeProducts = products.filter(
    (product) => product.isActive !== false && !isGiftCardProduct(product),
  );
  const stockProducts = activeProducts.filter(
    (product) => product.productType !== "service",
  );
  const finalizedTransactions = transactions.filter(
    (transaction) => transaction.isFinalized,
  );
  const sources = [
    {
      key: "cost",
      label: "Geldige kostprijzen",
      complete: activeProducts.filter(
        (product) =>
          Number.isSafeInteger(product.costPriceCents) &&
          product.costPriceCents! >= 0 &&
          (product.costPriceCents! > 0 || product.productType === "service"),
      ).length,
      total: activeProducts.length,
    },
    {
      key: "stock",
      label: "Geldige voorraadregistratie",
      complete: stockProducts.filter(
        (product) =>
          Number.isSafeInteger(product.stockQty) && product.stockQty! >= 0,
      ).length,
      total: stockProducts.length,
    },
    {
      key: "category",
      label: "Categorie-indeling",
      complete: activeProducts.filter(
        (product) =>
          product.category && product.category !== "Ongecategoriseerd",
      ).length,
      total: activeProducts.length,
    },
    {
      key: "customer",
      label: "Klantkoppeling",
      complete: finalizedTransactions.filter(
        (transaction) => transaction.customerId,
      ).length,
      total: finalizedTransactions.length,
    },
    {
      key: "employee",
      label: "Medewerkertoewijzing",
      complete: finalizedTransactions.filter(
        (transaction) => transaction.userId,
      ).length,
      total: finalizedTransactions.length,
    },
  ].map((source) => ({
    ...source,
    coverage: percentage(source.complete, source.total),
  }));
  return {
    costPriceCoverage: sources[0].coverage,
    stockCoverage: sources[1].coverage,
    categoryCoverage: sources[2].coverage,
    customerLinkCoverage: sources[3].coverage,
    employeeLinkCoverage: sources[4].coverage,
    sources,
  };
};
