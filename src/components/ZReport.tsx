import React, { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  Check,
  CheckCircle2,
  Clock3,
  CreditCard,
  FileCheck2,
  Gift,
  LockKeyhole,
  PackageCheck,
  Percent,
  Printer,
  ReceiptText,
  RefreshCw,
  ShieldCheck,
  ShoppingBag,
  TrendingUp,
  Users,
  WalletCards,
} from "lucide-react";
import {
  calculateReportData,
  generateZReport,
  getUnfinalizedTransactions,
  ReportData,
} from "../utils/report";
import {
  DailyReport,
  GiftCardEvent,
  PaymentMethod,
  RegisterShift,
  Transaction,
} from "../types";
import { useAuth } from "../auth/useAuth";
import { formatEUR, parseDecimalToCents } from "../utils/money";
import { db } from "../db/db";
import { DEFAULT_REGISTER_ID, transactionTenders } from "../utils/financial";
import { Modal } from "./Modal";

type PaymentKey = "Cash" | "PIN" | "Cadeaubon";

const paymentMeta: Record<
  PaymentKey,
  { label: string; Icon: typeof Banknote; tone: string; bar: string }
> = {
  Cash: {
    label: "Contant",
    Icon: Banknote,
    tone: "bg-emerald-50 text-emerald-700",
    bar: "bg-emerald-500",
  },
  PIN: {
    label: "Kaart",
    Icon: CreditCard,
    tone: "bg-sky-50 text-sky-700",
    bar: "bg-cyan-600",
  },
  Cadeaubon: {
    label: "Cadeaubon",
    Icon: Gift,
    tone: "bg-violet-50 text-violet-700",
    bar: "bg-violet-500",
  },
};

const signedEUR = (value: number) =>
  `${value > 0 ? "+" : ""}${formatEUR(value)}`;

const paymentLabel = (method: PaymentMethod) =>
  method === "PIN" ? "Kaart" : method;

const paymentTenderSummary = (transaction: Transaction) =>
  transactionTenders(transaction)
    .map((tender) => `${paymentLabel(tender.method)} ${formatEUR(tender.amountCents)}`)
    .join(" · ");

const splitPaymentSummary = (transactions: Transaction[]) => {
  const combinations = new Map<string, number>();
  let count = 0;
  for (const transaction of transactions) {
    const tenders = transactionTenders(transaction);
    if (tenders.length < 2) continue;
    count += 1;
    const label = tenders.map((tender) => paymentLabel(tender.method)).join(" + ");
    combinations.set(label, (combinations.get(label) ?? 0) + 1);
  }
  return { count, combinations: [...combinations.entries()] };
};

