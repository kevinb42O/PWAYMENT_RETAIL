import { useMemo, useState, type ReactNode } from "react";
import {
  ArrowRight,
  Calculator,
  CircleAlert,
  ExternalLink,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { useStore } from "../../store/useStore";
import type { FinancialCost, Transaction } from "../../types";
import {
  allocateFinancialCostCents,
  buildMonthlyProfitability,
  buildProfitabilitySnapshot,
  financialCategoryLabel,
  type ProfitabilitySnapshot,
} from "../../utils/financialManagement";
import { formatEUR } from "../../utils/money";
import type { InsightPeriod } from "../../utils/retailCharts";
import {
  ChartTooltip,
  DonutBreakdown,
  HorizontalBars,
  MetricCard,
  PageHeader,
  SectionCard,
  tooltipPositionFromElement,
  type ChartTooltipPosition,
} from "./InsightPrimitives";

export type FinancialInsightsPage =
  | "financial-result"
  | "financial-costs"
  | "financial-break-even";

const percentageChange = (current: number, previous: number) =>
  previous !== 0 ? ((current - previous) / Math.abs(previous)) * 100 : null;

const percentageLabel = (value: number | null) =>
  value == null ? "—" : `${value.toFixed(1).replace(".", ",")}%`;

const openFinancialSettings = () => {
  const url = new URL(window.location.href);
  url.searchParams.set("settings", "financial");
  window.history.replaceState(window.history.state, "", url);
  useStore.getState().setMainView("profile");
};

const ManageCostsButton = () => (
  <button
    type="button"
    onClick={openFinancialSettings}
    className="insights-primary-action inline-flex items-center gap-2 rounded-lg px-3.5 py-2.5 text-xs font-extrabold"
  >
    Kosten beheren <ExternalLink size={14} />
  </button>
);

const ReliabilityNotice = ({
  snapshot,
  activeCostCount,
}: {
  snapshot: ProfitabilitySnapshot;
  activeCostCount: number;
}) => {
  if (activeCostCount === 0) {
    return (
      <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">
        <CircleAlert size={17} className="mt-0.5 shrink-0 text-amber-700" />
        <span>
          Voeg eerst uw bedrijfskosten toe. Zonder huur, personeel en andere vaste lasten zou het resultaat misleidend zijn.
        </span>
      </div>
    );
  }
  if (snapshot.transactionCount === 0) {
    return (
      <div className="mb-4 flex items-start gap-3 rounded-xl border border-cyan-200 bg-cyan-50 px-4 py-3 text-xs leading-5 text-cyan-950">
        <CircleAlert size={17} className="mt-0.5 shrink-0 text-cyan-700" />
        <span>
          Nog geen afgeronde verkopen in deze periode. De geregistreerde bedrijfskosten worden wel al toegerekend; resultaat en break-even krijgen betekenis zodra er verkopen zijn.
        </span>
      </div>
    );
  }
  const costComplete =
    snapshot.completeCostTransactions === snapshot.transactionCount;
  if (costComplete && activeCostCount > 0) {
    return (
      <div className="mb-4 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs leading-5 text-emerald-900">
        <ShieldCheck size={17} className="mt-0.5 shrink-0 text-emerald-700" />
        <span>
          De productkost is volledig voor deze verkopen. Het resultaat gebruikt {activeCostCount}{" "}
          door de eigenaar geregistreerde {activeCostCount === 1 ? "kost" : "kosten"}. Dit is managementinformatie, geen officiële jaarrekening.
        </span>
      </div>
    );
  }
  return (
    <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">
      <CircleAlert size={17} className="mt-0.5 shrink-0 text-amber-700" />
      <span>
        Van {snapshot.transactionCount} verkopen hebben {snapshot.completeCostTransactions} een volledige productkost. Resultaat en break-even blijven voorlopig tot alle kostprijzen bekend zijn.
      </span>
    </div>
  );
};

const FinancialTrendChart = ({
  rows,
}: {
  rows: ReturnType<typeof buildMonthlyProfitability>;
}) => {
  const [metric, setMetric] = useState<"gross" | "operating">("operating");
  const [active, setActive] = useState<{
    key: string;
    position: ChartTooltipPosition;
  } | null>(null);
  const values = rows.map((row) =>
    metric === "gross" ? row.grossProfitCents : row.operatingResultCents,
  );
  const maximum = Math.max(1, ...values.map((value) => Math.abs(value)));
  const metricLabel = metric === "gross" ? "Brutowinst" : "Managementresultaat";
  return (
    <div>
      <div className="mb-5 flex justify-end">
        <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1" aria-label="Resultaatgrafiek">
          {([['operating', 'Managementresultaat'], ['gross', 'Brutowinst']] as const).map(([id, label]) => (
            <button key={id} type="button" onClick={() => { setMetric(id); setActive(null); }} aria-pressed={metric === id} className={`insights-control rounded-md px-3 py-1.5 text-xs font-bold ${metric === id ? "insights-control--active" : ""}`}>{label}</button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto pb-2">
        <div className="flex min-w-[720px] items-stretch gap-2" style={{ height: 292 }}>
          {rows.map((row, index) => {
            const value = values[index];
            const positive = value >= 0;
            const height = Math.max(3, (Math.abs(value) / maximum) * 108);
            const isActive = active?.key === row.key;
            const monthLabel = new Intl.DateTimeFormat("nl-BE", {
              month: "long",
              year: "numeric",
            }).format(new Date(`${row.key}-01T12:00:00`));
            return (
              <button
                key={row.key}
                type="button"
                onPointerEnter={(event) => setActive({ key: row.key, position: { x: event.clientX, y: event.clientY } })}
                onPointerMove={(event) => setActive({ key: row.key, position: { x: event.clientX, y: event.clientY } })}
                onPointerLeave={() => setActive(null)}
                onFocus={(event) => setActive({ key: row.key, position: tooltipPositionFromElement(event.currentTarget) })}
                onBlur={() => setActive(null)}
                aria-label={`${monthLabel}: ${metricLabel} ${formatEUR(value)}`}
                className={`group relative flex min-w-0 flex-1 flex-col rounded-lg outline-none transition-colors focus-visible:ring-2 focus-visible:ring-cyan-600 ${isActive ? "bg-slate-50/80" : "hover:bg-slate-50/60"}`}
              >
                {isActive && active && (
                  <ChartTooltip
                    label={monthLabel}
                    value={formatEUR(value)}
                    detail={`${metricLabel} · ${positive ? "positief" : "negatief"}`}
                    position={active.position}
                  />
                )}
                <div className="flex h-[124px] flex-col justify-end">
                  {positive && <span className={`mx-auto w-full max-w-10 rounded-t-md bg-emerald-600 transition-all group-hover:bg-emerald-700 ${isActive ? "scale-x-110 shadow-sm ring-2 ring-emerald-200" : ""}`} style={{ height }} />}
                </div>
                <div className="h-px bg-slate-300" />
                <div className="h-[124px]">
                  {!positive && <span className={`mx-auto block w-full max-w-10 rounded-b-md bg-rose-500 transition-all group-hover:bg-rose-600 ${isActive ? "scale-x-110 shadow-sm ring-2 ring-rose-200" : ""}`} style={{ height }} />}
                </div>
                <span className={`truncate text-center text-[11px] font-semibold ${isActive ? "text-slate-900" : "text-slate-500"}`}>{row.label}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="mt-2 flex items-center justify-center gap-5 text-[11px] font-semibold text-slate-500"><span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-emerald-600" /> Positief</span><span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-rose-500" /> Negatief</span></div>
    </div>
  );
};

const ResultBridge = ({ snapshot }: { snapshot: ProfitabilitySnapshot }) => {
  const rows = [
    { label: "Omzet excl. btw", value: snapshot.netRevenueCents, tone: "text-slate-950" },
    { label: "Productkost", value: -snapshot.costOfGoodsCents, tone: "text-rose-700" },
    { label: "Brutowinst", value: snapshot.grossProfitCents, tone: "text-cyan-800" },
    { label: "Bedrijfskosten", value: -snapshot.operatingCostsCents, tone: "text-rose-700" },
    { label: "Managementresultaat", value: snapshot.operatingResultCents, tone: snapshot.operatingResultCents >= 0 ? "text-emerald-700" : "text-rose-700" },
  ];
  return (
    <div className="grid gap-2 sm:grid-cols-5">
      {rows.map((row, index) => (
        <div key={row.label} className={`relative rounded-xl border p-3 ${index === rows.length - 1 ? "border-cyan-200 bg-cyan-50" : "border-slate-200 bg-slate-50"}`}>
          {index > 0 && <ArrowRight size={14} className="absolute -left-[11px] top-1/2 hidden -translate-y-1/2 rounded-full bg-white text-slate-400 sm:block" />}
          <div className="text-[11px] font-semibold text-slate-500">{row.label}</div>
          <div className={`mt-1 text-base font-extrabold tabular-nums ${row.tone}`}>{formatEUR(row.value)}</div>
        </div>
      ))}
    </div>
  );
};

export const FinancialInsights = ({
  page,
  transactions,
  costs,
  period,
  rangeStart,
  rangeEnd,
  previousRangeStart,
  previousRangeEnd,
  now,
  periodActions,
}: {
  page: FinancialInsightsPage;
  transactions: Transaction[];
  costs: FinancialCost[];
  period: InsightPeriod;
  rangeStart: number;
  rangeEnd: number;
  previousRangeStart: number;
  previousRangeEnd: number;
  now: number;
  periodActions: ReactNode;
}) => {
  const activeCosts = costs.filter((cost) => cost.status === "active");
  const periodCosts = costs.filter(
    (cost) => allocateFinancialCostCents(cost, rangeStart, rangeEnd + 1) !== 0,
  );
  const snapshot = useMemo(
    () => buildProfitabilitySnapshot({ transactions, costs, rangeStart, rangeEnd }),
    [costs, rangeEnd, rangeStart, transactions],
  );
  const previous = useMemo(
    () => buildProfitabilitySnapshot({
      transactions,
      costs,
      rangeStart: previousRangeStart,
      rangeEnd: previousRangeEnd,
    }),
    [costs, previousRangeEnd, previousRangeStart, transactions],
  );
  const monthly = useMemo(
    () => buildMonthlyProfitability(transactions, costs, now),
    [costs, now, transactions],
  );
  const rangeLabel = period === "7d" ? "de laatste 7 dagen" : period === "30d" ? "de laatste 30 dagen" : "de laatste 12 maanden";
  const reliable = periodCosts.length > 0 && snapshot.transactionCount > 0 &&
    snapshot.completeCostTransactions === snapshot.transactionCount;

  if (page === "financial-result") {
    return (
      <>
        <PageHeader title="Managementresultaat van uw zaak" subtitle={`Omzet exclusief btw, productkost en alle geregistreerde kosten · ${rangeLabel}`} actions={<div className="flex flex-wrap gap-2">{periodActions}<ManageCostsButton /></div>} />
        <ReliabilityNotice snapshot={snapshot} activeCostCount={periodCosts.length} />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Omzet exclusief btw" value={formatEUR(snapshot.netRevenueCents)} change={percentageChange(snapshot.netRevenueCents, previous.netRevenueCents)} detail={`${formatEUR(snapshot.vatCents)} btw buiten omzet gehouden`} />
          <MetricCard label="Brutowinst" value={formatEUR(snapshot.grossProfitCents)} change={percentageChange(snapshot.grossProfitCents, previous.grossProfitCents)} detail={`${percentageLabel(snapshot.grossMarginPercent)} brutomarge`} />
          <MetricCard label="Bedrijfskosten" value={formatEUR(snapshot.operatingCostsCents)} change={percentageChange(snapshot.operatingCostsCents, previous.operatingCostsCents)} detail={`${formatEUR(snapshot.fixedCostsCents)} vast · ${formatEUR(snapshot.variableCostsCents)} variabel`} />
          <MetricCard label="Managementresultaat" value={reliable ? formatEUR(snapshot.operatingResultCents) : "Voorlopig"} change={reliable ? percentageChange(snapshot.operatingResultCents, previous.operatingResultCents) : null} detail={reliable ? `${percentageLabel(snapshot.operatingMarginPercent)} van omzet excl. btw` : "Vervolledig kosten en productkostprijzen"} />
        </div>
        <div className="mt-4"><SectionCard title="Van verkoop naar managementresultaat" subtitle="Elke stap gebruikt dezelfde btw-, retour- en kostregels"><ResultBridge snapshot={snapshot} /></SectionCard></div>
        <div className="mt-4 grid gap-4 xl:grid-cols-[1.35fr_.65fr]">
          <SectionCard title="Resultaat per maand" subtitle="Lopende maand tot vandaag; retouren worden als omkering verwerkt"><FinancialTrendChart rows={monthly} /></SectionCard>
          <SectionCard title="Kostenverdeling" subtitle={`Toegerekend over ${rangeLabel}`}><DonutBreakdown rows={snapshot.categoryCosts.map((row) => ({ key: row.key, label: row.label, value: row.valueCents }))} centerLabel="Bedrijfskosten" ariaLabel="Bedrijfskosten per categorie" /></SectionCard>
        </div>
      </>
    );
  }

  if (page === "financial-costs") {
    const rangeEndExclusive = rangeEnd + 1;
    const allocatedRows = costs
      .map((cost) => ({ cost, value: allocateFinancialCostCents(cost, rangeStart, rangeEndExclusive) }))
      .filter((row) => row.value !== 0)
      .sort((left, right) => right.value - left.value);
    return (
      <>
        <PageHeader title="Waar uw geld naartoe gaat" subtitle={`Alle geregistreerde bedrijfskosten, correct toegerekend over ${rangeLabel}`} actions={<div className="flex flex-wrap gap-2">{periodActions}<ManageCostsButton /></div>} />
        <ReliabilityNotice snapshot={snapshot} activeCostCount={periodCosts.length} />
        <div className="grid gap-3 sm:grid-cols-3">
          <MetricCard label="Totale bedrijfskosten" value={formatEUR(snapshot.operatingCostsCents)} detail={`${periodCosts.length} ${periodCosts.length === 1 ? "kost" : "kosten"} in deze periode · ${activeCosts.length} actief`} />
          <MetricCard label="Vaste kosten" value={formatEUR(snapshot.fixedCostsCents)} detail={snapshot.operatingCostsCents > 0 ? `${Math.round((snapshot.fixedCostsCents / snapshot.operatingCostsCents) * 100)}% van bedrijfskosten` : "Nog geen kosten"} />
          <MetricCard label="Variabele kosten" value={formatEUR(snapshot.variableCostsCents)} detail={snapshot.operatingCostsCents > 0 ? `${Math.round((snapshot.variableCostsCents / snapshot.operatingCostsCents) * 100)}% van bedrijfskosten` : "Nog geen kosten"} />
        </div>
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <SectionCard title="Kosten per categorie" subtitle="Grootste impact eerst"><HorizontalBars rows={snapshot.categoryCosts.map((row) => ({ key: row.key, label: row.label, value: row.valueCents }))} formatValue={formatEUR} emptyLabel="Voeg kosten toe om de verdeling te zien." /></SectionCard>
          <SectionCard title="Grootste individuele kosten" subtitle="Toegerekend aan de geselecteerde periode"><HorizontalBars rows={allocatedRows.slice(0, 8).map(({ cost, value }) => ({ key: cost.id, label: cost.name, value, secondary: `${financialCategoryLabel(cost)} · ${cost.behavior === "fixed" ? "vast" : "variabel"}` }))} formatValue={formatEUR} emptyLabel="Nog geen kosten in deze periode." /></SectionCard>
        </div>
      </>
    );
  }

  const scenarios = [-10, 0, 10].map((change) => {
    const factor = 1 + change / 100;
    const revenue = Math.round(snapshot.netRevenueCents * factor);
    const grossProfit = Math.round(snapshot.grossProfitCents * factor);
    const variableCosts = Math.round(snapshot.variableCostsCents * factor);
    return { change, revenue, result: grossProfit - variableCosts - snapshot.fixedCostsCents };
  });
  const reached = snapshot.breakEvenRevenueCents != null && snapshot.breakEvenRevenueCents > 0
    ? Math.max(0, Math.min(100, (snapshot.netRevenueCents / snapshot.breakEvenRevenueCents) * 100))
    : 0;
  return (
    <>
      <PageHeader title="Uw break-evenpunt" subtitle="Hoeveel omzet exclusief btw nodig is om productkost, variabele kosten en vaste lasten te dragen" actions={<div className="flex flex-wrap gap-2">{periodActions}<ManageCostsButton /></div>} />
      <ReliabilityNotice snapshot={snapshot} activeCostCount={periodCosts.length} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Break-evenomzet" value={reliable && snapshot.breakEvenRevenueCents != null ? formatEUR(snapshot.breakEvenRevenueCents) : "Nog niet betrouwbaar"} detail="Omzet exclusief btw in deze periode" />
        <MetricCard label="Gerealiseerde omzet" value={formatEUR(snapshot.netRevenueCents)} detail={`${reached.toFixed(0)}% van berekend break-evenpunt`} />
        <MetricCard label={snapshot.breakEvenGapCents != null && snapshot.breakEvenGapCents >= 0 ? "Boven break-even" : "Nog nodig"} value={snapshot.breakEvenGapCents == null ? "—" : formatEUR(Math.abs(snapshot.breakEvenGapCents))} detail={snapshot.breakEvenGapCents != null && snapshot.breakEvenGapCents >= 0 ? "Operationele ruimte vóór overige niet-geregistreerde posten" : "Bij gelijkblijvende margestructuur"} />
        <MetricCard label="Bijdragemarge" value={percentageLabel(snapshot.contributionMarginPercent)} detail="Na productkost en variabele kosten" />
      </div>
      <div className="mt-4"><SectionCard title="Voortgang naar break-even" subtitle="Geen faillissementsvoorspelling: dit vergelijkt uitsluitend geregistreerde operationele kosten"><div className="py-4"><div className="mb-2 flex justify-between text-xs font-bold text-slate-600"><span>{formatEUR(snapshot.netRevenueCents)} gerealiseerd</span><span>{snapshot.breakEvenRevenueCents == null ? "Onvoldoende data" : `${formatEUR(snapshot.breakEvenRevenueCents)} nodig`}</span></div><div className="h-5 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full transition-all ${reached >= 100 ? "bg-emerald-600" : reached >= 75 ? "bg-amber-500" : "bg-cyan-700"}`} style={{ width: `${reached}%` }} /></div><div className="mt-2 text-right text-xs font-semibold text-slate-500">{reached.toFixed(0)}%</div></div></SectionCard></div>
      <div className="mt-4"><SectionCard title="Wat als uw omzet verandert?" subtitle="Eenvoudige managementscenario’s; product- en variabele kost bewegen evenredig mee"><div className="grid gap-3 sm:grid-cols-3">{scenarios.map((scenario) => <article key={scenario.change} className={`rounded-xl border p-4 ${scenario.change === 0 ? "border-cyan-200 bg-cyan-50" : "border-slate-200 bg-slate-50"}`}><div className="flex items-center justify-between"><span className="text-xs font-bold text-slate-600">{scenario.change === 0 ? "Huidig tempo" : `Omzet ${scenario.change > 0 ? "+" : ""}${scenario.change}%`}</span>{scenario.result >= 0 ? <TrendingUp size={16} className="text-emerald-700" /> : <TrendingDown size={16} className="text-rose-700" />}</div><div className={`mt-3 text-xl font-black ${scenario.result >= 0 ? "text-emerald-700" : "text-rose-700"}`}>{formatEUR(scenario.result)}</div><div className="mt-1 text-xs text-slate-500">resultaat bij {formatEUR(scenario.revenue)} omzet</div></article>)}</div></SectionCard></div>
      <div className="mt-4 flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 text-xs leading-5 text-slate-600"><Calculator size={18} className="mt-0.5 shrink-0 text-cyan-700" /><span>Break-even gebruikt de brutomarge na btw en productkost, verminderd met variabele bedrijfskosten. Vaste kosten worden volledig gedragen door de resterende bijdragemarge. Belastingen, investeringsafschrijvingen en niet-geregistreerde kosten tellen alleen mee wanneer de eigenaar ze invoert.</span></div>
    </>
  );
};
