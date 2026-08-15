import React, { useMemo } from 'react';
import { Download, Printer, X, ShieldCheck, Mail, FileText, CheckCircle2 } from 'lucide-react';
import { InvoiceData, downloadInvoicePdf, getInvoicePdfDataUrl } from '../utils/invoicePdfGenerator';
import { formatEUR } from '../utils/money';

interface InvoicePreviewModalProps {
  invoice: InvoiceData | null;
  onClose: () => void;
}

export const InvoicePreviewModal: React.FC<InvoicePreviewModalProps> = ({ invoice, onClose }) => {
  if (!invoice) return null;
  const documentTitle = invoice.type === "credit_note" ? "Creditnota" : invoice.type === "receipt" ? "Kassaticket" : "Factuur";

  const pdfDataUrl = useMemo(() => {
    try {
      return getInvoicePdfDataUrl(invoice);
    } catch (e) {
      console.error('Failed to generate PDF data URL', e);
      return null;
    }
  }, [invoice]);

  const handleDownload = () => {
    downloadInvoicePdf(invoice, `${invoice.invoiceNumber}.pdf`);
  };

  const handlePrint = () => {
    if (pdfDataUrl) {
      const printWindow = window.open(pdfDataUrl, '_blank');
      if (printWindow) {
        printWindow.focus();
      }
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/70 backdrop-blur-xs p-2 sm:p-4 animate-in fade-in">
      <div className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[94vh] sm:max-h-[90vh] flex flex-col overflow-hidden">
        {/* MODAL HEADER */}
        <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 border-b border-slate-200 bg-slate-50">
          <div className="flex min-w-0 items-start gap-3">
            <div className="w-10 h-10 rounded-2xl bg-slate-900 text-white flex items-center justify-center font-black">
              <FileText size={20} className="text-sky-400" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="break-words text-sm font-black text-slate-900 sm:text-base">
                  {documentTitle} {invoice.invoiceNumber}
                </h3>
                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-extrabold rounded-md border border-emerald-200">
                  {invoice.status}
                </span>
              </div>
              <p className="text-xs text-slate-500 font-semibold">
                PDF-weergave van de bevroren verkoopgegevens
              </p>
            </div>
          </div>

          <div className="flex w-full items-center gap-2 sm:w-auto">
            <button
              type="button"
              onClick={handleDownload}
              className="flex h-10 flex-1 items-center justify-center gap-2 px-4 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer sm:flex-none"
            >
              <Download size={15} className="text-sky-400" />
              <span>Download PDF</span>
            </button>
            <button
              type="button"
              onClick={handlePrint}
              aria-label="Factuur afdrukken"
              className="flex h-10 items-center justify-center gap-2 px-3.5 bg-white hover:bg-slate-100 text-slate-800 text-xs font-bold rounded-xl border border-slate-300 transition-all cursor-pointer"
            >
              <Printer size={15} />
              <span className="hidden sm:inline">Afdrukken</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Factuurvoorbeeld sluiten"
              className="flex h-10 w-10 shrink-0 items-center justify-center border border-slate-300 bg-white text-slate-500 hover:text-slate-900 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* MODAL BODY (PDF PREVIEW IFRAME) */}
        <div className="flex min-h-[380px] flex-1 flex-col overflow-hidden bg-slate-100 p-2 sm:min-h-[500px] sm:p-4">
          {pdfDataUrl ? (
            <iframe
              src={pdfDataUrl}
              title={`PDF Preview ${invoice.invoiceNumber}`}
              className="w-full h-full flex-1 rounded-2xl border border-slate-200 shadow-inner bg-white"
            />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-500 space-y-3 bg-white rounded-2xl border border-slate-200 p-8">
              <ShieldCheck size={48} className="text-slate-300 animate-pulse" />
              <p className="text-sm font-bold">Factuurvoorbeeld aan het laden...</p>
            </div>
          )}
        </div>

        {/* MODAL FOOTER */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between text-xs font-semibold text-slate-600 gap-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} className="text-emerald-500" />
            <span>BTW-uitsplitsing en documentreferentie inbegrepen.</span>
          </div>
          <div className="flex items-center gap-3">
            <span>Klant: <strong>{invoice.buyer.name}</strong></span>
            <span>•</span>
            <span>Totaal: <strong className="text-slate-900">{formatEUR(invoice.items.reduce((s, i) => s + i.totalInclCents, 0))}</strong></span>
          </div>
        </div>
      </div>
    </div>
  );
};
