import React, { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { BarChart3, Download, FileText, Filter, ReceiptText } from 'lucide-react';
import { db } from '../db/db';
import { AuditEntry, DailyReport, Transaction } from '../types';
import { formatEUR } from '../utils/money';
import { SalesHistoryRow, buildSalesHistory } from '../utils/retailDashboardData';

type Tab = 'sales' | 'reports' | 'audit';
type SalesRange = '30d' | '12m' | 'all';

export const AuditLog: React.FC = () => {
  const [tab, setTab] = useState<Tab>('sales');
  const [salesRange, setSalesRange] = useState<SalesRange>('12m');
  const [reports, setReports] = useState<DailyReport[]>([]);
  const [auditRows, setAuditRows] = useState<AuditEntry[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  useEffect(() => {
    void load();
  }, []);

  const load = async () => {
    const [nextReports, nextAuditRows, nextTransactions] = await Promise.all([
      db.daily_reports.reverse().toArray(),
      db.audit.orderBy('timestamp').reverse().limit(500).toArray(),
      db.transactions.orderBy('timestamp').reverse().toArray(),
    ]);
    setReports(nextReports);
    setAuditRows(nextAuditRows);
    setTransactions(nextTransactions);
  };

  const visibleTransactions = useMemo(() => {
    if (salesRange === 'all') return transactions;
    const start = new Date();
    if (salesRange === '30d') start.setDate(start.getDate() - 29);
    else start.setMonth(start.getMonth() - 11, 1);
    start.setHours(0, 0, 0, 0);
    return transactions.filter((transaction) => transaction.timestamp >= start.getTime());
  }, [salesRange, transactions]);

  const historyRows = useMemo(
    () => buildSalesHistory(visibleTransactions, salesRange === '30d' ? 'day' : 'month'),
    [salesRange, visibleTransactions],
  );
  const salesTotals = useMemo(() => visibleTransactions.reduce((totals, transaction) => ({
    revenueCents: totals.revenueCents + transaction.totalCents,
    discountCents: totals.discountCents + transaction.discountCents,
    linkedCustomerCount: totals.linkedCustomerCount + (transaction.customerId ? 1 : 0),
  }), { revenueCents: 0, discountCents: 0, linkedCustomerCount: 0 }), [visibleTransactions]);

  const exportCSV = () => {
    if (tab === 'sales') {
      if (historyRows.length === 0) return;
      const headers = ['Periode', 'Verkopen', 'Omzet', 'Gemiddeld ticket', 'Cash', 'Kaart', 'Kortingen', 'Gekoppelde klanten'];
      const rows = historyRows.map((row) => [
        row.label,
        row.transactionCount,
        (row.revenueCents / 100).toFixed(2),
        (row.revenueCents / Math.max(row.transactionCount, 1) / 100).toFixed(2),
        (row.cashCents / 100).toFixed(2),
        (row.pinCents / 100).toFixed(2),
        (row.discountCents / 100).toFixed(2),
        row.linkedCustomerCount,
      ]);
      const csv = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
      download(`pwayment_verkoopgeschiedenis_${format(Date.now(), 'yyyyMMdd')}.csv`, csv, 'text/csv;charset=utf-8;');
      return;
    }
    if (reports.length === 0) return;
    const headers = ['Rapport Nr', 'Datum', 'Totaal Omzet', 'Cash', 'PIN', 'BTW 21%', 'Hash'];
    const rows = reports.map((r) => [
      r.reportNumber,
      format(r.timestamp, 'yyyy-MM-dd HH:mm:ss'),
      (r.totalRevenueCents / 100).toFixed(2),
      (r.paymentTotalsCents.Cash / 100).toFixed(2),
      (r.paymentTotalsCents.PIN / 100).toFixed(2),
      (r.totalVat21Cents / 100).toFixed(2),
      r.hash,
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    download(`pwayment_export_${format(Date.now(), 'yyyyMMdd')}.csv`, csv, 'text/csv;charset=utf-8;');
  };

  const exportJSON = () => {
    if (tab === 'sales') {
      if (visibleTransactions.length === 0) return;
      download(`pwayment_verkopen_${format(Date.now(), 'yyyyMMdd')}.json`, JSON.stringify(visibleTransactions, null, 2), 'application/json');
      return;
    }
    if (reports.length === 0) return;
    download(`pwayment_export_${format(Date.now(), 'yyyyMMdd')}.json`, JSON.stringify(reports, null, 2), 'application/json');
  };

  const download = (name: string, body: string, mime: string) => {
    const blob = new Blob([body], { type: mime });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = name;
    link.click();
  };

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-white p-8 overflow-y-auto">
      <div className="max-w-5xl mx-auto w-full">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">Historiek</h1>
          <div className="flex gap-3">
            <button onClick={exportCSV} className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg">
              <FileText size={20} />
              <span>CSV</span>
            </button>
            <button onClick={exportJSON} className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg">
              <Download size={20} />
              <span>JSON</span>
            </button>
          </div>
        </div>

        <div className="flex flex-wrap bg-zinc-900 rounded-xl p-1 mb-6 w-fit border border-zinc-800">
          <button
            onClick={() => setTab('sales')}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === 'sales' ? 'bg-zinc-800' : 'text-zinc-400'}`}
          >
            <ReceiptText className="inline-block mr-1" size={14} /> Verkoopgeschiedenis
          </button>
          <button
            onClick={() => setTab('reports')}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === 'reports' ? 'bg-zinc-800' : 'text-zinc-400'}`}
          >
            Z-Rapporten
          </button>
          <button
            onClick={() => setTab('audit')}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === 'audit' ? 'bg-zinc-800' : 'text-zinc-400'}`}
          >
            <Filter className="inline-block mr-1" size={14} /> Audit log
          </button>
        </div>

        {tab === 'sales' ? (
          <SalesHistory
            range={salesRange}
            onRangeChange={setSalesRange}
            transactions={visibleTransactions}
            rows={historyRows}
            totals={salesTotals}
          />
        ) : tab === 'reports' ? (
          <div className="bg-zinc-900 rounded-2xl border border-zinc-800 overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-zinc-950 border-b border-zinc-800">
                  <th className="p-4 font-semibold">Nr</th>
                  <th className="p-4 font-semibold">Datum</th>
                  <th className="p-4 font-semibold">Omzet</th>
                  <th className="p-4 font-semibold">Cash</th>
                  <th className="p-4 font-semibold">PIN</th>
                  <th className="p-4 font-semibold">BTW 21%</th>
                </tr>
              </thead>
              <tbody>
                {reports.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-zinc-500">
                      Nog geen Z-rapporten gegenereerd.
                    </td>
                  </tr>
                ) : (
                  reports.map((r) => (
                    <tr key={r.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/50">
                      <td className="p-4 font-mono text-zinc-400">#{r.reportNumber}</td>
                      <td className="p-4">{format(r.timestamp, 'dd/MM/yyyy HH:mm')}</td>
                      <td className="p-4 font-bold">{formatEUR(r.totalRevenueCents)}</td>
                      <td className="p-4 text-emerald-400">{formatEUR(r.paymentTotalsCents.Cash)}</td>
                      <td className="p-4 text-blue-400">{formatEUR(r.paymentTotalsCents.PIN)}</td>
                      <td className="p-4 text-zinc-400">{formatEUR(r.totalVat21Cents)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="bg-zinc-900 rounded-2xl border border-zinc-800 overflow-hidden">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-zinc-950 border-b border-zinc-800">
                  <th className="p-3 font-semibold">Tijd</th>
                  <th className="p-3 font-semibold">Gebruiker</th>
                  <th className="p-3 font-semibold">Actie</th>
                  <th className="p-3 font-semibold">Detail</th>
                </tr>
              </thead>
              <tbody>
                {auditRows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-zinc-500">
                      Nog geen activiteit.
                    </td>
                  </tr>
                ) : (
                  auditRows.map((r) => (
                    <tr key={r.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/50 align-top">
                      <td className="p-3 text-zinc-400 whitespace-nowrap">{format(r.timestamp, 'dd/MM HH:mm:ss')}</td>
                      <td className="p-3 text-zinc-300">{r.userName ?? '-'}</td>
                      <td className="p-3 font-mono text-indigo-300">{r.action}</td>
                      <td className="p-3 text-zinc-500 font-mono text-xs break-all">
                        {r.detail ? JSON.stringify(r.detail) : ''}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

const SalesHistory = ({
  range,
  onRangeChange,
  transactions,
  rows,
  totals,
}: {
  range: SalesRange;
  onRangeChange: (range: SalesRange) => void;
  transactions: Transaction[];
  rows: SalesHistoryRow[];
  totals: { revenueCents: number; discountCents: number; linkedCustomerCount: number };
}) => {
  const averageTicket = transactions.length > 0 ? Math.round(totals.revenueCents / transactions.length) : 0;
  const linkedShare = transactions.length > 0 ? Math.round((totals.linkedCustomerCount / transactions.length) * 100) : 0;

  return (
    <section>
      <div className="flex flex-col gap-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sky-300"><BarChart3 size={18} /><span className="text-xs font-semibold uppercase tracking-[0.14em]">Geregistreerde verkopen</span></div>
          <h2 className="mt-2 text-2xl font-bold">{formatEUR(totals.revenueCents)}</h2>
          <p className="mt-1 text-sm text-zinc-500">{transactions.length} {transactions.length === 1 ? 'verkoop' : 'verkopen'} in de gekozen periode</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <RangeButton label="30 dagen" active={range === '30d'} onClick={() => onRangeChange('30d')} />
          <RangeButton label="12 maanden" active={range === '12m'} onClick={() => onRangeChange('12m')} />
          <RangeButton label="Alles" active={range === 'all'} onClick={() => onRangeChange('all')} />
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <HistoryMetric label="Gemiddeld ticket" value={formatEUR(averageTicket)} />
        <HistoryMetric label="Kortingen" value={formatEUR(totals.discountCents)} />
        <HistoryMetric label="Met klant gekoppeld" value={`${linkedShare}%`} detail={`${totals.linkedCustomerCount} verkopen`} />
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
        <div className="border-b border-zinc-800 bg-zinc-950 px-5 py-4">
          <h3 className="font-semibold">{range === '30d' ? 'Dagoverzicht' : 'Maandoverzicht'}</h3>
          <p className="mt-1 text-sm text-zinc-500">Elke rij is opgebouwd uit de transacties die in Pwayment zijn geregistreerd.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-zinc-800 text-xs uppercase tracking-[0.1em] text-zinc-500">
              <tr>
                <th className="px-5 py-3">Periode</th>
                <th className="px-5 py-3 text-right">Verkopen</th>
                <th className="px-5 py-3 text-right">Omzet</th>
                <th className="px-5 py-3 text-right">Gem. ticket</th>
                <th className="px-5 py-3 text-right">Kaart</th>
                <th className="px-5 py-3 text-right">Cash</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={6} className="px-5 py-10 text-center text-zinc-500">Nog geen verkopen in deze periode.</td></tr>
              ) : rows.map((row) => (
                <tr key={row.key} className="border-b border-zinc-800/50 last:border-0 hover:bg-zinc-800/50">
                  <td className="px-5 py-4 font-medium text-zinc-200">{row.label}</td>
                  <td className="px-5 py-4 text-right text-zinc-400">{row.transactionCount}</td>
                  <td className="px-5 py-4 text-right font-semibold">{formatEUR(row.revenueCents)}</td>
                  <td className="px-5 py-4 text-right text-zinc-400">{formatEUR(Math.round(row.revenueCents / row.transactionCount))}</td>
                  <td className="px-5 py-4 text-right text-sky-300">{formatEUR(row.pinCents)}</td>
                  <td className="px-5 py-4 text-right text-emerald-300">{formatEUR(row.cashCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="mt-3 text-xs text-zinc-500">Z-rapporten zijn financiële dagafsluitingen en blijven bewust apart van deze verkoopgeschiedenis.</p>
    </section>
  );
};

const RangeButton = ({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) => (
  <button type="button" onClick={onClick} className={`rounded-lg px-3 py-2 text-xs font-semibold ${active ? 'bg-sky-400 text-zinc-950' : 'bg-zinc-950 text-zinc-400 hover:bg-zinc-800 hover:text-white'}`}>{label}</button>
);

const HistoryMetric = ({ label, value, detail }: { label: string; value: string; detail?: string }) => (
  <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
    <div className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">{label}</div>
    <div className="mt-2 text-xl font-bold">{value}</div>
    {detail && <div className="mt-1 text-sm text-zinc-500">{detail}</div>}
  </div>
);