const ReportPrintout = ({
  report,
  transactions,
}: {
  report: ReportData | DailyReport;
  transactions: Transaction[];
}) => {
  const isFinal = "reportNumber" in report;
  const totalExcl = report.totalExclVat12Cents + report.totalExclVat21Cents;
  const totalVat = report.totalVat12Cents + report.totalVat21Cents;
  const splitSummary = splitPaymentSummary(transactions);

  return (
    <article className="hidden print:block print:bg-white print:text-black">
      <header className="border-b border-black pb-5 text-center">
        <h1 className="text-2xl font-bold">PWAyment POS</h1>
        <p className="mt-1 text-lg font-bold">
          {isFinal ? "Z-RAPPORT" : "X-RAPPORT"}
        </p>
        {isFinal && (
          <p className="mt-1 text-sm">Rapport nr. {report.reportNumber}</p>
        )}
        <p className="mt-1 text-sm">
          {format(report.timestamp, "dd/MM/yyyy HH:mm")}
        </p>
        {isFinal && report.closedByUserName && (
          <p className="mt-1 text-sm">
            Afgesloten door {report.closedByUserName}
          </p>
        )}
      </header>

      <div className="mt-6 space-y-6 text-sm">
        <section>
          <h2 className="mb-2 border-b border-gray-300 pb-1 font-bold">
            Omzet
          </h2>
          <PrintRow
            label="Productomzet incl. btw"
            value={formatEUR(report.totalRevenueCents)}
            strong
          />
          {(report.giftCardLiabilityAddedCents ?? 0) > 0 && (
            <PrintRow
              label="Nieuwe cadeaubonverplichting"
              value={formatEUR(report.giftCardLiabilityAddedCents ?? 0)}
            />
          )}
          <PrintRow
            label="Kortingen"
            value={`-${formatEUR(report.totalDiscountCents)}`}
          />
          {(report.totalCashRoundingAdjustmentCents ?? 0) !== 0 && (
            <PrintRow
              label="Cashafrondingen"
              value={`${(report.totalCashRoundingAdjustmentCents ?? 0) > 0 ? "+" : ""}${formatEUR(report.totalCashRoundingAdjustmentCents ?? 0)}`}
            />
          )}
          <PrintRow
            label="Inkoopwaarde"
            value={formatEUR(report.totalCostCents)}
          />
          <PrintRow
            label="Brutowinst"
            value={formatEUR(report.grossProfitCents)}
            strong
          />
        </section>

        <section>
          <h2 className="mb-2 border-b border-gray-300 pb-1 font-bold">
            Betaalmethodes
          </h2>
          <PrintRow
            label="Contant"
            value={formatEUR(
              report.paymentTotalsCents.Cash +
                (report.giftCardLiabilityPaymentTotalsCents?.Cash ?? 0),
            )}
          />
          <PrintRow
            label="Kaart"
            value={formatEUR(
              report.paymentTotalsCents.PIN +
                (report.giftCardLiabilityPaymentTotalsCents?.PIN ?? 0),
            )}
          />
          <PrintRow
            label="Cadeaubon"
            value={formatEUR(
              report.paymentTotalsCents.Cadeaubon +
                (report.giftCardLiabilityPaymentTotalsCents?.Cadeaubon ?? 0),
            )}
          />
        </section>

        {splitSummary.count > 0 && (
          <section>
            <h2 className="mb-2 border-b border-gray-300 pb-1 font-bold">
              Gesplitste betalingen
            </h2>
            <PrintRow label="Aantal verkopen" value={String(splitSummary.count)} />
            {splitSummary.combinations.map(([label, count]) => (
              <PrintRow key={label} label={label} value={`${count} verkoop${count === 1 ? "" : "en"}`} />
            ))}
            <p className="mt-1 text-xs text-gray-600">
              Reeds inbegrepen in de betaalmethodetotalen hierboven.
            </p>
          </section>
        )}

        <section>
          <h2 className="mb-2 border-b border-gray-300 pb-1 font-bold">BTW</h2>
          {report.totalExclVat12Cents > 0 && (
            <PrintRow
              label="12% · excl. / BTW"
              value={`${formatEUR(report.totalExclVat12Cents)} / ${formatEUR(report.totalVat12Cents)}`}
            />
          )}
          {(report.totalExclVat21Cents > 0 || report.totalVat21Cents > 0) && (
            <PrintRow
              label="21% · excl. / btw"
              value={`${formatEUR(report.totalExclVat21Cents)} / ${formatEUR(report.totalVat21Cents)}`}
            />
          )}
          <PrintRow
            label="Totaal excl. / BTW"
            value={`${formatEUR(totalExcl)} / ${formatEUR(totalVat)}`}
            strong
          />
        </section>

        <footer className="border-t border-gray-300 pt-4 text-center text-xs text-gray-600">
          <p>
            {transactions.length || report.transactionIds.length} transacties
          </p>
          {isFinal && (
            <p className="mt-3 break-all font-mono text-[9px]">
              Hash: {report.hash}
            </p>
          )}
          <p className="mt-4">Einde rapport</p>
        </footer>
      </div>
    </article>
  );
};

