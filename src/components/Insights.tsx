import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  Boxes,
  CircleDollarSign,
  CreditCard,
  DatabaseZap,
  ChevronRight,
  Layers3,
  LoaderCircle,
  PackageX,
  Trash2,
  Target,
  TrendingDown,
  TrendingUp,
  Users,
} from 'lucide-react';
import { db } from '../db/db';
import { Transaction } from '../types';
import { useCustomers } from '../store/useCustomers';
import { useProducts } from '../store/useProducts';
import { formatEUR } from '../utils/money';
import { buildRetailIntelligence } from '../utils/retailIntelligence';
import { InsightPeriod, SalesChartPoint, buildSalesChart } from '../utils/retailCharts';
import { clearDemoRetailData, seedDemoRetailData } from '../utils/demoRetailData';
import { CategoryPerformance, PaymentMixItem, buildCategoryPerformance, buildPaymentMix } from '../utils/retailDashboardData';
import { buildInventoryForecast, buildReorderRecommendations } from '../utils/retailActionEngine';
import { InventoryForecast } from './InventoryForecast';

export const Insights = () => {
  const products = useProducts((state) => state.list);
  const hydrateProducts = useProducts((state) => state.hydrate);
  const customers = useCustomers((state) => state.customers);
  const hydrateCustomers = useCustomers((state) => state.hydrate);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<InsightPeriod>('30d');
  const [chartMetric, setChartMetric] = useState<'revenue' | 'profit'>('revenue');
  const [hoveredPoint, setHoveredPoint] = useState<SalesChartPoint | null>(null);
  const [demoBusy, setDemoBusy] = useState(false);
  const [selectedInsightId, setSelectedInsightId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    await Promise.all([hydrateProducts(), hydrateCustomers()]);
    const [rows, persistedProducts, persistedCustomers] = await Promise.all([
      db.transactions.orderBy('timestamp').reverse().toArray(),
      db.products.toArray(),
      db.customers.toArray(),
    ]);
    // Hydration intentionally runs only once in the stores. Sync them after a demo-data action.
    useProducts.setState({ list: persistedProducts, hydrated: true });
    useCustomers.setState({ customers: persistedCustomers, hydrated: true });
    setTransactions(rows);
    setLoading(false);
  }, [hydrateCustomers, hydrateProducts]);

  useEffect(() => {
    void load();
  }, [load]);

  const addDemoData = async () => {
    setDemoBusy(true);
    try {
      await seedDemoRetailData();
      await load();
    } catch (error) {
      console.error(error);
    } finally {
      setDemoBusy(false);
    }
  };

  const removeDemoData = async () => {
    setDemoBusy(true);
    try {
      await clearDemoRetailData();
      await load();
    } catch {
      console.error('Demo-data kon niet worden verwijderd.');
    } finally {
      setDemoBusy(false);
    }
  };

  const refreshDemoData = async () => {
    setDemoBusy(true);
    try {
      await clearDemoRetailData();
      await seedDemoRetailData();
      await load();
    } catch (error) {
      console.error(error);
    } finally {
      setDemoBusy(false);
    }
  };

  const periodTransactions = useMemo(() => filterTransactionsForPeriod(transactions, period), [period, transactions]);
  const previousPeriodTransactions = useMemo(() => filterPreviousPeriodTransactions(transactions, period), [period, transactions]);
  const snapshot = useMemo(
    () => buildRetailIntelligence(periodTransactions, products, customers),
    [customers, periodTransactions, products],
  );
  const previousSnapshot = useMemo(
    () => buildRetailIntelligence(previousPeriodTransactions, products, customers),
    [customers, previousPeriodTransactions, products],
  );
  const chartPoints = useMemo(() => buildSalesChart(transactions, period), [period, transactions]);
  const demoTransactionCount = transactions.filter((transaction) => transaction.source === 'demo').length;
  const categoryPerformance = useMemo(() => buildCategoryPerformance(periodTransactions), [periodTransactions]);
  const paymentMix = useMemo(() => buildPaymentMix(periodTransactions), [periodTransactions]);
  const customerLinkedSales = periodTransactions.filter((transaction) => transaction.customerId).length;
  const inventoryForecast = useMemo(
    () => buildInventoryForecast(products, transactions),
    [products, transactions],
  );
  const inventoryRecommendations = useMemo(
    () => buildReorderRecommendations(products, transactions),
    [products, transactions],
  );
  const ownerInsights = useMemo(
    () => buildOwnerInsights({
      transactions,
      products,
      customerLinkedSales: transactions.filter((transaction) => transaction.customerId).length,
    }),
    [customers, products, transactions],
  );
  const selectedInsight = ownerInsights.find((insight) => insight.id === selectedInsightId) ?? null;
  const revenueChange = percentageChange(snapshot.revenueCents, previousSnapshot.revenueCents);
  const profitChange = percentageChange(snapshot.grossProfitCents, previousSnapshot.grossProfitCents);

  return (
    <div className="flex-1 overflow-y-auto bg-zinc-950 px-4 py-5 text-white sm:px-6">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-400">Pwayment intelligence</div>
            <h1 className="mt-1 text-3xl font-bold tracking-tight">Zo staat je winkel ervoor.</h1>
            <p className="mt-2 text-sm text-zinc-400">Eén helder beeld van verkoop, marge, voorraad en klanten. Geen ruis, alleen wat je data werkelijk vertelt.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="mr-1 text-sm text-zinc-500">{loading ? 'Gegevens laden...' : `${snapshot.transactionCount} verkopen · ${periodLabel(period)}`}</div>
            {demoTransactionCount === 0 && <button
              type="button"
              onClick={() => void addDemoData()}
              disabled={demoBusy}
              className="inline-flex items-center gap-2 rounded-lg border border-sky-400/30 bg-sky-400/10 px-3 py-2 text-xs font-semibold text-sky-200 transition hover:bg-sky-400/20 disabled:cursor-wait disabled:opacity-60"
            >
              {demoBusy ? <LoaderCircle size={14} className="animate-spin" /> : <DatabaseZap size={14} />}
              Vul 24 maanden demo-data
            </button>}
            {demoTransactionCount > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => void refreshDemoData()}
                  disabled={demoBusy}
                  className="inline-flex items-center gap-2 rounded-lg border border-emerald-400/25 bg-emerald-400/5 px-3 py-2 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-400/15 disabled:cursor-wait disabled:opacity-60"
                >
                  {demoBusy ? <LoaderCircle size={14} className="animate-spin" /> : <DatabaseZap size={14} />}
                  Herbouw demo
                </button>
                <button
                  type="button"
                  onClick={() => void removeDemoData()}
                  disabled={demoBusy}
                  className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs font-semibold text-zinc-300 transition hover:border-rose-400/50 hover:text-rose-200 disabled:cursor-wait disabled:opacity-60"
                >
                  <Trash2 size={14} />
                  Verwijder demo-data
                </button>
              </>
            )}
          </div>
        </header>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric icon={<CircleDollarSign size={18} />} label="Omzet" value={formatEUR(snapshot.revenueCents)} detail={formatChange(revenueChange, period)} />
          <Metric
            icon={<BarChart3 size={18} />}
            label="Brutowinst"
            value={formatEUR(snapshot.grossProfitCents)}
            detail={snapshot.grossMarginPercent == null ? 'Aankoopprijzen ontbreken.' : `${snapshot.grossMarginPercent.toFixed(1).replace('.', ',')}% marge · ${formatChange(profitChange, period)}`}
          />
          <Metric icon={<Boxes size={18} />} label="Voorraadrisico" value={String(inventoryRecommendations.length)} detail={inventoryRecommendations.length === 0 ? 'Geen verwacht tekort binnen 60 dagen.' : 'Voorspeld uit actuele voorraad en verkoopritme.'} />
          <Metric icon={<Users size={18} />} label="Klanten zonder recent bezoek" value={String(snapshot.dormantCustomers.length)} detail="Geen geregistreerd bezoek in 60 dagen." />
        </div>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <BarChart3 size={19} className="text-sky-300" />
                <h2 className="text-lg font-semibold">Verkoop en marge</h2>
              </div>
              <p className="mt-1 text-sm text-zinc-500">Alleen op basis van verkopen die in Pwayment zijn geregistreerd.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <ChartToggle label="Omzet" active={chartMetric === 'revenue'} onClick={() => setChartMetric('revenue')} />
              <ChartToggle label="Brutowinst" active={chartMetric === 'profit'} onClick={() => setChartMetric('profit')} />
              <span className="mx-1 hidden h-8 w-px bg-zinc-700 sm:block" />
              <ChartToggle label="7 dagen" active={period === '7d'} onClick={() => setPeriod('7d')} />
              <ChartToggle label="30 dagen" active={period === '30d'} onClick={() => setPeriod('30d')} />
              <ChartToggle label="12 maanden" active={period === '12m'} onClick={() => setPeriod('12m')} />
            </div>
          </div>
          <SalesChart
            points={chartPoints}
            metric={chartMetric}
            hoveredPoint={hoveredPoint}
            onHover={setHoveredPoint}
          />
        </section>

        <InventoryForecast
          rows={inventoryForecast}
          recommendations={inventoryRecommendations}
          products={products}
          onInventoryChanged={load}
        />

        <section className="grid gap-5 lg:grid-cols-3">
          <CategoryChart rows={categoryPerformance} />
          <PaymentMixChart rows={paymentMix} />
          <CustomerCaptureChart linkedSales={customerLinkedSales} totalSales={periodTransactions.length} />
        </section>

        <section className="grid gap-5 xl:grid-cols-[1.7fr_.8fr]">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-sm">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex items-center gap-2 text-amber-300">
                  <Target size={18} />
                  <span className="text-[11px] font-bold uppercase tracking-[0.16em]">Pwayment signaleert</span>
                </div>
                <h2 className="mt-2 text-xl font-semibold tracking-tight">Waar zit vandaag je aandacht?</h2>
                <p className="mt-1 max-w-xl text-sm text-zinc-500">{ownerInsights.length} {ownerInsights.length === 1 ? 'keuze' : 'keuzes'} die direct invloed hebben op je omzet, marge of voorraad. Kies waar je morgen mee aan de slag wilt.</p>
              </div>
              <div className="hidden rounded-full border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-xs font-medium text-zinc-400 sm:block">{ownerInsights.length} {ownerInsights.length === 1 ? 'signaal' : 'signalen'}</div>
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-3">
              {ownerInsights.map((insight) => (
                <OwnerInsightCard
                  key={insight.id}
                  insight={insight}
                  active={selectedInsight?.id === insight.id}
                  onClick={() => setSelectedInsightId((current) => current === insight.id ? null : insight.id)}
                />
              ))}
            </div>
            {selectedInsight ? <InsightDetailPanel insight={selectedInsight} onClose={() => setSelectedInsightId(null)} /> : (
              <div className="mt-4 flex items-center gap-3 rounded-xl border border-dashed border-zinc-800 bg-zinc-950/40 px-4 py-3 text-sm text-zinc-500">
                <ArrowUpRight size={16} className="shrink-0 text-sky-300" />
                <span>Kies een signaal voor de onderbouwing, de betekenis en één concrete vervolgstap.</span>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
            <h2 className="text-lg font-semibold">Medewerkeractiviteit</h2>
            <p className="mt-1 text-sm text-zinc-500">Op basis van wie een verkoop afrondde.</p>
            <div className="mt-4 space-y-3">
              {snapshot.employeePerformance.length === 0 ? (
                <p className="rounded-xl border border-dashed border-zinc-800 p-4 text-sm text-zinc-500">Zodra een medewerker een verkoop afrondt, verschijnt die activiteit hier.</p>
              ) : (
                snapshot.employeePerformance.map((employee) => (
                  <div key={employee.userId} className="rounded-xl bg-zinc-950 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium text-zinc-100">{employee.name}</span>
                      <span className="font-mono text-sm text-emerald-300">{formatEUR(employee.revenueCents)}</span>
                    </div>
                    <p className="mt-1 text-sm text-zinc-500">{employee.transactionCount} afgeronde {employee.transactionCount === 1 ? 'verkoop' : 'verkopen'}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

type OwnerInsightTone = 'attention' | 'opportunity' | 'foundation';

type OwnerInsight = {
  id: 'stock' | 'discounts' | 'retention' | 'capture' | 'margin-data' | 'data' | 'focus';
  tone: OwnerInsightTone;
  eyebrow: string;
  title: string;
  summary: string;
  metrics: Array<{ label: string; value: string }>;
  whatItMeans: string;
  improvement: string;
  evidence: string[];
  stockBreakdown?: StockBreakdown;
  discountBreakdown?: DiscountMarginBreakdown;
  retentionBreakdown?: RetentionBreakdown;
};

type StockVelocityItem = {
  productName: string;
  stockQty: number;
  stockValueCents: number;
  sold90d: number;
  sold30d: number;
};

type StockBreakdown = {
  notSold: StockVelocityItem[];
  slow: StockVelocityItem[];
  good: StockVelocityItem[];
  counts: { notSold: number; slow: number; good: number };
};

const DISCOUNT_MARGIN_FLOOR = 0.35;

type DiscountMarginItem = {
  productName: string;
  currentPriceCents: number;
  costPriceCents: number;
  stockQty: number;
  sold90d: number;
  sold30d: number;
  units: number;
  listRevenueCents: number;
  discountCents: number;
  discountRate: number;
  realizedMargin: number;
  listMargin: number;
  testPriceCents: number;
  testMargin: number;
  marginGapCents: number;
};

type DiscountMarginBreakdown = {
  priceTests: DiscountMarginItem[];
  tooMuchDiscount: DiscountMarginItem[];
  healthyDiscount: DiscountMarginItem[];
  counts: { priceTests: number; tooMuchDiscount: number; healthyDiscount: number };
  marginFloor: number;
};

type RetentionCohortItem = {
  productName: string;
  customers: number;
  returned: number;
  returnRate: number;
  averageDaysToReturn: number | null;
  repeatRevenueCents: number;
};

type RetentionNextPurchase = {
  firstProductName: string;
  nextProductName: string;
  customers: number;
  averageDaysToNext: number;
  nextRevenueCents: number;
};

type RetentionCustomerValue = {
  recognizedCustomers: number;
  oneTimeCustomers: number;
  returningCustomers: number;
  loyalCustomers: number;
  repeatRevenueCents: number;
  averageReturningCustomerRevenueCents: number;
};

type RetentionBreakdown = {
  cohorts: RetentionCohortItem[];
  nextPurchases: RetentionNextPurchase[];
  customerValue: RetentionCustomerValue;
  totalRecognizedCustomers: number;
};

const buildOwnerInsights = ({
  transactions,
  products,
  customerLinkedSales,
}: {
  transactions: Transaction[];
  products: ReturnType<typeof useProducts.getState>['list'];
  customerLinkedSales: number;
}): OwnerInsight[] => {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const activeTransactions = transactions.filter((transaction) => transaction.isFinalized);
  const transactionsByCustomer = new Map<string, Transaction[]>();
  for (const transaction of activeTransactions) {
    if (!transaction.customerId) continue;
    const customerTransactions = transactionsByCustomer.get(transaction.customerId) ?? [];
    customerTransactions.push(transaction);
    transactionsByCustomer.set(transaction.customerId, customerTransactions);
  }
  transactionsByCustomer.forEach((customerTransactions) => customerTransactions.sort((a, b) => a.timestamp - b.timestamp));

  const discounted = transactions.filter((transaction) => transaction.discountCents > 0);
  const discountCents = discounted.reduce((sum, transaction) => sum + transaction.discountCents, 0);
  const linkedDiscounts = discounted.filter((transaction) => transaction.customerId && transactionsByCustomer.has(transaction.customerId));
  const discountsWithLaterPurchase = linkedDiscounts.filter((transaction) =>
    transactionsByCustomer.get(transaction.customerId!)!.some((otherTransaction) => otherTransaction.timestamp > transaction.timestamp),
  );
  const discountsWithLaterPurchaseCents = discountsWithLaterPurchase.reduce((sum, transaction) => sum + transaction.discountCents, 0);
  const unknownDiscountCents = discountCents - linkedDiscounts.reduce((sum, transaction) => sum + transaction.discountCents, 0);

  const salesLast90Days = new Map<string, number>();
  const salesLast30Days = new Map<string, number>();
  for (const transaction of activeTransactions) {
    for (const item of transaction.items) {
      if (transaction.timestamp >= now - 90 * dayMs) salesLast90Days.set(item.product.id, (salesLast90Days.get(item.product.id) ?? 0) + item.quantity);
      if (transaction.timestamp >= now - 30 * dayMs) salesLast30Days.set(item.product.id, (salesLast30Days.get(item.product.id) ?? 0) + item.quantity);
    }
  }
  const stockedProducts = products.filter((product) => product.isActive !== false && (product.stockQty ?? 0) > 0 && product.costPriceCents != null);
  const slowStock = stockedProducts.filter((product) => (salesLast90Days.get(product.id) ?? 0) === 0);
  const slowStockValueCents = slowStock.reduce((sum, product) => sum + (product.stockQty ?? 0) * (product.costPriceCents ?? 0), 0);
  const stockVelocity = stockedProducts.map((product) => ({
    productName: product.name,
    stockQty: product.stockQty ?? 0,
    stockValueCents: (product.stockQty ?? 0) * (product.costPriceCents ?? 0),
    sold90d: salesLast90Days.get(product.id) ?? 0,
    sold30d: salesLast30Days.get(product.id) ?? 0,
  }));
  const notSoldStock = stockVelocity.filter((item) => item.sold90d === 0);
  const slowMovingStock = stockVelocity
    .filter((item) => item.sold90d > 0 && (item.sold30d === 0 || item.sold90d <= 3))
    .sort((a, b) => a.sold90d - b.sold90d || b.stockQty - a.stockQty);
  const goodMovingStock = stockVelocity
    .filter((item) => item.sold30d > 0)
    .sort((a, b) => b.sold30d - a.sold30d || b.sold90d - a.sold90d);
  const stockBreakdown: StockBreakdown = {
    notSold: notSoldStock.sort((a, b) => b.stockValueCents - a.stockValueCents || b.stockQty - a.stockQty),
    slow: slowMovingStock,
    good: goodMovingStock,
    counts: { notSold: notSoldStock.length, slow: slowMovingStock.length, good: goodMovingStock.length },
  };
  const marginByProduct = new Map<string, Omit<DiscountMarginItem, 'discountRate' | 'realizedMargin' | 'listMargin' | 'testPriceCents' | 'testMargin' | 'marginGapCents'>>();
  for (const transaction of activeTransactions) {
    const transactionBase = transaction.subtotalCents > 0
      ? transaction.subtotalCents
      : transaction.items.reduce((sum, item) => sum + (item.product.priceCents + (item.modifiers ?? []).reduce((modifierSum, modifier) => modifierSum + modifier.deltaCents, 0)) * item.quantity, 0);
    for (const item of transaction.items) {
      const modifierCents = (item.modifiers ?? []).reduce((sum, modifier) => sum + modifier.deltaCents, 0);
      const lineListCents = (item.product.priceCents + modifierCents) * item.quantity;
      const discountShareCents = transactionBase > 0 ? Math.round(transaction.discountCents * (lineListCents / transactionBase)) : 0;
      const currentProduct = products.find((product) => product.id === item.product.id) ?? item.product;
      const current = marginByProduct.get(item.product.id) ?? {
        productName: currentProduct.name,
        currentPriceCents: currentProduct.priceCents,
        costPriceCents: currentProduct.costPriceCents ?? item.product.costPriceCents ?? 0,
        stockQty: currentProduct.stockQty ?? 0,
        sold90d: salesLast90Days.get(item.product.id) ?? 0,
        sold30d: salesLast30Days.get(item.product.id) ?? 0,
        units: 0,
        listRevenueCents: 0,
        discountCents: 0,
      };
      current.units += item.quantity;
      current.listRevenueCents += lineListCents;
      current.discountCents += discountShareCents;
      marginByProduct.set(item.product.id, current);
    }
  }
  const marginItems = [...marginByProduct.values()]
    .filter((item) => item.costPriceCents > 0 && item.currentPriceCents > 0)
    .map((item) => {
      const realizedRevenueCents = Math.max(0, item.listRevenueCents - item.discountCents);
      const listMargin = (item.currentPriceCents - item.costPriceCents) / item.currentPriceCents;
      const realizedMargin = realizedRevenueCents > 0 ? (realizedRevenueCents - item.costPriceCents * item.units) / realizedRevenueCents : -1;
      const targetFloorPriceCents = Math.ceil(item.costPriceCents / (1 - DISCOUNT_MARGIN_FLOOR));
      const testPriceCents = Math.max(targetFloorPriceCents, Math.round(item.currentPriceCents * 0.9));
      const testMargin = testPriceCents > 0 ? (testPriceCents - item.costPriceCents) / testPriceCents : -1;
      const marginGapCents = Math.max(0, Math.round(realizedRevenueCents * DISCOUNT_MARGIN_FLOOR - (realizedRevenueCents - item.costPriceCents * item.units)));
      return {
        ...item,
        discountRate: item.listRevenueCents > 0 ? item.discountCents / item.listRevenueCents : 0,
        realizedMargin,
        listMargin,
        testPriceCents,
        testMargin,
        marginGapCents,
      };
    });
  const priceTests = marginItems
    .filter((item) => item.stockQty > 0 && item.sold90d === 0 && item.currentPriceCents > item.costPriceCents && item.testPriceCents < item.currentPriceCents)
    .sort((a, b) => b.stockQty * b.costPriceCents - a.stockQty * a.costPriceCents || b.stockQty - a.stockQty || a.productName.localeCompare(b.productName));
  const tooMuchDiscount = marginItems
    .filter((item) => item.discountCents > 0 && (item.realizedMargin < DISCOUNT_MARGIN_FLOOR || item.discountRate >= 0.15))
    .sort((a, b) => b.marginGapCents - a.marginGapCents || b.discountRate - a.discountRate || b.discountCents - a.discountCents || a.productName.localeCompare(b.productName));
  const healthyDiscount = marginItems
    .filter((item) => item.discountCents > 0 && item.realizedMargin >= DISCOUNT_MARGIN_FLOOR && item.discountRate < 0.15)
    .sort((a, b) => b.sold30d - a.sold30d || b.units - a.units || b.discountCents - a.discountCents || a.productName.localeCompare(b.productName));
  const discountBreakdown: DiscountMarginBreakdown = {
    priceTests,
    tooMuchDiscount,
    healthyDiscount,
    counts: { priceTests: priceTests.length, tooMuchDiscount: tooMuchDiscount.length, healthyDiscount: healthyDiscount.length },
    marginFloor: DISCOUNT_MARGIN_FLOOR,
  };
  const fastSeller = [...stockedProducts]
    .filter((product) => (salesLast30Days.get(product.id) ?? 0) > 0)
    .sort((a, b) => (salesLast30Days.get(b.id) ?? 0) - (salesLast30Days.get(a.id) ?? 0))[0];

  const firstProductGroups = new Map<string, { productName: string; customers: number; returned: number; returnDays: number[]; repeatRevenueCents: number }>();
  const nextPurchaseGroups = new Map<string, { firstProductName: string; nextProductName: string; customers: number; days: number[]; nextRevenueCents: number }>();
  transactionsByCustomer.forEach((customerTransactions) => {
    const firstTransaction = customerTransactions[0];
    const firstItem = firstTransaction?.items[0];
    if (!firstItem) return;
    const group = firstProductGroups.get(firstItem.product.id) ?? { productName: firstItem.product.name, customers: 0, returned: 0, returnDays: [], repeatRevenueCents: 0 };
    group.customers += 1;
    const laterTransactions = customerTransactions.slice(1);
    if (laterTransactions.length > 0) {
      group.returned += 1;
      group.repeatRevenueCents += laterTransactions.reduce((sum, transaction) => sum + transaction.totalCents, 0);
      group.returnDays.push(Math.round((laterTransactions[0].timestamp - firstTransaction.timestamp) / dayMs));
      const nextTransaction = laterTransactions[0];
      const nextItem = nextTransaction.items[0];
      if (nextItem) {
        const nextKey = `${firstItem.product.id}::${nextItem.product.id}`;
        const nextGroup = nextPurchaseGroups.get(nextKey) ?? {
          firstProductName: firstItem.product.name,
          nextProductName: nextItem.product.name,
          customers: 0,
          days: [],
          nextRevenueCents: 0,
        };
        nextGroup.customers += 1;
        nextGroup.days.push(Math.round((nextTransaction.timestamp - firstTransaction.timestamp) / dayMs));
        nextGroup.nextRevenueCents += nextTransaction.totalCents;
        nextPurchaseGroups.set(nextKey, nextGroup);
      }
    }
    firstProductGroups.set(firstItem.product.id, group);
  });
  const retentionCohorts = [...firstProductGroups.values()]
    .filter((group) => group.customers >= 3)
    .map((group) => ({
      productName: group.productName,
      customers: group.customers,
      returned: group.returned,
      returnRate: group.returned / group.customers,
      averageDaysToReturn: group.returnDays.length > 0 ? Math.round(group.returnDays.reduce((sum, days) => sum + days, 0) / group.returnDays.length) : null,
      repeatRevenueCents: group.repeatRevenueCents,
    }))
    .sort((a, b) => b.returnRate - a.returnRate || b.customers - a.customers || b.repeatRevenueCents - a.repeatRevenueCents);
  const strongestGateway = retentionCohorts[0];
  const nextPurchases = [...nextPurchaseGroups.values()]
    .filter((group) => group.customers >= 2)
    .map((group) => ({
      firstProductName: group.firstProductName,
      nextProductName: group.nextProductName,
      customers: group.customers,
      averageDaysToNext: Math.round(group.days.reduce((sum, days) => sum + days, 0) / group.days.length),
      nextRevenueCents: group.nextRevenueCents,
    }))
    .sort((a, b) => b.customers - a.customers || b.nextRevenueCents - a.nextRevenueCents);
  const recognizedCustomerRows = [...transactionsByCustomer.values()];
  const returningCustomerRows = recognizedCustomerRows.filter((rows) => rows.length >= 2);
  const customerValue: RetentionCustomerValue = {
    recognizedCustomers: recognizedCustomerRows.length,
    oneTimeCustomers: recognizedCustomerRows.filter((rows) => rows.length === 1).length,
    returningCustomers: returningCustomerRows.length,
    loyalCustomers: recognizedCustomerRows.filter((rows) => rows.length >= 3).length,
    repeatRevenueCents: returningCustomerRows.reduce((sum, rows) => sum + rows.slice(1).reduce((rowSum, transaction) => rowSum + transaction.totalCents, 0), 0),
    averageReturningCustomerRevenueCents: returningCustomerRows.length === 0 ? 0 : Math.round(returningCustomerRows.reduce((sum, rows) => sum + rows.reduce((rowSum, transaction) => rowSum + transaction.totalCents, 0), 0) / returningCustomerRows.length),
  };
  const retentionBreakdown: RetentionBreakdown = {
    cohorts: retentionCohorts,
    nextPurchases,
    customerValue,
    totalRecognizedCustomers: [...transactionsByCustomer.keys()].length,
  };
  const captureRate = activeTransactions.length === 0 ? null : customerLinkedSales / activeTransactions.length;

  const insights: OwnerInsight[] = [];
  if (discounted.length > 0) {
    const linkedDiscountRate = discountCents === 0 ? 0 : (linkedDiscounts.reduce((sum, transaction) => sum + transaction.discountCents, 0) / discountCents) * 100;
    insights.push({
      id: 'discounts', tone: 'attention', eyebrow: 'Korting en marge',
      title: `Maak korting weer winstgevend`,
      summary: linkedDiscounts.length === 0
        ? `${formatEUR(discountCents)} korting gegeven, maar nog niet zichtbaar welke klanten daardoor terugkwamen.`
        : `${discountBreakdown.counts.priceTests} producten vragen een prijsproef · ${discountBreakdown.counts.tooMuchDiscount} producten zakken onder ${Math.round(DISCOUNT_MARGIN_FLOOR * 100)}% marge na korting · ${discountBreakdown.counts.healthyDiscount} blijven gezond.`,
      metrics: [
        { label: 'Korting gegeven', value: formatEUR(discountCents) },
        { label: 'Onder margedrempel', value: String(discountBreakdown.counts.tooMuchDiscount) },
      ],
      whatItMeans: 'Er zijn twee verschillende problemen: sommige producten bewegen niet aan hun huidige prijs, andere verkopen alleen doordat je marge weggeeft. Die vragen niet dezelfde oplossing.',
      improvement: 'Test bij stilstaande voorraad eerst een gecontroleerde prijsverlaging. Beperk kortingen op producten die onder de margedrempel zakken en houd alleen acties aan die na korting nog rendabel zijn.',
      evidence: [
        `${linkedDiscounts.length} van ${discounted.length} verkopen met korting zijn aan een klant gekoppeld (${linkedDiscountRate.toFixed(0)}% van het kortingsbedrag).`,
        `${discountsWithLaterPurchase.length} klanten met korting kochten later opnieuw.`,
        'Dit is een patroon in je winkel, geen bewijs dat de korting de terugkeer veroorzaakte.',
      ],
      discountBreakdown,
    });
  }
  if (slowStock.length > 0) {
    insights.push({
      id: 'stock', tone: 'attention', eyebrow: 'Voorraad als cash',
      title: `Maak ${formatEUR(slowStockValueCents)} vrij uit voorraad`,
      summary: `${stockBreakdown.counts.notSold} stil · ${stockBreakdown.counts.slow} traag · ${stockBreakdown.counts.good} loopt goed. Bekijk welke producten in elke groep zitten.`,
      metrics: [
        { label: 'Waarde 90 dagen stil', value: formatEUR(slowStockValueCents) },
        { label: 'Loopt goed', value: String(stockBreakdown.counts.good) },
      ],
      whatItMeans: 'Voorraad is geld dat al uit je rekening is. Als het niet beweegt, blokkeert het ruimte én cash voor producten waar klanten wel naar vragen.',
      improvement: fastSeller
        ? `Bekijk deze week ${fastSeller.name} als tegenhanger: daarvan verkochten er de voorbije 30 dagen ${salesLast30Days.get(fastSeller.id)}. Beslis per stil product: afprijzen, bundelen of niet opnieuw inkopen.`
        : 'Bekijk deze producten deze week en beslis per stuk: afprijzen, bundelen of niet opnieuw inkopen.',
      evidence: [
        `${stockBreakdown.counts.notSold} producten verkochten de voorbije 90 dagen niets.`,
        `${stockBreakdown.counts.slow} producten verkochten wel iets, maar niet recent of slechts enkele stuks.`,
        `${stockBreakdown.counts.good} producten verkochten minstens één stuk in de voorbije 30 dagen.`,
        'De waarde is de huidige voorraad vermenigvuldigd met de ingegeven aankoopprijs.',
        '“Goed” betekent hier: minstens één verkoop in de voorbije 30 dagen; het is geen voorspelling van toekomstige vraag.',
      ],
      stockBreakdown,
    });
  }
  if (strongestGateway) {
    const returnRate = (strongestGateway.returned / strongestGateway.customers) * 100;
    insights.push({
      id: 'retention', tone: 'opportunity', eyebrow: 'Klanten die terugkomen',
      title: `Bouw verder op ${strongestGateway.productName}`,
      summary: `${strongestGateway.returned} van ${strongestGateway.customers} nieuwe klanten kwamen later terug (${returnRate.toFixed(0)}%). Gemiddeld na ${strongestGateway.averageDaysToReturn ?? '—'} dagen.`,
      metrics: [
        { label: 'Nieuwe klanten', value: String(strongestGateway.customers) },
        { label: 'Later terug', value: `${returnRate.toFixed(0)}%` },
      ],
      whatItMeans: `${strongestGateway.productName} is een sterke eerste aankoop: klanten die hiermee starten komen opvallend vaak terug. Het patroon is bruikbaar, maar bewijst niet dat het product de terugkeer veroorzaakt.`,
      improvement: `Maak ${strongestGateway.productName} een bewust startpunt: zet het zichtbaar, koppel er een logische vervolgaankoop aan en volg de terugkeer de komende maand opnieuw.`,
      evidence: [
        `${retentionCohorts.length} eerste-aankopen zijn vergeleken; alleen groepen met minstens drie nieuwe klanten tellen mee.`,
        '“Terugkeer” betekent minstens één latere aankoop van dezelfde klant.',
        `${formatEUR(strongestGateway.repeatRevenueCents)} omzet kwam later terug uit deze klantgroep.`,
      ],
      retentionBreakdown,
    });
  }
  if (insights.length < 3 && captureRate != null) {
    insights.push({
      id: 'capture', tone: 'foundation', eyebrow: 'Klantinzicht', title: `Herken meer klanten aan de kassa`,
      summary: `Nu is ${(captureRate * 100).toFixed(0)}% van je verkopen aan een klant gekoppeld. De rest kan niet terugkomen in je klantbeeld.`,
      metrics: [{ label: 'Herkenbare verkopen', value: `${(captureRate * 100).toFixed(0)}%` }, { label: 'Zonder klant', value: String(activeTransactions.length - customerLinkedSales) }],
      whatItMeans: 'Zonder klantnaam ziet de kassa alleen een bedrag. Met herkenbare klanten zie je welke producten mensen laten terugkomen en welke korting werkt.',
      improvement: 'Maak de klantenkaart onderdeel van het afrekenen: vraag er elke keer naar en laat de klant kiezen via telefoonnummer, kaart of QR.',
      evidence: ['De verhouding vergelijkt afgeronde verkopen mét en zonder klantkoppeling.', 'Anonieme verkopen blijven mogelijk; ze leveren alleen geen klantgeschiedenis op.'],
    });
  }
  if (insights.length < 3) {
    const productsWithoutCost = products.filter((product) => product.isActive !== false && product.costPriceCents == null);
    insights.push({
      id: 'margin-data', tone: 'foundation', eyebrow: 'Marge zichtbaar maken', title: 'Maak je echte marge zichtbaar',
      summary: productsWithoutCost.length > 0
        ? `Voor ${productsWithoutCost.length} actieve producten ontbreekt de aankoopprijs. Daardoor zie je omzet, maar niet wat er echt overblijft.`
        : 'Met aankoopprijzen per product kun je zien welke verkoop niet alleen omzet, maar ook gezonde marge oplevert.',
      metrics: [{ label: 'Zonder aankoopprijs', value: String(productsWithoutCost.length) }, { label: 'Actieve producten', value: String(products.filter((product) => product.isActive !== false).length) }],
      whatItMeans: 'Omzet is niet hetzelfde als winst. De aankoopprijs maakt zichtbaar waar je geld verdient en waar je vooral volume draait.',
      improvement: productsWithoutCost.length > 0
        ? 'Vul eerst de aankoopprijzen in van je belangrijkste producten. Daarna kun je sturen op marge in plaats van alleen op omzet.'
        : 'Vergelijk je productmarges en gebruik die informatie bij inkoop, bundels en promoties.',
      evidence: ['De marge wordt berekend uit verkoopprijs min aankoopprijs.', 'Ontbrekende aankoopprijzen worden niet geschat.'],
    });
  }
  if (insights.length < 3) {
    insights.push({
      id: 'data', tone: 'foundation', eyebrow: 'Volgende groeistap', title: 'Maak je volgende verkoop meetbaar',
      summary: 'Er is nog te weinig verkoopgeschiedenis om een betrouwbare commerciële kans aan te wijzen.',
      metrics: [{ label: 'Geregistreerde verkopen', value: String(transactions.length) }, { label: 'Actieve producten', value: String(products.filter((product) => product.isActive !== false).length) }],
      whatItMeans: 'Hoe consequenter je verkoopt en klanten herkent, hoe scherper dit overzicht wordt.',
      improvement: 'Registreer de komende weken elke verkoop en koppel waar mogelijk de klant. Daarna kun je gericht sturen op voorraad, marge en terugkeer.',
      evidence: ['Dit signaal verschijnt wanneer er nog geen sterkere patroon is.', 'Er worden geen externe gemiddelden of schattingen gebruikt.'],
    });
  }
  if (insights.length < 3) {
    insights.push({
      id: 'focus', tone: 'opportunity', eyebrow: 'Winkelkeuze', title: 'Kies één duidelijke groeifocus',
      summary: 'Je cijfers geven nog geen sterk onderscheid tussen risico en kans. Eén focus maakt de volgende weken wel meetbaar.',
      metrics: [{ label: 'Actieve producten', value: String(products.filter((product) => product.isActive !== false).length) }, { label: 'Verkopen', value: String(transactions.length) }],
      whatItMeans: 'Een eigenaar hoeft niet tegelijk op alles te sturen. Een kleine, meetbare keuze geeft sneller duidelijkheid dan nog meer dashboards.',
      improvement: 'Kies één productgroep of klantdoel voor de komende maand. Vergelijk daarna omzet, marge en terugkeer met vandaag.',
      evidence: ['Dit signaal verschijnt wanneer je verkoopdata nog geen duidelijke winnaar aanwijst.', 'De keuze blijft bij jou; Pwayment maakt geen commerciële beslissing namens de winkel.'],
    });
  }
  return insights;
};

const ownerInsightTone = (tone: OwnerInsightTone) => tone === 'attention'
  ? 'border-amber-400/25 bg-amber-400/5 hover:border-amber-300/50'
  : tone === 'opportunity'
    ? 'border-emerald-400/25 bg-emerald-400/5 hover:border-emerald-300/50'
    : 'border-sky-400/25 bg-sky-400/5 hover:border-sky-300/50';

const toneMeta: Record<OwnerInsightTone, { label: string; icon: ReactNode; className: string }> = {
  attention: { label: 'Aandacht', icon: <AlertTriangle size={13} />, className: 'text-amber-300' },
  opportunity: { label: 'Kans', icon: <ArrowUpRight size={13} />, className: 'text-emerald-300' },
  foundation: { label: 'Basis', icon: <Target size={13} />, className: 'text-sky-300' },
};

const OwnerInsightCard = ({ insight, active, onClick }: { insight: OwnerInsight; active: boolean; onClick: () => void }) => {
  const meta = toneMeta[insight.tone];
  return (
    <button type="button" onClick={onClick} aria-expanded={active} className={`group flex min-h-[218px] flex-col rounded-xl border p-4 text-left transition ${ownerInsightTone(insight.tone)} ${active ? 'ring-2 ring-sky-300/60 ring-offset-2 ring-offset-zinc-900' : 'hover:-translate-y-0.5'}`}>
      <div className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.15em] ${meta.className}`}>{meta.icon}{meta.label}</div>
      <div className="mt-4 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">{insight.eyebrow}</div>
      <h3 className="mt-1.5 line-clamp-2 text-[17px] font-semibold leading-6 text-white">{insight.title}</h3>
      <p className="mt-2 line-clamp-3 text-sm leading-5 text-zinc-400">{insight.summary}</p>
      <div className="mt-auto flex items-end justify-between gap-3 pt-4">
        <div className="flex gap-4">{insight.metrics.slice(0, 2).map((metric) => <div key={metric.label}><div className="text-[11px] text-zinc-500">{metric.label}</div><div className="mt-0.5 font-semibold text-white">{metric.value}</div></div>)}</div>
        <ChevronRight size={17} className={`shrink-0 text-zinc-500 transition group-hover:translate-x-0.5 group-hover:text-sky-300 ${active ? 'text-sky-300' : ''}`} />
      </div>
    </button>
  );
};

const InsightDetailPanel = ({ insight, onClose }: { insight: OwnerInsight; onClose: () => void }) => (
  <div className="mt-4 rounded-xl border border-sky-400/25 bg-sky-400/[0.04] p-4 sm:p-5" role="region" aria-label={`Onderbouwing: ${insight.title}`}>
    <div className="flex items-start justify-between gap-4">
      <div><div className="text-[10px] font-bold uppercase tracking-[0.15em] text-sky-300">Onderbouwing</div><h3 className="mt-1 text-base font-semibold text-white">{insight.title}</h3></div>
      <button type="button" onClick={onClose} className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-zinc-500 hover:bg-zinc-800 hover:text-white">Sluiten</button>
    </div>
    {insight.discountBreakdown && <DiscountMarginBreakdownView breakdown={insight.discountBreakdown} />}
    {insight.stockBreakdown && <StockBreakdownView breakdown={insight.stockBreakdown} />}
    {insight.retentionBreakdown && <RetentionBreakdownView breakdown={insight.retentionBreakdown} />}
    <div className={`${insight.stockBreakdown ? 'mt-5' : 'mt-5'} grid gap-5 lg:grid-cols-[.9fr_1.1fr]`}>
      <div className="insight-detail-surface rounded-lg border border-zinc-800 p-4"><div className="text-[10px] font-bold uppercase tracking-[0.14em] text-amber-300">Waarom dit telt</div><p className="mt-2 text-sm leading-6 text-zinc-300">{insight.whatItMeans}</p><div className="mt-4 border-t border-zinc-800 pt-4"><div className="text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-300">Volgende stap</div><p className="mt-2 text-sm leading-6 text-zinc-300">{insight.improvement}</p></div></div>
      <div><div className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-400">Waar dit op is gebaseerd</div><ul className="insight-detail-surface mt-2 divide-y divide-zinc-800/80 rounded-lg border border-zinc-800">{insight.evidence.map((line) => <li key={line} className="flex gap-2 px-3 py-2.5 text-sm leading-5 text-zinc-400"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-300" />{line}</li>)}</ul></div>
    </div>
  </div>
);

const formatMarginPercent = (margin: number) => `${Math.round(margin * 100)}%`;

const RetentionBreakdownView = ({ breakdown }: { breakdown: RetentionBreakdown }) => {
  const [activeTab, setActiveTab] = useState<'return' | 'next' | 'value'>('return');
  const tabs = [
    { id: 'return' as const, label: 'Terugkeer', hint: 'Wie komt terug?' },
    { id: 'next' as const, label: 'Vervolgkoop', hint: 'Wat kopen ze daarna?' },
    { id: 'value' as const, label: 'Klantwaarde', hint: 'Wat leveren ze op?' },
  ];
  const value = breakdown.customerValue;
  const returningShare = value.recognizedCustomers > 0 ? (value.returningCustomers / value.recognizedCustomers) * 100 : 0;
  const loyalShare = value.recognizedCustomers > 0 ? (value.loyalCustomers / value.recognizedCustomers) * 100 : 0;

  return (
    <div className="retention-breakdown mt-5 rounded-xl border p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div><div className="text-[10px] font-bold uppercase tracking-[0.15em]">Klantgroei uit je verkoopgeschiedenis</div><p className="mt-1 text-xs opacity-75">Van eerste aankoop naar terugkeer, vervolgaankoop en klantwaarde.</p></div>
        <div className="text-xs font-semibold opacity-75">{breakdown.totalRecognizedCustomers} herkende klanten</div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-1 rounded-lg border border-current/15 p-1">
        {tabs.map((tab) => <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)} className={`retention-tab rounded-md px-2 py-2 text-left transition ${activeTab === tab.id ? 'retention-tab--active' : ''}`}><div className="text-xs font-bold">{tab.label}</div><div className="mt-0.5 hidden text-[10px] opacity-70 sm:block">{tab.hint}</div></button>)}
      </div>

      {activeTab === 'return' && <div className="mt-4 space-y-2">
        <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.14em] opacity-70">Welke eerste aankopen leveren terugkeer op? · gesorteerd op terugkeerpercentage</div>
        {breakdown.cohorts.map((cohort) => (
          <div key={cohort.productName} className="retention-cohort-row flex flex-col gap-2 rounded-lg border px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-5">
            <div className="min-w-0"><div className="break-words text-sm font-semibold">{cohort.productName}</div><div className="mt-1 text-xs opacity-70">{cohort.customers} nieuwe klanten · {cohort.averageDaysToReturn == null ? 'nog geen terugkeer' : `gemiddeld na ${cohort.averageDaysToReturn} dagen`} · {formatEUR(cohort.repeatRevenueCents)} latere omzet</div></div>
            <div className="shrink-0 text-left sm:text-right"><div className="text-lg font-bold">{Math.round(cohort.returnRate * 100)}%</div><div className="text-xs opacity-70">{cohort.returned} van {cohort.customers} terug</div></div>
          </div>
        ))}
      </div>}

      {activeTab === 'next' && <div className="mt-4 space-y-2">
        <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.14em] opacity-70">Welke vervolgaankopen komen het vaakst na een eerste aankoop?</div>
        {breakdown.nextPurchases.length === 0 ? <div className="rounded-lg border border-dashed border-current/20 px-3 py-4 text-sm opacity-70">Nog niet genoeg herhaalaankopen om een betrouwbare vervolgstap te tonen.</div> : breakdown.nextPurchases.slice(0, 6).map((purchase) => (
          <div key={`${purchase.firstProductName}-${purchase.nextProductName}`} className="retention-cohort-row flex flex-col gap-2 rounded-lg border px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-5">
            <div className="min-w-0"><div className="break-words text-sm font-semibold">{purchase.firstProductName} <span className="px-1 opacity-50">→</span> {purchase.nextProductName}</div><div className="mt-1 text-xs opacity-70">{purchase.customers} klanten · gemiddeld na {purchase.averageDaysToNext} dagen · {formatEUR(purchase.nextRevenueCents)} omzet in de vervolgaankoop</div></div>
            <div className="shrink-0 rounded-full border border-current/20 px-2.5 py-1 text-xs font-bold">{purchase.customers}×</div>
          </div>
        ))}
      </div>}

      {activeTab === 'value' && <div className="mt-4">
        <div className="grid gap-2 sm:grid-cols-3">
          <RetentionValueMetric label="Eénmalige klanten" value={String(value.oneTimeCustomers)} detail={`${Math.round(100 - returningShare)}% van herkenbare klanten`} />
          <RetentionValueMetric label="Terugkerende klanten" value={String(value.returningCustomers)} detail={`${Math.round(returningShare)}% komt terug`} />
          <RetentionValueMetric label="3+ aankopen" value={String(value.loyalCustomers)} detail={`${Math.round(loyalShare)}% is loyaal`} />
        </div>
        <div className="mt-4 rounded-lg border border-current/15 p-3"><div className="flex items-center justify-between gap-3 text-xs font-semibold"><span>Verdeling klantbasis</span><span>{formatEUR(value.repeatRevenueCents)} latere omzet</span></div><div className="mt-2 flex h-3 overflow-hidden rounded-full bg-black/10"><div className="bg-emerald-500" style={{ width: `${returningShare}%` }} /><div className="bg-amber-400" style={{ width: `${Math.max(0, 100 - returningShare)}%` }} /></div><div className="mt-2 flex justify-between text-[11px] opacity-70"><span>Terugkerend {Math.round(returningShare)}%</span><span>Eénmalig {Math.round(100 - returningShare)}%</span></div></div>
        <div className="mt-3 flex items-center justify-between rounded-lg border border-current/15 px-3 py-3 text-sm"><span>Gemiddelde omzet per terugkerende klant</span><strong>{formatEUR(value.averageReturningCustomerRevenueCents)}</strong></div>
      </div>}
    </div>
  );
};

const RetentionValueMetric = ({ label, value, detail }: { label: string; value: string; detail: string }) => <div className="retention-value-metric rounded-lg border px-3 py-3"><div className="text-xs opacity-70">{label}</div><div className="mt-1 text-xl font-bold">{value}</div><div className="mt-1 text-[11px] opacity-70">{detail}</div></div>;

const DiscountMarginBreakdownView = ({ breakdown }: { breakdown: DiscountMarginBreakdown }) => {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const groups = [
    { key: 'priceTests', title: 'Afprijzen testen', subtitle: 'Staat stil aan huidige prijs', sortLabel: 'Hoogste voorraadwaarde eerst', icon: <PackageX size={17} />, tone: 'margin-decision-heading--red', surface: 'margin-decision-group--red', row: 'margin-decision-row--red', rows: breakdown.priceTests, count: breakdown.counts.priceTests },
    { key: 'tooMuchDiscount', title: 'Korting te hoog', subtitle: `Na korting onder ${Math.round(breakdown.marginFloor * 100)}% marge`, sortLabel: 'Grootste margeverlies eerst', icon: <TrendingDown size={17} />, tone: 'margin-decision-heading--orange', surface: 'margin-decision-group--orange', row: 'margin-decision-row--orange', rows: breakdown.tooMuchDiscount, count: breakdown.counts.tooMuchDiscount },
    { key: 'healthyDiscount', title: 'Korting binnen marge', subtitle: `Na korting nog minstens ${Math.round(breakdown.marginFloor * 100)}% marge`, sortLabel: 'Meeste verkopen eerst', icon: <TrendingUp size={17} />, tone: 'margin-decision-heading--green', surface: 'margin-decision-group--green', row: 'margin-decision-row--green', rows: breakdown.healthyDiscount, count: breakdown.counts.healthyDiscount },
  ] as const;

  return (
    <div className="mt-5 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div><div className="text-[10px] font-bold uppercase tracking-[0.15em] text-zinc-400">Prijs- en kortingsanalyse</div><p className="mt-1 text-xs text-zinc-500">Rekenregel: aankoopprijs blijft gedekt en de waarschuwing start onder {Math.round(breakdown.marginFloor * 100)}% brutomarge.</p></div>
      </div>
      {groups.map((group) => (
        <div key={group.key} className={`margin-decision-group ${group.surface} rounded-xl border p-4`}>
          <div className={`flex items-center gap-2 ${group.tone}`}>
            {group.icon}
            <div><div className="text-base font-bold">{group.title}</div><div className="text-xs opacity-75">{group.subtitle}</div><div className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide opacity-60">{group.sortLabel}</div></div>
            <span className="ml-auto text-xl font-bold">{group.count} <span className="text-xs font-semibold uppercase tracking-wide opacity-75">producten</span></span>
          </div>
          <div className="mt-3 space-y-2">
            {group.rows.length === 0 ? <div className="rounded-lg border border-dashed border-current/20 px-3 py-3 text-sm opacity-70">Geen producten in deze groep.</div> : (expanded[group.key] ? group.rows : group.rows.slice(0, 8)).map((row) => (
              <div key={`${group.key}-${row.productName}`} className={`margin-decision-row ${group.row} flex flex-col gap-1.5 rounded-lg border px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4`}>
                <span className="min-w-0 break-words text-sm font-semibold leading-5">{row.productName}</span>
                <span className="shrink-0 text-xs font-medium opacity-80">
                  {group.key === 'priceTests'
                    ? `${formatEUR(row.currentPriceCents)} → ${formatEUR(row.testPriceCents)} · marge ${formatMarginPercent(row.testMargin)} · ${row.stockQty} op voorraad`
                    : `${Math.round(row.discountRate * 100)}% korting (${formatEUR(row.discountCents)}) · marge ${formatMarginPercent(row.realizedMargin)} · ${row.units} verkocht`}
                </span>
              </div>
            ))}
            {group.rows.length > 8 && <button type="button" onClick={() => setExpanded((current) => ({ ...current, [group.key]: !current[group.key] }))} className="insight-more-button w-full rounded-lg border px-3 py-2.5 text-sm font-bold transition hover:brightness-95">
              {expanded[group.key] ? 'Toon minder' : `Toon meer (${group.rows.length - 8})`}
            </button>}
          </div>
        </div>
      ))}
    </div>
  );
};

const StockBreakdownView = ({ breakdown }: { breakdown: StockBreakdown }) => {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const groups = [
    { key: 'notSold', title: 'Niet verkocht', subtitle: '90 dagen stil', sortLabel: 'Hoogste voorraadwaarde eerst', icon: <PackageX size={17} />, tone: 'stock-velocity-heading--red', surface: 'stock-velocity-group--red', row: 'stock-velocity-row--red', rows: breakdown.notSold, count: breakdown.counts.notSold },
    { key: 'slow', title: 'Minder snel', subtitle: 'Wel verkocht, niet recent', sortLabel: 'Minste verkopen eerst', icon: <TrendingDown size={17} />, tone: 'stock-velocity-heading--orange', surface: 'stock-velocity-group--orange', row: 'stock-velocity-row--orange', rows: breakdown.slow, count: breakdown.counts.slow },
    { key: 'good', title: 'Verkoopt goed', subtitle: 'Minstens 1 stuk in 30 dagen', sortLabel: 'Meeste verkopen eerst', icon: <TrendingUp size={17} />, tone: 'stock-velocity-heading--green', surface: 'stock-velocity-group--green', row: 'stock-velocity-row--green', rows: breakdown.good, count: breakdown.counts.good },
  ] as const;

  return (
    <div className="space-y-3">
      {groups.map((group) => (
        <div key={group.key} className={`stock-velocity-group ${group.surface} rounded-xl border p-4`}>
          <div className={`flex items-center gap-2 ${group.tone}`}>
            {group.icon}
            <div><div className="text-base font-bold">{group.title}</div><div className="text-xs opacity-75">{group.subtitle}</div><div className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide opacity-60">{group.sortLabel}</div></div>
            <span className="ml-auto text-xl font-bold">{group.count} <span className="text-xs font-semibold uppercase tracking-wide opacity-75">producten</span></span>
          </div>
          <div className="mt-3 space-y-2">
            {group.rows.length === 0 ? <div className="rounded-lg border border-dashed border-current/20 px-3 py-3 text-sm opacity-70">Geen producten in deze groep.</div> : (expanded[group.key] ? group.rows : group.rows.slice(0, 5)).map((row) => (
              <div key={row.productName} className={`stock-velocity-row ${group.row} flex flex-col gap-1.5 rounded-lg border px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4`}>
                <span className="min-w-0 break-words text-sm font-semibold leading-5" title={row.productName}>{row.productName}</span>
                <span className="shrink-0 text-xs font-medium opacity-75">{row.sold30d} verkocht in 30 dagen · {row.stockQty} op voorraad</span>
              </div>
            ))}
            {group.rows.length > 5 && <button type="button" onClick={() => setExpanded((current) => ({ ...current, [group.key]: !current[group.key] }))} className="insight-more-button w-full rounded-lg border px-3 py-2.5 text-sm font-bold transition hover:brightness-95">
              {expanded[group.key] ? 'Toon minder' : `Toon meer (${group.rows.length - 5})`}
            </button>}
          </div>
        </div>
      ))}
    </div>
  );
};

const periodDurationMs = (period: InsightPeriod) => (period === '7d' ? 7 : period === '30d' ? 30 : 365) * 24 * 60 * 60 * 1000;

const filterTransactionsForPeriod = (transactions: Transaction[], period: InsightPeriod, now = Date.now()) => {
  const start = now - periodDurationMs(period);
  return transactions.filter((transaction) => transaction.timestamp >= start && transaction.timestamp <= now);
};

const filterPreviousPeriodTransactions = (transactions: Transaction[], period: InsightPeriod, now = Date.now()) => {
  const duration = periodDurationMs(period);
  const start = now - duration * 2;
  const end = now - duration;
  return transactions.filter((transaction) => transaction.timestamp >= start && transaction.timestamp < end);
};

const percentageChange = (current: number, previous: number) => previous <= 0 ? null : ((current - previous) / previous) * 100;

const formatChange = (change: number | null, period: InsightPeriod) => {
  if (change == null) return `Nog geen vergelijkbare ${period === '12m' ? 'jaarperiode' : 'vorige periode'}.`;
  const sign = change > 0 ? '+' : '';
  return `${sign}${change.toFixed(0).replace('.', ',')}% tegenover de vorige ${period === '12m' ? '12 maanden' : period === '7d' ? '7 dagen' : '30 dagen'}.`;
};

const Metric = ({ icon, label, value, detail }: { icon: ReactNode; label: string; value: string; detail?: string }) => (
  <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
    <div className="flex items-center gap-2 text-zinc-400">
      {icon}
      <span className="text-xs font-semibold uppercase tracking-[0.12em]">{label}</span>
    </div>
    <div className="mt-4 text-2xl font-bold tracking-tight text-white">{value}</div>
    {detail && <div className="mt-1 text-sm text-zinc-500">{detail}</div>}
  </div>
);

const ChartToggle = ({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) => (
  <button
    type="button"
    onClick={onClick}
    className={`rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
      active ? 'bg-sky-400 text-zinc-950' : 'bg-zinc-950 text-zinc-400 hover:bg-zinc-800 hover:text-white'
    }`}
  >
    {label}
  </button>
);

const formatAxisEUR = (cents: number) => new Intl.NumberFormat('nl-BE', {
  style: 'currency',
  currency: 'EUR',
  notation: cents >= 100_000 ? 'compact' : 'standard',
  maximumFractionDigits: cents >= 100_000 ? 1 : 0,
}).format(cents / 100);

const niceCeiling = (value: number) => {
  if (value <= 0) return 100;
  const magnitude = 10 ** Math.floor(Math.log10(value / 4));
  const normalized = value / 4 / magnitude;
  const niceNormalized = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10;
  return niceNormalized * magnitude * 4;
};

const periodLabel = (period: InsightPeriod) => period === '7d' ? 'laatste 7 dagen' : period === '30d' ? 'laatste 30 dagen' : 'laatste 12 maanden';

const SalesChart = ({
  points,
  metric,
  hoveredPoint,
  onHover,
}: {
  points: SalesChartPoint[];
  metric: 'revenue' | 'profit';
  hoveredPoint: SalesChartPoint | null;
  onHover: (point: SalesChartPoint | null) => void;
}) => {
  const values = points.map((point) => metric === 'revenue' ? point.revenueCents : point.grossProfitCents);
  const hasData = values.some((value) => value !== 0);
  const total = values.reduce((sum, value) => sum + value, 0);
  const totalTransactions = points.reduce((sum, point) => sum + point.transactionCount, 0);
  const width = 1040;
  const height = 320;
  const padding = { top: 26, right: 32, bottom: 48, left: 82 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const ceiling = niceCeiling(Math.max(...values, 0));
  const pointX = (index: number) => padding.left + (points.length <= 1 ? innerWidth / 2 : index * (innerWidth / (points.length - 1)));
  const pointY = (value: number) => padding.top + innerHeight - (Math.max(value, 0) / ceiling) * innerHeight;
  const coordinates = points.map((point, index) => ({ x: pointX(index), y: pointY(values[index]), point }));
  const line = coordinates.map(({ x, y }, index) => `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const area = `${line} L ${coordinates.at(-1)?.x ?? padding.left} ${padding.top + innerHeight} L ${coordinates[0]?.x ?? padding.left} ${padding.top + innerHeight} Z`;
  const labelStep = points.length > 12 ? Math.ceil((points.length - 1) / 5) : 1;
  const activeIndex = hoveredPoint ? points.findIndex((point) => point.key === hoveredPoint.key) : -1;
  const activeCoordinate = activeIndex >= 0 ? coordinates[activeIndex] : null;
  const activeValue = activeCoordinate ? values[activeIndex] : null;
  const ticks = Array.from({ length: 5 }, (_, index) => ceiling - (ceiling / 4) * index);

  const selectPoint = (clientX: number, bounds: DOMRect) => {
    if (points.length === 0) return;
    const ratio = Math.max(0, Math.min(1, (clientX - bounds.left) / bounds.width));
    onHover(points[Math.round(ratio * (points.length - 1))]);
  };

  return (
    <div className="mt-6">
      {!hasData ? (
        <div className="insight-chart-surface flex h-[300px] flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-800 text-center">
          <BarChart3 size={28} className="text-zinc-700" />
          <p className="mt-3 font-medium text-zinc-300">Nog geen verkoopdata in deze periode</p>
          <p className="mt-1 max-w-sm text-sm text-zinc-500">Zodra je verkopen afrondt via de kassa, wordt de grafiek automatisch opgebouwd.</p>
        </div>
      ) : (
        <>
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">{metric === 'revenue' ? 'Omzet' : 'Brutowinst'} · {periodLabel(points.length === 12 ? '12m' : points.length === 7 ? '7d' : '30d')}</div>
              <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <div className="text-3xl font-bold tracking-tight text-white">{formatEUR(total)}</div>
                <div className="text-sm text-zinc-500">{totalTransactions} {totalTransactions === 1 ? 'verkoop' : 'verkopen'}</div>
              </div>
            </div>
            <p className="text-sm text-zinc-500">Beweeg over de grafiek voor het detail per {points.length === 12 ? 'maand' : 'dag'}.</p>
          </div>
          <div className="insight-chart-surface relative overflow-hidden rounded-2xl border border-zinc-800">
            <div className="overflow-x-auto">
              <svg viewBox={`0 0 ${width} ${height}`} className="block min-w-[760px] w-full" role="img" aria-label={`${metric === 'revenue' ? 'Omzet' : 'Brutowinst'}grafiek. Beweeg over de grafiek voor detail.`}>
                <defs>
                  <linearGradient id="insight-area" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#0ea5e9" stopOpacity="0.28" />
                    <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0.015" />
                  </linearGradient>
                  <filter id="insight-glow" x="-10%" y="-20%" width="120%" height="140%">
                    <feGaussianBlur stdDeviation="3" result="blur" />
                    <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                  </filter>
                </defs>
                {ticks.map((value) => {
                  const y = pointY(value);
                  return (
                    <g key={value}>
                      <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke="var(--insight-chart-grid)" strokeWidth="1" />
                      <text x={padding.left - 14} y={y + 4} textAnchor="end" fill="var(--insight-chart-label)" fontSize="11" fontWeight="600">{formatAxisEUR(value)}</text>
                    </g>
                  );
                })}
                {activeCoordinate && (
                  <line x1={activeCoordinate.x} x2={activeCoordinate.x} y1={padding.top} y2={padding.top + innerHeight} stroke="var(--insight-chart-cursor)" strokeWidth="1.5" strokeDasharray="4 5" />
                )}
                <path d={area} fill="url(#insight-area)" />
                <path d={line} fill="none" stroke="#38bdf8" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" filter="url(#insight-glow)" />
                {coordinates.map(({ x, y, point }, index) => {
                  const isActive = activeIndex === index;
                  return (
                    <g key={point.key}>
                      <circle cx={x} cy={y} r={isActive ? 6.5 : point.transactionCount > 0 ? 3.2 : 2} fill={isActive ? '#0f172a' : '#38bdf8'} stroke="#7dd3fc" strokeWidth={isActive ? 3 : 0} />
                      {(index % labelStep === 0 || index === points.length - 1) && (
                        <text x={x} y={height - 18} textAnchor="middle" fill="var(--insight-chart-label)" fontSize="11" fontWeight="600">{point.label}</text>
                      )}
                    </g>
                  );
                })}
                <rect
                  x={padding.left}
                  y={padding.top}
                  width={innerWidth}
                  height={innerHeight}
                  fill="transparent"
                  onMouseMove={(event) => selectPoint(event.clientX, event.currentTarget.getBoundingClientRect())}
                  onMouseLeave={() => onHover(null)}
                />
              </svg>
            </div>
            {activeCoordinate && activeValue != null && (
              <div
                className="pointer-events-none absolute top-4 z-10 min-w-48 rounded-xl border border-sky-400/25 bg-zinc-950/95 px-4 py-3 text-left shadow-2xl"
                style={{ left: `${Math.min(76, Math.max(2, (activeCoordinate.x / width) * 100))}%`, transform: 'translateX(-50%)' }}
              >
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-sky-300">{hoveredPoint?.label}</div>
                <div className="mt-1 text-lg font-bold text-white">{formatEUR(activeValue)}</div>
                <div className="mt-1 text-xs text-zinc-400">{hoveredPoint?.transactionCount === 0 ? 'Geen verkoop geregistreerd' : `${hoveredPoint?.transactionCount} ${hoveredPoint?.transactionCount === 1 ? 'verkoop' : 'verkopen'} · brutowinst ${formatEUR(hoveredPoint?.grossProfitCents ?? 0)}`}</div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

const CategoryChart = ({ rows }: { rows: CategoryPerformance[] }) => {
  const visibleRows = rows.slice(0, 5);
  const highestValue = visibleRows[0]?.revenueCents ?? 1;

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
      <div className="flex items-center gap-2">
        <Layers3 size={18} className="text-violet-300" />
        <h2 className="text-lg font-semibold">Omzet per categorie</h2>
      </div>
      <p className="mt-1 text-sm text-zinc-500">Waar je omzet vandaag werkelijk vandaan komt.</p>
      {visibleRows.length === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed border-zinc-800 p-4 text-sm text-zinc-500">Categorieën verschijnen zodra je verkopen registreert.</p>
      ) : (
        <div className="mt-6 space-y-4">
          {visibleRows.map((row) => (
            <div key={row.category}>
              <div className="flex items-end justify-between gap-3 text-sm">
                <div className="min-w-0 truncate font-medium text-zinc-200">{row.category}</div>
                <div className="shrink-0 font-mono text-xs text-zinc-400">{formatEUR(row.revenueCents)}</div>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-950">
                <div className="h-full rounded-full bg-gradient-to-r from-violet-400 to-sky-400" style={{ width: `${Math.max(5, (row.revenueCents / highestValue) * 100)}%` }} />
              </div>
              <div className="mt-1 text-xs text-zinc-500">{row.units} {row.units === 1 ? 'stuk' : 'stuks'} verkocht · brutowinst {formatEUR(row.grossProfitCents)}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};

const paymentColors: Record<PaymentMixItem['method'], string> = {
  Kaart: '#38bdf8',
  PIN: '#38bdf8',
  Cash: '#a3e635',
  Cadeaubon: '#c084fc',
  Split: '#fbbf24',
};

const PaymentMixChart = ({ rows }: { rows: PaymentMixItem[] }) => {
  const total = rows.reduce((sum, row) => sum + row.amountCents, 0);
  const radius = 46;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
      <div className="flex items-center gap-2">
        <CreditCard size={18} className="text-emerald-300" />
        <h2 className="text-lg font-semibold">Betalingsmix</h2>
      </div>
      <p className="mt-1 text-sm text-zinc-500">Hoe klanten hun aankopen betalen.</p>
      {total === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed border-zinc-800 p-4 text-sm text-zinc-500">Betaalmethodes verschijnen zodra je verkopen registreert.</p>
      ) : (
        <div className="mt-5 flex items-center gap-5">
          <div className="relative h-32 w-32 shrink-0">
            <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90" role="img" aria-label="Verdeling van betaalmethodes">
              <circle cx="60" cy="60" r={radius} fill="none" stroke="currentColor" className="text-zinc-800" strokeWidth="13" />
              {rows.map((row) => {
                const length = (row.amountCents / total) * circumference;
                const segment = <circle key={row.method} cx="60" cy="60" r={radius} fill="none" stroke={paymentColors[row.method]} strokeWidth="13" strokeLinecap="butt" strokeDasharray={`${length} ${circumference - length}`} strokeDashoffset={-offset} />;
                offset += length;
                return segment;
              })}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="text-xl font-bold text-white">{rows.length}</span>
              <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">methodes</span>
            </div>
          </div>
          <div className="min-w-0 flex-1 space-y-3">
            {rows.map((row) => {
              const share = Math.round((row.amountCents / total) * 100);
              return (
                <div key={row.method} className="flex items-center justify-between gap-3 text-sm">
                  <div className="flex min-w-0 items-center gap-2"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: paymentColors[row.method] }} /><span className="truncate text-zinc-300">{row.method}</span></div>
                  <span className="shrink-0 font-mono text-xs text-zinc-400">{share}%</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
};

const CustomerCaptureChart = ({ linkedSales, totalSales }: { linkedSales: number; totalSales: number }) => {
  const percentage = totalSales > 0 ? Math.round((linkedSales / totalSales) * 100) : 0;

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
      <div className="flex items-center gap-2">
        <Users size={18} className="text-amber-300" />
        <h2 className="text-lg font-semibold">Klantrelatie</h2>
      </div>
      <p className="mt-1 text-sm text-zinc-500">Hoeveel verkopen al aan een klantprofiel gekoppeld zijn.</p>
      <div className="mt-8">
        <div className="flex items-end justify-between gap-4">
          <div className="text-4xl font-bold tracking-tight text-white">{percentage}%</div>
          <div className="text-right text-sm text-zinc-500"><strong className="font-medium text-zinc-300">{linkedSales}</strong> van {totalSales} verkopen</div>
        </div>
        <div className="mt-4 h-3 overflow-hidden rounded-full bg-zinc-950">
          <div className="h-full rounded-full bg-gradient-to-r from-amber-300 to-emerald-400 transition-all duration-500" style={{ width: `${percentage}%` }} />
        </div>
      </div>
      <div className="mt-7 rounded-xl border border-amber-400/15 bg-amber-400/5 p-4 text-sm text-zinc-300">
        {totalSales === 0 ? 'Koppel klanten aan verkopen om retentie en terugkeer te kunnen meten.' : percentage < 60 ? 'Hier zit nog groei: vraag aan de kassa consequent naar de klantenkaart.' : 'Sterke basis voor retentie: je kunt klanten nu gericht herkennen en opvolgen.'}
      </div>
    </section>
  );
};
