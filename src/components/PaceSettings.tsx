import type { ReactNode } from 'react';
import { Check, HeartHandshake, PackageCheck, ReceiptText, ShieldCheck, Sparkles, UserRoundCheck } from 'lucide-react';
import { PaceMark } from '../pace/PaceMark';
import { useMerchantProfile } from '../store/useMerchantProfile';
import { useProducts } from '../store/useProducts';

const SettingSwitch = ({ label, detail, checked, onChange, icon, emphasis = false }: {
  label: string;
  detail: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  icon: ReactNode;
  emphasis?: boolean;
}) => (
  <label className={`flex cursor-pointer items-start gap-4 rounded-2xl border p-4 transition-colors ${emphasis ? 'border-cyan-200 bg-cyan-50/70' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
    <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${emphasis ? 'bg-cyan-100 text-cyan-800' : 'bg-slate-100 text-slate-600'}`}>{icon}</span>
    <span className="min-w-0 flex-1">
      <strong className="block text-sm font-extrabold text-slate-950">{label}</strong>
      <span className="mt-1 block max-w-2xl text-xs leading-5 text-slate-600">{detail}</span>
    </span>
    <span className="relative mt-1 shrink-0">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="peer sr-only" />
      <span className="block h-6 w-11 rounded-full bg-slate-300 transition-colors peer-checked:bg-cyan-700 peer-focus-visible:ring-2 peer-focus-visible:ring-cyan-500 peer-focus-visible:ring-offset-2" />
      <span className="absolute left-1 top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-5" />
    </span>
  </label>
);

