import { Customer, Product, Transaction } from '../types';

export type InsightTone = 'attention' | 'opportunity' | 'neutral';

export interface RetailAction {
  id: string;
  tone: InsightTone;
  area: 'voorraad' | 'marge' | 'klanten' | 'team';
  title: string;
  description: string;
  action: string;
}

export interface EmployeePerformance {
  userId: string;
  name: string;
  transactionCount: number;
  revenueCents: number;
}

export interface RetailIntelligenceSnapshot {
  transactionCount: number;
  revenueCents: number;
  costCents: number;
  grossProfitCents: number;
  grossMarginPercent: number | null;
  lowStockProducts: Product[];
  dormantCustomers: Customer[];
  employeePerformance: EmployeePerformance[];
  actions: RetailAction[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

const productCostForTransaction = (transaction: Transaction): number =>
  transaction.items.reduce(
    (total, item) => total + (item.product.costPriceCents ?? 0) * item.quantity,
    0,
  );

/**
 * Convert the sales ledger into owner-facing insights. All values derive from
 * persisted transactions, products and customers; this function never seeds
 * example metrics or claims an outcome that has not been recorded.
 */
export const buildRetailIntelligence = (
  transactions: Transaction[],
  products: Product[],
  customers: Customer[],
  now = Date.now(),
): RetailIntelligenceSnapshot => {
  const revenueCents = transactions.reduce((total, transaction) => total + transaction.totalCents, 0);
  const costCents = transactions.reduce((total, transaction) => total + productCostForTransaction(transaction), 0);
  const grossProfitCents = revenueCents - costCents;
  const grossMarginPercent = revenueCents > 0 ? (grossProfitCents / revenueCents) * 100 : null;

  const lowStockProducts = products
    .filter(
      (product) =>
        product.isActive !== false &&
        product.stockQty != null &&
        product.minStockQty != null &&
        product.stockQty <= product.minStockQty,
    )
    .sort((a, b) => (a.stockQty ?? 0) - (b.stockQty ?? 0));

  const dormantCustomers = customers
    .filter((customer) => {
      if (!customer.isActive || !customer.lastVisitAt) return false;
      return now - new Date(customer.lastVisitAt).getTime() >= 60 * DAY_MS;
    })
    .sort((a, b) => new Date(a.lastVisitAt ?? 0).getTime() - new Date(b.lastVisitAt ?? 0).getTime());

  const employees = new Map<string, EmployeePerformance>();
  for (const transaction of transactions) {
    if (!transaction.userId) continue;
    const current = employees.get(transaction.userId) ?? {
      userId: transaction.userId,
      name: transaction.userName ?? 'Onbekende medewerker',
      transactionCount: 0,
      revenueCents: 0,
    };
    current.transactionCount += 1;
    current.revenueCents += transaction.totalCents;
    employees.set(transaction.userId, current);
  }
  const employeePerformance = [...employees.values()].sort((a, b) => b.revenueCents - a.revenueCents);

  const actions: RetailAction[] = [];
  if (lowStockProducts.length > 0) {
    const names = lowStockProducts.slice(0, 3).map((product) => product.name).join(', ');
    actions.push({
      id: 'low-stock',
      tone: 'attention',
      area: 'voorraad',
      title: 'Voorraad vraagt aandacht',
      description: `${lowStockProducts.length} product${lowStockProducts.length === 1 ? '' : 'en'} zitten op of onder de ingestelde minimumvoorraad${names ? `: ${names}.` : '.'}`,
      action: 'Controleer wat je wilt bijbestellen of stopzetten.',
    });
  }

  const discountedTransactions = transactions.filter((transaction) => transaction.discountCents > 0);
  if (discountedTransactions.length > 0) {
    actions.push({
      id: 'discounts',
      tone: 'attention',
      area: 'marge',
      title: 'Kortingen beïnvloeden je marge',
      description: 'Er zijn kortingen toegepast in geregistreerde verkopen. Pwayment bewaart ze samen met de verkoop en de verantwoordelijke medewerker.',
      action: 'Bekijk of de korting bewust was en of ze nog past bij je marge.',
    });
  }

  if (dormantCustomers.length > 0) {
    actions.push({
      id: 'dormant-customers',
      tone: 'opportunity',
      area: 'klanten',
      title: 'Geef terugkerende klanten een reden om opnieuw te komen',
      description: `${dormantCustomers.length} actieve klant${dormantCustomers.length === 1 ? ' heeft' : 'en hebben'} al minstens zestig dagen geen geregistreerd bezoek.`,
      action: 'Maak een gerichte klantenkaartactie voor deze groep.',
    });
  }

  if (transactions.length > 0 && employeePerformance.length > 0) {
    actions.push({
      id: 'team-activity',
      tone: 'neutral',
      area: 'team',
      title: 'Je ziet welke verkopen door wie werden verwerkt',
      description: 'Elke verkoop bewaart de medewerker die de transactie afrondde.',
      action: 'Gebruik dit om shifts, begeleiding en verantwoordelijkheden te bespreken.',
    });
  }

  if (actions.length === 0) {
    actions.push({
      id: 'collect-data',
      tone: 'neutral',
      area: 'voorraad',
      title: 'De intelligence-laag bouwt mee vanaf de eerste verkoop',
      description: 'Zodra er verkopen, voorraadgrenzen en klantenbezoeken geregistreerd zijn, maakt Pwayment hier concrete acties van.',
      action: 'Registreer verkopen en stel minimumvoorraad in per product.',
    });
  }

  return {
    transactionCount: transactions.length,
    revenueCents,
    costCents,
    grossProfitCents,
    grossMarginPercent,
    lowStockProducts,
    dormantCustomers,
    employeePerformance,
    actions,
  };
};
