import React, { useMemo, useState } from 'react';
import { RotateCcw, Save } from 'lucide-react';
import { useMerchantProfile } from '../store/useMerchantProfile';
import { MerchantTicketPreview } from './MerchantTicketPreview';

export const MerchantSettings: React.FC = () => {
  const profile = useMerchantProfile((state) => state.profile);
  const updateProfile = useMerchantProfile((state) => state.updateProfile);
  const resetProfile = useMerchantProfile((state) => state.resetProfile);
  const [draft, setDraft] = useState(profile);
  const [saved, setSaved] = useState(false);

  const canSave = useMemo(() => {
    return draft.name.trim() && draft.addressLine1.trim() && draft.addressLine2.trim() && draft.vatNumber.trim();
  }, [draft]);

  const set = (key: keyof typeof draft, value: string) => {
    setSaved(false);
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const setReturnPolicy = (
    patch: Partial<NonNullable<typeof draft.commercialReturnPolicy>>,
  ) => {
    setSaved(false);
    setDraft((current) => ({
      ...current,
      commercialReturnPolicy: {
        ...current.commercialReturnPolicy!,
        ...patch,
      },
    }));
  };

  const setCustomerInsights = (
    patch: Partial<NonNullable<typeof draft.customerInsightSettings>>,
  ) => {
    setSaved(false);
    setDraft((current) => ({
      ...current,
      customerInsightSettings: {
        ...current.customerInsightSettings!,
        ...patch,
      },
    }));
  };

  const save = () => {
    if (!canSave) return;
    updateProfile({
      ...draft,
      name: draft.name.trim(),
      legalName: draft.legalName?.trim() || undefined,
      addressLine1: draft.addressLine1.trim(),
      addressLine2: draft.addressLine2.trim(),
      vatNumber: draft.vatNumber.trim().toUpperCase(),
      phone: draft.phone?.trim() || undefined,
      email: draft.email?.trim() || undefined,
      website: draft.website?.trim() || undefined,
      iban: draft.iban?.trim().toUpperCase().replace(/\s+/g, '') || undefined,
      bic: draft.bic?.trim().toUpperCase() || undefined,
      rpr: draft.rpr?.trim() || undefined,
      invoiceTerms: draft.invoiceTerms?.trim() || undefined,
      footer: draft.footer?.trim() || undefined,
      returnPolicy: draft.returnPolicy?.trim() || undefined,
    });
    setSaved(true);
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-4">
      <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-4">
        <div>
          <h2 className="text-lg font-bold">Ticket- en factuuridentiteit</h2>
          <p className="text-sm text-zinc-400">Deze juridische identiteit wordt bevroren op ieder nieuw ticket en iedere factuur. Controleer ze zorgvuldig vóór livegebruik.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Shopnaam op ticket" required>
            <input value={draft.name} onChange={(e) => set('name', e.target.value)} className="input" />
          </Field>
          <Field label="Officiele bedrijfsnaam">
            <input value={draft.legalName ?? ''} onChange={(e) => set('legalName', e.target.value)} className="input" />
          </Field>
          <Field label="Adresregel 1" required>
            <input value={draft.addressLine1} onChange={(e) => set('addressLine1', e.target.value)} className="input" />
          </Field>
          <Field label="Postcode en gemeente" required>
            <input value={draft.addressLine2} onChange={(e) => set('addressLine2', e.target.value)} className="input" />
          </Field>
          <Field label="BTW nummer" required>
            <input value={draft.vatNumber} onChange={(e) => set('vatNumber', e.target.value)} placeholder="BE0123.456.789" className="input" />
          </Field>
          <Field label="Website">
            <input value={draft.website ?? ''} onChange={(e) => set('website', e.target.value)} placeholder="www.voorbeeld.be" className="input" />
          </Field>
          <Field label="Telefoon">
            <input value={draft.phone ?? ''} onChange={(e) => set('phone', e.target.value)} className="input" />
          </Field>
          <Field label="E-mail">
            <input value={draft.email ?? ''} onChange={(e) => set('email', e.target.value)} className="input" />
          </Field>
          <Field label="IBAN voor onbetaalde facturen">
            <input value={draft.iban ?? ''} onChange={(e) => set('iban', e.target.value)} placeholder="BE68 5390 0754 7011" className="input" />
          </Field>
          <Field label="BIC">
            <input value={draft.bic ?? ''} onChange={(e) => set('bic', e.target.value)} placeholder="KREDBEBB" className="input" />
          </Field>
          <Field label="RPR / ondernemingsrechtbank">
            <input value={draft.rpr ?? ''} onChange={(e) => set('rpr', e.target.value)} placeholder="RPR Gent, afdeling Gent" className="input" />
          </Field>
        </div>

        <Field label="Factuurvoorwaarden">
          <textarea value={draft.invoiceTerms ?? ''} onChange={(e) => set('invoiceTerms', e.target.value)} rows={3} placeholder="Alleen door uw accountant/juridisch adviseur goedgekeurde tekst." className="input resize-none" />
        </Field>

        <Field label="Ticket footer">
          <textarea value={draft.footer ?? ''} onChange={(e) => set('footer', e.target.value)} rows={2} className="input resize-none" />
        </Field>
        <Field label="Retourbeleid op ticket">
          <textarea value={draft.returnPolicy ?? ''} onChange={(e) => set('returnPolicy', e.target.value)} rows={2} className="input resize-none" />
        </Field>

        <section className="rounded-xl border border-cyan-900/60 bg-cyan-950/25 p-4 space-y-4">
          <div>
            <h3 className="text-sm font-bold text-cyan-100">Pace · klantcontext</h3>
            <p className="mt-1 text-xs leading-5 text-zinc-400">
              Pace berekent deze service-inzichten lokaal binnen deze winkel. Klant- en aankoopdata worden niet naar Pace AI gestuurd.
            </p>
          </div>
          <label className="flex items-start justify-between gap-4 text-sm font-semibold">
            <span><span className="block text-zinc-100">Klantcontext activeren</span><span className="mt-1 block text-xs font-normal text-zinc-500">Toon alleen na een bewuste klantkoppeling aan de kassa.</span></span>
            <input type="checkbox" checked={draft.customerInsightSettings?.enabled === true} onChange={(event) => setCustomerInsights({ enabled: event.target.checked })} className="mt-1 h-4 w-4 accent-cyan-500" />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="rounded-lg border border-zinc-800 bg-zinc-950/45 p-3 text-xs font-semibold text-zinc-300">
              <span className="flex items-center justify-between gap-3"><span>Retourherinneringen</span><input type="checkbox" checked={draft.customerInsightSettings?.returnRemindersEnabled === true} onChange={(event) => setCustomerInsights({ returnRemindersEnabled: event.target.checked })} className="h-4 w-4 accent-cyan-500" /></span>
            </label>
            <label className="rounded-lg border border-zinc-800 bg-zinc-950/45 p-3 text-xs font-semibold text-zinc-300">
              <span className="flex items-center justify-between gap-3"><span>Merkinteresse</span><input type="checkbox" checked={draft.customerInsightSettings?.brandAffinityEnabled === true} onChange={(event) => setCustomerInsights({ brandAffinityEnabled: event.target.checked })} className="h-4 w-4 accent-cyan-500" /></span>
            </label>
          </div>
          <div className="border-t border-zinc-800 pt-4">
            <label className="flex items-start justify-between gap-4 text-sm font-semibold">
              <span><span className="block text-zinc-100">Commerciële retourtermijn berekenen</span><span className="mt-1 block text-xs font-normal text-zinc-500">Dit staat los van wettelijke garantie en vervangt de tickettekst niet.</span></span>
              <input
                type="checkbox"
                checked={draft.commercialReturnPolicy?.enabled === true}
                onChange={(event) => setReturnPolicy({
                  enabled: event.target.checked,
                  ...(event.target.checked ? { effectiveFrom: new Date().toISOString() } : {}),
                })}
                className="mt-1 h-4 w-4 accent-cyan-500"
              />
            </label>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="Retourvenster (kalenderdagen)">
                <input type="number" min={1} max={365} value={draft.commercialReturnPolicy?.windowDays ?? 14} onChange={(event) => setReturnPolicy({ windowDays: Math.min(365, Math.max(1, Number(event.target.value) || 1)) })} className="input" />
              </Field>
              <Field label="Waarschuw vooraf (dagen)">
                <input type="number" min={0} max={30} value={draft.commercialReturnPolicy?.reminderLeadDays ?? 2} onChange={(event) => setReturnPolicy({ reminderLeadDays: Math.min(30, Math.max(0, Number(event.target.value) || 0)) })} className="input" />
              </Field>
            </div>
          </div>
        </section>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-800 pt-4">
          <button
            onClick={() => {
              resetProfile();
              setDraft(useMerchantProfile.getState().profile);
              setSaved(false);
            }}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm font-semibold"
          >
            <RotateCcw size={16} /> Reset demo
          </button>
          <div className="flex items-center gap-3">
            {saved && <span className="text-sm text-emerald-300">Opgeslagen</span>}
            <button
              onClick={save}
              disabled={!canSave}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-500 font-semibold"
            >
              <Save size={16} /> Opslaan
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <div className="mb-3">
          <h2 className="text-lg font-bold">Live preview</h2>
          <p className="text-sm text-zinc-400">Thermal layout met correcte Belgische BTW-uitsplitsing.</p>
        </div>
        <div className="overflow-auto rounded-lg bg-zinc-950 p-3">
          <MerchantTicketPreview merchant={draft} />
        </div>
      </section>
    </div>
  );
};

const Field: React.FC<{ label: string; required?: boolean; children: React.ReactNode }> = ({ label, required, children }) => (
  <label className="block">
    <span className="block text-xs font-medium text-zinc-400 mb-1 uppercase tracking-wide">
      {label}{required ? ' *' : ''}
    </span>
    {children}
  </label>
);
