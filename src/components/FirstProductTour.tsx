import React, { useState } from "react";
import { ArrowRight, CheckCircle2, Package, ScanLine, X } from "lucide-react";

interface FirstProductTourProps {
  productName: string;
  onClose: () => void;
  onOpenPos: () => void;
  onOpenCatalog: () => void;
}

const TOUR = ["product", "pos", "catalog"] as const;

/** A coach card, deliberately not a modal: the underlying workspace stays usable. */
export const FirstProductTour: React.FC<FirstProductTourProps> = ({
  productName,
  onClose,
  onOpenPos,
  onOpenCatalog,
}) => {
  const [step, setStep] = useState(0);
  const current = TOUR[step];
  const moveTo = (next: number, action?: () => void) => {
    action?.();
    setStep(next);
  };
  const content = current === "product"
    ? { Icon: CheckCircle2, tone: "bg-emerald-600", title: `${productName} staat klaar.`, body: "Je product staat nu in je catalogus en kan meteen verkocht worden.", action: "Toon me de kassa", onAction: () => moveTo(1, onOpenPos) }
    : current === "pos"
      ? { Icon: ScanLine, tone: "bg-sky-600", title: "Hier maak je een verkoop.", body: `Zoek bovenaan op “${productName}”, scan een barcode of kies een product uit de catalogus. Je winkelmand staat rechts.`, action: "Toon productbeheer", onAction: () => moveTo(2, onOpenCatalog) }
      : { Icon: Package, tone: "bg-slate-950", title: "Hier groeit je assortiment.", body: "Je past hier prijs, voorraad, barcode en categorie aan. Bovenaan voeg je producten toe of importeer je een volledige lijst.", action: "Klaar, ik ga verkopen", onAction: onClose };
  const Icon = content.Icon;

  return (
    <aside aria-label="Rondleiding voor je eerste product" aria-live="polite" className="fixed bottom-4 right-4 z-[70] w-[calc(100vw-2rem)] max-w-sm overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_22px_60px_-24px_rgba(15,23,42,0.4)] sm:bottom-6 sm:right-6">
      <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/85 px-4 py-3">
        <div className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Snelle rondleiding</div>
        <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-800" aria-label="Rondleiding sluiten"><X size={16} /></button>
      </div>
      <div className="p-4">
        <div className="flex gap-3">
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${content.tone} text-white shadow-sm`}><Icon size={19} /></span>
          <div className="min-w-0"><p className="text-sm font-black text-slate-950">{content.title}</p><p className="mt-1 text-xs leading-5 text-slate-600">{content.body}</p></div>
        </div>
        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="flex gap-1.5" aria-label={`Stap ${step + 1} van ${TOUR.length}`}>{TOUR.map((item, index) => <span key={item} className={`h-1.5 rounded-full ${index === step ? "w-6 bg-sky-600" : index < step ? "w-1.5 bg-emerald-500" : "w-1.5 bg-slate-200"}`} />)}</div>
          <button type="button" onClick={content.onAction} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-slate-950 px-3 text-xs font-extrabold text-white hover:bg-black">{content.action} <ArrowRight size={14} /></button>
        </div>
        {step === 1 && <button type="button" onClick={() => setStep(2)} className="mt-2 text-[11px] font-bold text-slate-500 hover:text-slate-900">Sla deze stap over</button>}
      </div>
    </aside>
  );
};
