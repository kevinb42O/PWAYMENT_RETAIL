import React, { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  BarChart3,
  CalendarDays,
  CreditCard,
  Download,
  Eye,
  FileJson,
  FileText,
  Filter,
  ReceiptText,
  RotateCcw,
  Search,
  ShieldCheck,
  ShoppingBag,
  UserRound,
  WalletCards,
  X,
  ScanLine,
} from "lucide-react";
import { db } from "../db/db";
import { MerchantInfo } from "../data/merchant";
import { AuditEntry, DailyReport, PaymentMethod, ReturnDisposition, Transaction } from "../types";
import { formatEUR } from "../utils/money";
import {
  SalesHistoryRow,
  buildSalesHistory,
} from "../utils/retailDashboardData";
import { useMerchantProfile } from "../store/useMerchantProfile";
import {
  convertTransactionToInvoiceData,
  downloadInvoicePdf,
  InvoiceData,
} from "../utils/invoicePdfGenerator";
import { transactionTenders } from "../utils/financial";
import { Modal } from "./Modal";
import { createRefund } from "../services/refunds";
import { useAuth } from "../auth/useAuth";
import { isValidReceiptBarcode, normalizeReceiptBarcode } from "../utils/receiptBarcode";
import {
  DailyReportDaySummary,
  loadDailyReportDaySummaries,
} from "../services/dailyReportDetail";

const InvoicePreviewModal = React.lazy(() =>
  import("./InvoicePreviewModal").then((module) => ({
    default: module.InvoicePreviewModal,
  })),
);
const ZReportHistoryDetail = React.lazy(() =>
  import("./ZReportHistoryDetail").then((module) => ({
    default: module.ZReportHistoryDetail,
  })),
);

type Tab = "sales" | "reports" | "audit";
type SalesRange = "30d" | "12m" | "all";
type PaymentFilter = "all" | PaymentMethod;
type SortDirection = "asc" | "desc";
type HistorySortKey =
  "period" | "sales" | "revenue" | "average" | "card" | "cash" | "gift-card";
type TransactionSortKey = "invoice" | "date" | "payment" | "cashier" | "total";
type ReportSortKey = "report" | "date" | "revenue" | "cash" | "card" | "vat";
type AuditSortKey = "time" | "user" | "action" | "detail";

const tabs: {
  id: Tab;
  label: string;
  description: string;
  icon: React.ReactNode;
}[] = [
  {
    id: "sales",
    label: "Verkopen",
    description: "Transacties en facturen",
    icon: <ReceiptText size={17} />,
  },
  {
    id: "reports",
    label: "Z-rapporten",
    description: "Financiële dagafsluitingen",
    icon: <CalendarDays size={17} />,
  },
  {
    id: "audit",
    label: "Auditlog",
    description: "Activiteit en controle",
    icon: <ShieldCheck size={17} />,
  },
];

const csvCell = (value: unknown): string =>
  `"${String(value ?? "").replaceAll('"', '""')}"`;