const PrintRow = ({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) => (
  <div
    className={`flex justify-between gap-6 py-1 ${strong ? "font-bold" : ""}`}
  >
    <span>{label}</span>
    <span>{value}</span>
  </div>
);

export const ZReportView: React.FC = () => {
  const auth = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [giftCardEvents, setGiftCardEvents] = useState<GiftCardEvent[]>([]);
  const [currentShift, setCurrentShift] = useState<RegisterShift | null>(null);
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [lastReport, setLastReport] = useState<DailyReport | null>(null);
  const [finalReport, setFinalReport] = useState<DailyReport | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmedChecks, setConfirmedChecks] = useState(false);
  const [loading, setLoading] = useState(true);
  const [closing, setClosing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [countedCashText, setCountedCashText] = useState("");
  const [openingFloatText, setOpeningFloatText] = useState("0,00");
  const [cashDifferenceReason, setCashDifferenceReason] = useState("");

  const loadData = async () => {
    setLoading(true);
    try {
      const [txs, latestReport, events, shift] = await Promise.all([
        getUnfinalizedTransactions(),
        db.daily_reports.orderBy("reportNumber").last(),
        db.gift_card_events
          .filter(
            (event) =>
              event.dailyReportId == null &&
              event.source !== "demo" &&
              (event.type === "issue" || event.type === "recharge"),
          )
          .toArray(),
        db.shifts
          .filter(
            (row) =>
              row.registerId === DEFAULT_REGISTER_ID && row.status === "open",
          )
          .last(),
      ]);
      setTransactions(txs.sort((a, b) => a.timestamp - b.timestamp));
      setGiftCardEvents(events);
      setCurrentShift(shift ?? null);
      setOpeningFloatText(
        ((shift?.openingFloatCents ?? 0) / 100).toFixed(2).replace(".", ","),
      );
      setReportData(
        txs.length > 0 || events.length > 0
          ? calculateReportData(txs, events)
          : null,
      );
      setLastReport(latestReport ?? null);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const confirmFinalize = async () => {
    const counted = parseDecimalToCents(countedCashText);
    const openingFloat = parseDecimalToCents(openingFloatText);
    if (!counted.ok) {
      setLoadError("Vul een geldig geteld kasbedrag in.");
      return;
    }
    if (!openingFloat.ok) {
      setLoadError("Vul een geldig startbedrag van de kassalade in.");
      return;
    }
    setClosing(true);
    try {
      const report = await generateZReport({
        closedByUserId: auth.currentUserId ?? undefined,
        closedByUserName: auth.currentUserName ?? undefined,
        registerId: DEFAULT_REGISTER_ID,
        shiftId: currentShift?.id,
        openingFloatCents: openingFloat.cents,
        countedCashCents: counted.cents,
        cashDifferenceReason: cashDifferenceReason.trim() || undefined,
      });
      if (report) {
        setFinalReport(report);
        setLastReport(report);
        setShowConfirm(false);
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
      setShowConfirm(false);
    } finally {
      setClosing(false);
    }
  };

  const analytics = useMemo(() => {
    const revenue = reportData?.totalRevenueCents ?? 0;
    const transactionCount = transactions.length;
    const itemCount = transactions.reduce(
      (sum, transaction) =>
        sum +
        transaction.items.reduce((itemSum, item) => itemSum + item.quantity, 0),
      0,
    );
    const staff = new Map<
      string,
      { name: string; count: number; revenueCents: number }
    >();

    for (const transaction of transactions) {
      const key = transaction.userId ?? transaction.userName ?? "unknown";
      const row = staff.get(key) ?? {
        name: transaction.userName ?? "Onbekende medewerker",
        count: 0,
        revenueCents: 0,
      };
      row.count += 1;
      row.revenueCents += transaction.totalCents;
      staff.set(key, row);
    }

    const salesPaymentTotal = reportData
      ? reportData.paymentTotalsCents.Cash +
        reportData.paymentTotalsCents.PIN +
        reportData.paymentTotalsCents.Cadeaubon
      : 0;
    const liabilityPaymentTotal = reportData
      ? reportData.giftCardLiabilityPaymentTotalsCents.Cash +
        reportData.giftCardLiabilityPaymentTotalsCents.PIN +
        reportData.giftCardLiabilityPaymentTotalsCents.Cadeaubon
      : 0;
    const vatTotal = reportData
      ? reportData.totalVat12Cents + reportData.totalVat21Cents
      : 0;
    const accountedRevenue = reportData
      ? reportData.totalExclVat12Cents +
        reportData.totalExclVat21Cents +
        vatTotal
      : 0;
    const margin =
      revenue > 0 ? ((reportData?.grossProfitCents ?? 0) / revenue) * 100 : 0;

    return {
      itemCount,
      averageBasketCents:
        transactionCount > 0 ? Math.round(revenue / transactionCount) : 0,
      margin,
      paymentDifferenceCents:
        salesPaymentTotal +
        liabilityPaymentTotal -
        revenue -
        (reportData?.giftCardLiabilityAddedCents ?? 0) -
        (reportData?.totalCashRoundingAdjustmentCents ?? 0),
      vatDifferenceCents: accountedRevenue - revenue,
      vatTotal,
      firstSaleAt: transactions[0]?.timestamp,
      lastSaleAt: transactions.at(-1)?.timestamp,
      staff: Array.from(staff.values()).sort(
        (a, b) => b.revenueCents - a.revenueCents,
      ),
      discountedTransactions: transactions.filter(
        (transaction) => transaction.discountCents > 0,
      ).length,
    };
  }, [reportData, transactions]);

  if (loading) {
    return (
      <div className="day-close-light flex flex-1 items-center justify-center bg-slate-50 text-slate-600">
        <RefreshCw size={22} className="mr-3 animate-spin text-cyan-700" />{" "}
        Daggegevens controleren…
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="day-close-light flex flex-1 items-center justify-center overflow-y-auto bg-slate-50 p-6">
        <section className="insights-panel max-w-xl p-8 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-rose-50 text-rose-600">
            <AlertTriangle size={24} />
          </span>
          <h1 className="mt-4 text-xl font-bold text-slate-950">
            Rapport kan niet worden opgesteld
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">{loadError}</p>
          <p className="mt-3 text-xs leading-5 text-slate-500">
            Controleer de openstaande transacties en corrigeer de foutieve regel
            voordat je de dag afsluit.
          </p>
          <button
            type="button"
            onClick={() => void loadData()}
            className="insights-primary-action mt-6 inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold"
          >
            <RefreshCw size={16} />
            Opnieuw proberen
          </button>
        </section>
      </div>
    );
  }

  if (finalReport) {
    return (
      <div className="day-close-light flex-1 overflow-y-auto bg-slate-50 print:bg-white">
        <ReportPrintout report={finalReport} transactions={transactions} />
        <main className="mx-auto max-w-5xl p-5 sm:p-8 print:hidden">
          <section className="insights-panel overflow-hidden">
            <div className="border-b border-emerald-100 bg-emerald-50/70 p-6 sm:p-8">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-emerald-600 text-white shadow-sm">
                <Check size={24} strokeWidth={3} />
              </span>
              <h1 className="mt-5 text-2xl font-bold tracking-tight text-slate-950">
                Dag succesvol afgesloten
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                Z-rapport #{finalReport.reportNumber} is definitief opgeslagen.{" "}
                {finalReport.transactionIds.length} transacties en{" "}
                {finalReport.giftCardEventIds?.length ?? 0} cadeaubonmutaties
                zijn opgenomen. Correcties worden als afzonderlijke tegenboeking
                geregistreerd.
              </p>
            </div>
            <div className="grid gap-6 p-6 sm:grid-cols-3 sm:p-8">
              <SummaryValue
                label="Definitieve omzet"
                value={formatEUR(finalReport.totalRevenueCents)}
              />
              <SummaryValue
                label="Afgesloten door"
                value={
                  finalReport.closedByUserName ??
                  auth.currentUserName ??
                  "Onbekend"
                }
              />
              <SummaryValue
                label="Afsluittijd"
                value={format(finalReport.timestamp, "HH:mm")}
              />
            </div>
            <div className="flex flex-col gap-3 border-t border-slate-100 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
              <p className="text-xs text-slate-500">
                <ShieldCheck
                  size={14}
                  className="mr-1.5 inline text-emerald-600"
                />
                Volledige transactiesnapshot en hashketen vastgelegd.
              </p>
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50"
              >
                <Printer size={16} />
                Z-rapport printen
              </button>
            </div>
          </section>
        </main>
      </div>
    );
  }

  if (!reportData) {
    return (
      <div className="day-close-light flex-1 overflow-y-auto bg-slate-50">
        <main className="mx-auto max-w-5xl p-5 sm:p-8">
          <header>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-cyan-700">
              Dagafsluiting
            </p>
            <h1 className="mt-1 text-[28px] font-bold tracking-tight text-slate-950">
              Alles is bijgewerkt
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Er staan geen transacties klaar om af te sluiten.
            </p>
          </header>
          <section className="insights-panel mt-6 p-8 text-center">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-emerald-50 text-emerald-600">
              <CheckCircle2 size={25} />
            </span>
            <h2 className="mt-4 text-lg font-bold text-slate-950">
              Geen openstaande verkoop
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
              Zodra er nieuwe verkopen zijn, verschijnt hier automatisch een
              nieuw voorlopig X-rapport.
            </p>
          </section>
          {lastReport && (
            <section className="insights-panel mt-4 flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600">
                  <FileCheck2 size={20} />
                </span>
                <div>
                  <p className="text-sm font-bold text-slate-900">
                    Laatste Z-rapport #{lastReport.reportNumber}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {format(lastReport.timestamp, "d MMMM yyyy 'om' HH:mm", {
                      locale: nl,
                    })}
                    {lastReport.closedByUserName
                      ? ` · ${lastReport.closedByUserName}`
                      : ""}
                  </p>
                </div>
              </div>
              <strong className="text-xl text-slate-950">
                {formatEUR(lastReport.totalRevenueCents)}
              </strong>
            </section>
          )}
        </main>
      </div>
    );
  }

  const totalRevenueCents = reportData.totalRevenueCents;
  const totalCollectedCents =
    totalRevenueCents +
    reportData.giftCardLiabilityAddedCents +
    reportData.totalCashRoundingAdjustmentCents;
  const paymentMax = Math.max(
    1,
    ...(Object.keys(paymentMeta) as PaymentKey[]).map(
      (key) =>
        reportData.paymentTotalsCents[key] +
        reportData.giftCardLiabilityPaymentTotalsCents[key],
    ),
  );
  const recentTransactions = [...transactions].reverse().slice(0, 5);
  const splitSummary = splitPaymentSummary(transactions);
  const canFinalize = auth.hasRole("owner", "manager");
  const parsedOpeningFloat = parseDecimalToCents(openingFloatText);
  const expectedCashCents =
    (parsedOpeningFloat.ok
      ? parsedOpeningFloat.cents
      : (currentShift?.openingFloatCents ?? 0)) +
    reportData.paymentTotalsCents.Cash +
    reportData.giftCardLiabilityPaymentTotalsCents.Cash;
  const parsedCountedCash = parseDecimalToCents(countedCashText);
  const cashDifferenceCents = parsedCountedCash.ok
    ? parsedCountedCash.cents - expectedCashCents
    : null;
  const needsDifferenceReason =
    cashDifferenceCents != null && cashDifferenceCents !== 0;
  const canConfirmClose =
    confirmedChecks &&
    parsedOpeningFloat.ok &&
    parsedCountedCash.ok &&
    (!needsDifferenceReason || cashDifferenceReason.trim().length >= 3) &&
    !closing;

  return (
    <div className="day-close-light flex-1 overflow-y-auto bg-slate-50 text-slate-900 print:bg-white">
      <ReportPrintout report={reportData} transactions={transactions} />

      <Modal
        open={showConfirm}
        onClose={() => !closing && setShowConfirm(false)}
        title="Dag definitief afsluiten"
        subtitle="Deze actie kan niet ongedaan worden gemaakt."
        icon={<LockKeyhole size={20} />}
        size="lg"
        className="print:hidden"
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => setShowConfirm(false)}
              disabled={closing}
              className="rounded-lg px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-40"
            >
              Annuleren
            </button>
            <button
              type="button"
              disabled={!canConfirmClose}
              onClick={() => void confirmFinalize()}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-950 px-5 py-2.5 text-sm font-bold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {closing ? (
                <RefreshCw size={16} className="animate-spin" />
              ) : (
                <LockKeyhole size={16} />
              )}
              Definitief afsluiten
            </button>
          </div>
        }
      >
        <div>
          <div className="grid grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <SummaryValue label="Omzet" value={formatEUR(totalRevenueCents)} />
            <SummaryValue
              label="Transacties"
              value={String(transactions.length)}
            />
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-bold text-slate-700">
              Startbedrag kassalade
              <input
                inputMode="decimal"
                value={openingFloatText}
                onChange={(event) => setOpeningFloatText(event.target.value)}
                placeholder="0,00"
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base font-bold tabular-nums text-slate-950 outline-none focus:border-cyan-700"
              />
              <span className="mt-1 block font-medium leading-4 text-slate-500">
                Controleer het wisselgeld waarmee deze shift begon.
              </span>
            </label>
            <SummaryValue
              label="Verwacht contant in lade"
              value={formatEUR(expectedCashCents)}
            />
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-bold text-slate-700">
              Geteld bedrag
              <input
                inputMode="decimal"
                value={countedCashText}
                onChange={(event) => setCountedCashText(event.target.value)}
                placeholder="0,00"
                autoFocus
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base font-bold tabular-nums text-slate-950 outline-none focus:border-cyan-700"
              />
            </label>
          </div>
          {cashDifferenceCents != null && (
            <div
              className={`mt-3 rounded-lg px-3.5 py-3 text-sm font-bold ${cashDifferenceCents === 0 ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}
            >
              Kasverschil: {signedEUR(cashDifferenceCents)}
            </div>
          )}
          {needsDifferenceReason && (
            <label className="mt-3 block text-xs font-bold text-slate-700">
              Verklaring kasverschil
              <textarea
                value={cashDifferenceReason}
                onChange={(event) =>
                  setCashDifferenceReason(event.target.value)
                }
                className="mt-1.5 min-h-20 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none focus:border-cyan-700"
                placeholder="Minimaal 3 tekens"
              />
            </label>
          )}
          <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-4 hover:bg-slate-50">
            <input
              type="checkbox"
              checked={confirmedChecks}
              onChange={(event) => setConfirmedChecks(event.target.checked)}
              className="mt-0.5 h-4 w-4 accent-cyan-700"
            />
            <span>
              <span className="block text-sm font-bold text-slate-800">
                Ik heb de betaalmethodes gecontroleerd
              </span>
              <span className="mt-1 block text-xs leading-5 text-slate-500">
                De transacties worden gearchiveerd en opgenomen in Z-rapport #
                {(lastReport?.reportNumber ?? 0) + 1}.
              </span>
            </span>
          </label>
        </div>
      </Modal>

      <main className="mx-auto max-w-[1280px] p-4 sm:p-6 lg:p-8 print:hidden">
        <header className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-cyan-700">
                Dagafsluiting
              </p>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-800">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                Voorlopig X-rapport
              </span>
            </div>
            <h1 className="mt-2 text-[28px] font-bold tracking-tight text-slate-950">
              Klaar om de dag af te sluiten
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {analytics.firstSaleAt && analytics.lastSaleAt
                ? `${format(analytics.firstSaleAt, "HH:mm")} – ${format(analytics.lastSaleAt, "HH:mm")} · `
                : ""}
              {format(reportData.timestamp, "EEEE d MMMM yyyy", { locale: nl })}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <Printer size={16} />
              X-rapport
            </button>
            {canFinalize && (
              <button
                type="button"
                onClick={() => {
                  setConfirmedChecks(false);
                  setCountedCashText("");
                  setCashDifferenceReason("");
                  setShowConfirm(true);
                }}
                className="insights-primary-action inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-bold"
              >
                <LockKeyhole size={16} />
                Dag afsluiten
                <ArrowRight size={15} />
              </button>
            )}
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric
            icon={WalletCards}
            label="Omzet incl. BTW"
            value={formatEUR(totalRevenueCents)}
            detail={`${formatEUR(reportData.totalDiscountCents)} korting verwerkt`}
          />
          <Metric
            icon={ReceiptText}
            label="Transacties"
            value={String(transactions.length)}
            detail={`${analytics.itemCount} artikelen verkocht`}
          />
          <Metric
            icon={ShoppingBag}
            label="Gemiddelde bon"
            value={formatEUR(analytics.averageBasketCents)}
            detail="Per afgerekende transactie"
          />
          <Metric
            icon={TrendingUp}
            label="Brutowinst"
            value={formatEUR(reportData.grossProfitCents)}
            detail={`${analytics.margin.toFixed(1).replace(".", ",")}% brutomarge`}
            tone="emerald"
          />
        </section>

        <div className="mt-4 grid items-start gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.8fr)]">
          <div className="space-y-4">
            <section className="insights-panel p-5 sm:p-6">
              <SectionHeading
                icon={CreditCard}
                title="Betaalmethodes"
                subtitle="Ontvangsten sluiten aan op de geregistreerde omzet."
              />
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                {(Object.keys(paymentMeta) as PaymentKey[]).map((key) => {
                  const meta = paymentMeta[key];
                  const value =
                    reportData.paymentTotalsCents[key] +
                    reportData.giftCardLiabilityPaymentTotalsCents[key];
                  return (
                    <div
                      key={key}
                      className="rounded-xl border border-slate-200 bg-slate-50/60 p-4"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`grid h-8 w-8 place-items-center rounded-lg ${meta.tone}`}
                        >
                          <meta.Icon size={16} />
                        </span>
                        <strong className="text-lg text-slate-950">
                          {formatEUR(value)}
                        </strong>
                      </div>
                      <div className="mt-4 flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-600">
                          {meta.label}
                        </span>
                        <span className="text-slate-400">
                          {totalCollectedCents > 0
                            ? Math.round((value / totalCollectedCents) * 100)
                            : 0}
                          %
                        </span>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
                        <div
                          className={`h-full rounded-full ${meta.bar}`}
                          style={{ width: `${(value / paymentMax) * 100}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div
                className={`mt-4 flex items-center justify-between rounded-lg px-3.5 py-3 text-xs font-semibold ${analytics.paymentDifferenceCents === 0 ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}
              >
                <span className="flex items-center gap-2">
                  {analytics.paymentDifferenceCents === 0 ? (
                    <CheckCircle2 size={16} />
                  ) : (
                    <AlertTriangle size={16} />
                  )}
                  {analytics.paymentDifferenceCents === 0
                    ? "Betaaltotalen sluiten volledig aan"
                    : "Verschil tussen omzet en betaalmethodes"}
                </span>
                <strong>{signedEUR(analytics.paymentDifferenceCents)}</strong>
              </div>
              {splitSummary.count > 0 && (
                <div className="mt-4 rounded-lg border border-violet-100 bg-violet-50 px-3.5 py-3 text-xs text-violet-950">
                  <div className="flex items-center justify-between gap-3 font-bold">
                    <span>Gesplitste betalingen</span>
                    <span>{splitSummary.count} verkoop{splitSummary.count === 1 ? "" : "en"}</span>
                  </div>
                  <div className="mt-1.5 text-violet-800">
                    {splitSummary.combinations.map(([label, count]) => `${label}: ${count}`).join(" · ")}
                  </div>
                  <p className="mt-1 text-violet-700/80">Al inbegrepen in Cash, Kaart en Cadeaubon hierboven.</p>
                </div>
              )}
            </section>

            <section className="insights-panel overflow-hidden">
              <div className="p-5 sm:p-6">
                <SectionHeading
                  icon={ReceiptText}
                  title="Laatste transacties"
                  subtitle="Snelle eindcontrole van de meest recente verkopen."
                />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[620px] text-left text-sm">
                  <thead className="border-y border-slate-100 bg-slate-50/70 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">
                    <tr>
                      <th className="px-6 py-3">Tijd</th>
                      <th className="px-4 py-3">Transactie</th>
                      <th className="px-4 py-3">Medewerker</th>
                      <th className="px-4 py-3">Betaling</th>
                      <th className="px-6 py-3 text-right">Totaal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {recentTransactions.map((transaction) => (
                      <tr
                        key={transaction.id ?? transaction.clientRequestId}
                        className="text-slate-600"
                      >
                        <td className="px-6 py-3.5 font-semibold text-slate-900">
                          {format(transaction.timestamp, "HH:mm")}
                        </td>
                        <td className="px-4 py-3.5">
                          #{transaction.id ?? "—"} ·{" "}
                          {transaction.items.reduce(
                            (sum, item) => sum + item.quantity,
                            0,
                          )}{" "}
                          art.
                        </td>
                        <td className="px-4 py-3.5">
                          {transaction.userName ?? "Onbekend"}
                        </td>
                        <td className="px-4 py-3.5">
                          {transaction.paymentMethod === "Split"
                            ? paymentTenderSummary(transaction)
                            : paymentLabel(transaction.paymentMethod)}
                        </td>
                        <td className="px-6 py-3.5 text-right font-bold text-slate-950">
                          {formatEUR(transaction.totalCents)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          <aside className="space-y-4">
            <section className="insights-panel p-5">
              <SectionHeading
                icon={FileCheck2}
                title="Afsluitcontrole"
                subtitle="Automatisch gecontroleerd op basis van de transacties."
              />
              <div className="mt-4 space-y-1">
                <CheckRow
                  label="Transacties compleet"
                  detail={`${transactions.length} verkopen opgenomen`}
                  ok
                />
                <CheckRow
                  label="Betaaltotalen"
                  detail={
                    analytics.paymentDifferenceCents === 0
                      ? "Geen verschil gevonden"
                      : `${signedEUR(analytics.paymentDifferenceCents)} verschil`
                  }
                  ok={analytics.paymentDifferenceCents === 0}
                />
                <CheckRow
                  label="BTW-berekening"
                  detail={
                    analytics.vatDifferenceCents === 0
                      ? `${formatEUR(analytics.vatTotal)} verschuldigde BTW`
                      : `${signedEUR(analytics.vatDifferenceCents)} verschil`
                  }
                  ok={analytics.vatDifferenceCents === 0}
                />
                <CheckRow
                  label="Rapportbevoegdheid"
                  detail={
                    canFinalize
                      ? `${auth.currentRole} kan afsluiten`
                      : "Manager of eigenaar vereist"
                  }
                  ok={canFinalize}
                />
              </div>
            </section>

            <section className="insights-panel p-5">
              <SectionHeading icon={Percent} title="Omzet & BTW" />
              <div className="mt-4 space-y-3">
                <ValueRow
                  label="Omzet incl. BTW"
                  value={formatEUR(totalRevenueCents)}
                  strong
                />
                <ValueRow
                  label="Omzet excl. BTW"
                  value={formatEUR(
                    reportData.totalExclVat12Cents +
                      reportData.totalExclVat21Cents,
                  )}
                />
                <ValueRow
                  label="BTW 12%"
                  value={formatEUR(reportData.totalVat12Cents)}
                  muted={reportData.totalVat12Cents === 0}
                />
                <ValueRow
                  label="BTW 21%"
                  value={formatEUR(reportData.totalVat21Cents)}
                />
                <div className="border-t border-slate-100 pt-3">
                  <ValueRow
                    label="Kortingen"
                    value={`-${formatEUR(reportData.totalDiscountCents)}`}
                  />
                  <p className="mt-1 text-[11px] text-slate-400">
                    {analytics.discountedTransactions} transacties met korting
                  </p>
                </div>
              </div>
            </section>

            <section className="insights-panel p-5">
              <SectionHeading
                icon={Users}
                title="Shift"
                subtitle={`${analytics.staff.length} ${analytics.staff.length === 1 ? "medewerker" : "medewerkers"} actief`}
              />
              <div className="mt-4 space-y-3">
                {analytics.staff.slice(0, 4).map((member) => (
                  <div
                    key={member.name}
                    className="flex items-center justify-between gap-3"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-cyan-50 text-xs font-bold text-cyan-800">
                        {member.name.charAt(0).toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-700">
                          {member.name}
                        </p>
                        <p className="text-[11px] text-slate-400">
                          {member.count} transacties
                        </p>
                      </div>
                    </div>
                    <strong className="text-sm text-slate-900">
                      {formatEUR(member.revenueCents)}
                    </strong>
                  </div>
                ))}
                <div className="grid grid-cols-2 gap-2 border-t border-slate-100 pt-4">
                  <SmallStat
                    icon={Clock3}
                    label="Eerste verkoop"
                    value={
                      analytics.firstSaleAt
                        ? format(analytics.firstSaleAt, "HH:mm")
                        : "—"
                    }
                  />
                  <SmallStat
                    icon={PackageCheck}
                    label="Artikelen"
                    value={String(analytics.itemCount)}
                  />
                </div>
              </div>
            </section>
          </aside>
        </div>
      </main>
    </div>
  );
};

const Metric = ({
  icon: Icon,
  label,
  value,
  detail,
  tone = "cyan",
}: {
  icon: typeof ReceiptText;
  label: string;
  value: string;
  detail: string;
  tone?: "cyan" | "emerald";
}) => (
  <div className="insights-panel min-w-0 p-4 sm:p-5">
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-xs font-semibold text-slate-500">{label}</p>
        <p className="mt-2 break-words text-2xl font-bold tracking-tight text-slate-950">
          {value}
        </p>
      </div>
      <span
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${tone === "emerald" ? "bg-emerald-50 text-emerald-700" : "bg-cyan-50 text-cyan-800"}`}
      >
        <Icon size={18} />
      </span>
    </div>
    <p className="mt-2 text-xs text-slate-500">{detail}</p>
  </div>
);

const SectionHeading = ({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: typeof ReceiptText;
  title: string;
  subtitle?: string;
}) => (
  <div className="flex items-start gap-3">
    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600">
      <Icon size={16} />
    </span>
    <div>
      <h2 className="text-sm font-bold text-slate-900">{title}</h2>
      {subtitle && (
        <p className="mt-1 text-xs leading-5 text-slate-500">{subtitle}</p>
      )}
    </div>
  </div>
);

const CheckRow = ({
  label,
  detail,
  ok,
}: {
  label: string;
  detail: string;
  ok: boolean;
}) => (
  <div className="flex items-start gap-3 rounded-lg px-2 py-2.5">
    <span
      className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full ${ok ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"}`}
    >
      {ok ? <Check size={12} strokeWidth={3} /> : <AlertTriangle size={11} />}
    </span>
    <div>
      <p className="text-xs font-bold text-slate-700">{label}</p>
      <p className="mt-0.5 text-[11px] leading-4 text-slate-400">{detail}</p>
    </div>
  </div>
);

const ValueRow = ({
  label,
  value,
  strong = false,
  muted = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
  muted?: boolean;
}) => (
  <div className="flex items-center justify-between gap-4 text-sm">
    <span className={strong ? "font-bold text-slate-800" : "text-slate-500"}>
      {label}
    </span>
    <span
      className={`${strong ? "font-bold text-slate-950" : "font-semibold text-slate-800"} ${muted ? "opacity-40" : ""}`}
    >
      {value}
    </span>
  </div>
);

const SummaryValue = ({ label, value }: { label: string; value: string }) => (
  <div>
    <p className="text-xs font-semibold text-slate-500">{label}</p>
    <p className="mt-1 text-lg font-bold text-slate-950">{value}</p>
  </div>
);

const SmallStat = ({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Clock3;
  label: string;
  value: string;
}) => (
  <div className="rounded-lg bg-slate-50 p-3">
    <Icon size={14} className="text-slate-400" />
    <p className="mt-2 text-[10px] font-semibold text-slate-400">{label}</p>
    <p className="mt-1 text-sm font-bold text-slate-800">{value}</p>
  </div>
);
