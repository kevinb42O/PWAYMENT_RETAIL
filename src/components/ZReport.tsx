import React, { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { AlertTriangle, CheckCircle, Printer } from 'lucide-react';
import { calculateReportData, generateZReport, getUnfinalizedTransactions, ReportData } from '../utils/report';
import { DailyReport, Transaction } from '../types';
import { useAuth } from '../auth/useAuth';
import { formatEUR } from '../utils/money';

export const ZReportView: React.FC = () => {
  const auth = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [isFinalized, setIsFinalized] = useState(false);
  const [finalReport, setFinalReport] = useState<DailyReport | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    void loadData();
  }, []);

  const loadData = async () => {
    const txs = await getUnfinalizedTransactions();
    setTransactions(txs);
    if (txs.length > 0) setReportData(calculateReportData(txs));
  };

  const confirmFinalize = async () => {
    setShowConfirm(false);
    const report = await generateZReport({
      closedByUserId: auth.currentUserId ?? undefined,
      closedByUserName: auth.currentUserName ?? undefined,
    });
    if (report) {
      setFinalReport(report);
      setIsFinalized(true);
    }
  };

  if (transactions.length === 0 && !isFinalized) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-zinc-400 bg-zinc-950 p-8">
        <CheckCircle size={64} className="text-emerald-500 mb-4" />
        <h2 className="text-2xl font-bold text-white mb-2">Alles is afgesloten</h2>
        <p>Er zijn geen openstaande transacties om een Z-rapport van te maken.</p>
      </div>
    );
  }

  const isXReport = !isFinalized;
  const data = isFinalized ? finalReport : reportData;
  if (!data) return null;

  const totalRevenueCents = isFinalized ? finalReport!.totalRevenueCents : reportData!.totalRevenueCents;
  const totalCostCents = isFinalized ? finalReport!.totalCostCents ?? 0 : reportData!.totalCostCents;
  const grossProfitCents = isFinalized ? finalReport!.grossProfitCents ?? 0 : reportData!.grossProfitCents;
  const totalDiscountCents = isFinalized ? finalReport!.totalDiscountCents : reportData!.totalDiscountCents;
  const totalVat12Cents = isFinalized ? finalReport!.totalVat12Cents : reportData!.totalVat12Cents;
  const totalVat21Cents = isFinalized ? finalReport!.totalVat21Cents : reportData!.totalVat21Cents;
  const totalExclVat12Cents = isFinalized ? finalReport!.totalExclVat12Cents : reportData!.totalExclVat12Cents;
  const totalExclVat21Cents = isFinalized ? finalReport!.totalExclVat21Cents : reportData!.totalExclVat21Cents;
  const paymentTotalsCents = isFinalized ? finalReport!.paymentTotalsCents : reportData!.paymentTotalsCents;
  const transactionIds = isFinalized ? finalReport!.transactionIds : reportData!.transactionIds;
  const ts = isFinalized ? finalReport!.timestamp : reportData!.timestamp;

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-white overflow-y-auto print:bg-white print:text-black relative">
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 print:hidden">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <div className="flex items-center gap-3 text-red-500 mb-4">
              <AlertTriangle size={32} />
              <h2 className="text-xl font-bold text-white">Dag Afsluiten</h2>
            </div>
            <p className="text-zinc-300 mb-6">
              Weet je zeker dat je de dag wilt afsluiten? Alle huidige transacties worden gearchiveerd en dit kan <strong>niet</strong> ongedaan worden gemaakt.
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowConfirm(false)} className="px-4 py-2 rounded-lg font-medium bg-zinc-800 hover:bg-zinc-700">
                Annuleren
              </button>
              <button onClick={confirmFinalize} className="px-4 py-2 rounded-lg font-bold bg-red-600 hover:bg-red-500">
                Ja, Sluit Dag Af
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-2xl mx-auto w-full p-8">
        <div className="flex justify-between items-center mb-8 print:hidden">
          <h1 className="text-3xl font-bold">{isXReport ? 'X-Rapport (Preview)' : 'Z-Rapport (Definitief)'}</h1>
          <div className="flex gap-4">
            <button onClick={() => window.print()} className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg">
              <Printer size={20} />
              <span>Print</span>
            </button>
            {isXReport && auth.hasRole('owner', 'manager') && (
              <button onClick={() => setShowConfirm(true)} className="flex items-center gap-2 px-6 py-2 bg-red-600 hover:bg-red-500 rounded-lg font-bold">
                <AlertTriangle size={20} />
                <span>Sluit Dag Af (Z-Rapport)</span>
              </button>
            )}
          </div>
        </div>

        <div className="bg-zinc-900 print:bg-white p-8 rounded-2xl border border-zinc-800 print:border-none print:p-0">
          <div className="text-center mb-8 border-b border-zinc-700 print:border-gray-300 pb-6">
            <h2 className="text-2xl font-bold mb-2">PWAyment POS</h2>
            <h3 className="text-xl">{isXReport ? 'X-RAPPORT' : 'Z-RAPPORT'}</h3>
            {finalReport && <p className="text-sm mt-1">Rapport Nr: {finalReport.reportNumber}</p>}
            <p className="text-sm mt-1">Datum: {format(ts, 'dd/MM/yyyy HH:mm')}</p>
            {finalReport?.closedByUserName && (
              <p className="text-xs mt-1 text-zinc-500">Afgesloten door: {finalReport.closedByUserName}</p>
            )}
          </div>

          <div className="space-y-6">
            <div>
              <h4 className="font-bold text-lg mb-3 border-b border-zinc-800 print:border-gray-200 pb-1">Omzet</h4>
              <div className="flex justify-between mb-1">
                <span>Totaal Ontvangsten (Incl. BTW)</span>
                <span className="font-bold">{formatEUR(totalRevenueCents)}</span>
              </div>
              <div className="flex justify-between text-zinc-400 print:text-gray-600 text-sm">
                <span>Totaal Kortingen</span>
                <span>-{formatEUR(totalDiscountCents)}</span>
              </div>
              <div className="flex justify-between text-zinc-400 print:text-gray-600 text-sm mt-3">
                <span>Inkoopwaarde verkochte goederen</span>
                <span>{formatEUR(totalCostCents)}</span>
              </div>
              <div className="flex justify-between text-emerald-300 print:text-gray-700 text-sm font-semibold">
                <span>Brutowinst retail</span>
                <span>{formatEUR(grossProfitCents)}</span>
              </div>
            </div>

            <div>
              <h4 className="font-bold text-lg mb-3 border-b border-zinc-800 print:border-gray-200 pb-1">BTW Uitsplitsing</h4>
              {totalExclVat12Cents > 0 && (
                <div className="mb-4">
                  <div className="font-semibold mb-1">12%</div>
                  <div className="flex justify-between text-sm"><span>Omzet Excl. BTW</span><span>{formatEUR(totalExclVat12Cents)}</span></div>
                  <div className="flex justify-between text-sm"><span>BTW Bedrag</span><span>{formatEUR(totalVat12Cents)}</span></div>
                </div>
              )}
              <div>
                <div className="font-semibold mb-1">21% retail</div>
                <div className="flex justify-between text-sm"><span>Omzet Excl. BTW</span><span>{formatEUR(totalExclVat21Cents)}</span></div>
                <div className="flex justify-between text-sm"><span>BTW Bedrag</span><span>{formatEUR(totalVat21Cents)}</span></div>
              </div>
            </div>

            <div>
              <h4 className="font-bold text-lg mb-3 border-b border-zinc-800 print:border-gray-200 pb-1">Betaalmethodes</h4>
              <div className="flex justify-between mb-1"><span>Cash</span><span>{formatEUR(paymentTotalsCents.Cash)}</span></div>
              <div className="flex justify-between mb-1"><span>PIN / Kaart</span><span>{formatEUR(paymentTotalsCents.PIN)}</span></div>
            </div>

            <div className="mt-12 pt-6 border-t border-zinc-700 print:border-gray-300 text-center text-xs text-zinc-500 print:text-gray-500">
              <p>Aantal transacties: {transactionIds.length}</p>
              {finalReport && (
                <>
                  <div className="mt-4 break-all font-mono text-[10px] opacity-50">Hash: {finalReport.hash}</div>
                  {finalReport.prevHash && (
                    <div className="break-all font-mono text-[10px] opacity-50">Prev: {finalReport.prevHash}</div>
                  )}
                </>
              )}
              <p className="mt-4">Einde Rapport</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