const toCsv = (headers: unknown[], rows: unknown[][]): string =>
  [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");

interface AuditLogProps {
  /** Basis includes the latest 30 days; paid plans retain the full history. */
  canViewFullHistory: boolean;
  /** The raw audit trail remains an Enterprise control. */
  canViewAuditLog: boolean;
}

export const AuditLog: React.FC<AuditLogProps> = ({
  canViewFullHistory,
  canViewAuditLog,
}) => {
  const merchantProfile = useMerchantProfile((state) => state.profile);
  const auth = useAuth();
  const [previewInvoice, setPreviewInvoice] = useState<InvoiceData | null>(
    null,
  );
  const [tab, setTab] = useState<Tab>("sales");
  const [salesRange, setSalesRange] = useState<SalesRange>(
    canViewFullHistory ? "12m" : "30d",
  );
  const [reports, setReports] = useState<DailyReport[]>([]);
  const [selectedReport, setSelectedReport] = useState<DailyReport | null>(null);
  const [auditRows, setAuditRows] = useState<AuditEntry[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [refundTransaction, setRefundTransaction] =
    useState<Transaction | null>(null);
  const [returnScanOpen, setReturnScanOpen] = useState(false);

  const availableTabs = useMemo(
    () => tabs.filter((item) => item.id !== "audit" || canViewAuditLog),
    [canViewAuditLog],
  );
  const effectiveSalesRange = canViewFullHistory ? salesRange : "30d";

  useEffect(() => {
    if (!canViewFullHistory) setSalesRange("30d");
    if (!canViewAuditLog && tab === "audit") setTab("sales");
  }, [canViewAuditLog, canViewFullHistory, tab]);

  useEffect(() => {
    void load();
  }, []);

  const load = async () => {
    const [nextReports, nextAuditRows, nextTransactions] = await Promise.all([
      db.daily_reports.reverse().toArray(),
      db.audit.orderBy("timestamp").reverse().toArray(),
      db.transactions.orderBy("timestamp").reverse().toArray(),
    ]);
    setReports(nextReports);
    setAuditRows(nextAuditRows);
    setTransactions(nextTransactions);
  };

  const visibleTransactions = useMemo(() => {
    if (effectiveSalesRange === "all") return transactions;
    const start = new Date();
    if (effectiveSalesRange === "30d") start.setDate(start.getDate() - 29);
    else start.setMonth(start.getMonth() - 11, 1);
    start.setHours(0, 0, 0, 0);
    return transactions.filter(
      (transaction) => transaction.timestamp >= start.getTime(),
    );
  }, [effectiveSalesRange, transactions]);

  const historyRows = useMemo(
    () =>
      buildSalesHistory(
        visibleTransactions,
        effectiveSalesRange === "30d" ? "day" : "month",
      ),
    [effectiveSalesRange, visibleTransactions],
  );
  const salesTotals = useMemo(
    () =>
      visibleTransactions.reduce(
        (totals, transaction) => ({
          revenueCents: totals.revenueCents + transaction.totalCents,
          discountCents: totals.discountCents + transaction.discountCents,
          linkedCustomerCount:
            totals.linkedCustomerCount + (transaction.customerId ? 1 : 0),
        }),
        { revenueCents: 0, discountCents: 0, linkedCustomerCount: 0 },
      ),
    [visibleTransactions],
  );

  const exportCSV = () => {
    if (tab === "sales") {
      if (historyRows.length === 0) return;
      const headers = [
        "Periode",
        "Verkopen",
        "Omzet",
        "Gemiddeld ticket",
        "Cash",
        "Kaart",
        "Cadeaubon",
        "Kortingen",
        "Gekoppelde klanten",
        "Reconciliatieverschil",
      ];
      const rows = historyRows.map((row) => [
        row.label,
        row.transactionCount,
        (row.revenueCents / 100).toFixed(2),
        (row.revenueCents / Math.max(row.transactionCount, 1) / 100).toFixed(2),
        (row.cashCents / 100).toFixed(2),
        (row.pinCents / 100).toFixed(2),
        (row.giftCardCents / 100).toFixed(2),
        (row.discountCents / 100).toFixed(2),
        row.linkedCustomerCount,
        (
          (row.cashCents +
            row.pinCents +
            row.giftCardCents -
            row.revenueCents) /
          100
        ).toFixed(2),
      ]);
      download(
        `pwayment_verkoopgeschiedenis_${format(Date.now(), "yyyyMMdd")}.csv`,
        toCsv(headers, rows),
        "text/csv;charset=utf-8;",
      );
      return;
    }

    if (tab === "reports") {
      if (reports.length === 0) return;
      const headers = [
        "Rapport Nr",
        "Datum",
        "Productomzet",
        "Nieuwe cadeaubonverplichting",
        "Cash",
        "PIN",
        "Cadeaubon",
        "BTW 12%",
        "BTW 21%",
        "Kasverschil",
        "Hash",
      ];
      const rows = reports.map((report) => [
        report.reportNumber,
        format(report.timestamp, "yyyy-MM-dd HH:mm:ss"),
        (report.totalRevenueCents / 100).toFixed(2),
        ((report.giftCardLiabilityAddedCents ?? 0) / 100).toFixed(2),
        (report.paymentTotalsCents.Cash / 100).toFixed(2),
        (report.paymentTotalsCents.PIN / 100).toFixed(2),
        (report.paymentTotalsCents.Cadeaubon / 100).toFixed(2),
        (report.totalVat12Cents / 100).toFixed(2),
        (report.totalVat21Cents / 100).toFixed(2),
        ((report.cashDifferenceCents ?? 0) / 100).toFixed(2),
        report.hash,
      ]);
      download(
        `pwayment_z_rapporten_${format(Date.now(), "yyyyMMdd")}.csv`,
        toCsv(headers, rows),
        "text/csv;charset=utf-8;",
      );
      return;
    }

    if (auditRows.length === 0) return;
    const headers = ["Tijd", "Gebruiker", "Actie", "Detail"];
    const rows = auditRows.map((row) => [
      format(row.timestamp, "yyyy-MM-dd HH:mm:ss"),
      row.userName ?? "",
      row.action,
      JSON.stringify(row.detail ?? {}).replaceAll(",", ";"),
    ]);
    download(
      `pwayment_auditlog_${format(Date.now(), "yyyyMMdd")}.csv`,
      toCsv(headers, rows),
      "text/csv;charset=utf-8;",
    );
  };

  const exportJSON = () => {
    const exportData =
      tab === "sales"
        ? visibleTransactions.map((transaction) => ({
            id: transaction.id,
            documentNumber: transaction.documentNumber,
            timestamp: transaction.timestamp,
            kind: transaction.kind ?? "sale",
            subtotalCents: transaction.subtotalCents,
            discountCents: transaction.discountCents,
            totalCents: transaction.totalCents,
            vat12Cents: transaction.vat12Cents,
            vat21Cents: transaction.vat21Cents,
            tenders: transactionTenders(transaction),
            customerLinked: Boolean(transaction.customerId),
            source: transaction.source ?? "live",
          }))
        : tab === "reports"
          ? reports
          : auditRows.map((row) => ({
              id: row.id,
              timestamp: row.timestamp,
              userName: row.userName,
              action: row.action,
            }));
    if (exportData.length === 0) return;
    download(
      `pwayment_${tab}_${format(Date.now(), "yyyyMMdd")}.json`,
      JSON.stringify(exportData, null, 2),
      "application/json",
    );
  };

  const download = (name: string, body: string, mime: string) => {
    const blob = new Blob([body], { type: mime });
    const link = document.createElement("a");
    const objectUrl = URL.createObjectURL(blob);
    link.href = objectUrl;
    link.download = name;
    link.click();
    URL.revokeObjectURL(objectUrl);
  };

  const exportDisabled =
    tab === "sales"
      ? visibleTransactions.length === 0
      : tab === "reports"
        ? reports.length === 0
        : auditRows.length === 0;

  return (
    <div className="insights-light app-page-shell flex h-full flex-col overflow-y-auto text-slate-950">
      <main className="mx-auto w-full max-w-[1320px] px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
        <header className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.1em] text-cyan-800">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-cyan-50 text-cyan-700">
                <BarChart3 size={14} />
              </span>
              Historiek
            </div>
            <h1 className="text-[28px] font-bold tracking-tight text-slate-950">
              Verkoopgeschiedenis
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">
              Vind een verkoop, controleer de betaling en open of download het
              onveranderlijke verkoopdocument.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {auth.hasRole("owner", "manager") && (
              <button
                type="button"
                onClick={() => setReturnScanOpen(true)}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-amber-600 px-3.5 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-600 focus:ring-offset-2"
              >
                <ScanLine size={16} /> Retour via ticket
              </button>
            )}
            <button
              type="button"
              onClick={exportCSV}
              disabled={exportDisabled}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-cyan-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <FileText size={16} /> Exporteer CSV
            </button>
            <button
              type="button"
              onClick={exportJSON}
              disabled={exportDisabled}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-cyan-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <FileJson size={16} /> Exporteer JSON
            </button>
          </div>
        </header>

        <nav
          aria-label="Historiek onderdelen"
          className={`insights-tabs mb-5 grid gap-1 rounded-xl border border-slate-200 bg-white p-1 ${canViewAuditLog ? "grid-cols-3" : "grid-cols-2"}`}
        >
          {availableTabs.map((item) => {
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={active}
                onClick={() => setTab(item.id)}
                className={`flex min-h-14 flex-col items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-center transition focus:outline-none focus:ring-2 focus:ring-cyan-600 focus:ring-offset-1 sm:flex-row sm:justify-start sm:gap-3 sm:px-4 sm:text-left ${
                  active
                    ? "insights-tab--active"
                    : "insights-tab"
                }`}
              >
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${active ? "bg-white text-cyan-700 ring-1 ring-cyan-100" : "bg-slate-100 text-slate-500"}`}
                >
                  {item.icon}
                </span>
                <span>
                  <span className="block text-xs font-extrabold sm:text-sm">
                    {item.label}
                  </span>
                  <span
                    className="mt-0.5 hidden text-xs text-slate-600 lg:block"
                  >
                    {item.description}
                  </span>
                </span>
              </button>
            );
          })}
        </nav>

        {tab === "sales" ? (
          <SalesHistory
            range={effectiveSalesRange}
            onRangeChange={setSalesRange}
            canViewFullHistory={canViewFullHistory}
            transactions={visibleTransactions}
            rows={historyRows}
            totals={salesTotals}
            merchantProfile={merchantProfile}
            onPreviewInvoice={setPreviewInvoice}
            canRefund={auth.hasRole("owner", "manager")}
            onRefund={setRefundTransaction}
          />
        ) : tab === "reports" ? (
          <ReportsTable
            reports={reports}
            storeId={auth.currentStoreId}
            onOpen={setSelectedReport}
          />
        ) : (
          <AuditTable rows={auditRows} />
        )}
      </main>

      <InvoicePreviewModal
        invoice={previewInvoice}
        onClose={() => setPreviewInvoice(null)}
      />
      {refundTransaction && (
        <RefundDialog
          transaction={refundTransaction}
          onClose={() => setRefundTransaction(null)}
          onDone={async () => {
            setRefundTransaction(null);
            await load();
          }}
        />
      )}
      <ReturnTicketScanDialog
        open={returnScanOpen}
        transactions={transactions}
        onClose={() => setReturnScanOpen(false)}
        onFound={(transaction) => {
          setReturnScanOpen(false);
          setRefundTransaction(transaction);
        }}
      />
      {selectedReport && (
        <ZReportHistoryDetail
          report={selectedReport}
          transactions={transactions}
          storeId={auth.currentStoreId}
          merchant={merchantProfile}
          onClose={() => setSelectedReport(null)}
          onOpenTransaction={(documentNumber) => {
            const transaction = transactions.find(
              (row) => row.documentNumber === documentNumber,
            );
            if (!transaction) return;
            setSelectedReport(null);
            setPreviewInvoice(
              convertTransactionToInvoiceData(
                transaction,
                transaction.merchantSnapshot ?? merchantProfile,
              ),
            );
          }}
        />
      )}
    </div>
  );
};

const ReturnTicketScanDialog = ({
  open,
  transactions,
  onClose,
  onFound,
}: {
  open: boolean;
  transactions: Transaction[];
  onClose: () => void;
  onFound: (transaction: Transaction) => void;
}) => {
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setValue("");
    setError(null);
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  const submit = () => {
    const barcode = normalizeReceiptBarcode(value);
    if (!isValidReceiptBarcode(barcode)) {
      setError("Scan een geldige PWAYMENT-ticketbarcode of voer de 20 cijfers in.");
      return;
    }
    const transaction = transactions.find((row) => row.receiptBarcode === barcode);
    if (!transaction) {
      setError("Dit ticket staat niet in de lokale winkeldata. Vernieuw de synchronisatie of zoek de bon handmatig op.");
      return;
    }
    if ((transaction.kind ?? "sale") !== "sale") {
      setError("Dit is een creditnota. Alleen een oorspronkelijke verkoop kan worden geretourneerd.");
      return;
    }
    if ((transaction.source ?? "live") === "demo") {
      setError("Demo-omzet kan niet als echte retour worden geboekt.");
      return;
    }
    onFound(transaction);
  };

  return (
    <Modal open={open} onClose={onClose} title="Retour via ticket scannen" size="md">
      <div className="space-y-4 text-slate-900">
        <p className="rounded-lg bg-cyan-50 p-3 text-sm text-cyan-950">
          Scan de barcode op het oorspronkelijke kassaticket. De verkoop wordt eerst gecontroleerd; een scan boekt nooit meteen een terugbetaling.
        </p>
        <label className="block text-xs font-bold text-slate-600">
          Ticketcode
          <input
            ref={inputRef}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                submit();
              }
            }}
            inputMode="numeric"
            autoComplete="off"
            placeholder="Scan barcode of voer 20 cijfers in"
            className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-3 font-mono text-base tracking-wide"
          />
        </label>
        {error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700">Annuleren</button>
          <button type="button" onClick={submit} className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-bold text-white"><ScanLine size={15} /> Ticket openen</button>
        </div>
      </div>
    </Modal>
  );
};

const SalesHistory = ({
  range,
  onRangeChange,
  canViewFullHistory,
  transactions,
  rows,
  totals,
  merchantProfile,
  onPreviewInvoice,
  canRefund,
  onRefund,
}: {
  range: SalesRange;
  onRangeChange: (range: SalesRange) => void;
  canViewFullHistory: boolean;
  transactions: Transaction[];
  rows: SalesHistoryRow[];
  totals: {
    revenueCents: number;
    discountCents: number;
    linkedCustomerCount: number;
  };
  merchantProfile: MerchantInfo;
  onPreviewInvoice: (inv: InvoiceData) => void;
  canRefund: boolean;
  onRefund: (transaction: Transaction) => void;
}) => {
  const [query, setQuery] = useState("");
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>("all");
  const [visibleTransactionCount, setVisibleTransactionCount] = useState(12);
  const [historySort, setHistorySort] = useState<{
    key: HistorySortKey;
    direction: SortDirection;
  }>({
    key: "period",
    direction: "desc",
  });
  const [transactionSort, setTransactionSort] = useState<{
    key: TransactionSortKey;
    direction: SortDirection;
  }>({
    key: "date",
    direction: "desc",
  });
  const averageTicket =
    transactions.length > 0
      ? Math.round(totals.revenueCents / transactions.length)
      : 0;
  const linkedShare =
    transactions.length > 0
      ? Math.round((totals.linkedCustomerCount / transactions.length) * 100)
      : 0;

  const sortedHistoryRows = useMemo(() => {
    const valueFor = (row: SalesHistoryRow): number => {
      switch (historySort.key) {
        case "period":
          return row.timestamp;
        case "sales":
          return row.transactionCount;
        case "revenue":
          return row.revenueCents;
        case "average":
          return row.transactionCount > 0
            ? row.revenueCents / row.transactionCount
            : 0;
        case "card":
          return row.pinCents;
        case "cash":
          return row.cashCents;
        case "gift-card":
          return row.giftCardCents;
      }
    };
    const direction = historySort.direction === "asc" ? 1 : -1;
    return [...rows].sort((left, right) => {
      const primary = valueFor(left) - valueFor(right);
      return primary === 0
        ? right.timestamp - left.timestamp
        : primary * direction;
    });
  }, [historySort, rows]);

  const filteredTransactions = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("nl-BE");
    return transactions.filter((transaction) => {
      if (paymentFilter !== "all") {
        const tenders = transactionTenders(transaction);
        const matches =
          paymentFilter === "Split"
            ? tenders.length > 1
            : tenders.some((tender) => tender.method === paymentFilter);
        if (!matches) return false;
      }
      if (!normalizedQuery) return true;
      const invoiceNumber = convertTransactionToInvoiceData(
        transaction,
        transaction.merchantSnapshot ?? merchantProfile,
      ).invoiceNumber;
      return [
        invoiceNumber,
        transaction.userName,
        transaction.paymentMethod,
        `Kassa ${transaction.tableId}`,
        format(transaction.timestamp, "dd/MM/yyyy HH:mm"),
        formatEUR(transaction.totalCents),
      ].some((value) =>
        String(value ?? "")
          .toLocaleLowerCase("nl-BE")
          .includes(normalizedQuery),
      );
    });
  }, [merchantProfile, paymentFilter, query, transactions]);

  const sortedTransactions = useMemo(() => {
    const direction = transactionSort.direction === "asc" ? 1 : -1;
    const compareText = (left: string, right: string) =>
      left.localeCompare(right, "nl-BE", {
        numeric: true,
        sensitivity: "base",
      });
    return [...filteredTransactions].sort((left, right) => {
      let primary = 0;
      switch (transactionSort.key) {
        case "invoice":
          primary =
            left.timestamp - right.timestamp ||
            (left.id ?? 0) - (right.id ?? 0);
          break;
        case "date":
          primary = left.timestamp - right.timestamp;
          break;
        case "payment":
          primary = compareText(left.paymentMethod, right.paymentMethod);
          break;
        case "cashier":
          primary = compareText(
            left.userName || "Kassa",
            right.userName || "Kassa",
          );
          break;
        case "total":
          primary = left.totalCents - right.totalCents;
          break;
      }
      return primary === 0
        ? right.timestamp - left.timestamp
        : primary * direction;
    });
  }, [filteredTransactions, transactionSort]);

  const shownTransactions = sortedTransactions.slice(
    0,
    visibleTransactionCount,
  );
  const hasActiveFilters = query.trim().length > 0 || paymentFilter !== "all";
  const clearFilters = () => {
    setQuery("");
    setPaymentFilter("all");
    setVisibleTransactionCount(12);
  };
  const changeHistorySort = (key: HistorySortKey) => {
    setHistorySort((current) => ({
      key,
      direction:
        current.key === key && current.direction === "desc" ? "asc" : "desc",
    }));
  };
  const changeTransactionSort = (key: TransactionSortKey) => {
    setTransactionSort((current) => ({
      key,
      direction:
        current.key === key && current.direction === "desc" ? "asc" : "desc",
    }));
  };

  return (
    <section className="space-y-6">
      <div className="insights-panel p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Resultatenperiode
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {canViewFullHistory
                ? "Alle cijfers en facturen hieronder volgen deze selectie."
                : "Basis bevat de laatste 30 dagen verkoopgeschiedenis."}
            </p>
          </div>
          <div
            className={`grid rounded-lg border border-slate-200 bg-slate-50 p-1 ${canViewFullHistory ? "grid-cols-3" : "grid-cols-1"}`}
            aria-label="Kies een periode"
          >
            <RangeButton
              label="30 dagen"
              active={range === "30d"}
              onClick={() => onRangeChange("30d")}
            />
            {canViewFullHistory && <>
              <RangeButton
                label="12 maanden"
                active={range === "12m"}
                onClick={() => onRangeChange("12m")}
              />
              <RangeButton
                label="Alles"
                active={range === "all"}
                onClick={() => onRangeChange("all")}
              />
            </>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <HistoryMetric
          label="Netto productomzet"
          value={formatEUR(totals.revenueCents)}
          detail={`${transactions.length} ${transactions.length === 1 ? "boeking" : "boekingen"}, inclusief retouren`}
          icon={<BarChart3 size={19} />}
        />
        <HistoryMetric
          label="Gemiddeld per boeking"
          value={formatEUR(averageTicket)}
          detail="Netto over verkopen en retouren"
          icon={<ShoppingBag size={19} />}
        />
        <HistoryMetric
          label="Totale korting"
          value={formatEUR(totals.discountCents)}
          detail="Verwerkt in de omzet"
          icon={<WalletCards size={19} />}
        />
        <HistoryMetric
          label="Met klant"
          value={`${linkedShare}%`}
          detail={`${totals.linkedCustomerCount} gekoppelde verkopen`}
          icon={<UserRound size={19} />}
        />
      </div>

      <div className="insights-panel overflow-hidden">
        <div className="border-b border-slate-100 px-5 py-4 sm:px-6">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cyan-50 text-cyan-700">
              <BarChart3 size={18} />
            </span>
            <div>
              <h2 className="font-bold text-slate-900">
                {range === "30d" ? "Omzet per dag" : "Omzet per maand"}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Snel vergelijken zonder de individuele transacties uit het oog
                te verliezen.
              </p>
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[940px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-bold uppercase tracking-[0.08em] text-slate-500">
              <tr>
                <SortableHeader
                  label="Periode"
                  sortKey="period"
                  activeKey={historySort.key}
                  direction={historySort.direction}
                  onSort={changeHistorySort}
                  className="px-6"
                />
                <SortableHeader
                  label="Boekingen"
                  sortKey="sales"
                  activeKey={historySort.key}
                  direction={historySort.direction}
                  onSort={changeHistorySort}
                  align="right"
                />
                <SortableHeader
                  label="Omzet"
                  sortKey="revenue"
                  activeKey={historySort.key}
                  direction={historySort.direction}
                  onSort={changeHistorySort}
                  align="right"
                />
                <SortableHeader
                  label="Gem. ticket"
                  sortKey="average"
                  activeKey={historySort.key}
                  direction={historySort.direction}
                  onSort={changeHistorySort}
                  align="right"
                />
                <SortableHeader
                  label="Kaart"
                  sortKey="card"
                  activeKey={historySort.key}
                  direction={historySort.direction}
                  onSort={changeHistorySort}
                  align="right"
                />
                <SortableHeader
                  label="Cash"
                  sortKey="cash"
                  activeKey={historySort.key}
                  direction={historySort.direction}
                  onSort={changeHistorySort}
                  align="right"
                  className="px-6"
                />
                <SortableHeader
                  label="Cadeaubon"
                  sortKey="gift-card"
                  activeKey={historySort.key}
                  direction={historySort.direction}
                  onSort={changeHistorySort}
                  align="right"
                />
                <th className="px-5 py-3 text-right">Controle</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-6 py-12 text-center text-sm text-slate-500"
                  >
                    Nog geen verkopen in deze periode.
                  </td>
                </tr>
              ) : (
                sortedHistoryRows.map((row) => (
                  <tr
                    key={row.key}
                    className="transition-colors hover:bg-sky-50/50"
                  >
                    <td className="px-6 py-4 font-bold text-slate-900">
                      {row.label}
                    </td>
                    <td className="px-5 py-4 text-right tabular-nums text-slate-600">
                      {row.transactionCount}
                    </td>
                    <td className="px-5 py-4 text-right font-extrabold tabular-nums text-slate-950">
                      {formatEUR(row.revenueCents)}
                    </td>
                    <td className="px-5 py-4 text-right tabular-nums text-slate-600">
                      {formatEUR(
                        Math.round(row.revenueCents / row.transactionCount),
                      )}
                    </td>
                    <td className="px-5 py-4 text-right font-semibold tabular-nums text-slate-700">
                      {formatEUR(row.pinCents)}
                    </td>
                    <td className="px-6 py-4 text-right font-semibold tabular-nums text-slate-700">
                      {formatEUR(row.cashCents)}
                    </td>
                    <td className="px-5 py-4 text-right font-semibold tabular-nums text-slate-700">
                      {formatEUR(row.giftCardCents)}
                    </td>
                    <td
                      className={`px-5 py-4 text-right font-bold tabular-nums ${row.cashCents + row.pinCents + row.giftCardCents === row.revenueCents ? "text-cyan-700" : "text-rose-700"}`}
                    >
                      {formatEUR(
                        row.cashCents +
                          row.pinCents +
                          row.giftCardCents -
                          row.revenueCents,
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="insights-panel overflow-hidden">
        <div className="border-b border-slate-100 px-5 py-5 sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-950">
                  Transacties & facturen
                </h2>
                <span className="rounded-full bg-cyan-50 px-2.5 py-1 text-xs font-bold text-cyan-800 ring-1 ring-inset ring-cyan-100">
                  {filteredTransactions.length} gevonden
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-500">
                Zoek een verkoop en kies daarna bekijken of downloaden.
              </p>
            </div>

            <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
              <label className="relative block min-w-0 flex-1 lg:w-72">
                <span className="sr-only">Zoek transacties</span>
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  size={17}
                />
                <input
                  type="search"
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setVisibleTransactionCount(12);
                  }}
                  placeholder="Factuur, kassier, bedrag…"
                  className="h-11 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-9 text-sm font-medium text-slate-900 outline-none placeholder:text-slate-400 focus:border-cyan-600 focus:ring-2 focus:ring-cyan-600/20"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    aria-label="Zoekopdracht wissen"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  >
                    <X size={15} />
                  </button>
                )}
              </label>
              <label className="relative block sm:w-48">
                <span className="sr-only">Filter op betaalmethode</span>
                <Filter
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  size={16}
                />
                <select
                  value={paymentFilter}
                  onChange={(event) => {
                    setPaymentFilter(event.target.value as PaymentFilter);
                    setVisibleTransactionCount(12);
                  }}
                  className="h-11 w-full appearance-none rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm font-bold text-slate-700 outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-600/20"
                >
                  <option value="all">Alle betalingen</option>
                  <option value="PIN">Kaart</option>
                  <option value="Cash">Cash</option>
                  <option value="Cadeaubon">Cadeaubon</option>
                  <option value="Split">Gesplitst</option>
                </select>
              </label>
            </div>
          </div>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-cyan-800 hover:text-cyan-950"
            >
              <X size={14} /> Filters wissen
            </button>
          )}
        </div>

        {shownTransactions.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
              <Search size={22} />
            </span>
            <h3 className="mt-4 font-extrabold text-slate-900">
              Geen transacties gevonden
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              Pas je zoekopdracht, betaalmethode of periode aan.
            </p>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="mt-4 rounded-lg bg-cyan-700 px-4 py-2 text-sm font-bold text-white hover:bg-cyan-800"
              >
                Wis filters
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[980px] text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs font-bold uppercase tracking-[0.07em] text-slate-500">
                  <tr>
                    <SortableHeader
                      label="Factuur"
                      sortKey="invoice"
                      activeKey={transactionSort.key}
                      direction={transactionSort.direction}
                      onSort={changeTransactionSort}
                      className="px-6"
                    />
                    <SortableHeader
                      label="Datum & tijd"
                      sortKey="date"
                      activeKey={transactionSort.key}
                      direction={transactionSort.direction}
                      onSort={changeTransactionSort}
                    />
                    <SortableHeader
                      label="Betaling"
                      sortKey="payment"
                      activeKey={transactionSort.key}
                      direction={transactionSort.direction}
                      onSort={changeTransactionSort}
                    />
                    <SortableHeader
                      label="Kassier / kassa"
                      sortKey="cashier"
                      activeKey={transactionSort.key}
                      direction={transactionSort.direction}
                      onSort={changeTransactionSort}
                    />
                    <SortableHeader
                      label="Totaal incl. btw"
                      sortKey="total"
                      activeKey={transactionSort.key}
                      direction={transactionSort.direction}
                      onSort={changeTransactionSort}
                      align="right"
                    />
                    <th className="px-6 py-3 text-right">Acties</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {shownTransactions.map((transaction) => {
                    const invoice = convertTransactionToInvoiceData(
                      transaction,
                      transaction.merchantSnapshot ?? merchantProfile,
                    );
                    return (
                      <TransactionRow
                        key={
                          transaction.id ??
                          `${transaction.timestamp}-${transaction.tableId}`
                        }
                        transaction={transaction}
                        invoice={invoice}
                        onPreview={onPreviewInvoice}
                        canRefund={canRefund}
                        onRefund={onRefund}
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-slate-100 md:hidden">
              {shownTransactions.map((transaction) => {
                const invoice = convertTransactionToInvoiceData(
                  transaction,
                  transaction.merchantSnapshot ?? merchantProfile,
                );
                return (
                  <TransactionCard
                    key={
                      transaction.id ??
                      `${transaction.timestamp}-${transaction.tableId}`
                    }
                    transaction={transaction}
                    invoice={invoice}
                    onPreview={onPreviewInvoice}
                    canRefund={canRefund}
                    onRefund={onRefund}
                  />
                );
              })}
            </div>
          </>
        )}

        {filteredTransactions.length > shownTransactions.length && (
          <div className="border-t border-slate-200 bg-slate-50 px-6 py-4 text-center">
            <button
              type="button"
              onClick={() => setVisibleTransactionCount((value) => value + 50)}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-cyan-600"
            >
              Toon volgende{" "}
              {Math.min(
                50,
                filteredTransactions.length - shownTransactions.length,
              )}{" "}
              transacties
            </button>
          </div>
        )}
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-cyan-100 bg-cyan-50/70 px-4 py-3.5 text-sm text-slate-700">
        <ShieldCheck className="mt-0.5 shrink-0 text-cyan-700" size={18} />
        <p>
          <strong>Z-rapporten blijven apart:</strong> ze vormen de officiële
          financiële dagafsluiting en staan daarom in hun eigen onderdeel
          bovenaan.
        </p>
      </div>
    </section>
  );
};

const TransactionRow = ({
  transaction,
  invoice,
  onPreview,
  canRefund,
  onRefund,
}: {
  transaction: Transaction;
  invoice: InvoiceData;
  onPreview: (invoice: InvoiceData) => void;
  canRefund: boolean;
  onRefund: (transaction: Transaction) => void;
}) => (
  <tr className="transition-colors hover:bg-slate-50">
    <td className="px-6 py-4 font-mono text-xs font-bold text-cyan-800">
      {invoice.invoiceNumber}
    </td>
    <td className="px-5 py-4 font-medium text-slate-700">
      {format(transaction.timestamp, "dd/MM/yyyy")}
      <span className="ml-1 text-slate-400">
        {format(transaction.timestamp, "HH:mm")}
      </span>
    </td>
    <td className="px-5 py-4">
      <PaymentSummary transaction={transaction} />
    </td>
    <td className="px-5 py-4 text-slate-600">
      <span className="block font-semibold text-slate-700">
        {transaction.userName || "Kassa"}
      </span>
      <span className="text-xs text-slate-400">
        Kassa {transaction.tableId}
      </span>
    </td>
    <td className="px-5 py-4 text-right text-base font-extrabold tabular-nums text-slate-950">
      {formatEUR(transaction.totalCents)}
    </td>
    <td className="px-6 py-4">
      <div className="flex justify-end gap-2">
        {canRefund &&
          (transaction.kind ?? "sale") === "sale" &&
          (transaction.source ?? "live") !== "demo" && (
            <button
              type="button"
              onClick={() => onRefund(transaction)}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3 text-sm font-bold text-amber-800 hover:bg-amber-100"
            >
              <RotateCcw size={15} />
              Retour
            </button>
          )}
        <InvoiceActions invoice={invoice} onPreview={onPreview} />
      </div>
    </td>
  </tr>
);

const TransactionCard = ({
  transaction,
  invoice,
  onPreview,
  canRefund,
  onRefund,
}: {
  transaction: Transaction;
  invoice: InvoiceData;
  onPreview: (invoice: InvoiceData) => void;
  canRefund: boolean;
  onRefund: (transaction: Transaction) => void;
}) => (
  <article className="p-5">
    <div className="flex items-start justify-between gap-3">
      <div>
        <div className="font-mono text-xs font-extrabold text-sky-700">
          {invoice.invoiceNumber}
        </div>
        <div className="mt-1 text-sm font-semibold text-slate-600">
          {format(transaction.timestamp, "dd/MM/yyyy · HH:mm")}
        </div>
      </div>
      <div className="text-lg font-extrabold tabular-nums text-slate-950">
        {formatEUR(transaction.totalCents)}
      </div>
    </div>
    <div className="my-4 grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 text-sm">
      <div>
        <div className="text-xs font-bold uppercase tracking-wide text-slate-400">
          Betaling
        </div>
        <div className="mt-1">
          <PaymentSummary transaction={transaction} />
        </div>
      </div>
      <div>
        <div className="text-xs font-bold uppercase tracking-wide text-slate-400">
          Kassier / kassa
        </div>
        <div className="mt-1 font-bold text-slate-700">
          {transaction.userName || "Kassa"} · Kassa {transaction.tableId}
        </div>
      </div>
    </div>
    <div className="flex flex-col gap-2">
      {canRefund &&
        (transaction.kind ?? "sale") === "sale" &&
        (transaction.source ?? "live") !== "demo" && (
          <button
            type="button"
            onClick={() => onRefund(transaction)}
            className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3 text-sm font-bold text-amber-800"
          >
            <RotateCcw size={15} />
            Retour boeken
          </button>
        )}
      <InvoiceActions invoice={invoice} onPreview={onPreview} mobile />
    </div>
  </article>
);

const InvoiceActions = ({
  invoice,
  onPreview,
  mobile = false,
}: {
  invoice: InvoiceData;
  onPreview: (invoice: InvoiceData) => void;
  mobile?: boolean;
}) => (
  <div
    className={`flex items-center justify-end gap-2 ${mobile ? "w-full" : ""}`}
  >
    <button
      type="button"
      onClick={() => onPreview(invoice)}
      className={`inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-cyan-600 ${mobile ? "flex-1" : ""}`}
      aria-label={`Bekijk factuur ${invoice.invoiceNumber}`}
    >
      <Eye size={16} /> Bekijken
    </button>
    <button
      type="button"
      onClick={() =>
        downloadInvoicePdf(invoice, `${invoice.invoiceNumber}.pdf`)
      }
      className={`inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-cyan-700 px-3.5 text-sm font-bold text-white shadow-sm transition hover:bg-cyan-800 focus:outline-none focus:ring-2 focus:ring-cyan-600 focus:ring-offset-2 ${mobile ? "flex-1" : ""}`}
      aria-label={`Download factuur ${invoice.invoiceNumber}`}
    >
      <Download size={16} /> Download
    </button>
  </div>
);

const RefundDialog = ({
  transaction,
  onClose,
  onDone,
}: {
  transaction: Transaction;
  onClose: () => void;
  onDone: () => Promise<void>;
}) => {
  const auth = useAuth();
  const [quantities, setQuantities] = useState<Record<string, number>>(
    Object.fromEntries(
      transaction.items.map((item) => [item.lineId, item.quantity]),
    ),
  );
  const [method, setMethod] = useState<"Cash" | "PIN" | "Cadeaubon">(() => {
    const tenders = transactionTenders(transaction);
    return tenders.length === 1 ? tenders[0].method : "PIN";
  });
  const [reason, setReason] = useState("");
  const [disposition, setDisposition] = useState<ReturnDisposition>("sellable");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    setError(null);
    setSaving(true);
    try {
      await createRefund({
        clientRequestId: globalThis.crypto.randomUUID(),
        originalTransactionId: transaction.id!,
        lines: transaction.items
          .map((item) => ({
            lineId: item.lineId,
            quantity: quantities[item.lineId] ?? 0,
          }))
          .filter((line) => line.quantity > 0),
        method,
        reason,
        disposition,
        userId: auth.currentUserId ?? undefined,
        userName: auth.currentUserName ?? undefined,
      });
      await onDone();
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={`Retour boeken · ${transaction.documentNumber ?? `#${transaction.id}`}`}
      size="lg"
      footer={
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700"
          >
            Annuleren
          </button>
          <button
            disabled={
              saving ||
              reason.trim().length < 3 ||
              !Object.values(quantities).some((quantity) => quantity > 0)
            }
            onClick={() => void submit()}
            className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
          >
            {saving ? "Retour wordt geboekt…" : "Retour definitief boeken"}
          </button>
        </div>
      }
    >
      <div className="space-y-4 text-slate-900">
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          Een retour maakt een afzonderlijk correctiedocument en blijft gekoppeld
          aan de oorspronkelijke verkoop. Alleen een verkoopbare retour komt
          terug in de beschikbare voorraad.
        </p>
        <fieldset>
          <legend className="text-xs font-bold uppercase tracking-wide text-slate-500">
            Retourregels
          </legend>
          <div className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200">
            {transaction.items.map((item) => (
              <label
                key={item.lineId}
                className="flex items-center justify-between gap-4 p-3 text-sm"
              >
                <span>
                  <strong className="block">{item.product.name}</strong>
                  <span className="text-xs text-slate-500">
                    Oorspronkelijk {item.quantity} stuks
                  </span>
                </span>
                <input
                  type="number"
                  min={0}
                  max={item.quantity}
                  step={1}
                  value={quantities[item.lineId] ?? 0}
                  onChange={(event) =>
                    setQuantities((current) => ({
                      ...current,
                      [item.lineId]: Math.max(
                        0,
                        Math.min(
                          item.quantity,
                          Number(event.target.value) || 0,
                        ),
                      ),
                    }))
                  }
                  className="w-20 rounded-lg border border-slate-300 px-3 py-2 text-right font-bold"
                  aria-label={`Retouraantal ${item.product.name}`}
                />
              </label>
            ))}
          </div>
        </fieldset>
        <label className="block text-xs font-bold text-slate-600">
          Terugbetalen via
          <select
            value={method}
            onChange={(event) => setMethod(event.target.value as typeof method)}
            className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm"
          >
            <option value="PIN">Kaart</option>
            <option value="Cash">Contant</option>
            <option value="Cadeaubon">Oorspronkelijke cadeaubon</option>
          </select>
        </label>
        <label className="block text-xs font-bold text-slate-600">
          Bestemming retourartikel
          <select
            value={disposition}
            onChange={(event) => setDisposition(event.target.value as ReturnDisposition)}
            className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm"
          >
            <option value="sellable">Verkoopbaar — terug in beschikbare voorraad</option>
            <option value="quarantine">Quarantaine — eerst controleren</option>
            <option value="defective">Defect — niet verkoopbaar</option>
            <option value="supplier-return">Retour leverancier — niet verkoopbaar</option>
          </select>
          <span className="mt-1 block text-[11px] font-medium text-slate-500">
            {disposition === "sellable"
              ? "Deze artikelen verhogen de beschikbare voorraad."
              : "Deze artikelen worden financieel geretourneerd, maar verhogen de beschikbare voorraad niet."}
          </span>
        </label>
        <label className="block text-xs font-bold text-slate-600">
          Retourreden
          <textarea
            autoFocus
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className="mt-1.5 min-h-24 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder="Minimaal 3 tekens"
          />
        </label>
        {error && (
          <p
            role="alert"
            className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700"
          >
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
};

const PaymentBadge = ({ method }: { method: PaymentMethod }) => {
  const isCash = method === "Cash";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-extrabold ring-1 ring-inset ${
        isCash
          ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
          : "bg-sky-50 text-sky-700 ring-sky-200"
      }`}
    >
      {isCash ? <WalletCards size={13} /> : <CreditCard size={13} />}
      {method === "PIN" ? "Kaart" : method === "Split" ? "Gesplitst" : method}
    </span>
  );
};

const PaymentSummary = ({ transaction }: { transaction: Transaction }) => {
  const tenders = transactionTenders(transaction);
  return (
    <div>
      <PaymentBadge method={transaction.paymentMethod} />
      {tenders.length > 1 && (
        <div className="mt-1 text-xs font-semibold leading-4 text-slate-500">
          {tenders
            .map((tender) =>
              `${tender.method === "PIN" ? "Kaart" : tender.method} ${formatEUR(tender.amountCents)}`,
            )
            .join(" · ")}
        </div>
      )}
    </div>
  );
};

const auditActionLabel: Partial<Record<AuditEntry["action"], string>> = {
  login: "Aangemeld",
  logout: "Afgemeld",
  register: "Account aangemaakt",
  "order.add": "Product toegevoegd",
  "order.remove": "Product verwijderd",
  "order.update": "Aantal gewijzigd",
  "order.void": "Regel geannuleerd",
  checkout: "Verkoop afgerekend",
  "refund.create": "Retour geboekt",
  "discount.apply": "Korting toegepast",
  "zreport.finalize": "Z-rapport afgesloten",
  "customer.create": "Klant aangemaakt",
  "customer.update": "Klant bijgewerkt",
  "customer.delete": "Klant gearchiveerd",
  "customer.restore": "Klant hersteld",
  "giftcard.create": "Cadeaubon uitgegeven",
  "giftcard.recharge": "Cadeaubon opgewaardeerd",
  "giftcard.deduct": "Cadeaubon gebruikt",
  "giftcard.deactivate": "Cadeaubon geblokkeerd",
  "giftcard.activate": "Cadeaubon geactiveerd",
  "product.create": "Product aangemaakt",
  "product.update": "Product bijgewerkt",
  "product.delete": "Product gearchiveerd",
  "product.restore": "Product hersteld",
  "webshop_order.create": "Webshopbestelling aangemaakt",
  "webshop_order.update": "Webshopbestelling bijgewerkt",
  "webshop_order.cancel": "Webshopbestelling geannuleerd",
};

const auditDetailSummary = (detail: unknown): string => {
  if (!detail || typeof detail !== "object") return "Geen aanvullende details";
  const value = detail as Record<string, unknown>;
  const parts: string[] = [];
  if (typeof value.name === "string") parts.push(value.name);
  if (typeof value.totalCents === "number")
    parts.push(formatEUR(value.totalCents));
  if (typeof value.amountCents === "number")
    parts.push(formatEUR(value.amountCents));
  if (typeof value.reason === "string") parts.push(`Reden: ${value.reason}`);
  if (typeof value.method === "string") parts.push(`Betaling: ${value.method}`);
  if (typeof value.code === "string")
    parts.push(`Bon ••••${value.code.replace(/[^A-Z0-9]/gi, "").slice(-4)}`);
  if (typeof value.transactionId === "number")
    parts.push(`Transactie #${value.transactionId}`);
  if (typeof value.refundTransactionId === "number")
    parts.push(`Retour #${value.refundTransactionId}`);
  return parts.length > 0
    ? parts.join(" · ")
    : "Technische details beschikbaar in beveiligde export";
};

const ReportsTable = ({
  reports,
  storeId,
  onOpen,
}: {
  reports: DailyReport[];
  storeId?: string | null;
  onOpen: (report: DailyReport) => void;
}) => {
  const [view, setView] = useState<"reports" | "days">("reports");
  const [daySummaries, setDaySummaries] = useState<DailyReportDaySummary[]>([]);
  const [sort, setSort] = useState<{
    key: ReportSortKey;
    direction: SortDirection;
  }>({ key: "date", direction: "desc" });

  useEffect(() => {
    let active = true;
    void loadDailyReportDaySummaries(reports, storeId).then((rows) => {
      if (active) setDaySummaries(rows);
    });
    return () => {
      active = false;
    };
  }, [reports, storeId]);

  const sortedReports = useMemo(() => {
    const valueFor = (report: DailyReport): number => {
      switch (sort.key) {
        case "report":
          return report.reportNumber;
        case "date":
          return report.timestamp;
        case "revenue":
          return report.totalRevenueCents;
        case "cash":
          return report.paymentTotalsCents.Cash;
        case "card":
          return report.paymentTotalsCents.PIN;
        case "vat":
          return report.totalVat21Cents;
      }
    };
    const direction = sort.direction === "asc" ? 1 : -1;
    return [...reports].sort((left, right) => {
      const primary = valueFor(left) - valueFor(right);
      return primary === 0
        ? right.timestamp - left.timestamp
        : primary * direction;
    });
  }, [reports, sort]);

  const changeSort = (key: ReportSortKey) => {
    setSort((current) => ({
      key,
      direction:
        current.key === key && current.direction === "desc" ? "asc" : "desc",
    }));
  };

  return (
    <section className="insights-panel overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-slate-100 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-cyan-50 text-cyan-700">
            <CalendarDays size={20} />
          </span>
          <div>
            <h2 className="text-lg font-bold text-slate-950">
              Z-rapporten
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Officiële afsluitingen per kassa/shift, met een apart geconsolideerd dagoverzicht.
            </p>
          </div>
        </div>
        <div className="inline-flex w-fit rounded-lg border border-slate-200 bg-slate-50 p-1" role="group" aria-label="Z-rapportweergave">
          <button type="button" aria-pressed={view === "reports"} onClick={() => setView("reports")} className={`rounded-md px-3 py-2 text-sm font-bold transition ${view === "reports" ? "bg-white text-cyan-800 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>Z-rapporten</button>
          <button type="button" aria-pressed={view === "days"} onClick={() => setView("days")} className={`rounded-md px-3 py-2 text-sm font-bold transition ${view === "days" ? "bg-white text-cyan-800 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>Dagtotalen</button>
        </div>
      </div>
      {view === "days" ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-bold uppercase tracking-[0.07em] text-slate-500"><tr><th className="px-6 py-3">Werkdag</th><th className="px-4 py-3 text-right">Z-rapporten</th><th className="px-4 py-3 text-right">Transacties</th><th className="px-4 py-3 text-right">Omzet</th><th className="px-4 py-3 text-right">Cash</th><th className="px-4 py-3 text-right">Kaart</th><th className="px-4 py-3 text-right">BTW</th><th className="px-6 py-3 text-right">Brutowinst</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{daySummaries.length === 0 ? <tr><td colSpan={8} className="px-6 py-14 text-center text-slate-500">Nog geen afgesloten werkdagen.</td></tr> : daySummaries.map((day) => <tr key={day.date} className="hover:bg-slate-50"><td className="px-6 py-4"><div className="font-bold text-slate-900">{format(new Date(`${day.date}T12:00:00`), "dd/MM/yyyy")}</div><div className="mt-0.5 text-xs text-slate-500">Rapport #{day.firstReportNumber}{day.lastReportNumber !== day.firstReportNumber ? `–#${day.lastReportNumber}` : ""}</div></td><td className="px-4 py-4 text-right font-semibold tabular-nums">{day.reportCount}</td><td className="px-4 py-4 text-right font-semibold tabular-nums">{day.transactionCount}</td><td className="px-4 py-4 text-right font-extrabold tabular-nums">{formatEUR(day.totalRevenueCents)}</td><td className="px-4 py-4 text-right tabular-nums">{formatEUR(day.cashCents)}</td><td className="px-4 py-4 text-right tabular-nums">{formatEUR(day.pinCents)}</td><td className="px-4 py-4 text-right tabular-nums">{formatEUR(day.totalVat12Cents + day.totalVat21Cents)}</td><td className="px-6 py-4 text-right font-bold tabular-nums text-emerald-700">{formatEUR(day.grossProfitCents)}</td></tr>)}</tbody>
          </table>
        </div>
      ) : <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs font-bold uppercase tracking-[0.07em] text-slate-500">
            <tr>
              <SortableHeader
                label="Rapport"
                sortKey="report"
                activeKey={sort.key}
                direction={sort.direction}
                onSort={changeSort}
                className="px-6"
              />
              <SortableHeader
                label="Datum"
                sortKey="date"
                activeKey={sort.key}
                direction={sort.direction}
                onSort={changeSort}
              />
              <SortableHeader
                label="Omzet"
                sortKey="revenue"
                activeKey={sort.key}
                direction={sort.direction}
                onSort={changeSort}
                align="right"
              />
              <SortableHeader
                label="Cash"
                sortKey="cash"
                activeKey={sort.key}
                direction={sort.direction}
                onSort={changeSort}
                align="right"
              />
              <SortableHeader
                label="Kaart"
                sortKey="card"
                activeKey={sort.key}
                direction={sort.direction}
                onSort={changeSort}
                align="right"
              />
              <th className="px-5 py-3 text-right">Cadeaubon</th>
              <th className="px-5 py-3 text-right">Kasverschil</th>
              <SortableHeader
                label="BTW 21%"
                sortKey="vat"
                activeKey={sort.key}
                direction={sort.direction}
                onSort={changeSort}
                align="right"
                className="px-6"
              />
              <th className="px-5 py-3 text-right">Actie</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {reports.length === 0 ? (
              <tr>
                <td
                  colSpan={9}
                  className="px-6 py-14 text-center text-slate-500"
                >
                  Nog geen Z-rapporten gegenereerd. Sluit eerst een
                  gecontroleerde shift af.
                </td>
              </tr>
            ) : (
              sortedReports.map((report) => (
                <tr
                  key={report.id}
                  className="cursor-pointer hover:bg-cyan-50/50 focus-within:bg-cyan-50/50"
                  onClick={() => onOpen(report)}
                >
                  <td className="px-6 py-4 font-mono text-xs font-bold text-cyan-800">
                    #{report.reportNumber}
                  </td>
                  <td className="px-5 py-4 font-semibold text-slate-700">
                    {format(report.timestamp, "dd/MM/yyyy HH:mm")}
                  </td>
                  <td className="px-5 py-4 text-right font-extrabold tabular-nums text-slate-950">
                    {formatEUR(report.totalRevenueCents)}
                  </td>
                  <td className="px-5 py-4 text-right font-semibold tabular-nums text-slate-700">
                    {formatEUR(report.paymentTotalsCents.Cash)}
                  </td>
                  <td className="px-5 py-4 text-right font-semibold tabular-nums text-slate-700">
                    {formatEUR(report.paymentTotalsCents.PIN)}
                  </td>
                  <td className="px-5 py-4 text-right font-semibold tabular-nums text-slate-700">
                    {formatEUR(report.paymentTotalsCents.Cadeaubon)}
                  </td>
                  <td
                    className={`px-5 py-4 text-right font-bold tabular-nums ${(report.cashDifferenceCents ?? 0) === 0 ? "text-cyan-700" : "text-rose-700"}`}
                  >
                    {formatEUR(report.cashDifferenceCents ?? 0)}
                  </td>
                  <td className="px-6 py-4 text-right tabular-nums text-slate-600">
                    {formatEUR(report.totalVat21Cents)}
                  </td>
                  <td className="px-5 py-4 text-right">
                    <button type="button" onClick={(event) => { event.stopPropagation(); onOpen(report); }} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-cyan-50 px-3 py-2 text-xs font-extrabold text-cyan-800 transition hover:bg-cyan-100 focus:outline-none focus:ring-2 focus:ring-cyan-600" aria-label={`Bekijk Z-rapport ${report.reportNumber}`}><Eye size={15} /> Bekijken</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>}
    </section>
  );
};

const AuditTable = ({ rows }: { rows: AuditEntry[] }) => {
  const [sort, setSort] = useState<{
    key: AuditSortKey;
    direction: SortDirection;
  }>({ key: "time", direction: "desc" });

  const sortedRows = useMemo(() => {
    const compareText = (left: string, right: string) =>
      left.localeCompare(right, "nl-BE", {
        numeric: true,
        sensitivity: "base",
      });
    const direction = sort.direction === "asc" ? 1 : -1;
    return [...rows].sort((left, right) => {
      let primary = 0;
      switch (sort.key) {
        case "time":
          primary = left.timestamp - right.timestamp;
          break;
        case "user":
          primary = compareText(
            left.userName ?? "Systeem",
            right.userName ?? "Systeem",
          );
          break;
        case "action":
          primary = compareText(left.action, right.action);
          break;
        case "detail":
          primary = compareText(
            JSON.stringify(left.detail ?? {}),
            JSON.stringify(right.detail ?? {}),
          );
          break;
      }
      return primary === 0
        ? right.timestamp - left.timestamp
        : primary * direction;
    });
  }, [rows, sort]);

  const changeSort = (key: AuditSortKey) => {
    setSort((current) => ({
      key,
      direction:
        current.key === key && current.direction === "desc" ? "asc" : "desc",
    }));
  };

  return (
    <section className="insights-panel overflow-hidden">
      <div className="border-b border-slate-100 px-5 py-5 sm:px-6">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-cyan-50 text-cyan-700">
            <ShieldCheck size={20} />
          </span>
          <div>
            <h2 className="text-lg font-bold text-slate-950">Auditlog</h2>
            <p className="mt-1 text-sm text-slate-500">
              Een controleerbaar overzicht van belangrijke acties in Pwayment.
            </p>
          </div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs font-bold uppercase tracking-[0.07em] text-slate-500">
            <tr>
              <SortableHeader
                label="Tijd"
                sortKey="time"
                activeKey={sort.key}
                direction={sort.direction}
                onSort={changeSort}
                className="px-6"
              />
              <SortableHeader
                label="Gebruiker"
                sortKey="user"
                activeKey={sort.key}
                direction={sort.direction}
                onSort={changeSort}
              />
              <SortableHeader
                label="Actie"
                sortKey="action"
                activeKey={sort.key}
                direction={sort.direction}
                onSort={changeSort}
              />
              <SortableHeader
                label="Detail"
                sortKey="detail"
                activeKey={sort.key}
                direction={sort.direction}
                onSort={changeSort}
                className="px-6"
              />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-6 py-14 text-center text-slate-500"
                >
                  Nog geen activiteit geregistreerd.
                </td>
              </tr>
            ) : (
              sortedRows.map((row) => (
                <tr key={row.id} className="align-top hover:bg-slate-50">
                  <td className="whitespace-nowrap px-6 py-4 font-medium text-slate-500">
                    {format(row.timestamp, "dd/MM/yyyy HH:mm:ss")}
                  </td>
                  <td className="px-5 py-4 font-bold text-slate-700">
                    {row.userName ?? "Systeem"}
                  </td>
                  <td className="px-5 py-4">
                    <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">
                      {auditActionLabel[row.action] ?? row.action}
                    </span>
                  </td>
                  <td className="max-w-xl px-6 py-4 text-xs leading-5 text-slate-500">
                    {auditDetailSummary(row.detail)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
};

function SortableHeader<K extends string>({
  label,
  sortKey,
  activeKey,
  direction,
  onSort,
  align = "left",
  className = "px-5",
}: {
  label: string;
  sortKey: K;
  activeKey: K;
  direction: SortDirection;
  onSort: (key: K) => void;
  align?: "left" | "right";
  className?: string;
}) {
  const active = activeKey === sortKey;
  const ariaSort = active
    ? direction === "asc"
      ? "ascending"
      : "descending"
    : "none";
  const nextDirection =
    active && direction === "desc" ? "oplopend" : "aflopend";

  return (
    <th
      aria-sort={ariaSort}
      className={`${className} py-0 ${align === "right" ? "text-right" : "text-left"}`}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        aria-label={`Sorteer ${label} ${nextDirection}`}
        title={`Sorteer op ${label}`}
        className={`flex w-full items-center gap-1.5 py-3 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-600 ${
          align === "right" ? "justify-end" : "justify-start"
        } ${active ? "text-cyan-800" : "text-slate-500 hover:text-slate-900"}`}
      >
        <span>{label}</span>
        {active ? (
          direction === "asc" ? (
            <ArrowUp aria-hidden="true" size={14} />
          ) : (
            <ArrowDown aria-hidden="true" size={14} />
          )
        ) : (
          <ArrowUpDown aria-hidden="true" className="opacity-55" size={14} />
        )}
      </button>
    </th>
  );
}

const RangeButton = ({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) => (
  <button
    type="button"
    aria-pressed={active}
    onClick={onClick}
    className={`min-h-9 rounded-md px-3 py-1.5 text-xs font-bold transition focus:outline-none focus:ring-2 focus:ring-cyan-600 ${
      active
        ? "bg-white text-cyan-800 shadow-sm ring-1 ring-slate-200"
        : "text-slate-500 hover:bg-white hover:text-slate-900"
    }`}
  >
    {label}
  </button>
);

const HistoryMetric = ({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: React.ReactNode;
}) => (
  <article className="insights-panel min-w-0 p-4 sm:p-5">
    <div className="flex items-start justify-between gap-3">
      <div className="text-xs font-semibold text-slate-500">
        {label}
      </div>
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cyan-50 text-cyan-700 ring-1 ring-inset ring-cyan-100"
      >
        {icon}
      </span>
    </div>
    <div className="mt-3 break-words text-xl font-bold tracking-tight tabular-nums text-slate-950 sm:text-2xl">
      {value}
    </div>
    <div className="mt-1 text-sm font-medium text-slate-500">{detail}</div>
  </article>
);
