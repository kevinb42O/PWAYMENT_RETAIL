import { useCallback, useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { CheckCircle2, ChevronDown } from "lucide-react";
import { db } from "../db/db";
import { Customer, Product, Transaction } from "../types";
import { useCustomers } from "../store/useCustomers";
import { useCategories } from "../store/useCategories";
import { useProducts } from "../store/useProducts";
import { formatEUR } from "../utils/money";
import {
  buildRetailIntelligence,
  getTransactionSellerIdentity,
} from "../utils/retailIntelligence";
import {
  InsightPeriod,
  SalesChartPoint,
  buildSalesChart,
} from "../utils/retailCharts";
import {
  buildCategoryPerformance,
  buildPaymentMix,
} from "../utils/retailDashboardData";
import {
  buildInventoryForecast,
  buildReorderRecommendations,
} from "../utils/retailActionEngine";
import {
  SeasonalRetailSnapshot,
  buildSeasonalRetailSnapshot,
} from "../utils/seasonalRetail";
import {
  CustomerInsightSnapshot,
  DataQualitySnapshot,
  DiscountInsightSnapshot,
  ProductInsightRow,
  StoreMomentRow,
  buildCustomerInsights,
  buildDataQuality,
  buildDiscountInsights,
  buildHourlyInsights,
  buildProductInsights,
  buildWeekdayInsights,
} from "../utils/insightsAnalytics";
import { InventoryForecast } from "./InventoryForecast";
import { Modal } from "./Modal";
import { getZonedDateParts } from "../utils/time";
import { useAuth } from "../auth/useAuth";
import {
  InsightsMobileNavigation,
  InsightsPage,
  InsightsSection,
  InsightsSidebar,
  defaultPageForSection,
} from "./insights/InsightsSidebar";
import {
  HorizontalBars,
  EmptyChart,
  MetricCard,
  PageHeader,
  PeriodControl,
  SectionCard,
  SegmentControl,
  DonutBreakdown,
  TextLink,
  VerticalBars,
} from "./insights/InsightPrimitives";

type WorkflowView = "active" | "snoozed";
type WorkflowState = Record<string, { snoozedUntil: number }>;
type ChartMetric = "revenue" | "profit";
type RankedMetric = "revenue" | "profit" | "units";
type MomentMetric = "revenue" | "transactions" | "average";
type CustomerSort =
  | "revenue-desc"
  | "revenue-asc"
  | "purchases-desc"
  | "purchases-asc"
  | "recent-desc"
  | "name-asc";

interface OwnerAction {
  id: string;
  tone: "attention" | "opportunity";
  label: string;
  title: string;
  metricLabel: string;
  metricValue: string;
  secondaryLabel: string;
  secondaryValue: string;
  chartTitle?: string;
  chartRows?: Array<{
    key: string;
    label: string;
    value: number;
    secondary?: string;
  }>;
  chartFormat?: "currency" | "percent" | "number";
  destination: { section: InsightsSection; page: InsightsPage; label: string };
}

const WORKFLOW_KEY = "pwayment_insight_workflow_v3";
const LEGACY_WORKFLOW_KEY = "pwayment_insight_workflow_v2";
const DAY_MS = 86_400_000;

const nextMorning = (now = Date.now()) => {
  const date = new Date(now);
  date.setDate(date.getDate() + 1);
  date.setHours(9, 0, 0, 0);
  return date.getTime();
};

const readWorkflow = (): WorkflowState => {
  try {
    const raw = window.localStorage.getItem(WORKFLOW_KEY);
    if (raw) return JSON.parse(raw) as WorkflowState;
    const legacyRaw = window.localStorage.getItem(LEGACY_WORKFLOW_KEY);
    if (!legacyRaw) return {};
    const legacy = JSON.parse(legacyRaw) as Record<
      string,
      "open" | "later" | "done"
    >;
    return Object.fromEntries(
      Object.entries(legacy)
        .filter(([, status]) => status === "later")
        .map(([id]) => [id, { snoozedUntil: nextMorning() }]),
    );
  } catch {
    return {};
  }
};

const isSnoozed = (workflow: WorkflowState, id: string, now: number) =>
  (workflow[id]?.snoozedUntil ?? 0) > now;

const validSections: InsightsSection[] = [
  "today",
  "performance",
  "inventory",
  "seasons",
  "customers",
  "team",
  "quality",
];
const validPages: InsightsPage[] = [
  "today",
  "performance-overview",
  "performance-products",
  "performance-moments",
  "performance-discounts",
  "inventory-overview",
  "inventory-reorder",
  "inventory-velocity",
  "seasons-forecast",
  "seasons-rhythm",
  "seasons-categories",
  "customers-overview",
  "customers-return",
  "customers-value",
  "team-overview",
  "team-activity",
  "quality",
];

const initialLocation = () => {
  const parameters = new URLSearchParams(window.location.search);
  const requestedSection = parameters.get("section") as InsightsSection | null;
  const section =
    requestedSection && validSections.includes(requestedSection)
      ? requestedSection
      : "today";
  const requestedPage = parameters.get("insight") as InsightsPage | null;
  const page =
    requestedPage && validPages.includes(requestedPage)
      ? requestedPage
      : defaultPageForSection(section);
  return { section, page };
};

export const Insights = () => {
  const presentationMode =
    new URLSearchParams(window.location.search).get("presentation") === "1" &&
    (import.meta.env.DEV || import.meta.env.VITE_PRESENTATION_BUILD === "true");
  const demoStore = useAuth((state) => state.currentStoreIsDemo);
  const products = useProducts((state) => state.list);
  const hydrateProducts = useProducts((state) => state.hydrate);
  const customers = useCustomers((state) => state.customers);
  const hydrateCustomers = useCustomers((state) => state.hydrate);
  const categories = useCategories((state) => state.list);
  const hydrateCategories = useCategories((state) => state.hydrate);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<InsightPeriod>("30d");
  const [location, setLocation] = useState(initialLocation);
  const [workflow, setWorkflow] = useState<WorkflowState>(readWorkflow);
  const [workflowClock, setWorkflowClock] = useState(Date.now);

  const load = useCallback(async () => {
    setLoading(true);
    await Promise.all([
      hydrateProducts(),
      hydrateCustomers(),
      hydrateCategories(),
    ]);
    const rows = await db.transactions.orderBy("timestamp").reverse().toArray();
    setTransactions(rows);
    setLoading(false);
  }, [hydrateCategories, hydrateCustomers, hydrateProducts]);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    const timer = window.setInterval(
      () => setWorkflowClock(Date.now()),
      60_000,
    );
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    try {
      window.localStorage.setItem(WORKFLOW_KEY, JSON.stringify(workflow));
    } catch {
      /* Non-critical preference. */
    }
  }, [workflow]);
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("section", location.section);
    url.searchParams.set("insight", location.page);
    window.history.replaceState(window.history.state, "", url);
  }, [location]);

  const now = workflowClock;
  const analysisTransactions = useMemo(
    () =>
      transactions.filter(
        (transaction) =>
          presentationMode ||
          demoStore ||
          (transaction.source ?? "live") !== "demo",
      ),
    [demoStore, presentationMode, transactions],
  );
  const periodTransactions = useMemo(
    () => filterTransactionsForPeriod(analysisTransactions, period, now),
    [analysisTransactions, now, period],
  );
  const previousTransactions = useMemo(
    () => filterPreviousPeriodTransactions(analysisTransactions, period, now),
    [analysisTransactions, now, period],
  );
  const users = useLiveQuery(() => db.users.toArray()) || [];

  const snapshot = useMemo(
    () => buildRetailIntelligence(periodTransactions, products, customers, now, users),
    [customers, periodTransactions, products, now, users],
  );
  const previousSnapshot = useMemo(
    () => buildRetailIntelligence(previousTransactions, products, customers),
    [customers, previousTransactions, products],
  );
  const currentChart = useMemo(
    () => buildSalesChart(analysisTransactions, period, new Date(now)),
    [analysisTransactions, now, period],
  );
  const previousChart = useMemo(
    () =>
      buildSalesChart(
        analysisTransactions,
        period,
        new Date(periodBounds(period, now).previousEnd),
      ),
    [analysisTransactions, now, period],
  );
  const categoryLabels = useMemo(
    () =>
      Object.fromEntries(
        categories.map((category) => [category.id, category.name]),
      ),
    [categories],
  );
  const categoryPerformance = useMemo(
    () =>
      buildCategoryPerformance(periodTransactions).map((row) => ({
        ...row,
        category: categoryLabels[row.category] ?? row.category,
      })),
    [categoryLabels, periodTransactions],
  );
  const paymentMix = useMemo(
    () => buildPaymentMix(periodTransactions),
    [periodTransactions],
  );
  const productInsights = useMemo(
    () => buildProductInsights(periodTransactions, previousTransactions),
    [periodTransactions, previousTransactions],
  );
  const discountInsights = useMemo(
    () => buildDiscountInsights(periodTransactions),
    [periodTransactions],
  );
  const latestThirtyDayTransactions = useMemo(
    () => filterTransactionsForPeriod(analysisTransactions, "30d", now),
    [analysisTransactions, now],
  );
  const latestThirtyDayDiscountInsights = useMemo(
    () => buildDiscountInsights(latestThirtyDayTransactions),
    [latestThirtyDayTransactions],
  );
  const weekdayInsights = useMemo(
    () => buildWeekdayInsights(periodTransactions),
    [periodTransactions],
  );
  const hourlyInsights = useMemo(
    () => buildHourlyInsights(periodTransactions),
    [periodTransactions],
  );
  const customerInsights = useMemo(
    () => buildCustomerInsights(analysisTransactions, customers),
    [analysisTransactions, customers],
  );
  const dataQuality = useMemo(
    () => buildDataQuality(products, analysisTransactions, customers),
    [analysisTransactions, customers, products],
  );
  const inventoryRows = useMemo(
    () => buildInventoryForecast(products, analysisTransactions),
    [analysisTransactions, products],
  );
  const inventoryRecommendations = useMemo(
    () => buildReorderRecommendations(products, analysisTransactions),
    [analysisTransactions, products],
  );
  const seasonalSnapshot = useMemo(
    () => buildSeasonalRetailSnapshot(analysisTransactions, now),
    [analysisTransactions, now],
  );
  const stockSnapshot = useMemo(
    () => buildStockSnapshot(products, analysisTransactions),
    [analysisTransactions, products],
  );
  const actions = useMemo(
    () =>
      buildOwnerActions({
        seasonalSnapshot,
        stockSnapshot,
        customerInsights,
        discountInsights: latestThirtyDayDiscountInsights,
        transactions: analysisTransactions,
        inventoryRecommendations,
        categoryLabels,
      }),
    [
      analysisTransactions,
      categoryLabels,
      customerInsights,
      inventoryRecommendations,
      latestThirtyDayDiscountInsights,
      seasonalSnapshot,
      stockSnapshot,
    ],
  );
  const activeActionCount = actions.filter(
    (action) => !isSnoozed(workflow, action.id, workflowClock),
  ).length;
  const snoozedActionCount = actions.length - activeActionCount;
  const measurableQualitySources = dataQuality.sources.filter(
    (source) => source.total > 0,
  );
  const qualitySourcesOnLevel = measurableQualitySources.filter(
    (source) => source.coverage >= 85,
  ).length;
  const qualityLabel = measurableQualitySources.length
    ? `${qualitySourcesOnLevel}/${measurableQualitySources.length} op niveau`
    : "Nog geen data";

  const navigate = (section: InsightsSection, page: InsightsPage) =>
    setLocation({ section, page });
  const periodActions = <PeriodControl period={period} onChange={setPeriod} />;
  const badges: Partial<Record<InsightsSection, string | number>> = {
    today: activeActionCount
      ? `${activeActionCount} actueel`
      : snoozedActionCount
        ? `${snoozedActionCount} uitgesteld`
        : undefined,
    inventory: inventoryRecommendations.length
      ? `${inventoryRecommendations.length} ${inventoryRecommendations.length === 1 ? "advies" : "adviezen"}`
      : undefined,
    seasons:
      seasonalSnapshot.daysUntilNextSeason <= 45
        ? `${seasonalSnapshot.daysUntilNextSeason} d`
        : undefined,
  };

  return (
    <div className="insights-light flex min-h-0 flex-1 overflow-hidden">
      <InsightsSidebar
        section={location.section}
        page={location.page}
        onNavigate={navigate}
        badges={badges}
        qualityLabel={qualityLabel}
      />
      <main className="min-w-0 flex-1 overflow-y-auto bg-slate-50 px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
        <div className="mx-auto max-w-[1320px]">
          <InsightsMobileNavigation
            section={location.section}
            page={location.page}
            onNavigate={navigate}
            badges={badges}
            qualityLabel={qualityLabel}
          />
          {loading ? (
            <InsightsLoading />
          ) : (
            <>
              {location.page === "today" && (
                <TodayPage
                  actions={actions}
                  workflow={workflow}
                  now={workflowClock}
                  demoMode={demoStore || presentationMode}
                  onSnooze={(id, until) =>
                    setWorkflow((current) => {
                      const next = { ...current };
                      if (until == null) delete next[id];
                      else next[id] = { snoozedUntil: until };
                      return next;
                    })
                  }
                  onNavigate={navigate}
                />
              )}
              {location.page === "performance-overview" && (
                <PerformanceOverview
                  snapshot={snapshot}
                  previousSnapshot={previousSnapshot}
                  currentChart={currentChart}
                  previousChart={previousChart}
                  categories={categoryPerformance}
                  paymentMix={paymentMix}
                  period={period}
                  now={now}
                  costCoverage={dataQuality.costPriceCoverage}
                  discountCents={discountInsights.discountCents}
                  headerActions={periodActions}
                  onNavigate={navigate}
                />
              )}
              {location.page === "performance-products" && (
                <ProductPerformancePage
                  rows={productInsights}
                  categoryLabels={categoryLabels}
                  period={period}
                  now={now}
                  costCoverage={dataQuality.costPriceCoverage}
                  headerActions={periodActions}
                />
              )}
              {location.page === "performance-moments" && (
                <StoreMomentsPage
                  weekdays={weekdayInsights}
                  hours={hourlyInsights}
                  period={period}
                  now={now}
                  headerActions={periodActions}
                />
              )}
              {location.page === "performance-discounts" && (
                <DiscountPerformancePage
                  snapshot={discountInsights}
                  categoryLabels={categoryLabels}
                  period={period}
                  now={now}
                  totalSales={periodTransactions.length}
                  headerActions={periodActions}
                />
              )}
              {location.page === "inventory-overview" && (
                <InventoryOverview
                  stock={stockSnapshot}
                  recommendations={inventoryRecommendations.length}
                  forecast={inventoryRows}
                  categoryLabels={categoryLabels}
                  onNavigate={navigate}
                />
              )}
              {location.page === "inventory-reorder" && (
                <>
                  <PageHeader
                    title="Besteladvies"
                    subtitle="Op basis van verkooptempo en minimumvoorraad · niets wordt automatisch besteld"
                  />
                  <InventoryForecast
                    rows={inventoryRows}
                    recommendations={inventoryRecommendations}
                    products={products}
                    onInventoryChanged={load}
                  />
                </>
              )}
              {location.page === "inventory-velocity" && (
                <InventoryVelocityPage
                  stock={stockSnapshot}
                  categoryLabels={categoryLabels}
                />
              )}
              {location.page === "seasons-forecast" && (
                <SeasonForecastPage
                  snapshot={seasonalSnapshot}
                  categoryLabels={categoryLabels}
                  onNavigate={navigate}
                />
              )}
              {location.page === "seasons-rhythm" && (
                <SeasonRhythmPage snapshot={seasonalSnapshot} />
              )}
              {location.page === "seasons-categories" && (
                <SeasonCategoriesPage
                  snapshot={seasonalSnapshot}
                  categoryLabels={categoryLabels}
                />
              )}
              {location.page === "customers-overview" && (
                <CustomerOverviewPage
                  snapshot={customerInsights}
                  linkedSales={
                    periodTransactions.filter((row) => row.customerId).length
                  }
                  totalSales={periodTransactions.length}
                  period={period}
                  periodActions={periodActions}
                  onNavigate={navigate}
                />
              )}
              {location.page === "customers-return" && (
                <CustomerReturnPage snapshot={customerInsights} />
              )}
              {location.page === "customers-value" && (
                <CustomerValuePage
                  snapshot={customerInsights}
                  customers={customers}
                  transactions={analysisTransactions}
                />
              )}
              {location.page === "team-overview" && (
                <TeamOverviewPage
                  employees={snapshot.employeePerformance}
                  totalSales={periodTransactions.length}
                  period={period}
                  now={now}
                  headerActions={periodActions}
                />
              )}
              {location.page === "team-activity" && (
                <TeamActivityPage
                  transactions={periodTransactions}
                  users={users}
                  period={period}
                  now={now}
                  headerActions={periodActions}
                />
              )}
              {location.page === "quality" && (
                <DataQualityPage snapshot={dataQuality} />
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
};

const TodayPage = ({
  actions,
  workflow,
  now,
  demoMode,
  onSnooze,
  onNavigate,
}: {
  actions: OwnerAction[];
  workflow: WorkflowState;
  now: number;
  demoMode: boolean;
  onSnooze: (id: string, until: number | null) => void;
  onNavigate: (section: InsightsSection, page: InsightsPage) => void;
}) => {
  const [view, setView] = useState<WorkflowView>("active");
  const visibleActions = actions.filter(
    (action) => isSnoozed(workflow, action.id, now) === (view === "snoozed"),
  );
  const [selectedId, setSelectedId] = useState(actions[0]?.id ?? "");
  const selected =
    visibleActions.find((action) => action.id === selectedId) ??
    visibleActions[0];
  useEffect(() => {
    if (selected && selected.id !== selectedId) setSelectedId(selected.id);
  }, [selected, selectedId]);
  const counts = {
    active: actions.filter((action) => !isSnoozed(workflow, action.id, now))
      .length,
    snoozed: actions.filter((action) => isSnoozed(workflow, action.id, now))
      .length,
  };
  return (
    <>
      <PageHeader
        title="Acties vandaag"
        subtitle={`Actuele signalen uit verkoop, voorraad, seizoenen en klanten · ${demoMode ? "gevulde demo-omgeving" : "uitsluitend livegegevens"}`}
        actions={
          <SegmentControl<WorkflowView>
            value={view}
            onChange={setView}
            label="Signalen"
            options={[
              { id: "active", label: `Actueel ${counts.active}` },
              { id: "snoozed", label: `Uitgesteld ${counts.snoozed}` },
            ]}
          />
        }
      />
      {selected ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <section className="insights-panel min-w-0 p-5 sm:p-6">
            <div
              className={`text-[11px] font-extrabold uppercase tracking-[0.12em] ${selected.tone === "attention" ? "text-amber-700" : "text-emerald-700"}`}
            >
              {selected.label}
            </div>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">
              {selected.title}
            </h2>
            {view === "snoozed" && (
              <div className="mt-3 text-xs font-semibold text-slate-500">
                Opnieuw actueel op{" "}
                {formatSnoozeDate(workflow[selected.id].snoozedUntil)}
              </div>
            )}
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <MetricCard
                label={selected.metricLabel}
                value={selected.metricValue}
              />
              <MetricCard
                label={selected.secondaryLabel}
                value={selected.secondaryValue}
              />
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-5">
              <button
                type="button"
                onClick={() =>
                  onNavigate(
                    selected.destination.section,
                    selected.destination.page,
                  )
                }
                className="insights-primary-action rounded-lg px-4 py-2.5 text-sm font-bold"
              >
                {selected.destination.label}
              </button>
              {view === "active" ? (
                <button
                  type="button"
                  onClick={() => onSnooze(selected.id, nextMorning(now))}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50"
                >
                  Uitstellen tot morgen
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onSnooze(selected.id, null)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50"
                >
                  Nu terugzetten
                </button>
              )}
            </div>
            {selected.chartRows && selected.chartRows.length > 0 && (
              <div className="mt-6 border-t border-slate-100 pt-5">
                <div className="mb-4 text-xs font-bold text-slate-600">
                  {selected.chartTitle}
                </div>
                <HorizontalBars
                  rows={selected.chartRows}
                  formatValue={
                    selected.chartFormat === "currency"
                      ? formatEUR
                      : selected.chartFormat === "percent"
                        ? (value) => `${value.toFixed(0)}%`
                        : (value) => String(Math.round(value))
                  }
                />
              </div>
            )}
          </section>
          <aside className="insights-panel p-3">
            <div className="px-2 pb-2 pt-1 text-[10px] font-extrabold uppercase tracking-[0.14em] text-slate-600">
              {view === "active" ? "Actuele signalen" : "Uitgestelde signalen"}
            </div>
            <div className="space-y-1">
              {visibleActions.map((action, index) => (
                <button
                  key={action.id}
                  type="button"
                  onClick={() => setSelectedId(action.id)}
                  aria-pressed={selected?.id === action.id}
                  className={`insights-queue-item flex w-full gap-3 rounded-lg p-3 text-left ${selected?.id === action.id ? "insights-queue-item--active" : ""}`}
                >
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md border border-slate-200 bg-white text-[10px] font-bold text-slate-500">
                    {index + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-600">
                      {action.label}
                    </span>
                    <span className="mt-1 block text-sm font-bold leading-5 text-slate-800">
                      {action.title}
                    </span>
                    <span className="mt-1 block text-xs text-slate-500">
                      {view === "snoozed"
                        ? `Terug ${formatSnoozeDate(workflow[action.id].snoozedUntil)}`
                        : action.metricValue}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </aside>
        </div>
      ) : (
        <section className="insights-panel grid min-h-72 place-items-center p-8 text-center">
          <div>
            <CheckCircle2 size={30} className="mx-auto text-emerald-600" />
            <h2 className="mt-3 font-bold text-slate-900">
              {view === "active"
                ? "Geen actuele signalen"
                : "Geen uitgestelde signalen"}
            </h2>
          </div>
        </section>
      )}
    </>
  );
};

const PerformanceOverview = ({
  snapshot,
  previousSnapshot,
  currentChart,
  previousChart,
  categories,
  paymentMix,
  period,
  now,
  costCoverage,
  discountCents,
  headerActions,
  onNavigate,
}: {
  snapshot: ReturnType<typeof buildRetailIntelligence>;
  previousSnapshot: ReturnType<typeof buildRetailIntelligence>;
  currentChart: SalesChartPoint[];
  previousChart: SalesChartPoint[];
  categories: ReturnType<typeof buildCategoryPerformance>;
  paymentMix: ReturnType<typeof buildPaymentMix>;
  period: InsightPeriod;
  now: number;
  costCoverage: number;
  discountCents: number;
  headerActions: React.ReactNode;
  onNavigate: (section: InsightsSection, page: InsightsPage) => void;
}) => {
  const [metric, setMetric] = useState<ChartMetric>("revenue");
  const profitAvailable = costCoverage === 100;
  useEffect(() => {
    if (!profitAvailable && metric === "profit") setMetric("revenue");
  }, [metric, profitAvailable]);
  return (
    <>
      <PageHeader
        title="Verkoopprestaties"
        subtitle={periodComparisonSubtitle(period, now)}
        actions={headerActions}
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Netto-omzet"
          value={formatEUR(snapshot.revenueCents)}
          change={percentageChange(
            snapshot.revenueCents,
            previousSnapshot.revenueCents,
          )}
          detail={`Na ${formatEUR(discountCents)} korting`}
        />
        <MetricCard
          label="Brutowinst"
          value={profitAvailable ? formatEUR(snapshot.grossProfitCents) : "—"}
          change={
            profitAvailable
              ? percentageChange(
                  snapshot.grossProfitCents,
                  previousSnapshot.grossProfitCents,
                )
              : null
          }
          detail={
            profitAvailable && snapshot.grossMarginPercent != null
              ? `${snapshot.grossMarginPercent.toFixed(1).replace(".", ",")}% van netto-omzet`
              : `${costCoverage}% van kostprijzen ingevuld`
          }
        />
        <MetricCard
          label="Afgeronde verkopen"
          value={String(snapshot.transactionCount)}
          change={percentageChange(
            snapshot.transactionCount,
            previousSnapshot.transactionCount,
          )}
          detail={periodRangeLabel(period, now)}
        />
        <MetricCard
          label="Gemiddelde omzet per verkoop"
          value={formatEUR(
            snapshot.transactionCount > 0
              ? Math.round(snapshot.revenueCents / snapshot.transactionCount)
              : 0,
          )}
          detail={`${formatEUR(snapshot.revenueCents)} verdeeld over ${snapshot.transactionCount} verkopen`}
        />
      </div>
      <div className="mt-4">
        <SectionCard
          title={
            metric === "revenue" ? "Netto-omzet per dag" : "Brutowinst per dag"
          }
          subtitle={`${periodRangeLabel(period, now)} · stippellijn is ${previousPeriodRangeLabel(period, now)}`}
          action={
            <SegmentControl<ChartMetric>
              value={metric}
              onChange={setMetric}
              label="Waarde"
              options={
                profitAvailable
                  ? [
                      { id: "revenue", label: "Netto-omzet" },
                      { id: "profit", label: "Brutowinst" },
                    ]
                  : [{ id: "revenue", label: "Netto-omzet" }]
              }
            />
          }
        >
          <TrendChart
            current={currentChart}
            previous={previousChart}
            metric={metric}
          />
        </SectionCard>
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-[1.25fr_.75fr]">
        <SectionCard
          title="Netto-omzet per categorie"
          subtitle={periodRangeLabel(period, now)}
          action={
            <TextLink
              label="Bekijk productprestaties"
              onClick={() => onNavigate("performance", "performance-products")}
            />
          }
        >
          <HorizontalBars
            rows={categories.slice(0, 6).map((row) => ({
              key: row.category,
              label: row.category,
              value: row.revenueCents,
              secondary: `${row.units} stuks${profitAvailable ? ` · ${formatEUR(row.grossProfitCents)} brutowinst` : ""}`,
            }))}
            formatValue={formatEUR}
          />
        </SectionCard>
        <SectionCard
          title="Omzet per betaalwijze"
          subtitle={periodRangeLabel(period, now)}
        >
          <DonutBreakdown
            rows={paymentMix.map((row) => ({
              key: row.method,
              label: row.method,
              value: row.amountCents,
            }))}
            centerLabel="Netto-omzet"
            ariaLabel="Netto-omzet verdeeld per betaalwijze"
          />
        </SectionCard>
      </div>
    </>
  );
};

const ProductPerformancePage = ({
  rows,
  categoryLabels,
  period,
  now,
  costCoverage,
  headerActions,
}: {
  rows: ProductInsightRow[];
  categoryLabels: Record<string, string>;
  period: InsightPeriod;
  now: number;
  costCoverage: number;
  headerActions: React.ReactNode;
}) => {
  const [metric, setMetric] = useState<RankedMetric>("revenue");
  const [category, setCategory] = useState("all");
  const categories = [...new Set(rows.map((row) => row.category))].sort();
  const filtered = rows
    .filter((row) => category === "all" || row.category === category)
    .sort((a, b) =>
      metric === "revenue"
        ? b.revenueCents - a.revenueCents
        : metric === "profit"
          ? b.grossProfitCents - a.grossProfitCents
          : b.units - a.units,
    );
  const comparable = rows.filter(
    (row) => row.previousRevenueCents >= 5000 && row.changePercent != null,
  );
  const strongest = [...comparable].sort(
    (a, b) => (b.changePercent ?? -Infinity) - (a.changePercent ?? -Infinity),
  )[0];
  const profitRows = rows.filter((row) => row.missingCostLines === 0);
  const highestProfit = [...profitRows].sort(
    (a, b) => b.grossProfitCents - a.grossProfitCents,
  )[0];
  const chartTitle =
    metric === "revenue"
      ? "Netto-omzet per product"
      : metric === "profit"
        ? "Brutowinst per product"
        : "Verkochte stuks per product";
  return (
    <>
      <PageHeader
        title="Productprestaties"
        subtitle={periodComparisonSubtitle(period, now)}
        actions={headerActions}
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <MetricCard
          label="Hoogste netto-omzet"
          value={rows[0]?.name ?? "—"}
          detail={rows[0] ? formatEUR(rows[0].revenueCents) : undefined}
        />
        <MetricCard
          label="Hoogste brutowinst"
          value={costCoverage === 100 ? (highestProfit?.name ?? "—") : "—"}
          detail={
            costCoverage === 100 && highestProfit
              ? formatEUR(highestProfit.grossProfitCents)
              : `${costCoverage}% van kostprijzen ingevuld`
          }
        />
        <MetricCard
          label="Sterkste omzetgroei"
          value={strongest?.name ?? "—"}
          detail={
            strongest?.changePercent != null
              ? `${formatEUR(strongest.previousRevenueCents)} → ${formatEUR(strongest.revenueCents)} · +${strongest.changePercent.toFixed(0)}%`
              : "Geen product met voldoende vergelijkbare omzet"
          }
        />
      </div>
      <div className="mt-4">
        <SectionCard
          title={chartTitle}
          subtitle={`Hoog naar laag · ${periodRangeLabel(period, now)} · groeipercentage alleen bij minstens €50 omzet in de vorige periode`}
          action={
            <div className="flex flex-wrap justify-end gap-2">
              <select
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                aria-label="Categorie"
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:border-cyan-600"
              >
                <option value="all">Alle categorieën</option>
                {categories.map((value) => (
                  <option key={value} value={value}>
                    {categoryLabels[value] ?? value}
                  </option>
                ))}
              </select>
              <SegmentControl<RankedMetric>
                value={metric}
                onChange={setMetric}
                label="Productmaatstaf"
                options={[
                  { id: "revenue", label: "Netto-omzet" },
                  { id: "profit", label: "Brutowinst" },
                  { id: "units", label: "Stuks" },
                ]}
              />
            </div>
          }
        >
          {metric === "profit" && costCoverage < 100 ? (
            <EmptyChart
              label={`Brutowinst is niet betrouwbaar: ${costCoverage}% van kostprijzen is ingevuld.`}
            />
          ) : (
            <HorizontalBars
              rows={filtered
                .filter(
                  (row) => metric !== "profit" || row.missingCostLines === 0,
                )
                .slice(0, 12)
                .map((row) => ({
                  key: row.productId,
                  label: row.name,
                  value:
                    metric === "revenue"
                      ? row.revenueCents
                      : metric === "profit"
                        ? row.grossProfitCents
                        : row.units,
                  secondary: `${categoryLabels[row.category] ?? row.category}${row.changePercent == null ? "" : ` · ${row.changePercent >= 0 ? "+" : ""}${row.changePercent.toFixed(0)}% tegenover vorige periode`}`,
                }))}
              formatValue={
                metric === "units" ? (value) => `${value} stuks` : formatEUR
              }
            />
          )}
        </SectionCard>
      </div>
    </>
  );
};

const StoreMomentsPage = ({
  weekdays,
  hours,
  period,
  now,
  headerActions,
}: {
  weekdays: StoreMomentRow[];
  hours: StoreMomentRow[];
  period: InsightPeriod;
  now: number;
  headerActions: React.ReactNode;
}) => {
  const [metric, setMetric] = useState<MomentMetric>("revenue");
  const strongestDay = [...weekdays].sort(
    (a, b) => b.revenueCents - a.revenueCents,
  )[0];
  const strongestHour = [...hours].sort(
    (a, b) => b.revenueCents - a.revenueCents,
  )[0];
  return (
    <>
      <PageHeader
        title="Verkoopmomenten"
        subtitle={`Wanneer verkopen en omzet ontstaan · ${periodRangeLabel(period, now)}`}
        actions={headerActions}
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <MetricCard
          label="Weekdag met meeste omzet"
          value={
            strongestDay?.revenueCents
              ? fullWeekdayLabel(strongestDay.label)
              : "—"
          }
          detail={
            strongestDay?.revenueCents
              ? formatEUR(strongestDay.revenueCents)
              : undefined
          }
        />
        <MetricCard
          label="Uur met meeste omzet"
          value={
            strongestHour?.revenueCents
              ? hourRangeLabel(strongestHour.key)
              : "—"
          }
          detail={
            strongestHour?.revenueCents
              ? formatEUR(strongestHour.revenueCents)
              : undefined
          }
        />
        <MetricCard
          label="Gemiddelde omzet per verkoop"
          value={formatEUR(
            weekdays.reduce((sum, row) => sum + row.transactionCount, 0) > 0
              ? Math.round(
                  weekdays.reduce((sum, row) => sum + row.revenueCents, 0) /
                    weekdays.reduce(
                      (sum, row) => sum + row.transactionCount,
                      0,
                    ),
                )
              : 0,
          )}
          detail={periodRangeLabel(period, now)}
        />
      </div>
      <div className="mt-4">
        <SectionCard
          title={`${momentMetricLabel(metric)} per weekdag`}
          subtitle={periodRangeLabel(period, now)}
          action={
            <SegmentControl<MomentMetric>
              value={metric}
              onChange={setMetric}
              label="Waarde"
              options={[
                { id: "revenue", label: "Netto-omzet" },
                { id: "transactions", label: "Verkopen" },
                { id: "average", label: "Gemiddelde omzet" },
              ]}
            />
          }
        >
          <VerticalBars rows={weekdays} metric={metric} />
        </SectionCard>
      </div>
      <div className="mt-4">
        <SectionCard
          title={`${momentMetricLabel(metric)} per uur`}
          subtitle={`Lokale winkeltijd · ${periodRangeLabel(period, now)}`}
        >
          <VerticalBars rows={hours} metric={metric} />
        </SectionCard>
      </div>
    </>
  );
};

const DiscountPerformancePage = ({
  snapshot,
  categoryLabels,
  period,
  now,
  totalSales,
  headerActions,
}: {
  snapshot: DiscountInsightSnapshot;
  categoryLabels: Record<string, string>;
  period: InsightPeriod;
  now: number;
  totalSales: number;
  headerActions: React.ReactNode;
}) => (
  <>
    <PageHeader
      title="Kortingsanalyse"
      subtitle={`Gegeven korting en brutomarge op afgeprijsde verkopen · ${periodRangeLabel(period, now)}`}
      actions={headerActions}
    />
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard
        label="Totaal gegeven korting"
        value={formatEUR(snapshot.discountCents)}
        detail={periodRangeLabel(period, now)}
      />
      <MetricCard
        label="Korting als aandeel van brutoverkoop"
        value={`${snapshot.discountRate.toFixed(1).replace(".", ",")}%`}
        detail={`Brutoverkoop vóór korting: ${formatEUR(snapshot.grossSalesBeforeDiscountCents)}`}
      />
      <MetricCard
        label="Verkopen met korting"
        value={String(snapshot.discountedTransactionCount)}
        detail={`${snapshot.discountedTransactionCount} van ${totalSales} afgeronde verkopen`}
      />
      <MetricCard
        label="Brutomarge op afgeprijsde verkopen"
        value={
          snapshot.marginAfterDiscountPercent == null
            ? "—"
            : `${snapshot.marginAfterDiscountPercent.toFixed(1).replace(".", ",")}%`
        }
        detail={
          snapshot.marginAfterDiscountPercent == null
            ? `${snapshot.missingCostLines} verkoopregels zonder kostprijs`
            : `${formatEUR(snapshot.grossProfitAfterDiscountCents)} brutowinst`
        }
      />
    </div>
    <div className="mt-4 grid gap-4 xl:grid-cols-2">
      <SectionCard
        title="Gegeven korting per categorie"
        subtitle={`Hoog naar laag · ${periodRangeLabel(period, now)}`}
      >
        <HorizontalBars
          rows={snapshot.categoryRows.slice(0, 8).map((row) => ({
            key: row.key,
            label: categoryLabels[row.key] ?? row.label,
            value: row.discountCents,
            secondary: `${row.transactionCount} ${row.transactionCount === 1 ? "verkoop" : "verkopen"} · ${row.marginPercent == null ? "brutomarge onbekend" : `${row.marginPercent.toFixed(0)}% brutomarge`}`,
          }))}
          formatValue={formatEUR}
          emptyLabel="Geen kortingen in deze periode."
        />
      </SectionCard>
      <SectionCard
        title="Gegeven korting per product"
        subtitle={`Hoog naar laag · ${periodRangeLabel(period, now)}`}
      >
        <HorizontalBars
          rows={snapshot.productRows.slice(0, 8).map((row) => ({
            key: row.key,
            label: row.label,
            value: row.discountCents,
            secondary: `${row.transactionCount} ${row.transactionCount === 1 ? "verkoop" : "verkopen"} · ${row.marginPercent == null ? "brutomarge onbekend" : `${row.marginPercent.toFixed(0)}% brutomarge`}`,
          }))}
          formatValue={formatEUR}
          emptyLabel="Geen producten met korting in deze periode."
        />
      </SectionCard>
    </div>
  </>
);

interface StockRow {
  productId: string;
  name: string;
  category: string;
  stockQty: number;
  valueCents: number;
  sold30d: number;
  sold90d: number;
}
interface StockSnapshot {
  totalValueCents: number;
  stagnantValueCents: number;
  trackedProducts: number;
  rows: StockRow[];
}

const InventoryOverview = ({
  stock,
  recommendations,
  forecast,
  categoryLabels,
  onNavigate,
}: {
  stock: StockSnapshot;
  recommendations: number;
  forecast: ReturnType<typeof buildInventoryForecast>;
  categoryLabels: Record<string, string>;
  onNavigate: (section: InsightsSection, page: InsightsPage) => void;
}) => {
  const belowMinimum = forecast.filter(
    (row) => row.currentStockQty <= row.minStockQty,
  ).length;
  const stagnant = stock.rows.filter((row) => row.sold90d === 0);
  return (
    <>
      <PageHeader
        title="Voorraadoverzicht"
        subtitle="Waarde, verkoopstilstand en producten die binnen 60 dagen aandacht vragen"
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Voorraadwaarde tegen aankoopprijs"
          value={formatEUR(stock.totalValueCents)}
          detail={`${stock.trackedProducts} producten met voorraadregistratie`}
        />
        <MetricCard
          label="Aankoopwaarde 90 dagen niet verkocht"
          value={formatEUR(stock.stagnantValueCents)}
          detail={`${stagnant.length} producten`}
        />
        <MetricCard
          label="Onder minimumvoorraad"
          value={String(belowMinimum)}
        />
        <MetricCard
          label="Besteladviezen binnen 60 dagen"
          value={String(recommendations)}
        />
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-[1.2fr_.8fr]">
        <SectionCard
          title="Aankoopwaarde zonder verkoop in 90 dagen"
          subtitle="Waarde berekend met de geregistreerde aankoopprijs"
          action={
            <TextLink
              label="Bekijk verkooptempo"
              onClick={() => onNavigate("inventory", "inventory-velocity")}
            />
          }
        >
          <HorizontalBars
            rows={stagnant
              .sort((a, b) => b.valueCents - a.valueCents)
              .slice(0, 8)
              .map((row) => ({
                key: row.productId,
                label: row.name,
                value: row.valueCents,
                secondary: `${row.stockQty} op voorraad · ${categoryLabels[row.category] ?? row.category}`,
              }))}
            formatValue={formatEUR}
            emptyLabel="Alle geregistreerde voorraad verkocht minstens één keer in de laatste 90 dagen."
          />
        </SectionCard>
        <SectionCard
          title={`Status van ${stock.trackedProducts} voorraadproducten`}
          subtitle="Iedere productstatus komt exact één keer voor"
        >
          <DonutBreakdown
            rows={[
              {
                key: "minimum",
                label: "Onder minimumvoorraad",
                value: belowMinimum,
              },
              {
                key: "advice",
                label: "Bereikt minimum binnen 60 dagen",
                value: Math.max(0, recommendations - belowMinimum),
              },
              {
                key: "healthy",
                label: "Geen actie binnen 60 dagen",
                value: Math.max(0, stock.trackedProducts - recommendations),
              },
            ]}
            centerLabel="Voorraad"
            valueFormatter={(value) => String(value)}
            ariaLabel="Voorraadproducten verdeeld per actiestatus"
          />
          <button
            type="button"
            disabled={recommendations === 0}
            onClick={() => onNavigate("inventory", "inventory-reorder")}
            className="insights-primary-action mt-2 w-full rounded-lg px-4 py-2.5 text-sm font-bold disabled:cursor-default disabled:bg-slate-200 disabled:text-slate-500"
          >
            {recommendations > 0
              ? `Bekijk ${recommendations} besteladviezen`
              : "Geen besteladvies nodig"}
          </button>
        </SectionCard>
      </div>
    </>
  );
};

const InventoryVelocityPage = ({
  stock,
  categoryLabels,
}: {
  stock: StockSnapshot;
  categoryLabels: Record<string, string>;
}) => {
  const [group, setGroup] = useState<"stagnant" | "slow" | "healthy">(
    "stagnant",
  );
  const rows = stock.rows
    .filter((row) =>
      group === "stagnant"
        ? row.sold90d === 0
        : group === "slow"
          ? row.sold90d > 0 && row.sold30d === 0
          : row.sold30d > 0,
    )
    .sort((a, b) =>
      group === "healthy" ? b.sold30d - a.sold30d : b.valueCents - a.valueCents,
    );
  const title =
    group === "stagnant"
      ? "Aankoopwaarde zonder verkoop in 90 dagen"
      : group === "slow"
        ? "Aankoopwaarde zonder verkoop in 30 dagen"
        : "Verkochte stuks in de laatste 30 dagen";
  return (
    <>
      <PageHeader
        title="Verkooptempo van voorraad"
        subtitle="Groepeer producten op recente verkoopsnelheid; dit is geen boekhoudkundige omloopsnelheid"
      />
      <SectionCard
        title={title}
        subtitle={
          group === "healthy"
            ? "Hoog naar laag"
            : "Waarde tegen geregistreerde aankoopprijs"
        }
        action={
          <SegmentControl<"stagnant" | "slow" | "healthy">
            value={group}
            onChange={setGroup}
            label="Verkooptempo"
            options={[
              { id: "stagnant", label: "90 dagen geen verkoop" },
              { id: "slow", label: "30–89 dagen geen verkoop" },
              { id: "healthy", label: "Verkocht in 30 dagen" },
            ]}
          />
        }
      >
        <HorizontalBars
          rows={rows.slice(0, 15).map((row) => ({
            key: row.productId,
            label: row.name,
            value: group === "healthy" ? row.sold30d : row.valueCents,
            secondary: `${row.stockQty} op voorraad · ${categoryLabels[row.category] ?? row.category}`,
          }))}
          formatValue={
            group === "healthy" ? (value) => `${value} stuks` : formatEUR
          }
        />
      </SectionCard>
    </>
  );
};

const SeasonForecastPage = ({
  snapshot,
  categoryLabels,
  onNavigate,
}: {
  snapshot: SeasonalRetailSnapshot;
  categoryLabels: Record<string, string>;
  onNavigate: (section: InsightsSection, page: InsightsPage) => void;
}) => (
  <>
    <PageHeader
      title={`${snapshot.nextSeasonLabel}: verkoopvooruitblik`}
      subtitle={
        snapshot.upcomingProfile.completedOccurrences > 0
          ? `Start over ${snapshot.daysUntilNextSeason} dagen · gebaseerd op ${snapshot.upcomingProfile.completedOccurrences} volledige vorige ${snapshot.nextSeasonLabel.toLowerCase()}seizoenen`
          : `Start over ${snapshot.daysUntilNextSeason} dagen · nog geen volledig ${snapshot.nextSeasonLabel.toLowerCase()}seizoen in de verkoopgeschiedenis`
      }
    />
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard
        label={`Start ${snapshot.nextSeasonLabel.toLowerCase()}`}
        value={`${snapshot.daysUntilNextSeason} dagen`}
      />
      <MetricCard
        label="Gemiddelde netto-omzet per seizoen"
        value={
          snapshot.upcomingProfile.completedOccurrences > 0
            ? formatEUR(snapshot.upcomingProfile.averageRevenueCents)
            : "—"
        }
      />
      <MetricCard
        label="Gemiddeld verkochte stuks per seizoen"
        value={
          snapshot.upcomingProfile.completedOccurrences > 0
            ? `${snapshot.upcomingProfile.averageUnits} stuks`
            : "—"
        }
      />
      <MetricCard
        label="Volledige seizoenen in vergelijking"
        value={String(snapshot.upcomingProfile.completedOccurrences)}
        detail={
          snapshot.sourceYears.length
            ? snapshot.sourceYears.join(", ")
            : "Nog geen volledig historisch seizoen"
        }
      />
    </div>
    <div className="mt-4">
      <SectionCard
        title={`Gemiddelde netto-omzet per categorie in de ${snapshot.nextSeasonLabel.toLowerCase()}`}
        subtitle={`${snapshot.upcomingProfile.completedOccurrences} volledige seizoenen · aandeel is binnen ${snapshot.nextSeasonLabel.toLowerCase()}`}
        action={
          <TextLink
            label="Vergelijk alle seizoenen"
            onClick={() => onNavigate("seasons", "seasons-categories")}
          />
        }
      >
        <HorizontalBars
          rows={snapshot.upcomingProfile.categories.slice(0, 8).map((row) => ({
            key: row.category,
            label: categoryLabels[row.category] ?? row.category,
            value: row.revenueCents,
            secondary: `${row.units} stuks gemiddeld · ${Math.round(row.share * 100)}% van seizoensomzet`,
          }))}
          formatValue={formatEUR}
          emptyLabel="Nog geen volledig historisch seizoen beschikbaar."
        />
      </SectionCard>
    </div>
  </>
);

const SeasonRhythmPage = ({
  snapshot,
}: {
  snapshot: SeasonalRetailSnapshot;
}) => {
  const maximum = Math.max(
    1,
    ...snapshot.profiles.map((profile) => profile.averageRevenueCents),
  );
  return (
    <>
      <PageHeader
        title="Seizoensritme"
        subtitle="Vergelijk gemiddelde winkelomzet tussen lente, zomer, herfst en winter"
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <MetricCard
          label="Lopend seizoen"
          value={snapshot.currentSeasonLabel}
          detail={`${formatEUR(snapshot.currentRevenueCents)} netto-omzet tot vandaag`}
        />
        <MetricCard
          label="Tempo tegenover historische seizoenen"
          value={
            snapshot.currentPaceChange == null
              ? "—"
              : `${snapshot.currentPaceChange >= 0 ? "+" : ""}${snapshot.currentPaceChange.toFixed(0)}%`
          }
          detail={`Zelfde verstreken deel van ${snapshot.currentSeasonLabel.toLowerCase()}`}
        />
        <MetricCard
          label="Historische jaren beschikbaar"
          value={String(snapshot.sourceYears.length)}
        />
      </div>
      <div className="mt-4">
        <SectionCard
          title="Gemiddelde netto-omzet per volledig seizoen"
          subtitle="Elk seizoen gebruikt dezelfde kalendergrenzen"
        >
          <div className="flex h-72 items-end gap-4">
            {snapshot.profiles.map((profile) => (
              <div
                key={profile.season}
                className="flex h-full min-w-0 flex-1 flex-col justify-end text-center"
              >
                <strong className="mb-2 text-xs text-slate-700">
                  {formatEUR(profile.averageRevenueCents)}
                </strong>
                <div
                  className={`mx-auto w-full max-w-28 rounded-t-lg ${profile.season === snapshot.nextSeason ? "bg-cyan-700" : "bg-cyan-200"}`}
                  style={{
                    height: `${(profile.averageRevenueCents / maximum) * 210}px`,
                  }}
                />
                <span className="mt-2 text-xs font-bold text-slate-600">
                  {profile.label}
                </span>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </>
  );
};

const SeasonCategoriesPage = ({
  snapshot,
  categoryLabels,
}: {
  snapshot: SeasonalRetailSnapshot;
  categoryLabels: Record<string, string>;
}) => {
  const categoryIds = [
    ...new Set(
      snapshot.profiles.flatMap((profile) =>
        profile.categories.slice(0, 8).map((row) => row.category),
      ),
    ),
  ].slice(0, 10);
  const max = Math.max(
    1,
    ...snapshot.profiles.flatMap((profile) =>
      profile.categories.map((row) => row.revenueCents),
    ),
  );
  return (
    <>
      <PageHeader
        title="Categorieën per seizoen"
        subtitle="Welke categorieën omzet dragen in lente, zomer, herfst en winter"
      />
      <SectionCard
        title="Gemiddelde netto-omzet per categorie en seizoen"
        subtitle="Donkerder betekent een hoger eurobedrag binnen deze tabel"
      >
        <div className="overflow-x-auto">
          <div className="min-w-[680px]">
            <div className="grid grid-cols-[190px_repeat(4,1fr)] gap-2 border-b border-slate-200 pb-2 text-xs font-bold text-slate-500">
              <span>Categorie</span>
              {snapshot.profiles.map((profile) => (
                <span key={profile.season} className="text-center">
                  {profile.label}
                </span>
              ))}
            </div>
            {categoryIds.map((category) => (
              <div
                key={category}
                className="grid grid-cols-[190px_repeat(4,1fr)] items-center gap-2 border-b border-slate-100 py-2 last:border-0"
              >
                <span className="truncate text-sm font-semibold text-slate-700">
                  {categoryLabels[category] ?? category}
                </span>
                {snapshot.profiles.map((profile) => {
                  const value =
                    profile.categories.find((row) => row.category === category)
                      ?.revenueCents ?? 0;
                  const opacity =
                    value === 0 ? 0.03 : 0.12 + (value / max) * 0.7;
                  return (
                    <div
                      key={profile.season}
                      className="rounded-md px-2 py-3 text-center text-xs font-bold text-slate-800"
                      style={{
                        backgroundColor: `rgba(8, 145, 178, ${opacity})`,
                      }}
                    >
                      {value ? formatEUR(value) : "—"}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </SectionCard>
    </>
  );
};

const CustomerOverviewPage = ({
  snapshot,
  linkedSales,
  totalSales,
  period,
  periodActions,
  onNavigate,
}: {
  snapshot: CustomerInsightSnapshot;
  linkedSales: number;
  totalSales: number;
  period: InsightPeriod;
  periodActions: React.ReactNode;
  onNavigate: (section: InsightsSection, page: InsightsPage) => void;
}) => {
  const linkRate =
    totalSales > 0 ? Math.round((linkedSales / totalSales) * 100) : 0;
  return (
    <>
      <PageHeader
        title="Klantoverzicht"
        subtitle="Zie hoeveel klanten worden herkend bij de kassa en hoeveel daarvan terugkomen"
      />
      <SectionCard
        title="Klantregistratie"
        subtitle={`${periodLabel(period)} · afgeronde verkopen`}
        action={periodActions}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <MetricCard
            label="Verkopen gekoppeld aan een klant"
            value={`${linkRate}%`}
            detail={`${linkedSales} van ${totalSales} verkopen`}
          />
          <MetricCard
            label="Verkopen zonder klantprofiel"
            value={String(Math.max(0, totalSales - linkedSales))}
            detail="Deze verkopen tellen niet mee in klantanalyses"
          />
        </div>
      </SectionCard>
      <div className="mt-4 rounded-lg border border-slate-200 bg-white px-4 py-3 text-xs font-semibold text-slate-600">
        <strong className="text-slate-900">Volledige klantgeschiedenis:</strong>{" "}
        de cijfers hieronder gebruiken alle gekoppelde verkopen, niet alleen de
        gekozen periode hierboven.
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <MetricCard
          label="Herkende klanten"
          value={String(snapshot.recognizedCustomers)}
          detail="Met minstens één gekoppelde aankoop"
        />
        <MetricCard
          label="Klanten die terugkwamen"
          value={String(snapshot.returningCustomers)}
          detail={`${snapshot.returningCustomers} van ${snapshot.recognizedCustomers} klanten met een klantprofiel (${snapshot.repeatRate.toFixed(0)}%)`}
        />
        <MetricCard
          label="Gemiddelde tijd tot tweede aankoop"
          value={
            snapshot.averageDaysToSecondPurchase == null
              ? "—"
              : `${snapshot.averageDaysToSecondPurchase} dagen`
          }
          detail={`Berekend over ${snapshot.returningCustomers} klanten die minstens twee keer kochten`}
        />
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <SectionCard
          title="Klanten naar aantal aankopen"
          subtitle={`${snapshot.recognizedCustomers} klanten met minstens één gekoppelde aankoop`}
          action={
            <TextLink
              label="Bekijk herhaalaankopen"
              onClick={() => onNavigate("customers", "customers-return")}
            />
          }
        >
          <DonutBreakdown
            rows={[
              {
                key: "one",
                label: "1 aankoop",
                value: snapshot.oneTimeCustomers,
              },
              {
                key: "returning",
                label: "2+ aankopen",
                value: snapshot.returningCustomers,
              },
            ]}
            centerLabel="Klanten"
            valueFormatter={(value) => String(value)}
            ariaLabel="Herkende klanten verdeeld naar aantal aankopen"
          />
        </SectionCard>
        <SectionCard
          title="Welke producten kochten terugkerende klanten eerst?"
          subtitle="Per product uit de eerste aankoop zie je hoeveel klanten later nog eens kochten. Alleen producten met minstens 5 klanten."
        >
          <HorizontalBars
            rows={snapshot.gatewayProducts.slice(0, 5).map((row) => ({
              key: row.productName,
              label: row.productName,
              value: row.returned,
              secondary: `${row.returned} van ${row.customers} klanten kwamen later terug (${row.returnRate.toFixed(0)}%)`,
            }))}
            formatValue={(value) => `${value} klanten`}
            emptyLabel="Nog te weinig klantgegevens om eerste aankopen te vergelijken."
          />
        </SectionCard>
      </div>
    </>
  );
};

const CustomerReturnPage = ({
  snapshot,
}: {
  snapshot: CustomerInsightSnapshot;
}) => {
  const loyalRate =
    snapshot.recognizedCustomers > 0
      ? (snapshot.loyalCustomers / snapshot.recognizedCustomers) * 100
      : 0;
  return (
    <>
      <PageHeader
        title="Herhaalaankopen"
        subtitle="Hoeveel klanten komen terug, hoe snel en hoe vaak?"
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <MetricCard
          label="Klanten die terugkwamen"
          value={String(snapshot.returningCustomers)}
          detail={`${snapshot.returningCustomers} van ${snapshot.recognizedCustomers} klanten met een klantprofiel (${snapshot.repeatRate.toFixed(0)}%)`}
        />
        <MetricCard
          label="Gemiddelde tijd tot tweede aankoop"
          value={
            snapshot.averageDaysToSecondPurchase == null
              ? "—"
              : `${snapshot.averageDaysToSecondPurchase} dagen`
          }
          detail={`Berekend over ${snapshot.returningCustomers} klanten die minstens twee keer kochten`}
        />
        <MetricCard
          label="Klanten met 3 of meer aankopen"
          value={String(snapshot.loyalCustomers)}
          detail={`${snapshot.loyalCustomers} van ${snapshot.recognizedCustomers} klanten met een klantprofiel (${loyalRate.toFixed(0)}%)`}
        />
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <SectionCard
          title="Wanneer doen klanten hun tweede aankoop?"
          subtitle={`Verdeling van ${snapshot.returningCustomers} klanten op basis van de tijd tussen hun eerste en tweede aankoop`}
        >
          <HorizontalBars
            rows={snapshot.returnBuckets.map((row) => ({
              key: row.label,
              label: row.label,
              value: row.customers,
            }))}
            formatValue={(value) => `${value} klanten`}
          />
        </SectionCard>
        <SectionCard
          title="Welke producten kochten terugkerende klanten eerst?"
          subtitle="Per product uit de eerste aankoop zie je hoeveel klanten later nog eens kochten. Alleen producten met minstens 5 klanten."
        >
          <HorizontalBars
            rows={snapshot.gatewayProducts.map((row) => ({
              key: row.productName,
              label: row.productName,
              value: row.returned,
              secondary: `${row.returned} van ${row.customers} klanten kwamen later terug (${row.returnRate.toFixed(0)}%)`,
            }))}
            formatValue={(value) => `${value} klanten`}
            emptyLabel="Nog te weinig klantgegevens om eerste aankopen te vergelijken."
          />
        </SectionCard>
      </div>
    </>
  );
};

const CustomerValuePage = ({
  snapshot,
  customers,
  transactions,
}: {
  snapshot: CustomerInsightSnapshot;
  customers: Customer[];
  transactions: Transaction[];
}) => {
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(
    null,
  );
  const [showAllPurchases, setShowAllPurchases] = useState(false);
  const [showAllCustomers, setShowAllCustomers] = useState(false);
  const [customerSort, setCustomerSort] =
    useState<CustomerSort>("revenue-desc");
  useEffect(() => {
    setShowAllPurchases(false);
  }, [selectedCustomerId]);
  const selectedCustomer = customers.find(
    (customer) => customer.id === selectedCustomerId,
  );
  const selectedTopCustomer = snapshot.customerRows.find(
    (customer) => customer.customerId === selectedCustomerId,
  );
  const customerTransactions = useMemo(
    () =>
      transactions
        .filter(
          (transaction) =>
            transaction.isFinalized &&
            transaction.customerId === selectedCustomerId,
        )
        .sort((a, b) => b.timestamp - a.timestamp),
    [selectedCustomerId, transactions],
  );
  const customerRevenueCents = customerTransactions.reduce(
    (sum, transaction) => sum + transaction.totalCents,
    0,
  );
  const averageSaleCents =
    customerTransactions.length > 0
      ? Math.round(customerRevenueCents / customerTransactions.length)
      : 0;
  const customerName =
    selectedCustomer?.name ?? selectedTopCustomer?.customerName ?? "Klant";
  const sortedCustomers = useMemo(
    () =>
      [...snapshot.customerRows].sort((a, b) => {
        if (customerSort === "revenue-desc")
          return (
            b.revenueCents - a.revenueCents ||
            a.customerName.localeCompare(b.customerName, "nl-BE")
          );
        if (customerSort === "revenue-asc")
          return (
            a.revenueCents - b.revenueCents ||
            a.customerName.localeCompare(b.customerName, "nl-BE")
          );
        if (customerSort === "purchases-desc")
          return b.purchases - a.purchases || b.revenueCents - a.revenueCents;
        if (customerSort === "purchases-asc")
          return a.purchases - b.purchases || b.revenueCents - a.revenueCents;
        if (customerSort === "recent-desc")
          return (
            b.lastPurchaseAt - a.lastPurchaseAt ||
            b.revenueCents - a.revenueCents
          );
        return a.customerName.localeCompare(b.customerName, "nl-BE");
      }),
    [customerSort, snapshot.customerRows],
  );
  const visibleCustomers = showAllCustomers
    ? sortedCustomers
    : sortedCustomers.slice(0, 10);

  return (
    <>
      <PageHeader
        title="Klantwaarde"
        subtitle="Wie het meeste besteedt en hoe herhaalaankopen bijdragen aan omzet"
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <MetricCard
          label="Herkende klanten"
          value={String(snapshot.recognizedCustomers)}
        />
        <MetricCard
          label="Gemiddelde netto-omzet per klant"
          value={formatEUR(snapshot.averageCustomerValueCents)}
        />
        <MetricCard
          label="Klanten met 3+ aankopen"
          value={String(snapshot.loyalCustomers)}
        />
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <SectionCard
          title="Netto-omzet per aankoopfrequentie"
          subtitle="Open een groep om de klanten en hun omzet te bekijken"
        >
          <CustomerFrequencyBreakdown snapshot={snapshot} />
        </SectionCard>
        <SectionCard
          title="Netto-omzet per klant"
          subtitle={`${snapshot.customerRows.length} klanten met minstens één gekoppelde aankoop`}
          action={
            <select
              value={customerSort}
              onChange={(event) =>
                setCustomerSort(event.target.value as CustomerSort)
              }
              aria-label="Sorteer klanten"
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:border-cyan-600"
            >
              <option value="revenue-desc">Omzet: hoog–laag</option>
              <option value="revenue-asc">Omzet: laag–hoog</option>
              <option value="purchases-desc">Aankopen: meeste eerst</option>
              <option value="purchases-asc">Aankopen: minste eerst</option>
              <option value="recent-desc">Laatst gekocht: recentste</option>
              <option value="name-asc">Naam: A–Z</option>
            </select>
          }
        >
          <div
            className={
              showAllCustomers
                ? "max-h-[760px] overflow-y-auto pr-2 custom-scrollbar"
                : ""
            }
          >
            <HorizontalBars
              rows={visibleCustomers.map((row) => ({
                key: row.customerId,
                label: row.customerName,
                value: row.revenueCents,
                secondary: `${row.purchases} ${row.purchases === 1 ? "aankoop" : "aankopen"} · laatste ${formatCustomerDate(row.lastPurchaseAt)}`,
              }))}
              formatValue={formatEUR}
              onSelect={setSelectedCustomerId}
              emptyLabel="Nog geen verkopen met een gekoppeld klantprofiel."
            />
          </div>
          {sortedCustomers.length > 10 && (
            <button
              type="button"
              onClick={() => setShowAllCustomers((current) => !current)}
              className="mt-5 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-cyan-800 hover:border-cyan-200 hover:bg-cyan-50"
            >
              {showAllCustomers
                ? "Toon alleen de eerste 10"
                : `Toon alle ${sortedCustomers.length} klanten`}
            </button>
          )}
        </SectionCard>
      </div>

      <Modal
        open={selectedCustomerId != null}
        onClose={() => setSelectedCustomerId(null)}
        title={customerName}
        subtitle="Klantfiche"
        size="3xl"
        variant="light"
        footer={
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setSelectedCustomerId(null)}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800"
            >
              Sluiten
            </button>
          </div>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <CustomerModalMetric
            label="Netto-omzet"
            value={formatEUR(customerRevenueCents)}
          />
          <CustomerModalMetric
            label="Aankopen"
            value={String(customerTransactions.length)}
          />
          <CustomerModalMetric
            label="Gemiddeld per aankoop"
            value={formatEUR(averageSaleCents)}
          />
          <CustomerModalMetric
            label="Laatste aankoop"
            value={
              customerTransactions[0]
                ? formatCustomerDate(customerTransactions[0].timestamp)
                : "—"
            }
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-bold text-slate-900">
              Contactgegevens
            </h3>
            <dl className="mt-4 space-y-3 text-sm">
              <CustomerDetail label="E-mail" value={selectedCustomer?.email} />
              <CustomerDetail
                label="Telefoon"
                value={selectedCustomer?.phone}
              />
              <CustomerDetail label="Adres" value={selectedCustomer?.address} />
              <CustomerDetail
                label="Klant sinds"
                value={
                  selectedCustomer?.createdAt
                    ? formatCustomerDate(selectedCustomer.createdAt)
                    : undefined
                }
              />
            </dl>
          </section>
          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-bold text-slate-900">Notitie</h3>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-600">
              {selectedCustomer?.notes?.trim() || "Geen notitie toegevoegd."}
            </p>
          </section>
        </div>

        <section>
          <div className="flex items-end justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Recente aankopen
              </h3>
              <p className="mt-1 text-xs text-slate-500">
                Nieuwste aankoop eerst
              </p>
            </div>
            <span className="text-xs font-bold text-slate-500">
              {customerTransactions.length} totaal
            </span>
          </div>
          <div className="mt-3 space-y-2">
            {customerTransactions.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-5 text-center text-sm text-slate-500">
                Geen aankopen gevonden.
              </div>
            ) : (
              (showAllPurchases
                ? customerTransactions
                : customerTransactions.slice(0, 8)
              ).map((transaction, index) => (
                <article
                  key={transaction.id ?? `${transaction.timestamp}-${index}`}
                  className="rounded-xl border border-slate-200 bg-white p-4"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-slate-900">
                        {formatCustomerDateTime(transaction.timestamp)}
                      </div>
                      <div
                        className="mt-1 truncate text-xs text-slate-500"
                        title={customerPurchaseSummary(transaction)}
                      >
                        {customerPurchaseSummary(transaction)}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-3 sm:text-right">
                      <span className="text-xs font-semibold text-slate-500">
                        {transaction.paymentMethod}
                      </span>
                      <strong className="text-base text-slate-950">
                        {formatEUR(transaction.totalCents)}
                      </strong>
                    </div>
                  </div>
                </article>
              ))
            )}
            {customerTransactions.length > 8 && (
              <button
                type="button"
                onClick={() => setShowAllPurchases((current) => !current)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-cyan-800 hover:border-cyan-200 hover:bg-cyan-50"
              >
                {showAllPurchases
                  ? "Toon alleen de 8 recentste"
                  : `Toon alle ${customerTransactions.length} aankopen`}
              </button>
            )}
          </div>
        </section>
      </Modal>
    </>
  );
};

const CustomerFrequencyBreakdown = ({
  snapshot,
}: {
  snapshot: CustomerInsightSnapshot;
}) => {
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const maximum = Math.max(
    1,
    ...snapshot.valueBuckets.map((row) => row.revenueCents),
  );
  if (snapshot.valueBuckets.every((row) => row.customers === 0))
    return <EmptyChart label="Nog geen klanten met gekoppelde aankopen." />;

  return (
    <div className="space-y-2">
      {snapshot.valueBuckets.map((row) => {
        const expanded = expandedGroup === row.label;
        const customers = snapshot.customerRows.filter(
          (customer) =>
            customerFrequencyLabel(customer.purchases) === row.label,
        );
        return (
          <div
            key={row.label}
            className={`overflow-hidden rounded-xl border transition-colors ${expanded ? "border-cyan-200 bg-cyan-50/40" : "border-transparent hover:border-slate-200"}`}
          >
            <button
              type="button"
              aria-expanded={expanded}
              aria-controls={`customer-frequency-${row.label}`}
              onClick={() => setExpandedGroup(expanded ? null : row.label)}
              className="block w-full cursor-pointer p-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-600"
            >
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="font-bold text-slate-800">{row.label}</span>
                <span className="flex items-center gap-3">
                  <strong className="text-slate-950">
                    {formatEUR(row.revenueCents)}
                  </strong>
                  <ChevronDown
                    size={16}
                    className={`text-slate-400 transition-transform ${expanded ? "rotate-180" : ""}`}
                  />
                </span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-cyan-600"
                  style={{
                    width: `${(row.revenueCents / maximum) * 100}%`,
                  }}
                />
              </div>
              <div className="mt-1.5 text-xs font-medium text-slate-500">
                {row.customers} {row.customers === 1 ? "klant" : "klanten"} ·{" "}
                {expanded ? "Namen verbergen" : "Klanten bekijken"}
              </div>
            </button>
            {expanded && (
              <div
                id={`customer-frequency-${row.label}`}
                className="border-t border-cyan-100 px-3 pb-3 pt-2"
              >
                <div className="max-h-80 space-y-1 overflow-y-auto pr-1 custom-scrollbar">
                  {customers.map((customer) => (
                    <div
                      key={customer.customerId}
                      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 rounded-lg bg-white px-3 py-2.5 shadow-[inset_0_0_0_1px_#e2e8f0]"
                    >
                      <div className="min-w-0">
                        <div
                          className="truncate text-sm font-bold text-slate-800"
                          title={customer.customerName}
                        >
                          {customer.customerName}
                        </div>
                        <div className="mt-0.5 text-xs text-slate-500">
                          {customer.purchases}{" "}
                          {customer.purchases === 1 ? "aankoop" : "aankopen"} ·
                          laatste {formatCustomerDate(customer.lastPurchaseAt)}
                        </div>
                      </div>
                      <strong className="shrink-0 text-sm text-slate-950">
                        {formatEUR(customer.revenueCents)}
                      </strong>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

const CustomerModalMetric = ({
  label,
  value,
}: {
  label: string;
  value: string;
}) => (
  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
    <div className="text-xs font-semibold text-slate-500">{label}</div>
    <div className="mt-1 text-xl font-bold tracking-tight text-slate-950">
      {value}
    </div>
  </div>
);

const CustomerDetail = ({
  label,
  value,
}: {
  label: string;
  value?: string;
}) => (
  <div className="grid grid-cols-[90px_minmax(0,1fr)] gap-3">
    <dt className="font-semibold text-slate-500">{label}</dt>
    <dd className="break-words font-medium text-slate-800">
      {value?.trim() || "Niet ingevuld"}
    </dd>
  </div>
);

const TeamOverviewPage = ({
  employees,
  totalSales,
  period,
  now,
  headerActions,
}: {
  employees: Array<{
    userId: string;
    name: string;
    transactionCount: number;
    revenueCents: number;
  }>;
  totalSales: number;
  period: InsightPeriod;
  now: number;
  headerActions: React.ReactNode;
}) => {
  const totalRevenue = employees.reduce(
    (sum, employee) => sum + employee.revenueCents,
    0,
  );
  const totalTransactions = employees.reduce(
    (sum, employee) => sum + employee.transactionCount,
    0,
  );
  const assignmentRate =
    totalSales > 0 ? Math.round((totalTransactions / totalSales) * 100) : 0;
  return (
    <>
      <PageHeader
        title="Afgehandelde omzet per medewerker"
        subtitle={`${periodRangeLabel(period, now)} · volledige kassabon toegeschreven aan de afrekenende medewerker; dit meet geen individuele verkoopbijdrage`}
        actions={headerActions}
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <MetricCard
          label="Medewerkers met toegewezen verkopen"
          value={String(employees.length)}
        />
        <MetricCard
          label="Netto-omzet met medewerker"
          value={formatEUR(totalRevenue)}
        />
        <MetricCard
          label="Verkopen met medewerker"
          value={`${assignmentRate}%`}
          detail={`${totalTransactions} van ${totalSales} verkopen`}
        />
      </div>
      <div className="mt-4">
        <SectionCard
          title="Netto-omzet per medewerker"
          subtitle={`Alleen toegewezen verkopen · ${periodRangeLabel(period, now)}`}
        >
          <HorizontalBars
            rows={employees.map((employee) => ({
              key: employee.userId,
              label: employee.name,
              value: employee.revenueCents,
              secondary: `${employee.transactionCount} ${employee.transactionCount === 1 ? "verkoop" : "verkopen"} · gemiddeld ${formatEUR(employee.transactionCount > 0 ? Math.round(employee.revenueCents / employee.transactionCount) : 0)} per verkoop`,
            }))}
            formatValue={formatEUR}
            emptyLabel="Nog geen verkopen aan medewerkers toegewezen."
          />
        </SectionCard>
      </div>
    </>
  );
};

const TeamActivityPage = ({
  transactions,
  users,
  period,
  now,
  headerActions,
}: {
  transactions: Transaction[];
  users: { id: string; name: string }[];
  period: InsightPeriod;
  now: number;
  headerActions: React.ReactNode;
}) => (
  <>
    <PageHeader
      title="Afgehandelde verkopen per weekdag"
      subtitle={`${periodRangeLabel(period, now)} · alleen verkopen met een toegewezen medewerker`}
      actions={headerActions}
    />
    <SectionCard
      title="Aantal verkopen per medewerker en weekdag"
      subtitle="De volledige balk is het totaal van toegewezen verkopen op die weekdag"
    >
      <TeamWeekdayChart transactions={transactions} users={users} />
    </SectionCard>
  </>
);

const TeamWeekdayChart = ({
  transactions,
  users,
}: {
  transactions: Transaction[];
  users: { id: string; name: string }[];
}) => {
  const employees: [string, string][] = users.map(user => [user.id, user.name]);

  // Still add anyone found in transactions just in case (e.g. deleted users)
  const transactionUsers = new Map(
    transactions.flatMap((row) => {
      const seller = getTransactionSellerIdentity(row);
      return seller ? [[seller.id, seller.name] as const] : [];
    }),
  );
  
  for (const [id, name] of transactionUsers.entries()) {
    if (!employees.some(([eId]) => eId === id)) {
      employees.push([id, name]);
    }
  }

  const rows = ["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"].map(
    (label, dayIndex) => {
      const counts = employees.map(
        ([userId]) =>
          transactions.filter((transaction) => {
            if (getTransactionSellerIdentity(transaction)?.id !== userId)
              return false;
            const parts = getZonedDateParts(transaction.timestamp);
            const day = new Date(
              Date.UTC(parts.year, parts.month - 1, parts.day),
            ).getUTCDay();
            return (day === 0 ? 6 : day - 1) === dayIndex;
          }).length,
      );
      return {
        label,
        counts,
        total: counts.reduce((sum, value) => sum + value, 0),
      };
    },
  );
  const maximum = Math.max(1, ...rows.map((row) => row.total));
  const colors = ["#0e7490", "#06b6d4", "#64748b", "#a5b4fc", "#f59e0b"];
  if (employees.length === 0)
    return (
      <EmptyChart label="Nog geen verkopen aan medewerkers toegewezen in deze periode." />
    );
  return (
    <div>
      <div className="overflow-x-auto">
        <div className="flex h-72 min-w-[620px] items-end gap-4">
          {rows.map((row) => (
            <div
              key={row.label}
              className="flex h-full min-w-0 flex-1 flex-col justify-end"
            >
              <div className="mb-2 text-center text-xs font-bold text-slate-700">
                {row.total || "—"}
              </div>
              <div
                className="mx-auto flex w-full max-w-20 flex-col-reverse overflow-hidden rounded-t-lg bg-slate-100"
                style={{
                  height: `${(row.total / maximum) * 210}px`,
                }}
              >
                {row.counts.map((count, index) =>
                  count > 0 ? (
                    <span
                      key={employees[index][0]}
                      style={{
                        height: `${(count / row.total) * 100}%`,
                        backgroundColor: colors[index % colors.length],
                      }}
                      title={`${employees[index][1]}: ${count} ${count === 1 ? "verkoop" : "verkopen"}`}
                    />
                  ) : null,
                )}
              </div>
              <div className="mt-2 text-center text-xs font-bold text-slate-600">
                {row.label}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 border-t border-slate-100 pt-4">
        {employees.map(([userId, name], index) => (
          <span
            key={userId}
            className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600"
          >
            <i
              className="h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: colors[index % colors.length] }}
            />
            {name}
          </span>
        ))}
      </div>
    </div>
  );
};

const DataQualityPage = ({ snapshot }: { snapshot: DataQualitySnapshot }) => {
  const measurable = snapshot.sources.filter((source) => source.total > 0);
  const sourcesOnLevel = measurable.filter((source) => source.coverage >= 85);
  const lowest = [...measurable].sort((a, b) => a.coverage - b.coverage)[0];
  return (
    <>
      <PageHeader
        title="Datadekking"
        subtitle="Welke registraties de berekeningen in Inzichten volledig en betrouwbaar maken"
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <MetricCard
          label="Meetbare bronnen boven de 85%-werkdrempel"
          value={`${sourcesOnLevel.length} van ${measurable.length}`}
          detail="Operationele signaaldrempel; geen statistische kwaliteitsgarantie"
        />
        <MetricCard
          label="Laagste meetbare dekking"
          value={lowest?.label ?? "Nog geen data"}
          detail={
            lowest
              ? `${lowest.complete} van ${lowest.total} ${lowest.entityLabel} geregistreerd · ${lowest.coverage}%`
              : "Er zijn nog geen producten of verkopen om te meten"
          }
        />
      </div>
      <div className="mt-4">
        <SectionCard
          title="Registratiedekking per bron"
          subtitle="Teller is volledig geregistreerd; noemer is het totale relevante aantal"
        >
          <HorizontalBars
            rows={snapshot.sources.map((source) => ({
              key: source.key,
              label: source.label,
              value: source.coverage,
              valueLabel:
                source.total > 0 ? `${source.coverage}%` : "Niet meetbaar",
              secondary:
                source.total > 0
                  ? `${source.complete} van ${source.total} ${source.entityLabel} geregistreerd`
                  : "Nog geen relevante producten of verkopen",
            }))}
            formatValue={(value) => `${value}%`}
          />
        </SectionCard>
      </div>
    </>
  );
};

const TrendChart = ({
  current,
  previous,
  metric,
}: {
  current: SalesChartPoint[];
  previous: SalesChartPoint[];
  metric: ChartMetric;
}) => {
  const values = current.map((point) =>
    metric === "revenue" ? point.revenueCents : point.grossProfitCents,
  );
  const previousValues = previous.map((point) =>
    metric === "revenue" ? point.revenueCents : point.grossProfitCents,
  );
  const maximum = Math.max(1, ...values, ...previousValues);
  const width = 920;
  const height = 280;
  const padding = { top: 20, right: 18, bottom: 38, left: 62 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const x = (index: number) =>
    padding.left +
    (current.length <= 1
      ? innerWidth / 2
      : index * (innerWidth / (current.length - 1)));
  const y = (value: number) =>
    padding.top + innerHeight - (value / maximum) * innerHeight;
  const path = (rows: number[]) =>
    rows
      .map(
        (value, index) =>
          `${index === 0 ? "M" : "L"} ${x(index).toFixed(1)} ${y(value).toFixed(1)}`,
      )
      .join(" ");
  if (!values.some((value) => value > 0))
    return (
      <div className="grid h-64 place-items-center rounded-lg border border-dashed border-slate-200 text-sm font-medium text-slate-500">
        Nog geen verkopen in deze periode.
      </div>
    );
  const labelStep = current.length > 12 ? Math.ceil(current.length / 6) : 1;
  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="block min-w-[700px] w-full"
        role="img"
        aria-label="Geselecteerde periode vergeleken met de direct voorafgaande periode"
      >
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const value = maximum * (1 - ratio);
          const lineY = padding.top + innerHeight * ratio;
          return (
            <g key={ratio}>
              <line
                x1={padding.left}
                x2={width - padding.right}
                y1={lineY}
                y2={lineY}
                stroke="#e2e8f0"
              />
              <text
                x={padding.left - 10}
                y={lineY + 4}
                textAnchor="end"
                fill="#64748b"
                fontSize="10"
              >
                {compactEUR(value)}
              </text>
            </g>
          );
        })}
        <path
          d={path(previousValues)}
          fill="none"
          stroke="#94a3b8"
          strokeWidth="2"
          strokeDasharray="5 6"
        />
        <path
          d={path(values)}
          fill="none"
          stroke="#0891b2"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {values.map((value, index) => (
          <circle
            key={current[index].key}
            cx={x(index)}
            cy={y(value)}
            r={3}
            fill="#0891b2"
          >
            <title>
              {current[index].label}: {formatEUR(value)}
            </title>
          </circle>
        ))}
        {current.map((point, index) =>
          index % labelStep === 0 || index === current.length - 1 ? (
            <text
              key={point.key}
              x={x(index)}
              y={height - 13}
              textAnchor="middle"
              fill="#64748b"
              fontSize="10"
              fontWeight="600"
            >
              {point.label}
            </text>
          ) : null,
        )}
      </svg>
      <div className="mt-1 flex justify-end gap-4 text-[11px] font-semibold text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <i className="h-0.5 w-5 bg-cyan-600" />
          Geselecteerde periode
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className="w-5 border-t-2 border-dashed border-slate-400" />
          Direct voorafgaande periode
        </span>
      </div>
      <table className="sr-only">
        <caption>
          {metric === "revenue" ? "Omzet" : "Brutowinst"} per periode,
          geselecteerde periode vergeleken met de direct voorafgaande periode
        </caption>
        <thead>
          <tr>
            <th scope="col">Periode</th>
            <th scope="col">Geselecteerd</th>
            <th scope="col">Voorafgaand</th>
          </tr>
        </thead>
        <tbody>
          {current.map((point, index) => (
            <tr key={`accessible-${point.key}`}>
              <th scope="row">{point.label}</th>
              <td>{formatEUR(values[index] ?? 0)}</td>
              <td>{formatEUR(previousValues[index] ?? 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const buildOwnerActions = ({
  seasonalSnapshot,
  stockSnapshot,
  customerInsights,
  discountInsights,
  transactions,
  inventoryRecommendations,
  categoryLabels,
}: {
  seasonalSnapshot: SeasonalRetailSnapshot;
  stockSnapshot: StockSnapshot;
  customerInsights: CustomerInsightSnapshot;
  discountInsights: DiscountInsightSnapshot;
  transactions: Transaction[];
  inventoryRecommendations: ReturnType<typeof buildReorderRecommendations>;
  categoryLabels: Record<string, string>;
}): OwnerAction[] => {
  const rows: OwnerAction[] = [];
  if (
    seasonalSnapshot.upcomingProfile.completedOccurrences > 0 &&
    seasonalSnapshot.daysUntilNextSeason <= 60
  )
    rows.push({
      id: "season",
      tone: "opportunity",
      label: `${seasonalSnapshot.nextSeasonLabel} · start over ${seasonalSnapshot.daysUntilNextSeason} dagen`,
      title: `Bereid de ${seasonalSnapshot.nextSeasonLabel.toLowerCase()}voorraad voor`,
      metricLabel: `Start ${seasonalSnapshot.nextSeasonLabel.toLowerCase()}`,
      metricValue: `${seasonalSnapshot.daysUntilNextSeason} dagen`,
      secondaryLabel: "Gemiddelde historische seizoensomzet",
      secondaryValue: formatEUR(
        seasonalSnapshot.upcomingProfile.averageRevenueCents,
      ),
      chartTitle: `Gemiddelde omzet per categorie in de ${seasonalSnapshot.nextSeasonLabel.toLowerCase()}`,
      chartRows: seasonalSnapshot.upcomingProfile.categories
        .slice(0, 5)
        .map((row) => ({
          key: row.category,
          label: categoryLabels[row.category] ?? row.category,
          value: row.revenueCents,
          secondary: `${row.units} stuks gemiddeld`,
        })),
      chartFormat: "currency",
      destination: {
        section: "seasons",
        page: "seasons-forecast",
        label: `Open ${seasonalSnapshot.nextSeasonLabel.toLowerCase()}vooruitblik`,
      },
    });
  if (inventoryRecommendations.length > 0)
    rows.push({
      id: "stock",
      tone: "attention",
      label: `Voorraad · ${inventoryRecommendations.length} besteladviezen`,
      title: `${inventoryRecommendations.length} producten vragen een bestelbeslissing`,
      metricLabel: "Binnen 60 dagen op of onder minimum",
      metricValue: String(inventoryRecommendations.length),
      secondaryLabel: "Aankoopwaarde 90 dagen niet verkocht",
      secondaryValue: formatEUR(stockSnapshot.stagnantValueCents),
      chartTitle: "Aankoopwaarde zonder verkoop in 90 dagen",
      chartRows: stockSnapshot.rows
        .filter((row) => row.sold90d === 0)
        .sort((a, b) => b.valueCents - a.valueCents)
        .slice(0, 5)
        .map((row) => ({
          key: row.productId,
          label: row.name,
          value: row.valueCents,
          secondary: `${row.stockQty} op voorraad`,
        })),
      chartFormat: "currency",
      destination: {
        section: "inventory",
        page: "inventory-reorder",
        label: `Bekijk ${inventoryRecommendations.length} besteladviezen`,
      },
    });
  if (discountInsights.discountCents > 0)
    rows.push({
      id: "discount",
      tone: "attention",
      label: "Kortingen · laatste 30 dagen",
      title: `Controleer ${formatEUR(discountInsights.discountCents)} korting van de laatste 30 dagen`,
      metricLabel: "Totaal gegeven korting",
      metricValue: formatEUR(discountInsights.discountCents),
      secondaryLabel: "Aandeel van brutoverkoop",
      secondaryValue: `${discountInsights.discountRate.toFixed(1).replace(".", ",")}%`,
      chartTitle: "Gegeven korting per categorie",
      chartRows: discountInsights.categoryRows.slice(0, 5).map((row) => ({
        key: row.key,
        label: categoryLabels[row.key] ?? row.label,
        value: row.discountCents,
        secondary: `${row.transactionCount} ${row.transactionCount === 1 ? "verkoop" : "verkopen"}${row.marginPercent == null ? "" : ` · ${row.marginPercent.toFixed(0)}% marge na korting`}`,
      })),
      chartFormat: "currency",
      destination: {
        section: "performance",
        page: "performance-discounts",
        label: "Bekijk kortingsanalyse",
      },
    });
  if (customerInsights.returningCustomers > 0)
    rows.push({
      id: "customers",
      tone: "opportunity",
      label: "Klanten · gekoppelde aankopen",
      title: `${customerInsights.returningCustomers} klanten kochten minstens twee keer`,
      metricLabel: "Klanten die terugkwamen",
      metricValue: String(customerInsights.returningCustomers),
      secondaryLabel: "Aandeel van gekoppelde klanten",
      secondaryValue: `${customerInsights.repeatRate.toFixed(0)}%`,
      chartTitle: "Welke producten kochten terugkerende klanten eerst?",
      chartRows: customerInsights.gatewayProducts.slice(0, 5).map((row) => ({
        key: row.productName,
        label: row.productName,
        value: row.returned,
        secondary: `${row.returned} van ${row.customers} klanten kwamen later terug`,
      })),
      chartFormat: "number",
      destination: {
        section: "customers",
        page: "customers-return",
        label: "Bekijk herhaalaankopen",
      },
    });
  if (rows.length === 0)
    rows.push({
      id: "basis",
      tone: "opportunity",
      label: "Datadekking",
      title: "Controleer welke registraties nog ontbreken",
      metricLabel: "Afgeronde verkopen",
      metricValue: String(transactions.length),
      secondaryLabel: "Beschikbare analyse",
      secondaryValue:
        transactions.length > 0 ? "In opbouw" : "Nog geen verkoopdata",
      destination: {
        section: "quality",
        page: "quality",
        label: "Bekijk datadekking",
      },
    });
  return rows.slice(0, 5);
};

const buildStockSnapshot = (
  products: Product[],
  transactions: Transaction[],
): StockSnapshot => {
  const start30 = Date.now() - 30 * DAY_MS;
  const start90 = Date.now() - 90 * DAY_MS;
  const sold30 = new Map<string, number>();
  const sold90 = new Map<string, number>();
  transactions
    .filter((row) => row.isFinalized)
    .forEach((transaction) =>
      transaction.items.forEach((item) => {
        if (transaction.timestamp >= start90)
          sold90.set(
            item.product.id,
            (sold90.get(item.product.id) ?? 0) + item.quantity,
          );
        if (transaction.timestamp >= start30)
          sold30.set(
            item.product.id,
            (sold30.get(item.product.id) ?? 0) + item.quantity,
          );
      }),
    );
  const rows = products
    .filter((product) => product.isActive !== false && product.stockQty != null)
    .map((product) => ({
      productId: product.id,
      name: product.name,
      category: product.category || "Ongecategoriseerd",
      stockQty: product.stockQty ?? 0,
      valueCents: (product.stockQty ?? 0) * (product.costPriceCents ?? 0),
      sold30d: sold30.get(product.id) ?? 0,
      sold90d: sold90.get(product.id) ?? 0,
    }));
  return {
    totalValueCents: rows.reduce((sum, row) => sum + row.valueCents, 0),
    stagnantValueCents: rows
      .filter((row) => row.sold90d === 0)
      .reduce((sum, row) => sum + row.valueCents, 0),
    trackedProducts: rows.length,
    rows,
  };
};

const periodBounds = (period: InsightPeriod, now: number) => {
  const currentStart = new Date(now);
  currentStart.setHours(0, 0, 0, 0);
  if (period === "12m") {
    currentStart.setDate(1);
    currentStart.setMonth(currentStart.getMonth() - 11);
  } else {
    currentStart.setDate(currentStart.getDate() - (period === "7d" ? 6 : 29));
  }
  const previousEnd = currentStart.getTime() - 1;
  const previousStart = new Date(currentStart);
  if (period === "12m") previousStart.setMonth(previousStart.getMonth() - 12);
  else
    previousStart.setDate(previousStart.getDate() - (period === "7d" ? 7 : 30));
  return {
    currentStart: currentStart.getTime(),
    currentEnd: now,
    previousStart: previousStart.getTime(),
    previousEnd,
  };
};
const filterTransactionsForPeriod = (
  transactions: Transaction[],
  period: InsightPeriod,
  now = Date.now(),
) => {
  const bounds = periodBounds(period, now);
  return transactions.filter(
    (row) =>
      row.timestamp >= bounds.currentStart &&
      row.timestamp <= bounds.currentEnd &&
      row.isFinalized,
  );
};
const filterPreviousPeriodTransactions = (
  transactions: Transaction[],
  period: InsightPeriod,
  now = Date.now(),
) => {
  const bounds = periodBounds(period, now);
  return transactions.filter(
    (row) =>
      row.timestamp >= bounds.previousStart &&
      row.timestamp <= bounds.previousEnd &&
      row.isFinalized,
  );
};
const percentageChange = (current: number, previous: number) =>
  previous > 0 ? ((current - previous) / previous) * 100 : null;
const periodLabel = (period: InsightPeriod) =>
  period === "7d"
    ? "Laatste 7 dagen"
    : period === "30d"
      ? "Laatste 30 dagen"
      : "Laatste 12 maanden";
const formatRangeDate = (timestamp: number, includeYear = false) =>
  new Intl.DateTimeFormat("nl-BE", {
    day: "numeric",
    month: "long",
    ...(includeYear ? { year: "numeric" as const } : {}),
  }).format(timestamp);
const periodRangeLabel = (period: InsightPeriod, now: number) => {
  const bounds = periodBounds(period, now);
  return `${formatRangeDate(bounds.currentStart)}–${formatRangeDate(bounds.currentEnd, true)}`;
};
const previousPeriodRangeLabel = (period: InsightPeriod, now: number) => {
  const bounds = periodBounds(period, now);
  return `${formatRangeDate(bounds.previousStart)}–${formatRangeDate(bounds.previousEnd, true)}`;
};
const periodComparisonSubtitle = (period: InsightPeriod, now: number) =>
  `${periodRangeLabel(period, now)} · vergeleken met ${previousPeriodRangeLabel(period, now)}`;
const fullWeekdayLabel = (label: string) =>
  ({
    Ma: "Maandag",
    Di: "Dinsdag",
    Wo: "Woensdag",
    Do: "Donderdag",
    Vr: "Vrijdag",
    Za: "Zaterdag",
    Zo: "Zondag",
  })[label] ?? label;
const hourRangeLabel = (key: string) =>
  `${String(Number(key)).padStart(2, "0")}:00–${String(Number(key)).padStart(2, "0")}:59`;
const momentMetricLabel = (metric: MomentMetric) =>
  metric === "revenue"
    ? "Netto-omzet"
    : metric === "transactions"
      ? "Aantal verkopen"
      : "Gemiddelde omzet per verkoop";
const formatSnoozeDate = (timestamp: number) =>
  new Intl.DateTimeFormat("nl-BE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(timestamp);
const formatCustomerDate = (value: number | string) =>
  new Intl.DateTimeFormat("nl-BE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
const formatCustomerDateTime = (timestamp: number) =>
  new Intl.DateTimeFormat("nl-BE", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(timestamp);
const customerFrequencyLabel = (purchases: number) =>
  purchases >= 5
    ? "5+ aankopen"
    : purchases >= 3
      ? "3–4 aankopen"
      : purchases === 2
        ? "2 aankopen"
        : "1 aankoop";
const customerPurchaseSummary = (transaction: Transaction) => {
  const visibleItems = transaction.items
    .slice(0, 3)
    .map((item) => `${item.quantity}× ${item.product.name}`);
  const remaining = transaction.items.length - visibleItems.length;
  return `${visibleItems.join(" · ")}${remaining > 0 ? ` · +${remaining} meer` : ""}`;
};
const compactEUR = (cents: number) =>
  new Intl.NumberFormat("nl-BE", {
    style: "currency",
    currency: "EUR",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(cents / 100);

const InsightsLoading = () => (
  <div className="space-y-4" aria-label="Inzichten laden">
    <div className="h-10 w-48 animate-pulse rounded-lg bg-slate-200" />
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 4 }, (_, index) => (
        <div
          key={index}
          className="h-28 animate-pulse rounded-xl border border-slate-200 bg-white"
        />
      ))}
    </div>
    <div className="h-80 animate-pulse rounded-xl border border-slate-200 bg-white" />
  </div>
);
