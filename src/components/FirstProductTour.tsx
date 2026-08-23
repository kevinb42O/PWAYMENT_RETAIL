import React, { useState } from "react";
import { ArrowRight, CheckCircle2, Package, Receipt, ScanLine, Sparkles } from "lucide-react";
import { Modal } from "./Modal";

interface FirstProductTourProps {
  productName: string;
  onClose: () => void;
  onOpenPos: () => void;
  onOpenCatalog: () => void;
}

const TOUR = ["product", "pos", "catalog"] as const;

export const FirstProductTour: React.FC<FirstProductTourProps> = ({
  productName,
  onClose,
  onOpenPos,
  onOpenCatalog,
}) => {
  const [step, setStep] = useState(0);
  const current = TOUR[step];

  const goToPos = () => {
    onOpenPos();
    setStep(1);
  };

  const goToCatalog = () => {
    onOpenCatalog();
    setStep(2);
  };

  return (
    <Modal
      open
      onClose={onClose}
      closeOnBackdrop
      size="lg"
      icon={<Sparkles size={20} />}
      title={step === 0 ? "Je eerste product staat klaar" : "Een snelle rondleiding"}
      subtitle={`Stap ${step + 1} van ${TOUR.length} · Je kunt deze uitleg altijd sluiten.`}
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <div className="flex gap-1.5" aria-label={`Stap ${step + 1} van ${TOUR.length}`}>
            {TOUR.map((item, index) => <span key={item} className={`h-1.5 rounded-full ${index === step ? "w-7 bg-sky-600" : index < step ? "w-1.5 bg-emerald-500" : "w-1.5 bg-slate-200"}`} />)}
          </div>
          <button type="button" onClick={onClose} className="text-xs font-bold text-slate-600 hover:text-slate-950">{step === 2 ? "Klaar, ik ga verkopen" : "Rondleiding sluiten"}</button>
        </div>
      }
    >
      {current === "product" && (
        <div className="space-y-5 py-2">
          <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-6 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-lg shadow-emerald-600/20"><CheckCircle2 size={24} /></span>
            <h3 className="mt-4 text-lg font-black text-slate-950">{productName} staat in je catalogus.</h3>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">Je product is nu beschikbaar aan de kassa. We tonen je in twee korte stappen waar je verkoopt en waar je later alles beheert.</p>
          </div>
          <button type="button" onClick={goToPos} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-extrabold text-white hover:bg-black"><ScanLine size={17} /> Toon me de kassa <ArrowRight size={16} /></button>
        </div>
      )}

      {current === "pos" && (
        <div className="space-y-5 py-2">
          <div className="rounded-2xl border border-sky-200 bg-sky-50 p-5">
            <div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-600 text-white"><Receipt size={19} /></span><div><p className="text-sm font-black text-slate-950">Hier maak je een verkoop.</p><p className="mt-1 text-xs leading-5 text-slate-600">Zoek bovenaan op naam, scan een barcode of kies je product uit de catalogus. Daarna verschijnt het rechts in je winkelmand.</p></div></div>
            <div className="mt-4 rounded-xl border border-sky-100 bg-white px-4 py-3 text-xs font-bold text-sky-900">Tip: typ “{productName}” in de zoekbalk om het meteen terug te vinden.</div>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" onClick={() => setStep(2)} className="min-h-10 rounded-xl px-3 text-xs font-bold text-slate-600 hover:bg-slate-100">Sla dit over</button><button type="button" onClick={goToCatalog} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-extrabold text-white hover:bg-black"><Package size={16} /> Toon productbeheer <ArrowRight size={16} /></button></div>
        </div>
      )}

      {current === "catalog" && (
        <div className="space-y-5 py-2">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5"><div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-white"><Package size={19} /></span><div><p className="text-sm font-black text-slate-950">Hier groeit je assortiment.</p><p className="mt-1 text-xs leading-5 text-slate-600">In Productbeheer pas je prijs, voorraad, barcode en categorie aan. Bovenaan voeg je producten toe of importeer je een volledige lijst.</p></div></div></div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs leading-5 text-emerald-900"><strong>Je bent vertrokken.</strong> Je zaakgegevens, eerste product en de weg naar je kassa zijn nu duidelijk. De rest kun je rustig verder opbouwen.</div>
          <button type="button" onClick={onClose} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-extrabold text-white hover:bg-black">Klaar, ik ga verkopen <ArrowRight size={16} /></button>
        </div>
      )}
    </Modal>
  );
};
