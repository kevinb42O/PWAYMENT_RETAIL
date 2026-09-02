import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import {
  ArrowLeft,
  Banknote,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CreditCard,
  Download,
  FileJson,
  Gift,
  PackageCheck,
  Printer,
  ReceiptText,
  ShieldCheck,
  TrendingUp,
  X,
} from "lucide-react";
import type { MerchantInfo } from "../data/merchant";
import type { DailyReport, Transaction } from "../types";
import {
  DailyReportDetail,
  loadDailyReportDetail,
} from "../services/dailyReportDetail";
import { formatEUR } from "../utils/money";
import { downloadZReportPdf } from "../utils/zReportPdf";
import { vatBreakdownForReport } from "../utils/vatReport";

const download = (name: string, body: string, mime: string) => {
  const blob = new Blob([body], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
};

const csvCell = (value: unknown) =>
  `"${String(value ?? "").replaceAll('"', '""')}"`;
const csvRows = (rows: unknown[][]) =>
  rows.map((row) => row.map(csvCell).join(",")).join("\r\n");

const paymentLabel = (method: string) =>
  method === "PIN" ? "Kaart" : method;

const tenderSummary = (
  tenders: { method: "Cash" | "PIN" | "Cadeaubon"; amountCents: number }[],
) => tenders
  .map((tender) => `${paymentLabel(tender.method)} ${formatEUR(tender.amountCents)}`)
  .join(" · ");

const Stat = ({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "good" | "warn" }) => (
  <div className="z-report-history-stat rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">{label}</div>
    <div className={`mt-1.5 text-xl font-extrabold tabular-nums ${tone === "good" ? "text-emerald-700" : tone === "warn" ? "text-rose-700" : "text-slate-950"}`}>
      {value}
    </div>
  </div>
);

const ReportPrintout = ({ detail, merchant }: { detail: DailyReportDetail; merchant: MerchantInfo }) => {
  const { report, products, transactions } = detail;
  const totals = report.totals;
  return (
    <article className="z-report-history-print hidden bg-white text-black print:block">
      <header className="border-b-2 border-slate-950 pb-5">
        <div className="flex items-start justify-between gap-8">
          <div>
            <h1 className="text-2xl font-black">{merchant.name || "PWAYMENT"}</h1>
            <p className="mt-1 text-xs">{merchant.addressLine1} {merchant.addressLine2}</p>
            <p className="text-xs">BTW {merchant.vatNumber}</p>
          </div>
          <div className="text-right">
            <h2 className="text-2xl font-black">Z-RAPPORT #{report.reportNumber}</h2>
            <p className="mt-1 text-sm">{format(report.closedAt, "dd/MM/yyyy HH:mm:ss")}</p>
            <p className="text-xs">{report.registerName}{report.shiftNumber ? ` · Shift ${report.shiftNumber}` : ""}</p>
          </div>
        </div>
      </header>
      <section className="mt-5 grid grid-cols-4 gap-4 text-xs">
        <div><b>Periode</b><br />{report.openedAt ? format(report.openedAt, "dd/MM HH:mm") : "—"} – {format(report.closedAt, "dd/MM HH:mm")}</div>
        <div><b>Afgesloten door</b><br />{report.closedByUserName ?? "Systeem"}</div>
        <div><b>Transacties</b><br />{report.transactionCount}</div>
        <div><b>Berekening</b><br />{report.calculationAuthority === "server" ? "Server-authoritair" : "Historisch"}</div>
      </section>
      <section className="mt-6 grid grid-cols-2 gap-8 text-sm">
        <table className="w-full"><tbody>
          <tr><td>Productomzet</td><td className="text-right font-bold">{formatEUR(Number(totals.totalRevenueCents ?? 0))}</td></tr>
          <tr><td>Kostprijs</td><td className="text-right">{formatEUR(Number(totals.totalCostCents ?? 0))}</td></tr>
          <tr><td>Brutowinst</td><td className="text-right font-bold">{formatEUR(Number(totals.grossProfitCents ?? 0))}</td></tr>
          <tr><td>Kortingen</td><td className="text-right">{formatEUR(Number(totals.totalDiscountCents ?? 0))}</td></tr>
          {Number(totals.totalCashRoundingAdjustmentCents ?? 0) !== 0 && <tr><td>Cashafrondingen</td><td className="text-right">{formatEUR(Number(totals.totalCashRoundingAdjustmentCents ?? 0))}</td></tr>}
          {vatBreakdownForReport({
            totalVat12Cents: Number(totals.totalVat12Cents ?? 0),
            totalVat21Cents: Number(totals.totalVat21Cents ?? 0),
            totalExclVat12Cents: Number(totals.totalExclVat12Cents ?? 0),
            totalExclVat21Cents: Number(totals.totalExclVat21Cents ?? 0),
            totalVatBreakdown: totals.totalVatBreakdown,
          }).map((line) => <tr key={line.rate}><td>BTW {line.rate}%</td><td className="text-right">{formatEUR(line.vatCents)}</td></tr>)}
        </tbody></table>
        <table className="w-full"><tbody>
          <tr><td>Cash</td><td className="text-right">{formatEUR(Number(totals.paymentTotalsCents?.Cash ?? 0))}</td></tr>
          <tr><td>Kaart</td><td className="text-right">{formatEUR(Number(totals.paymentTotalsCents?.PIN ?? 0))}</td></tr>
          <tr><td>Cadeaubon</td><td className="text-right">{formatEUR(Number(totals.paymentTotalsCents?.Cadeaubon ?? 0))}</td></tr>
          <tr><td>Beginkas</td><td className="text-right">{formatEUR(report.openingFloatCents)}</td></tr>
          <tr><td>Verwacht cash</td><td className="text-right">{formatEUR(report.expectedCashCents)}</td></tr>
          <tr><td>Geteld cash</td><td className="text-right">{formatEUR(report.countedCashCents)}</td></tr>
          <tr className="border-t border-black font-bold"><td>Kasverschil</td><td className="text-right">{formatEUR(report.cashDifferenceCents)}</td></tr>
        </tbody></table>
      </section>
      <h3 className="mt-7 text-sm font-black uppercase tracking-wide">Verkochte producten</h3>
      <table className="mt-2 w-full border-collapse text-[10px]">
        <thead><tr className="border-y border-black text-left"><th className="py-1">Product</th><th>SKU</th><th className="text-right">Verkocht</th><th className="text-right">Retour</th><th className="text-right">Netto</th><th className="text-right">Omzet</th><th className="text-right">BTW</th><th className="text-right">Marge</th></tr></thead>
        <tbody>{products.map((product) => <tr key={product.key} className="border-b border-slate-300"><td className="py-1">{product.productName}{product.variant ? ` · ${product.variant}` : ""}</td><td>{product.sku ?? "—"}</td><td className="text-right">{product.soldQuantity}</td><td className="text-right">{product.returnedQuantity}</td><td className="text-right">{product.netQuantity}</td><td className="text-right">{formatEUR(product.netRevenueCents)}</td><td className="text-right">{formatEUR(product.vatCents)}</td><td className="text-right">{formatEUR(product.grossProfitCents)}</td></tr>)}</tbody>
      </table>
      <h3 className="mt-7 text-sm font-black uppercase tracking-wide">Transacties</h3>
      <table className="mt-2 w-full border-collapse text-[10px]">
        <thead><tr className="border-y border-black text-left"><th className="py-1">Document</th><th>Tijd</th><th>Type</th><th>Kassier</th><th className="text-right">Items</th><th>Betaling</th><th className="text-right">Totaal</th></tr></thead>
        <tbody>{transactions.map((transaction) => <tr key={transaction.id} className="border-b border-slate-300"><td className="py-1">{transaction.documentNumber}</td><td>{format(transaction.timestamp, "HH:mm:ss")}</td><td>{transaction.kind === "refund" ? "Retour" : "Verkoop"}</td><td>{transaction.cashierName ?? "—"}</td><td className="text-right">{transaction.lines.reduce((sum, line) => sum + line.quantity, 0)}</td><td>{tenderSummary(transaction.tenders)}</td><td className="text-right">{formatEUR(transaction.totalCents)}{transaction.roundingAdjustmentCents !== 0 && <><br /><span className="text-[9px]">cash {transaction.roundingAdjustmentCents > 0 ? "+" : ""}{formatEUR(transaction.roundingAdjustmentCents)}</span></>}</td></tr>)}</tbody>
      </table>
      <footer className="mt-8 break-inside-avoid border-t border-slate-400 pt-3 text-[9px] text-slate-600">
        <p>SHA-256 · hashversie {report.hashPayloadVersion}</p>
        <p className="mt-1 break-all font-mono">{report.hash}</p>
        {report.cashDifferenceReason && <p className="mt-2">Toelichting kasverschil: {report.cashDifferenceReason}</p>}
      </footer>
    </article>
  );
};

export const ZReportHistoryDetail = ({
  report,
  transactions,
  storeId,
  merchant,
  onClose,
  onOpenTransaction,
}: {
  report: DailyReport;
  transactions: Transaction[];
  storeId?: string | null;
  merchant: MerchantInfo;
  onClose: () => void;
  onOpenTransaction: (documentNumber: string) => void;
}) => {
  const [detail, setDetail] = useState<DailyReportDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedTransaction, setExpandedTransaction] = useState<string | number | null>(null);

  useEffect(() => {
    let active = true;
    setDetail(null);
    setError(null);
    void loadDailyReportDetail(report, transactions, storeId)
      .then((next) => { if (active) setDetail(next); })
      .catch(() => { if (active) setError("Het serverdetail kon niet worden geladen. Vernieuw de historiek en probeer opnieuw."); });
    return () => { active = false; };
  }, [report, storeId, transactions]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [onClose]);

  const totals = detail?.report.totals;
  const marginPercent = useMemo(() => {
    const revenue = Number(totals?.totalRevenueCents ?? 0);
    return revenue === 0 ? 0 : Math.round((Number(totals?.grossProfitCents ?? 0) / revenue) * 1000) / 10;
  }, [totals]);

  const print = () => {
    document.body.classList.add("z-report-history-printing");
    const cleanup = () => document.body.classList.remove("z-report-history-printing");
    window.addEventListener("afterprint", cleanup, { once: true });
    window.print();
    setTimeout(cleanup, 1500);
  };

  const exportCsv = () => {
    if (!detail) return;
    const productRows: unknown[][] = [["PRODUCTEN"], ["Product", "Variant", "SKU", "Categorie", "BTW %", "Verkocht", "Retour", "Netto aantal", "Bruto", "Korting", "Netto omzet", "BTW", "Kost", "Marge"], ...detail.products.map((product) => [product.productName, product.variant, product.sku, product.categoryName, product.vatRate, product.soldQuantity, product.returnedQuantity, product.netQuantity, (product.grossCents / 100).toFixed(2), (product.discountCents / 100).toFixed(2), (product.netRevenueCents / 100).toFixed(2), (product.vatCents / 100).toFixed(2), (product.costCents / 100).toFixed(2), (product.grossProfitCents / 100).toFixed(2)])];
    const transactionRows: unknown[][] = [[""], ["TRANSACTIES"], ["Document", "Tijd", "Type", "Kassier", "Items", "Betaling", "Totaal"], ...detail.transactions.map((transaction) => [transaction.documentNumber, format(transaction.timestamp, "yyyy-MM-dd HH:mm:ss"), transaction.kind, transaction.cashierName, transaction.lines.reduce((sum, line) => sum + line.quantity, 0), transaction.tenders.map((tender) => `${tender.method}:${(tender.amountCents / 100).toFixed(2)}`).join(" + "), (transaction.totalCents / 100).toFixed(2)])];
    download(`Z-rapport-${detail.report.reportNumber}-${format(detail.report.timestamp, "yyyy-MM-dd")}.csv`, `\uFEFF${csvRows([...productRows, ...transactionRows])}`, "text/csv;charset=utf-8");
  };

  const exportJson = () => {
    if (!detail) return;
    download(`Z-rapport-${detail.report.reportNumber}-${format(detail.report.timestamp, "yyyy-MM-dd")}.json`, JSON.stringify({ schemaVersion: 1, exportedAt: new Date().toISOString(), customerDataIncluded: false, ...detail }, null, 2), "application/json");
  };

  return (
    <div className="z-report-history-detail fixed inset-0 z-[100] overflow-y-auto bg-slate-50 text-slate-950" role="dialog" aria-modal="true" aria-label={`Z-rapport ${report.reportNumber}`}>
      <div className="print:hidden">
        <header className="z-report-history-detail-header sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur sm:px-6">
          <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4">
            <button type="button" onClick={onClose} className="z-report-history-nav-action inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-cyan-600"><ArrowLeft size={17} /> Terug naar historiek</button>
            <div className="hidden text-center sm:block"><div className="text-xs font-bold uppercase tracking-[0.1em] text-cyan-700">Officiële afsluiting</div><div className="font-extrabold">Z-rapport #{report.reportNumber}</div></div>
            <button type="button" aria-label="Sluiten" onClick={onClose} className="z-report-history-close-action flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-600"><X size={21} /></button>
          </div>
        </header>

        {!detail && !error && <div className="mx-auto max-w-3xl px-5 py-24 text-center"><div className="mx-auto h-9 w-9 animate-spin rounded-full border-4 border-cyan-100 border-t-cyan-700" /><p className="mt-4 font-semibold text-slate-600">Serverdetail wordt berekend…</p></div>}
        {error && <div className="mx-auto max-w-3xl px-5 py-24 text-center"><div className="rounded-xl border border-rose-200 bg-rose-50 p-6 font-semibold text-rose-800">{error}</div></div>}

        {detail && <main className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8">
          <section className="z-report-history-hero rounded-2xl bg-slate-950 p-5 text-white shadow-xl sm:p-7">
            <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-start">
              <div><div className="flex flex-wrap items-center gap-2"><span className="rounded-md bg-cyan-500/15 px-2.5 py-1 text-xs font-bold text-cyan-200">Z-RAPPORT #{detail.report.reportNumber}</span>{detail.report.isDemo && <span className="rounded-md bg-violet-500/20 px-2.5 py-1 text-xs font-bold text-violet-200">DEMODATA</span>}<span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-2.5 py-1 text-xs font-bold text-emerald-200"><CheckCircle2 size={13} /> Definitief</span></div><h1 className="mt-4 text-3xl font-black tracking-tight">{format(detail.report.timestamp, "EEEE d MMMM yyyy", { locale: nl })}</h1><p className="mt-2 text-sm text-slate-300">{detail.report.registerName}{detail.report.shiftNumber ? ` · Shift ${detail.report.shiftNumber}` : ""} · gesloten om {format(detail.report.closedAt, "HH:mm:ss")} door {detail.report.closedByUserName ?? "Systeem"}</p></div>
              <div className="flex flex-wrap gap-2"><button type="button" onClick={print} className="z-report-history-action z-report-history-action--secondary inline-flex min-h-10 items-center gap-2 rounded-lg bg-white px-3.5 py-2 text-sm font-bold !text-slate-900 hover:bg-slate-100"><Printer size={16} /> Print</button><button type="button" onClick={() => downloadZReportPdf(detail, merchant)} className="z-report-history-action z-report-history-action--primary inline-flex min-h-10 items-center gap-2 rounded-lg bg-cyan-600 px-3.5 py-2 text-sm font-bold text-white hover:bg-cyan-500"><Download size={16} /> A4 PDF</button><button type="button" onClick={exportCsv} className="z-report-history-action z-report-history-action--secondary inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-700 px-3.5 py-2 text-sm font-bold text-slate-100 hover:bg-slate-800"><ReceiptText size={16} /> CSV</button><button type="button" onClick={exportJson} className="z-report-history-action z-report-history-action--secondary inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-700 px-3.5 py-2 text-sm font-bold text-slate-100 hover:bg-slate-800"><FileJson size={16} /> JSON</button></div>
            </div>
          </section>

          <section className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-6"><Stat label="Productomzet" value={formatEUR(Number(totals?.totalRevenueCents ?? 0))} /><Stat label="Kostprijs" value={formatEUR(Number(totals?.totalCostCents ?? 0))} /><Stat label="Brutowinst" value={formatEUR(Number(totals?.grossProfitCents ?? 0))} tone="good" /><Stat label="Marge" value={`${marginPercent.toFixed(1)}%`} tone="good" /><Stat label="Transacties" value={String(detail.report.transactionCount)} /><Stat label="Gem. ticket" value={formatEUR(detail.report.transactionCount ? Math.round(Number(totals?.totalRevenueCents ?? 0) / detail.report.transactionCount) : 0)} /></section>

          <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="flex items-start gap-3 border-b border-slate-100 px-5 py-5"><span className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-50 text-cyan-700"><PackageCheck size={20} /></span><div><h2 className="text-lg font-extrabold">Wat werd er verkocht?</h2><p className="mt-0.5 text-sm text-slate-500">Exacte productsnapshot met verkopen, retouren, korting, btw, kost en marge.</p></div></div><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Product</th><th className="px-3 py-3">SKU / categorie</th><th className="px-3 py-3 text-right">Verkocht</th><th className="px-3 py-3 text-right">Retour</th><th className="px-3 py-3 text-right">Netto</th><th className="px-3 py-3 text-right">Bruto</th><th className="px-3 py-3 text-right">Korting</th><th className="px-3 py-3 text-right">Omzet</th><th className="px-3 py-3 text-right">BTW</th><th className="px-5 py-3 text-right">Marge</th></tr></thead><tbody className="divide-y divide-slate-100">{detail.products.map((product) => <tr key={product.key} className="hover:bg-slate-50"><td className="px-5 py-3.5"><div className="font-bold text-slate-900">{product.productName}</div>{product.variant && <div className="mt-0.5 text-xs text-slate-500">{product.variant}</div>}</td><td className="px-3 py-3.5"><div className="font-mono text-xs text-slate-700">{product.sku ?? "—"}</div><div className="mt-0.5 text-xs text-slate-500">{product.categoryName ?? "Geen categorie"} · {product.vatRate}%</div></td><td className="px-3 py-3.5 text-right font-semibold tabular-nums">{product.soldQuantity}</td><td className="px-3 py-3.5 text-right font-semibold tabular-nums text-rose-700">{product.returnedQuantity || "—"}</td><td className="px-3 py-3.5 text-right font-extrabold tabular-nums">{product.netQuantity}</td><td className="px-3 py-3.5 text-right tabular-nums text-slate-600">{formatEUR(product.grossCents)}</td><td className="px-3 py-3.5 text-right tabular-nums text-amber-700">{formatEUR(product.discountCents)}</td><td className="px-3 py-3.5 text-right font-extrabold tabular-nums">{formatEUR(product.netRevenueCents)}</td><td className="px-3 py-3.5 text-right tabular-nums text-slate-600">{formatEUR(product.vatCents)}</td><td className="px-5 py-3.5 text-right font-bold tabular-nums text-emerald-700">{formatEUR(product.grossProfitCents)}</td></tr>)}</tbody></table></div></section>

            <aside className="space-y-5"><section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="flex items-center gap-2 font-extrabold"><Banknote size={18} className="text-emerald-600" /> Kasreconciliatie</h2><dl className="mt-4 space-y-2.5 text-sm"><div className="flex justify-between"><dt className="text-slate-500">Beginkas</dt><dd className="font-bold tabular-nums">{formatEUR(detail.report.openingFloatCents)}</dd></div><div className="flex justify-between"><dt className="text-slate-500">Cash verkopen</dt><dd className="font-bold tabular-nums">{formatEUR(Number(totals?.paymentTotalsCents?.Cash ?? 0))}</dd></div><div className="flex justify-between border-t border-slate-100 pt-2.5"><dt className="text-slate-500">Verwacht cash</dt><dd className="font-extrabold tabular-nums">{formatEUR(detail.report.expectedCashCents)}</dd></div><div className="flex justify-between"><dt className="text-slate-500">Geteld cash</dt><dd className="font-extrabold tabular-nums">{formatEUR(detail.report.countedCashCents)}</dd></div><div className={`flex justify-between rounded-lg px-3 py-2.5 ${(detail.report.cashDifferenceCents === 0) ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}><dt className="font-bold">Kasverschil</dt><dd className="font-black tabular-nums">{formatEUR(detail.report.cashDifferenceCents)}</dd></div></dl>{detail.report.cashDifferenceReason && <p className="mt-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-600"><b>Verklaring:</b> {detail.report.cashDifferenceReason}</p>}</section>
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="flex items-center gap-2 font-extrabold"><CreditCard size={18} className="text-cyan-700" /> Betalingen</h2><div className="mt-4 space-y-3">{[["Cash", Number(totals?.paymentTotalsCents?.Cash ?? 0), Banknote], ["Kaart", Number(totals?.paymentTotalsCents?.PIN ?? 0), CreditCard], ["Cadeaubon", Number(totals?.paymentTotalsCents?.Cadeaubon ?? 0), Gift]].map(([label, value, Icon]) => { const PaymentIcon = Icon as typeof Banknote; return <div key={String(label)} className="flex items-center justify-between"><span className="flex items-center gap-2 text-sm text-slate-600"><PaymentIcon size={16} /> {String(label)}</span><b className="tabular-nums">{formatEUR(Number(value))}</b></div>; })}</div></section>
              <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5"><h2 className="flex items-center gap-2 font-extrabold text-emerald-900"><ShieldCheck size={18} /> Integriteit</h2><p className="mt-2 text-sm text-emerald-800">{detail.report.calculationAuthority === "server" ? "Financiële totalen zijn server-authoritair berekend en atomair afgesloten." : "Historisch rapport; detail is afgeleid van onveranderlijke gekoppelde transacties."}</p><div className="mt-3 rounded-lg bg-white/70 p-3"><div className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">SHA-256 · v{detail.report.hashPayloadVersion}</div><div className="mt-1 break-all font-mono text-[10px] leading-relaxed text-slate-600">{detail.report.hash}</div></div></section>
            </aside>
          </div>

          <section className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="flex items-start gap-3 border-b border-slate-100 px-5 py-5"><span className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-50 text-violet-700"><ReceiptText size={20} /></span><div><h2 className="text-lg font-extrabold">Transacties in dit Z-rapport</h2><p className="mt-0.5 text-sm text-slate-500">Klantnamen worden bewust niet getoond. Open het verkoopdocument voor de individuele verkoop.</p></div></div><div className="divide-y divide-slate-100">{detail.transactions.map((transaction) => { const expanded = expandedTransaction === transaction.id; const isSplit = transaction.tenders.length > 1; return <div key={transaction.id}><button type="button" onClick={() => setExpandedTransaction(expanded ? null : transaction.id)} className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-5 py-4 text-left hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-cyan-600 sm:grid-cols-[180px_100px_minmax(130px,1fr)_110px_180px_32px]"><div><div className="font-mono text-xs font-bold text-cyan-800">{transaction.documentNumber}</div><div className="mt-1 text-xs text-slate-500">{format(transaction.timestamp, "HH:mm:ss")}</div></div><span className={`w-fit rounded-md px-2 py-1 text-xs font-bold ${transaction.kind === "refund" ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>{transaction.kind === "refund" ? "Retour" : "Verkoop"}</span><div className="hidden text-sm text-slate-600 sm:block">{transaction.cashierName ?? "Systeem"}</div><div className="hidden text-right text-sm font-semibold text-slate-600 sm:block">{transaction.lines.reduce((sum, line) => sum + line.quantity, 0)} items</div><div className="text-right"><div className="font-extrabold tabular-nums">{formatEUR(transaction.totalCents)}</div><div className={`mt-1 text-xs ${isSplit ? "font-bold text-violet-700" : "text-slate-500"}`}>{isSplit ? "Gesplitst · " : ""}{tenderSummary(transaction.tenders)}</div></div>{expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}</button>{expanded && <div className="border-t border-slate-100 bg-slate-50 px-5 py-4"><div className="grid gap-4 lg:grid-cols-[1fr_220px]"><div className="overflow-x-auto"><table className="w-full min-w-[560px] text-sm"><thead className="text-left text-xs font-bold uppercase tracking-wide text-slate-500"><tr><th className="pb-2">Product</th><th className="pb-2">SKU</th><th className="pb-2 text-right">Aantal</th><th className="pb-2 text-right">BTW</th><th className="pb-2 text-right">Netto bedrag</th></tr></thead><tbody className="divide-y divide-slate-200">{transaction.lines.map((line, index) => <tr key={`${line.sku}-${index}`}><td className="py-2 font-semibold">{line.productName}{line.variant ? ` · ${line.variant}` : ""}</td><td className="py-2 font-mono text-xs text-slate-500">{line.sku ?? "—"}</td><td className="py-2 text-right">{line.quantity}</td><td className="py-2 text-right">{line.vatRate}%</td><td className="py-2 text-right font-bold">{formatEUR(line.netRevenueCents)}</td></tr>)}</tbody></table></div><div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-4"><div>{transaction.correctionReason && <p className="mb-3 text-xs text-rose-700"><b>Retourreden:</b> {transaction.correctionReason}</p>}<div className="text-xs text-slate-500">{isSplit ? "Gesplitste betaling" : "Betaling"}</div>{transaction.tenders.map((tender, index) => <div key={`${tender.method}-${index}`} className="mt-1 flex justify-between text-sm"><span>{paymentLabel(tender.method)}</span><b>{formatEUR(tender.amountCents)}</b></div>)}</div><button type="button" onClick={() => onOpenTransaction(transaction.documentNumber)} className="mt-4 inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-slate-950 px-3 py-2 text-sm font-bold text-white hover:bg-slate-800"><ReceiptText size={15} /> Open verkoopdocument</button></div></div></div>}</div>; })}</div></section>

          <div className="mt-5 flex items-center justify-between rounded-xl border border-cyan-100 bg-cyan-50 px-4 py-3 text-sm text-cyan-900"><span className="flex items-center gap-2"><TrendingUp size={17} /><b>Dagconsolidatie</b> staat apart in de Z-rapportenhistoriek; dit document blijft de officiële kassa-/shiftafsluiting.</span><button type="button" onClick={onClose} className="font-bold underline underline-offset-2">Terug</button></div>
        </main>}
      </div>
      {detail && <ReportPrintout detail={detail} merchant={merchant} />}
    </div>
  );
};
