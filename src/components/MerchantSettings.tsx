import React, { useMemo, useState } from 'react';
import { Plus, RotateCcw, Save, Trash2 } from 'lucide-react';
import { useMerchantProfile } from '../store/useMerchantProfile';
import { useProducts } from '../store/useProducts';
import { useCategories } from '../store/useCategories';
import type { PaceRecommendationMatchKind, PaceRecommendationRule } from '../data/merchant';
import { MerchantTicketPreview } from './MerchantTicketPreview';

export const MerchantSettings: React.FC = () => {
  const profile = useMerchantProfile((state) => state.profile);
  const updateProfile = useMerchantProfile((state) => state.updateProfile);
  const resetProfile = useMerchantProfile((state) => state.resetProfile);
  const products = useProducts((state) => state.list).filter((product) => product.isActive !== false);
  const categories = useCategories((state) => state.list).filter((category) => category.isActive !== false);
  const [draft, setDraft] = useState(profile);
  const [saved, setSaved] = useState(false);

  const canSave = useMemo(() => {
    return draft.name.trim() && draft.addressLine1.trim() && draft.addressLine2.trim() && draft.vatNumber.trim()
      && (draft.paceRecommendationRules ?? []).every((rule) => rule.name.trim() && rule.reason.trim() && rule.trigger.value && rule.recommendation.value && rule.priority >= 1 && rule.priority <= 100);
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

  const brands = useMemo(() => [...new Set(products.map((product) => product.brand?.trim()).filter((brand): brand is string => Boolean(brand)))].sort((a, b) => a.localeCompare(b)), [products]);
  const matchOptions = (kind: PaceRecommendationMatchKind) => kind === 'product'
    ? products.map((product) => ({ value: product.id, label: [product.name, product.variant].filter(Boolean).join(' · ') }))
    : kind === 'brand'
      ? brands.map((brand) => ({ value: brand, label: brand }))
      : categories.map((category) => ({ value: category.id, label: category.name }));
  const updateRecommendationRule = (id: string, patch: Partial<PaceRecommendationRule>) => {
    setSaved(false);
    setDraft((current) => ({
      ...current,
      paceRecommendationRules: (current.paceRecommendationRules ?? []).map((rule) => rule.id === id ? { ...rule, ...patch } : rule),
    }));
  };
  const changeRuleMatchKind = (id: string, side: 'trigger' | 'recommendation', kind: PaceRecommendationMatchKind) => {
    const first = matchOptions(kind)[0]?.value ?? '';
    const current = (draft.paceRecommendationRules ?? []).find((rule) => rule.id === id);
    if (!current) return;
    updateRecommendationRule(id, { [side]: { kind, value: first } });
  };
  const addRecommendationRule = () => {
    const product = products[0];
    if (!product) return;
    const rule: PaceRecommendationRule = {
      id: crypto.randomUUID(),
      name: 'Nieuwe Pace-regel',
      enabled: true,
      trigger: { kind: 'product', value: product.id },
      recommendation: { kind: 'product', value: product.id },
      reason: 'Leg kort uit waarom dit relevant is voor de klant.',
      priority: 65,
      scope: 'store',
    };
    setSaved(false);
    setDraft((current) => ({ ...current, paceRecommendationRules: [...(current.paceRecommendationRules ?? []), rule] }));
  };
  const deleteRecommendationRule = (id: string) => {
    setSaved(false);
    setDraft((current) => ({ ...current, paceRecommendationRules: (current.paceRecommendationRules ?? []).filter((rule) => rule.id !== id) }));
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

          <div className="space-y-3 border-t border-zinc-800 pt-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h4 className="text-sm font-bold text-zinc-100">Actieregels</h4>
                <p className="mt-1 max-w-2xl text-xs leading-5 text-zinc-500">Koppel een eerdere aankoop aan beschikbare catalogusartikelen. Elke regel geldt alleen voor deze winkel en opent uitsluitend een filter—nooit het winkelmandje.</p>
              </div>
              <button type="button" onClick={addRecommendationRule} disabled={products.length === 0 || (draft.paceRecommendationRules?.length ?? 0) >= 100} className="flex items-center gap-2 rounded-lg bg-cyan-700 px-3 py-2 text-xs font-bold text-white hover:bg-cyan-600 disabled:cursor-not-allowed disabled:opacity-40"><Plus size={14} /> Regel toevoegen</button>
            </div>
            {products.length === 0 && <p className="rounded-lg border border-amber-900/50 bg-amber-950/30 p-3 text-xs text-amber-200">Voeg eerst minstens één product toe aan de catalogus.</p>}
            {(draft.paceRecommendationRules ?? []).length === 0 && products.length > 0 && <p className="rounded-lg border border-zinc-800 bg-zinc-950/45 p-3 text-xs text-zinc-500">Nog geen actieregels. Merkinteresse en retourcontext blijven onafhankelijk werken.</p>}
            {(draft.paceRecommendationRules ?? []).map((rule) => (
              <article key={rule.id} className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-950/55 p-3">
                <div className="flex items-center gap-3">
                  <input aria-label="Naam van de Pace-regel" value={rule.name} onChange={(event) => updateRecommendationRule(rule.id, { name: event.target.value })} className="input flex-1 font-semibold" />
                  <label className="flex items-center gap-2 text-xs font-semibold text-zinc-400"><input type="checkbox" checked={rule.enabled} onChange={(event) => updateRecommendationRule(rule.id, { enabled: event.target.checked })} className="h-4 w-4 accent-cyan-500" /> Actief</label>
                  <button type="button" onClick={() => deleteRecommendationRule(rule.id)} aria-label={`Verwijder ${rule.name}`} className="rounded-lg p-2 text-rose-300 hover:bg-rose-950/60"><Trash2 size={15} /></button>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {(['trigger', 'recommendation'] as const).map((side) => {
                    const match = rule[side];
                    const options = matchOptions(match.kind);
                    return <div key={side} className="rounded-lg border border-zinc-800 p-3">
                      <span className="mb-2 block text-[11px] font-bold uppercase tracking-wide text-zinc-500">{side === 'trigger' ? 'Als klant eerder kocht' : 'Toon in catalogus'}</span>
                      <div className="grid gap-2">
                        <select aria-label={`${side} type`} value={match.kind} onChange={(event) => changeRuleMatchKind(rule.id, side, event.target.value as PaceRecommendationMatchKind)} className="input">
                          <option value="product">Product</option><option value="brand">Merk</option><option value="category">Categorie</option>
                        </select>
                        <select aria-label={`${side} waarde`} value={match.value} onChange={(event) => updateRecommendationRule(rule.id, { [side]: { ...match, value: event.target.value } })} className="input">
                          {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </select>
                      </div>
                    </div>;
                  })}
                </div>
                <Field label="Waarom is dit relevant? (zichtbaar als bewijs in Pace)">
                  <input value={rule.reason} onChange={(event) => updateRecommendationRule(rule.id, { reason: event.target.value })} className="input" maxLength={240} />
                </Field>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Prioriteit (1–100)"><input type="number" min={1} max={100} value={rule.priority} onChange={(event) => updateRecommendationRule(rule.id, { priority: Math.min(100, Math.max(1, Number(event.target.value) || 1)) })} className="input" /></Field>
                  <Field label="Geldig vanaf"><input type="date" value={rule.validFrom?.slice(0, 10) ?? ''} onChange={(event) => updateRecommendationRule(rule.id, { validFrom: event.target.value ? `${event.target.value}T00:00:00.000Z` : undefined })} className="input" /></Field>
                  <Field label="Geldig tot en met"><input type="date" value={rule.validUntil?.slice(0, 10) ?? ''} onChange={(event) => updateRecommendationRule(rule.id, { validUntil: event.target.value ? `${event.target.value}T23:59:59.999Z` : undefined })} className="input" /></Field>
                </div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-600">Scope · alleen deze winkel</div>
              </article>
            ))}
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