export const PaceSettings = () => {
  const profile = useMerchantProfile((state) => state.profile);
  const updateProfile = useMerchantProfile((state) => state.updateProfile);
  const activeProducts = useProducts((state) => state.list).filter((product) => product.isActive !== false).length;
  const settings = profile.customerInsightSettings!;
  const policy = profile.commercialReturnPolicy!;

  const updateSettings = (patch: Partial<typeof settings>) => updateProfile({ customerInsightSettings: { ...settings, ...patch } });
  const updatePolicy = (patch: Partial<typeof policy>) => updateProfile({ commercialReturnPolicy: { ...policy, ...patch } });
  const returnHelpEnabled = settings.returnRemindersEnabled && policy.enabled;
  const setReturnHelpEnabled = (enabled: boolean) => {
    updateProfile({
      customerInsightSettings: { ...settings, returnRemindersEnabled: enabled },
      commercialReturnPolicy: {
        ...policy,
        enabled,
        ...(enabled && !policy.enabled ? { effectiveFrom: new Date().toISOString() } : {}),
      },
    });
  };

  return <div className="mx-auto max-w-6xl space-y-5 pb-8">
    <section className="relative overflow-hidden rounded-[28px] bg-slate-950 px-6 py-7 text-white shadow-xl shadow-slate-900/10 md:px-8 md:py-9">
      <div className="absolute -right-20 -top-28 h-72 w-72 rounded-full bg-cyan-400/20 blur-3xl" />
      <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-3xl border border-white/10 bg-white shadow-2xl"><PaceMark size={62} active emotion="attentive" motionMode="subtle" /></div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.16em] text-cyan-300"><Sparkles size={14} /> Pace voor jouw team</div>
          <h2 className="mt-2 max-w-3xl text-2xl font-black tracking-tight sm:text-3xl">Persoonlijke service, zonder alles te hoeven onthouden.</h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">Wanneer je een terugkerende klant koppelt, brengt Pace relevante aankopen, voorkeuren en retourmomenten onder de aandacht. Je medewerker kiest altijd zelf wat past in het gesprek.</p>
        </div>
        <span className={`inline-flex shrink-0 items-center gap-2 self-start rounded-full px-3 py-2 text-xs font-black ${settings.enabled ? 'bg-emerald-400/15 text-emerald-200 ring-1 ring-emerald-300/25' : 'bg-white/10 text-slate-300 ring-1 ring-white/10'}`}><span className={`h-2 w-2 rounded-full ${settings.enabled ? 'bg-emerald-400' : 'bg-slate-400'}`} />{settings.enabled ? 'Pace helpt mee' : 'Pace is gepauzeerd'}</span>
      </div>
      <div className="relative mt-6 flex flex-wrap gap-x-6 gap-y-2 border-t border-white/10 pt-5 text-xs font-semibold text-slate-300">
        <span className="flex items-center gap-2"><Check size={15} className="text-cyan-300" /> Werkt zodra een klant is gekoppeld</span>
        <span className="flex items-center gap-2"><PackageCheck size={15} className="text-cyan-300" /> Kiest uit {activeProducts} beschikbare artikelen</span>
        <span className="flex items-center gap-2"><ShieldCheck size={15} className="text-cyan-300" /> Klantgegevens blijven binnen jouw winkel</span>
      </div>
    </section>

    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-5">
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
          <div className="mb-5">
            <h3 className="text-base font-black text-slate-950">Welke hulp wil je inschakelen?</h3>
            <p className="mt-1 text-xs leading-5 text-slate-500">Je wijzigingen worden automatisch bewaard.</p>
          </div>
          <div className="space-y-3">
            <SettingSwitch label="Persoonlijke verkoophulp" detail="Laat Pace relevante klantinzichten en passende producten tonen aan je medewerker. Zet dit uit om alle klantgerichte hulp tijdelijk te pauzeren." checked={settings.enabled} onChange={(enabled) => updateSettings({ enabled })} icon={<HeartHandshake size={18} />} emphasis />
            <SettingSwitch label="Merkvoorkeuren herkennen" detail="Laat Pace terugkerende merken benoemen wanneer een klant daar meermaals iets van kocht en er passende artikelen beschikbaar zijn." checked={settings.brandAffinityEnabled} onChange={(brandAffinityEnabled) => updateSettings({ brandAffinityEnabled })} icon={<Sparkles size={18} />} />
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
          <div className="mb-4 flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700"><ReceiptText size={18} /></span>
            <div><h3 className="text-base font-black text-slate-950">Retourservice</h3><p className="mt-1 text-xs leading-5 text-slate-500">Help medewerkers om op het juiste moment te vragen of een aankoop helemaal in orde is.</p></div>
          </div>
          <SettingSwitch label="Retourherinneringen tonen" detail="Pace kan bij een gekoppelde klant een vriendelijke herinnering tonen zolang jouw retourtermijn nog loopt." checked={returnHelpEnabled} onChange={setReturnHelpEnabled} icon={<ReceiptText size={18} />} />
          {returnHelpEnabled && <div className="mt-4 grid gap-3 rounded-2xl bg-slate-50 p-4 sm:grid-cols-2">
            <label className="text-xs font-bold text-slate-700">Retour mogelijk gedurende
              <span className="relative mt-1.5 block"><input type="number" min={1} max={365} value={policy.windowDays} onChange={(event) => updatePolicy({ windowDays: Math.min(365, Math.max(1, Number(event.target.value) || 1)) })} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 pr-14 text-sm font-semibold text-slate-900 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100" /><span className="pointer-events-none absolute right-3 top-2.5 font-medium text-slate-400">dagen</span></span>
            </label>
            <label className="text-xs font-bold text-slate-700">Herinner vanaf
              <span className="relative mt-1.5 block"><input type="number" min={0} max={30} value={policy.reminderLeadDays} onChange={(event) => updatePolicy({ reminderLeadDays: Math.min(30, Math.max(0, Number(event.target.value) || 0)) })} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 pr-20 text-sm font-semibold text-slate-900 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100" /><span className="pointer-events-none absolute right-3 top-2.5 font-medium text-slate-400">dagen vooraf</span></span>
            </label>
            <p className="text-[11px] leading-5 text-slate-500 sm:col-span-2">Deze instelling ondersteunt jouw eigen winkelservice en verandert niets aan de wettelijke garantierechten van de klant.</p>
          </div>}
        </section>
      </div>

      <aside className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm lg:sticky lg:top-6">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-800"><UserRoundCheck size={20} /></span>
        <h3 className="mt-4 text-base font-black text-slate-950">Zo helpt Pace in de winkel</h3>
        <ol className="mt-5 space-y-5">
          {[
            ['1', 'Koppel de klant', 'Zoek de klant op of scan de klantenkaart tijdens het bezoek.'],
            ['2', 'Pace kijkt mee', 'Relevante aankopen, voorkeuren en handige aandachtspunten verschijnen vanzelf.'],
            ['3', 'Je medewerker beslist', 'Een tip kan worden gebruikt of genegeerd. Pace voegt nooit zelf iets toe aan het winkelmandje.'],
          ].map(([number, title, detail]) => <li key={number} className="flex gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-950 text-[11px] font-black text-white">{number}</span><span><strong className="block text-xs font-extrabold text-slate-900">{title}</strong><span className="mt-1 block text-xs leading-5 text-slate-500">{detail}</span></span></li>)}
        </ol>
        <div className="mt-6 rounded-2xl bg-slate-50 p-4">
          <div className="flex items-center gap-2 text-xs font-extrabold text-slate-800"><ShieldCheck size={16} className="text-emerald-600" /> Vertrouwd omgaan met klantgegevens</div>
          <p className="mt-2 text-[11px] leading-5 text-slate-500">Aankoopgegevens worden alleen gebruikt om het team van deze winkel te helpen en worden nooit met andere winkels gedeeld.</p>
        </div>
      </aside>
    </div>
  </div>;
};
