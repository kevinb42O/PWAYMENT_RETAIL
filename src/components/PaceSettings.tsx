import { useLiveQuery } from 'dexie-react-hooks';
import { BrainCircuit, Check, DatabaseZap, ShieldCheck, Sparkles } from 'lucide-react';
import { db } from '../db/db';
import { PaceMark } from '../pace/PaceMark';
import { useMerchantProfile } from '../store/useMerchantProfile';
import { useProducts } from '../store/useProducts';

const Toggle = ({ label, detail, checked, onChange }: { label: string; detail: string; checked: boolean; onChange: (checked: boolean) => void }) => (
  <label className="flex items-start justify-between gap-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
    <span><strong className="block text-sm text-slate-900">{label}</strong><small className="mt-1 block max-w-xl text-xs leading-5 text-slate-500">{detail}</small></span>
    <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-cyan-700" />
  </label>
);

export const PaceSettings = () => {
  const profile = useMerchantProfile((state) => state.profile);
  const updateProfile = useMerchantProfile((state) => state.updateProfile);
  const activeProducts = useProducts((state) => state.list).filter((product) => product.isActive !== false).length;
  const saleCount = useLiveQuery(() => db.transactions.where('kind').equals('sale').count(), [], 0) ?? 0;
  const settings = profile.customerInsightSettings!;
  const policy = profile.commercialReturnPolicy!;

  const updateSettings = (patch: Partial<typeof settings>) => updateProfile({
    customerInsightSettings: { ...settings, ...patch },
  });
  const updatePolicy = (patch: Partial<typeof policy>) => updateProfile({
    commercialReturnPolicy: { ...policy, ...patch },
  });

  return <div className="mx-auto max-w-5xl space-y-6">
    <section className="overflow-hidden rounded-3xl border border-cyan-200 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.18),transparent_42%),linear-gradient(145deg,#f8fafc,#ecfeff)] p-6 shadow-sm md:p-8">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-3xl border border-white/80 bg-white/80 shadow-lg shadow-cyan-900/10"><PaceMark size={62} active emotion="attentive" motionMode="subtle" /></div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.14em] text-cyan-700"><Sparkles size={14} /> PACE · AUTOMATISCHE RETAIL INTELLIGENCE</div>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">Pace leert zelf wat relevant is.</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Aankoopcombinaties, herhaalaankopen, actuele voorraad en retourcontext worden automatisch verwerkt. Een winkeleigenaar hoeft geen aanbevelingsregels te schrijven.</p>
        </div>
        <span className={`inline-flex items-center gap-2 self-start rounded-full px-3 py-2 text-xs font-black ${settings.enabled ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}`}><span className={`h-2 w-2 rounded-full ${settings.enabled ? 'bg-emerald-500' : 'bg-slate-400'}`} />{settings.enabled ? 'Actief' : 'Gepauzeerd'}</span>
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-white bg-white/75 p-4"><strong className="text-xl font-black text-slate-950">{activeProducts}</strong><span className="mt-1 block text-xs font-semibold text-slate-500">actieve producten als kandidaat</span></div>
        <div className="rounded-2xl border border-white bg-white/75 p-4"><strong className="text-xl font-black text-slate-950">{saleCount}</strong><span className="mt-1 block text-xs font-semibold text-slate-500">lokale verkopen als bewijs</span></div>
        <div className="rounded-2xl border border-white bg-white/75 p-4"><strong className="text-xl font-black text-slate-950">100%</strong><span className="mt-1 block text-xs font-semibold text-slate-500">tenant-geïsoleerd</span></div>
      </div>
    </section>

    <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-3">
        <Toggle label="Pace-klantintelligentie" detail="Beschikbaar voor iedere gekoppelde klant. Pace blijft stil wanneer er onvoldoende controleerbaar bewijs is." checked={settings.enabled} onChange={(enabled) => updateSettings({ enabled })} />
        <Toggle label="Retourcontext" detail="Gebruik het commerciële retourvenster als serviceherinnering; wettelijke garantie blijft volledig losstaan." checked={settings.returnRemindersEnabled} onChange={(returnRemindersEnabled) => updateSettings({ returnRemindersEnabled })} />
        <Toggle label="Merk- en herhaalinteresse" detail="Toon alleen feitelijke patronen met voldoende afzonderlijke aankopen en beschikbare voorraad." checked={settings.brandAffinityEnabled} onChange={(brandAffinityEnabled) => updateSettings({ brandAffinityEnabled })} />
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="flex items-start justify-between gap-5"><span><strong className="block text-sm text-slate-900">Commercieel retourvenster</strong><small className="mt-1 block text-xs leading-5 text-slate-500">Wordt gebruikt voor klantservice, niet als juridische garantieclaim.</small></span><input type="checkbox" checked={policy.enabled} onChange={(event) => updatePolicy({ enabled: event.target.checked, ...(event.target.checked ? { effectiveFrom: new Date().toISOString() } : {}) })} className="mt-1 h-4 w-4 accent-cyan-700" /></div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-bold text-slate-600">Retourvenster<input type="number" min={1} max={365} value={policy.windowDays} onChange={(event) => updatePolicy({ windowDays: Math.min(365, Math.max(1, Number(event.target.value) || 1)) })} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900" /></label>
            <label className="text-xs font-bold text-slate-600">Waarschuw vooraf<input type="number" min={0} max={30} value={policy.reminderLeadDays} onChange={(event) => updatePolicy({ reminderLeadDays: Math.min(30, Math.max(0, Number(event.target.value) || 0)) })} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900" /></label>
          </div>
        </div>
      </div>

      <aside className="h-fit rounded-3xl border border-slate-200 bg-slate-950 p-5 text-white shadow-xl">
        <BrainCircuit size={22} className="text-cyan-300" /><h3 className="mt-3 text-sm font-black">Platformmotor</h3>
        <ul className="mt-4 space-y-4 text-xs leading-5 text-slate-300">
          <li className="flex gap-3"><DatabaseZap size={16} className="mt-0.5 shrink-0 text-cyan-300" /><span><strong className="block text-white">Automatisch incrementeel</strong>Nieuwe verkopen versterken productaffiniteiten zonder volledige herberekening.</span></li>
          <li className="flex gap-3"><ShieldCheck size={16} className="mt-0.5 shrink-0 text-cyan-300" /><span><strong className="block text-white">Geen cross-tenant klantdata</strong>Scores zijn per winkel geïsoleerd; alleen generieke platformlogica wordt gedeeld.</span></li>
          <li className="flex gap-3"><Check size={16} className="mt-0.5 shrink-0 text-cyan-300" /><span><strong className="block text-white">Geen autonome verkoopactie</strong>Pace opent hoogstens een catalogusselectie en wijzigt nooit het winkelmandje.</span></li>
        </ul>
      </aside>
    </section>
  </div>;
};
