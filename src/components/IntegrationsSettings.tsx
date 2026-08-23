import React, { useMemo, useState } from 'react';
import { FeatureGate } from '../billing/FeatureGate';
import { canUseFeature, FEATURE_KEYS } from '../billing/entitlements';
import {
  Activity,
  AlertCircle,
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpFromLine,
  BookOpen,
  Boxes,
  Check,
  CheckCircle2,
  ChevronRight,
  CirclePause,
  CirclePlay,
  Clock3,
  Cloud,
  Code2,
  Copy,
  CreditCard,
  Database,
  ExternalLink,
  Eye,
  EyeOff,
  FileSpreadsheet,
  Filter,
  Globe2,
  KeyRound,
  Link2,
  Loader2,
  PackageSearch,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  ShoppingBag,
  Store,
  Trash2,
  Truck,
  Webhook,
  X,
  Zap,
} from 'lucide-react';
import {
  FieldMapping,
  IntegrationAuthType,
  IntegrationCategory,
  IntegrationConfig,
  IntegrationStatus,
  NewIntegrationInput,
  SyncDirection,
  SyncSchedule,
  useIntegrations,
} from '../store/useIntegrations';

type Section = 'overview' | 'suppliers' | 'channels' | 'finance' | 'developer' | 'activity';

interface ProviderTemplate {
  name: string;
  provider: string;
  category: IntegrationCategory;
  description: string;
  color: string;
  icon: React.ReactNode;
  baseUrl?: string;
  authType?: IntegrationAuthType;
  resources: string[];
}

const providerTemplates: ProviderTemplate[] = [
  {
    name: 'Leverancier REST API',
    provider: 'Custom REST',
    category: 'supplier',
    description: 'Producten, barcodes, inkoopprijzen en voorraad rechtstreeks inlezen.',
    color: 'bg-slate-100 text-slate-900 border-slate-200',
    icon: <Truck size={18} />,
    resources: ['products', 'inventory', 'prices'],
  },
  {
    name: 'Leverancier GraphQL',
    provider: 'Custom GraphQL',
    category: 'supplier',
    description: 'Flexibele catalogus- en voorraadfeed met eigen query-endpoint.',
    color: 'bg-slate-100 text-slate-900 border-slate-200',
    icon: <Boxes size={18} />,
    resources: ['products', 'inventory', 'prices'],
  },
  {
    name: 'SFTP / CSV Feed',
    provider: 'SFTP Import',
    category: 'supplier',
    description: 'Geplande import van CSV-, XML- of JSON-bestanden van uw leverancier.',
    color: 'bg-slate-100 text-slate-900 border-slate-200',
    icon: <FileSpreadsheet size={18} />,
    authType: 'sftp',
    resources: ['products', 'inventory'],
  },
  {
    name: 'Shopify',
    provider: 'Shopify',
    category: 'commerce',
    description: 'Producten, orders, klanten en voorraad in twee richtingen synchroniseren.',
    color: 'bg-slate-100 text-slate-900 border-slate-200',
    icon: <ShoppingBag size={18} />,
    authType: 'oauth2',
    resources: ['products', 'inventory', 'orders', 'customers'],
  },
  {
    name: 'WooCommerce',
    provider: 'WooCommerce',
    category: 'commerce',
    description: 'Koppel uw webshop via de beveiligde WooCommerce REST API.',
    color: 'bg-slate-100 text-slate-900 border-slate-200',
    icon: <Store size={18} />,
    resources: ['products', 'inventory', 'orders', 'customers'],
  },
  {
    name: 'Custom Webshop',
    provider: 'Custom Commerce API',
    category: 'commerce',
    description: 'Een eigen webshop of marketplace aansluiten op Pwayment Retail.',
    color: 'bg-slate-100 text-slate-900 border-slate-200',
    icon: <Globe2 size={18} />,
    resources: ['products', 'inventory', 'orders'],
  },
  {
    name: 'Exact Online',
    provider: 'Exact Online',
    category: 'accounting',
    description: 'Dagontvangsten, btw, betaalmethodes en Z-rapporten doorboeken.',
    color: 'bg-slate-100 text-slate-900 border-slate-200',
    icon: <BookOpen size={18} />,
    authType: 'oauth2',
    baseUrl: 'https://start.exactonline.be',
    resources: ['z-reports', 'invoices', 'payments'],
  },
  {
    name: 'Moneybird',
    provider: 'Moneybird',
    category: 'accounting',
    description: 'Omzet, facturen en betaalstatussen automatisch uitwisselen.',
    color: 'bg-slate-100 text-slate-900 border-slate-200',
    icon: <Database size={18} />,
    authType: 'oauth2',
    baseUrl: 'https://moneybird.com',
    resources: ['invoices', 'payments'],
  },
  {
    name: 'Mollie',
    provider: 'Mollie',
    category: 'payment',
    description: 'Betalingen en terugbetalingen opvolgen naast uw kassatransacties.',
    color: 'bg-slate-100 text-slate-900 border-slate-200',
    icon: <CreditCard size={18} />,
    baseUrl: 'https://api.mollie.com/v2',
    resources: ['payments', 'refunds'],
  },
  {
    name: 'Stripe',
    provider: 'Stripe',
    category: 'payment',
    description: 'Online betaalstatussen, refunds en transactiereferenties synchroniseren.',
    color: 'bg-slate-100 text-slate-900 border-slate-200',
    icon: <CreditCard size={18} />,
    baseUrl: 'https://api.stripe.com/v1',
    resources: ['payments', 'refunds'],
  },
];

const resourceLabels: Record<string, string> = {
  products: 'Producten',
  inventory: 'Voorraad',
  prices: 'Inkoop- & verkoopprijzen',
  orders: 'Bestellingen',
  customers: 'Klanten',
  'z-reports': 'Z-rapporten',
  invoices: 'Facturen',
  payments: 'Betalingen',
  refunds: 'Terugbetalingen',
};

const eventLabels: Record<string, string> = {
  'sale.created': 'Verkoop aangemaakt',
  'sale.refunded': 'Verkoop terugbetaald',
  'product.updated': 'Product gewijzigd',
  'stock.changed': 'Voorraad gewijzigd',
  'customer.updated': 'Klant gewijzigd',
  'giftcard.used': 'Cadeaubon gebruikt',
  'zreport.closed': 'Z-rapport afgesloten',
};

const defaultMappings = (): Omit<FieldMapping, 'id'>[] => [
  { source: 'sku', target: 'sku', enabled: true },
  { source: 'ean', target: 'barcode', enabled: true },
  { source: 'name', target: 'name', enabled: true },
  { source: 'stock', target: 'stockQty', enabled: true },
  { source: 'price', target: 'priceCents', enabled: true },
];

const emptyForm = (template?: ProviderTemplate): NewIntegrationInput => ({
  name: template?.name ?? '',
  provider: template?.provider ?? '',
  category: template?.category ?? 'supplier',
  baseUrl: template?.baseUrl ?? '',
  authType: template?.authType ?? 'api-key',
  username: '',
  credential: '',
  resources: template?.resources ?? ['products', 'inventory'],
  direction: template?.category === 'supplier' ? 'import' : 'bidirectional',
  schedule: 'hourly',
  mappings: defaultMappings(),
});

const formatDate = (value?: string) => {
  if (!value) return 'Nog nooit';
  return new Intl.DateTimeFormat('nl-BE', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
};

const statusStyle: Record<IntegrationStatus, { label: string; className: string }> = {
  connected: { label: 'Verbonden', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  attention: { label: 'Aandacht nodig', className: 'bg-rose-50 text-rose-700 border-rose-200' },
  paused: { label: 'Gepauzeerd', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  disconnected: { label: 'Niet getest', className: 'bg-slate-50 text-slate-600 border-slate-200' },
  testing: { label: 'Controleren…', className: 'bg-sky-50 text-sky-700 border-sky-200' },
};

const categoryLabels: Record<IntegrationCategory, string> = {
  supplier: 'Leverancier',
  commerce: 'Verkoopkanaal',
  accounting: 'Boekhouding',
  payment: 'Payment',
  custom: 'Maatwerk',
};

const copyText = async (value: string) => {
  if (navigator.clipboard) await navigator.clipboard.writeText(value);
};

const ModalShell: React.FC<{
  title: string;
  subtitle: string;
  onClose: () => void;
  children: React.ReactNode;
}> = ({ title, subtitle, onClose, children }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-500/25 p-3 backdrop-blur-[2px]">
    <div className="max-h-[94vh] w-full max-w-3xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl">
      <div className="flex items-start justify-between border-b border-slate-100 px-6 py-5">
        <div>
          <h2 className="text-lg font-black text-slate-900">{title}</h2>
          <p className="mt-1 text-xs font-medium text-slate-500">{subtitle}</p>
        </div>
        <button onClick={onClose} className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 hover:bg-slate-50" aria-label="Sluiten">
          <X size={18} />
        </button>
      </div>
      <div className="max-h-[calc(94vh-88px)] overflow-y-auto">{children}</div>
    </div>
  </div>
);

const IntegrationForm: React.FC<{
  initial: NewIntegrationInput;
  editing?: boolean;
  onCancel: () => void;
  onSave: (value: NewIntegrationInput) => void;
}> = ({ initial, editing, onCancel, onSave }) => {
  const [form, setForm] = useState(initial);
  const [showCredential, setShowCredential] = useState(false);
  const [error, setError] = useState('');

  const update = <K extends keyof NewIntegrationInput>(key: K, value: NewIntegrationInput[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.name.trim() || !form.provider.trim() || !form.baseUrl.trim()) {
      setError('Naam, provider en endpoint zijn verplicht.');
      return;
    }
    if (!editing && form.authType !== 'oauth2' && !form.credential?.trim()) {
      setError('Stel een API-sleutel, token of wachtwoord in.');
      return;
    }
    if (form.resources.length === 0) {
      setError('Kies minstens één gegevensstroom.');
      return;
    }
    onSave(form);
  };

  const setMapping = (index: number, key: 'source' | 'target', value: string) => {
    update('mappings', form.mappings.map((mapping, mappingIndex) =>
      mappingIndex === index ? { ...mapping, [key]: value } : mapping,
    ));
  };

  return (
    <form onSubmit={submit} className="space-y-7 p-6">
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-700">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      <section>
        <div className="mb-3 flex items-center gap-2 text-sm font-black text-slate-900"><Settings2 size={17} className="text-slate-700" /> Basisconfiguratie</div>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1.5 text-xs font-bold text-slate-700">Naam in Pwayment
            <input value={form.name} onChange={(event) => update('name', event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-900" placeholder="Bijv. Hoofdleverancier Benelux" />
          </label>
          <label className="space-y-1.5 text-xs font-bold text-slate-700">Provider / leverancier
            <input value={form.provider} onChange={(event) => update('provider', event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-900" placeholder="Bijv. Brand Distribution Europe" />
          </label>
          <label className="space-y-1.5 text-xs font-bold text-slate-700">Type koppeling
            <select value={form.category} onChange={(event) => update('category', event.target.value as IntegrationCategory)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-900">
              {Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="space-y-1.5 text-xs font-bold text-slate-700">API-endpoint
            <input value={form.baseUrl} onChange={(event) => update('baseUrl', event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-900" placeholder={form.authType === 'sftp' ? 'sftp://feeds.leverancier.be' : 'https://api.leverancier.be/v1'} />
          </label>
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center gap-2 text-sm font-black text-slate-900"><ShieldCheck size={17} className="text-slate-700" /> Authenticatie</div>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1.5 text-xs font-bold text-slate-700">Methode
            <select value={form.authType} onChange={(event) => update('authType', event.target.value as IntegrationAuthType)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-900">
              <option value="api-key">API key</option>
              <option value="bearer">Bearer token</option>
              <option value="basic">Gebruikersnaam + wachtwoord</option>
              <option value="oauth2">OAuth 2.0</option>
              <option value="sftp">SFTP sleutel / wachtwoord</option>
            </select>
          </label>
          {(form.authType === 'basic' || form.authType === 'sftp') && (
            <label className="space-y-1.5 text-xs font-bold text-slate-700">Gebruikersnaam
              <input value={form.username ?? ''} onChange={(event) => update('username', event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-900" />
            </label>
          )}
          {form.authType !== 'oauth2' && (
            <label className="space-y-1.5 text-xs font-bold text-slate-700 md:col-span-2">{editing ? 'Nieuw geheim (leeg laten om te behouden)' : 'API-sleutel / token / wachtwoord'}
              <div className="relative">
                <input type={showCredential ? 'text' : 'password'} value={form.credential ?? ''} onChange={(event) => update('credential', event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 pr-11 text-sm outline-none focus:border-slate-900" autoComplete="new-password" />
                <button type="button" onClick={() => setShowCredential((value) => !value)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 hover:bg-slate-50 cursor-pointer" aria-label="Geheim tonen of verbergen">
                  {showCredential ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </label>
          )}
        </div>
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-[11px] font-medium leading-relaxed text-slate-700">
          <ShieldCheck size={16} className="mt-0.5 shrink-0" /> Geheime waarden worden na opslaan niet opnieuw leesbaar getoond. Alleen de laatste vier tekens blijven zichtbaar voor herkenning.
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center gap-2 text-sm font-black text-slate-900"><ArrowLeftRight size={17} className="text-slate-700" /> Gegevens & planning</div>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1.5 text-xs font-bold text-slate-700">Richting
            <select value={form.direction} onChange={(event) => update('direction', event.target.value as SyncDirection)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-900">
              <option value="import">Importeren naar Pwayment</option>
              <option value="export">Exporteren vanuit Pwayment</option>
              <option value="bidirectional">Twee richtingen</option>
            </select>
          </label>
          <label className="space-y-1.5 text-xs font-bold text-slate-700">Automatische frequentie
            <select value={form.schedule} onChange={(event) => update('schedule', event.target.value as SyncSchedule)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-900">
              <option value="manual">Alleen handmatig</option>
              <option value="15m">Iedere 15 minuten</option>
              <option value="hourly">Ieder uur</option>
              <option value="daily">Dagelijks</option>
            </select>
          </label>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 md:grid-cols-3">
          {Object.entries(resourceLabels).map(([value, label]) => {
            const checked = form.resources.includes(value);
            return (
              <label key={value} className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-bold transition-colors ${checked ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
                <input type="checkbox" checked={checked} onChange={() => update('resources', checked ? form.resources.filter((item) => item !== value) : [...form.resources, value])} className="accent-slate-900" /> {label}
              </label>
            );
          })}
        </div>
      </section>

      <section>
        <div className="mb-1 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-black text-slate-900"><Code2 size={17} className="text-slate-700" /> Veldmapping</div>
          <button type="button" onClick={() => update('mappings', [...form.mappings, { source: '', target: '', enabled: true }])} className="flex items-center gap-1 text-xs font-bold text-slate-900 hover:underline cursor-pointer"><Plus size={14} /> Regel toevoegen</button>
        </div>
        <p className="mb-3 text-[11px] font-medium text-slate-500">Koppel de velden van de externe bron aan Pwayment. Zo blijft een leverancier met afwijkende kolomnamen bruikbaar.</p>
        <div className="space-y-2">
          {form.mappings.map((mapping, index) => (
            <div key={index} className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2">
              <input value={mapping.source} onChange={(event) => setMapping(index, 'source', event.target.value)} className="min-w-0 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs outline-none focus:border-slate-900" placeholder="Bronveld" />
              <ChevronRight size={15} className="text-slate-400" />
              <input value={mapping.target} onChange={(event) => setMapping(index, 'target', event.target.value)} className="min-w-0 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs outline-none focus:border-slate-900" placeholder="Pwayment veld" />
              <button type="button" onClick={() => update('mappings', form.mappings.filter((_, mappingIndex) => mappingIndex !== index))} className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 cursor-pointer" aria-label="Mapping verwijderen"><Trash2 size={15} /></button>
            </div>
          ))}
        </div>
      </section>

      <div className="sticky bottom-0 -mx-6 -mb-6 flex justify-end gap-2 border-t border-slate-100 bg-white px-6 py-4">
        <button type="button" onClick={onCancel} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer">Annuleren</button>
        <button type="submit" className="flex items-center gap-2 rounded-xl border border-slate-900 bg-slate-900 px-4 py-2.5 text-xs font-bold text-white shadow-2xs hover:bg-black cursor-pointer"><Check size={15} /> Configuratie opslaan</button>
      </div>
    </form>
  );
};

const IntegrationCard: React.FC<{
  integration: IntegrationConfig;
  onEdit: () => void;
  onNotify: (message: string, success?: boolean) => void;
}> = ({ integration, onEdit, onNotify }) => {
  const { testConnection, runSync, toggleIntegration, removeIntegration } = useIntegrations();
  const [syncing, setSyncing] = useState(false);
  const status = statusStyle[integration.status];

  const test = async () => {
    const ok = await testConnection(integration.id);
    onNotify(ok ? 'Verbinding gevalideerd.' : 'Controle mislukt. Bekijk de foutmelding.', ok);
  };

  const sync = async () => {
    setSyncing(true);
    const ok = await runSync(integration.id);
    setSyncing(false);
    onNotify(ok ? 'Synchronisatie voltooid.' : 'Test eerst de verbinding.', ok);
  };

  const remove = () => {
    if (window.confirm(`Wilt u “${integration.name}” definitief verwijderen?`)) {
      removeIntegration(integration.id);
      onNotify('Koppeling verwijderd.');
    }
  };

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs transition-shadow hover:shadow-xs">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-slate-800">
            {integration.category === 'supplier' ? <Truck size={20} /> : integration.category === 'commerce' ? <ShoppingBag size={20} /> : integration.category === 'payment' ? <CreditCard size={20} /> : <Database size={20} />}
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-black text-slate-900">{integration.name}</h3>
            <p className="mt-0.5 text-xs font-medium text-slate-500">{integration.provider} · {categoryLabels[integration.category]}</p>
          </div>
        </div>
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black ${status.className}`}>
          {integration.status === 'testing' && <Loader2 size={12} className="animate-spin" />}{status.label}
        </span>
      </div>

      {integration.lastError && (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-[11px] font-semibold leading-relaxed text-rose-700"><AlertCircle size={15} className="mt-0.5 shrink-0" />{integration.lastError}</div>
      )}

      <div className="mt-4 flex flex-wrap gap-1.5">
        {integration.resources.map((resource) => <span key={resource} className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-bold text-slate-600">{resourceLabels[resource] ?? resource}</span>)}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 border-y border-slate-100 py-3 text-[11px]">
        <div><div className="font-semibold text-slate-400">Laatste sync</div><div className="mt-0.5 font-bold text-slate-700">{formatDate(integration.lastSyncAt)}</div></div>
        <div><div className="font-semibold text-slate-400">Planning</div><div className="mt-0.5 font-bold text-slate-700">{integration.schedule === '15m' ? 'Iedere 15 min.' : integration.schedule === 'hourly' ? 'Ieder uur' : integration.schedule === 'daily' ? 'Dagelijks' : 'Handmatig'}</div></div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button onClick={test} disabled={integration.status === 'testing'} className="flex items-center gap-1.5 rounded-xl border border-slate-900 bg-slate-900 px-3 py-2 text-[11px] font-bold text-white hover:bg-black disabled:opacity-50 cursor-pointer"><Zap size={14} /> Test verbinding</button>
        <button onClick={sync} disabled={syncing || integration.status !== 'connected'} className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45 cursor-pointer">{syncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Nu syncen</button>
        <button onClick={onEdit} className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 hover:bg-slate-50 cursor-pointer" aria-label="Bewerken"><Pencil size={15} /></button>
        <button onClick={() => toggleIntegration(integration.id)} className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 hover:bg-slate-100 cursor-pointer" aria-label={integration.status === 'paused' ? 'Hervatten' : 'Pauzeren'}>{integration.status === 'paused' ? <CirclePlay size={15} /> : <CirclePause size={15} />}</button>
        <button onClick={remove} className="ml-auto rounded-xl border border-slate-200 bg-white p-2 text-slate-400 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 cursor-pointer" aria-label="Verwijderen"><Trash2 size={15} /></button>
      </div>
    </article>
  );
};

export const IntegrationsSettings: React.FC = () => {
  const state = useIntegrations();
  const [section, setSection] = useState<Section>('overview');
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<'integration' | 'webhook' | 'api-key' | null>(null);
  const [template, setTemplate] = useState<ProviderTemplate | undefined>();
  const [editing, setEditing] = useState<IntegrationConfig | undefined>();
  const [toast, setToast] = useState<{ message: string; success: boolean } | null>(null);
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [webhookName, setWebhookName] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookEvents, setWebhookEvents] = useState<string[]>(['sale.created']);
  const [keyName, setKeyName] = useState('Externe rapportering');
  const [keyScopes, setKeyScopes] = useState<string[]>(['sales:read']);
  const [keyExpiry, setKeyExpiry] = useState('');
  const [activityFilter, setActivityFilter] = useState('all');

  const notify = (message: string, success = true) => {
    setToast({ message, success });
    window.setTimeout(() => setToast(null), 3200);
  };

  const connected = state.integrations.filter((item) => item.status === 'connected').length;
  const attention = state.integrations.filter((item) => item.status === 'attention').length;
  const lastSync = [...state.integrations].filter((item) => item.lastSyncAt).sort((a, b) => (b.lastSyncAt ?? '').localeCompare(a.lastSyncAt ?? ''))[0]?.lastSyncAt;

  const matchingIntegrations = useMemo(() => state.integrations.filter((item) => {
    const sectionMatch = section === 'suppliers'
      ? item.category === 'supplier'
      : section === 'channels'
        ? item.category === 'commerce'
        : section === 'finance'
          ? item.category === 'accounting' || item.category === 'payment'
          : true;
    const needle = search.trim().toLowerCase();
    return sectionMatch && (!needle || `${item.name} ${item.provider}`.toLowerCase().includes(needle));
  }), [search, section, state.integrations]);

  const openTemplate = (value?: ProviderTemplate) => {
    setEditing(undefined);
    setTemplate(value);
    setModal('integration');
  };

  const editIntegration = (integration: IntegrationConfig) => {
    setTemplate(undefined);
    setEditing(integration);
    setModal('integration');
  };

  const editingForm = editing ? {
    name: editing.name,
    provider: editing.provider,
    category: editing.category,
    baseUrl: editing.baseUrl,
    authType: editing.authType,
    username: editing.username,
    credential: '',
    resources: editing.resources,
    direction: editing.direction,
    schedule: editing.schedule,
    mappings: editing.mappings.map(({ source, target, enabled }) => ({ source, target, enabled })),
  } satisfies NewIntegrationInput : undefined;

  const navigation: { id: Section; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'Overzicht', icon: <Activity size={15} /> },
    { id: 'suppliers', label: 'Leveranciers', icon: <Truck size={15} /> },
    { id: 'channels', label: 'Verkoopkanalen', icon: <ShoppingBag size={15} /> },
    { id: 'finance', label: 'Boekhouding & payments', icon: <CreditCard size={15} /> },
    { id: 'developer', label: 'Webhooks & API', icon: <Code2 size={15} /> },
    { id: 'activity', label: 'Activiteit', icon: <Clock3 size={15} /> },
  ];

  const listHeader = (title: string, subtitle: string, buttonLabel: string) => (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div><h2 className="text-base font-black text-slate-900">{title}</h2><p className="mt-1 text-xs font-medium text-slate-500">{subtitle}</p></div>
      <button onClick={() => openTemplate()} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-900 bg-slate-900 px-4 py-2.5 text-xs font-bold text-white shadow-2xs hover:bg-black cursor-pointer"><Plus size={15} /> {buttonLabel}</button>
    </div>
  );

  return (
    <div className="integrations-light-surface max-w-7xl space-y-5 text-slate-900">
      {toast && (
        <div className={`fixed right-5 top-5 z-[70] flex items-center gap-2 rounded-2xl border bg-white px-4 py-3 text-xs font-bold shadow-lg ${toast.success ? 'border-emerald-200 text-emerald-700' : 'border-rose-200 text-rose-700'}`}>
          {toast.success ? <CheckCircle2 size={17} /> : <AlertCircle size={17} />}{toast.message}
        </div>
      )}

      {/* Quick Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
        <div className="flex items-center gap-2 font-bold text-xs text-slate-900">
          <Link2 size={16} className="text-emerald-600" />
          <span>Integration Hub Snelacties</span>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button onClick={() => { setSection('suppliers'); openTemplate(providerTemplates[0]); }} className="flex items-center gap-2 rounded-xl border border-slate-900 bg-slate-900 px-3.5 py-2 text-xs font-bold text-white shadow-2xs hover:bg-black cursor-pointer"><Truck size={14} /> Leverancier toevoegen</button>
          <button onClick={() => { setSection('developer'); if (canUseFeature(FEATURE_KEYS.webhooksManage)) setModal('webhook'); }} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-800 hover:bg-slate-50 cursor-pointer"><Webhook size={14} /> Webhook maken</button>
        </div>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Actieve koppelingen', value: connected, detail: `${state.integrations.length} geconfigureerd`, icon: <Link2 size={18} />, color: 'border-slate-200 bg-slate-50 text-slate-800' },
          { label: 'Aandacht nodig', value: attention, detail: attention ? 'Controleer de fouten' : 'Alles rustig', icon: <AlertCircle size={18} />, color: attention ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-slate-200 bg-slate-50 text-slate-800' },
          { label: 'Laatste synchronisatie', value: lastSync ? formatDate(lastSync).split(',')[0] : '—', detail: lastSync ? formatDate(lastSync) : 'Nog geen sync uitgevoerd', icon: <RefreshCw size={18} />, color: 'border-slate-200 bg-slate-50 text-slate-800' },
          { label: 'Actieve webhooks', value: state.webhooks.filter((item) => item.active).length, detail: `${state.apiKeys.filter((item) => item.active).length} actieve API-sleutels`, icon: <Webhook size={18} />, color: 'border-slate-200 bg-slate-50 text-slate-800' },
        ].map((card) => (
          <div key={card.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
            <div className={`mb-3 inline-flex rounded-xl border p-2 ${card.color}`}>{card.icon}</div>
            <div className="text-xl font-black text-slate-900">{card.value}</div>
            <div className="mt-0.5 text-xs font-bold text-slate-700">{card.label}</div>
            <div className="mt-1 text-[10px] font-medium text-slate-400">{card.detail}</div>
          </div>
        ))}
      </section>

      <div className="rounded-2xl border border-slate-200 bg-white p-1.5 shadow-2xs">
        <div className="flex gap-1 overflow-x-auto">
          {navigation.map((item) => (
            <button key={item.id} onClick={() => setSection(item.id)} className={`flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2.5 text-[11px] font-bold transition-colors cursor-pointer ${section === item.id ? 'bg-slate-900 text-white shadow-2xs' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'}`}>{item.icon}{item.label}</button>
          ))}
        </div>
      </div>

      {section === 'overview' && (
        <div className="grid gap-5 xl:grid-cols-[1.35fr_.65fr]">
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-2xs">
            <div className="flex items-center justify-between gap-3"><div><h2 className="text-base font-black">Integratiegezondheid</h2><p className="mt-1 text-xs font-medium text-slate-500">De belangrijkste signalen en volgende acties.</p></div><button onClick={() => setSection('activity')} className="text-xs font-bold text-slate-900 hover:underline cursor-pointer">Alle activiteit</button></div>
            {state.integrations.length === 0 ? (
              <div className="mt-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
                <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700"><Link2 size={21} /></div>
                <h3 className="mt-3 text-sm font-black">Nog geen externe systemen gekoppeld</h3>
                <p className="mx-auto mt-1 max-w-md text-xs font-medium leading-relaxed text-slate-500">Begin met uw belangrijkste leverancier. Daarna kunt u voorraad, prijzen en productdata automatisch laten binnenkomen.</p>
                <button onClick={() => openTemplate(providerTemplates[0])} className="mt-4 inline-flex items-center gap-2 rounded-xl border border-slate-900 bg-slate-900 px-4 py-2.5 text-xs font-bold text-white hover:bg-black cursor-pointer"><Plus size={15} /> Eerste koppeling toevoegen</button>
              </div>
            ) : (
              <div className="mt-4 space-y-2">
                {state.integrations.slice(0, 5).map((integration) => {
                  const status = statusStyle[integration.status];
                  return <button key={integration.id} onClick={() => { editIntegration(integration); }} className="flex w-full items-center gap-3 rounded-xl border border-slate-100 px-3 py-3 text-left hover:border-slate-300 hover:bg-slate-50 cursor-pointer"><div className="rounded-lg bg-slate-50 p-2 text-slate-500"><Link2 size={16} /></div><div className="min-w-0 flex-1"><div className="truncate text-xs font-black text-slate-800">{integration.name}</div><div className="mt-0.5 text-[10px] font-medium text-slate-400">{integration.provider} · {formatDate(integration.lastSyncAt)}</div></div><span className={`rounded-full border px-2 py-1 text-[9px] font-black ${status.className}`}>{status.label}</span><ChevronRight size={15} className="text-slate-300" /></button>;
                })}
              </div>
            )}
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-2xs">
            <h2 className="text-base font-black">Snel koppelen</h2><p className="mt-1 text-xs font-medium text-slate-500">Veelgebruikte startpunten.</p>
            <div className="mt-4 space-y-2">
              {[providerTemplates[0], providerTemplates[3], providerTemplates[6], providerTemplates[8]].map((provider) => (
                <button key={provider.provider} onClick={() => openTemplate(provider)} className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left hover:border-slate-300 hover:bg-slate-50 cursor-pointer"><span className={`rounded-xl border p-2 ${provider.color}`}>{provider.icon}</span><span className="min-w-0 flex-1"><span className="block text-xs font-black text-slate-800">{provider.name}</span><span className="mt-0.5 block truncate text-[10px] font-medium text-slate-400">{categoryLabels[provider.category]}</span></span><Plus size={16} className="text-slate-900" /></button>
              ))}
            </div>
          </section>
        </div>
      )}

      {(section === 'suppliers' || section === 'channels' || section === 'finance') && (
        <div className="space-y-5">
          {section === 'suppliers' && listHeader('Leveranciers & productfeeds', 'Importeer assortimenten, barcodes, voorraad, adviesprijzen en inkoopprijzen.', 'Leverancier-API toevoegen')}
          {section === 'channels' && listHeader('Webshops & verkoopkanalen', 'Houd orders, klanten, productdata en voorraad in alle kanalen gelijk.', 'Verkoopkanaal toevoegen')}
          {section === 'finance' && listHeader('Boekhouding & paymentproviders', 'Stuur omzet en rapporten door en volg online betaalstatussen.', 'Financiële koppeling toevoegen')}

          <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 sm:flex-row sm:items-center">
            <label className="relative flex-1"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-xs outline-none focus:border-slate-900 focus:bg-white" placeholder="Zoek op naam of provider…" /></label>
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[11px] font-bold text-slate-500"><Filter size={14} /> {matchingIntegrations.length} geconfigureerd</div>
          </div>

          {matchingIntegrations.length > 0 && <div className="grid gap-4 lg:grid-cols-2">{matchingIntegrations.map((integration) => <IntegrationCard key={integration.id} integration={integration} onEdit={() => editIntegration(integration)} onNotify={notify} />)}</div>}

          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-2xs">
            <div><h3 className="text-sm font-black text-slate-900">Beschikbare connectoren</h3><p className="mt-1 text-xs font-medium text-slate-500">Kies een template of start met een volledig eigen configuratie.</p></div>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {providerTemplates.filter((provider) => section === 'suppliers' ? provider.category === 'supplier' : section === 'channels' ? provider.category === 'commerce' : provider.category === 'accounting' || provider.category === 'payment').map((provider) => (
                <button key={provider.provider} onClick={() => openTemplate(provider)} className="group flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left transition-colors hover:border-slate-400 hover:bg-slate-50 cursor-pointer">
                  <span className={`rounded-xl border p-2.5 ${provider.color}`}>{provider.icon}</span><span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2 text-xs font-black text-slate-900">{provider.name}<Plus size={15} className="shrink-0 text-slate-900 opacity-60 group-hover:opacity-100" /></span><span className="mt-1.5 block text-[11px] font-medium leading-relaxed text-slate-500">{provider.description}</span></span>
                </button>
              ))}
              <button onClick={() => openTemplate()} className="flex min-h-28 items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-xs font-black text-slate-900 hover:bg-slate-100 cursor-pointer"><Plus size={17} /> Volledig maatwerk</button>
            </div>
          </section>
        </div>
      )}

      {section === 'developer' && (
        <FeatureGate
          feature={FEATURE_KEYS.apiAccess}
          title="REST API en webhooks zijn beschikbaar in Enterprise"
          description="Uw bestaande configuratie blijft bewaard. Schakel tijdelijk naar Enterprise om deze ontwikkelaarsfuncties te testen."
        >
        <div className="space-y-5">
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-2xs">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="flex items-center gap-2 text-base font-black"><Webhook size={18} className="text-slate-900" /> Uitgaande webhooks</h2><p className="mt-1 text-xs font-medium text-slate-500">Stuur gebeurtenissen realtime naar uw ERP, webshop, CRM of eigen backend.</p></div><button onClick={() => setModal('webhook')} className="flex items-center justify-center gap-2 rounded-xl border border-slate-900 bg-slate-900 px-4 py-2.5 text-xs font-bold text-white shadow-2xs hover:bg-black cursor-pointer"><Plus size={15} /> Webhook toevoegen</button></div>
            {state.webhooks.length === 0 ? <div className="mt-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5 text-center text-xs font-medium text-slate-500">Nog geen webhooks ingesteld.</div> : <div className="mt-4 space-y-3">{state.webhooks.map((webhook) => (
              <div key={webhook.id} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2 text-sm font-black text-slate-900">{webhook.name}<span className={`rounded-full border px-2 py-0.5 text-[9px] font-black ${webhook.active ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-500'}`}>{webhook.active ? 'Actief' : 'Gepauzeerd'}</span></div><div className="mt-1 break-all font-mono text-[10px] text-slate-500">{webhook.url}</div></div><div className="flex gap-2"><button onClick={async () => notify(await state.testWebhook(webhook.id) ? 'Testevent afgeleverd.' : 'Webhook geweigerd; gebruik HTTPS.', webhook.url.startsWith('https://'))} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-bold text-slate-800 hover:bg-slate-100 cursor-pointer"><Send size={14} className="inline mr-1.5" />Test</button><button onClick={() => state.toggleWebhook(webhook.id)} className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 cursor-pointer">{webhook.active ? <CirclePause size={15} /> : <CirclePlay size={15} />}</button><button onClick={() => window.confirm(`Webhook “${webhook.name}” verwijderen?`) && state.removeWebhook(webhook.id)} className="rounded-xl border border-slate-200 bg-white p-2 text-rose-500 hover:bg-rose-50 cursor-pointer"><Trash2 size={15} /></button></div></div>
                <div className="mt-3 flex flex-wrap gap-1.5">{webhook.events.map((event) => <span key={event} className="rounded-lg bg-slate-100 px-2 py-1 text-[9px] font-bold text-slate-700">{eventLabels[event] ?? event}</span>)}</div>
                <div className="mt-3 text-[10px] font-medium text-slate-400">Ondertekening {webhook.secretHint} · Laatste levering: {formatDate(webhook.lastDeliveryAt)} {webhook.lastStatus ? `· HTTP ${webhook.lastStatus}` : ''}</div>
              </div>
            ))}</div>}
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-2xs">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="flex items-center gap-2 text-base font-black"><KeyRound size={18} className="text-slate-900" /> Pwayment REST API-sleutels</h2><p className="mt-1 text-xs font-medium text-slate-500">Geef externe toepassingen alleen de rechten die ze werkelijk nodig hebben.</p></div><button onClick={() => setModal('api-key')} className="flex items-center justify-center gap-2 rounded-xl border border-slate-900 bg-slate-900 px-4 py-2.5 text-xs font-bold text-white shadow-2xs hover:bg-black cursor-pointer"><Plus size={15} /> Sleutel aanmaken</button></div>
            {state.apiKeys.length === 0 ? <div className="mt-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5 text-center text-xs font-medium text-slate-500">Nog geen REST API-sleutels aangemaakt.</div> : <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[680px] text-left text-xs"><thead><tr className="border-b border-slate-100 text-[10px] uppercase tracking-wide text-slate-400"><th className="px-3 py-2">Naam</th><th className="px-3 py-2">Sleutel</th><th className="px-3 py-2">Rechten</th><th className="px-3 py-2">Aangemaakt</th><th className="px-3 py-2 text-right">Actie</th></tr></thead><tbody className="divide-y divide-slate-100">{state.apiKeys.map((apiKey) => <tr key={apiKey.id} className={!apiKey.active ? 'opacity-50' : ''}><td className="px-3 py-3 font-black text-slate-800">{apiKey.name}</td><td className="px-3 py-3 font-mono text-[10px] text-slate-500">{apiKey.prefix}</td><td className="px-3 py-3"><div className="flex flex-wrap gap-1">{apiKey.scopes.map((scope) => <span key={scope} className="rounded bg-slate-100 px-1.5 py-1 text-[9px] font-bold text-slate-700">{scope}</span>)}</div></td><td className="px-3 py-3 text-[10px] font-medium text-slate-500">{formatDate(apiKey.createdAt)}</td><td className="px-3 py-3 text-right">{apiKey.active ? <button onClick={() => window.confirm(`API-sleutel “${apiKey.name}” intrekken? Dit kan niet ongedaan worden gemaakt.`) && state.revokeApiKey(apiKey.id)} className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[10px] font-bold text-rose-700 cursor-pointer">Intrekken</button> : <span className="text-[10px] font-bold text-slate-400">Ingetrokken</span>}</td></tr>)}</tbody></table></div>}
          </section>

          <section className="grid gap-4 md:grid-cols-3">
            {[{ icon: <Globe2 size={18} />, title: 'Basis-URL', value: '/api/v1', text: 'Versiebeheer voorkomt onverwachte breuken.' }, { icon: <ShieldCheck size={18} />, title: 'Authenticatie', value: 'Bearer token', text: 'Stuur de sleutel via de Authorization-header.' }, { icon: <BookOpen size={18} />, title: 'Documentatie', value: 'OpenAPI-ready', text: 'Resources voor producten, verkoop en klanten.' }].map((item) => <div key={item.title} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs"><div className="mb-3 inline-flex rounded-xl border border-slate-200 bg-slate-50 p-2 text-slate-900">{item.icon}</div><div className="text-[10px] font-black uppercase tracking-wide text-slate-400">{item.title}</div><div className="mt-1 text-sm font-black text-slate-900">{item.value}</div><p className="mt-1 text-[11px] font-medium leading-relaxed text-slate-500">{item.text}</p></div>)}
          </section>
        </div>
        </FeatureGate>
      )}

      {section === 'activity' && (
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-2xs">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="text-base font-black">Activiteit & synchronisatielog</h2><p className="mt-1 text-xs font-medium text-slate-500">Tests, synchronisaties, webhooks, configuratiewijzigingen en fouten.</p></div><div className="flex gap-2"><select value={activityFilter} onChange={(event) => setActivityFilter(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600"><option value="all">Alle activiteit</option><option value="error">Alleen fouten</option><option value="sync">Synchronisaties</option><option value="webhook">Webhooks</option><option value="api-key">API-sleutels</option></select><button onClick={() => window.confirm('Volledig activiteitenlog wissen?') && state.clearLogs()} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-500 hover:bg-slate-50 cursor-pointer">Wissen</button></div></div>
          <div className="mt-5 space-y-2">{state.logs.filter((log) => activityFilter === 'all' || log.level === activityFilter || log.kind === activityFilter).map((log) => <div key={log.id} className="flex items-start gap-3 rounded-2xl border border-slate-100 p-3"><div className={`mt-0.5 rounded-lg border p-1.5 ${log.level === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : log.level === 'error' ? 'border-rose-200 bg-rose-50 text-rose-700' : log.level === 'warning' ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-slate-200 bg-slate-50 text-slate-700'}`}>{log.level === 'success' ? <CheckCircle2 size={15} /> : log.level === 'error' ? <AlertCircle size={15} /> : <Activity size={15} />}</div><div className="min-w-0 flex-1"><div className="text-xs font-bold text-slate-800">{log.message}</div><div className="mt-1 flex flex-wrap gap-x-3 text-[10px] font-medium text-slate-400"><span>{formatDate(log.timestamp)}</span><span>{log.kind}</span>{log.records != null && <span>{log.records} records</span>}{log.durationMs != null && <span>{log.durationMs} ms</span>}</div></div></div>)}{state.logs.length === 0 && <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-xs font-medium text-slate-500">Geen activiteit om te tonen.</div>}</div>
        </section>
      )}

      <section className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center">
        <div className="rounded-xl border border-slate-200 bg-white p-2 text-slate-900"><ShieldCheck size={19} /></div><div className="flex-1"><div className="text-xs font-black text-slate-900">Veilig en controleerbaar</div><p className="mt-0.5 text-[11px] font-medium leading-relaxed text-slate-600">Elke wijziging en controle komt in het activiteitenlog. Geheime sleutels worden niet opnieuw leesbaar gemaakt. Gebruik voor productie een server-side secrets vault en proxy voor externe API-aanroepen.</p></div>
      </section>

      {modal === 'integration' && (
        <ModalShell title={editing ? 'Koppeling bewerken' : 'Nieuwe koppeling toevoegen'} subtitle="Configureer authenticatie, gegevensstromen, planning en veldmappings." onClose={() => setModal(null)}>
          <IntegrationForm editing={Boolean(editing)} initial={editingForm ?? emptyForm(template)} onCancel={() => setModal(null)} onSave={(value) => { if (editing) { state.updateIntegration(editing.id, value); notify('Configuratie bijgewerkt. Test de verbinding opnieuw.'); } else { state.addIntegration(value); notify('Koppeling toegevoegd. Test nu de verbinding.'); } setModal(null); }} />
        </ModalShell>
      )}

      {modal === 'webhook' && (
        <ModalShell title="Webhook toevoegen" subtitle="Kies welke gebeurtenissen realtime naar uw endpoint worden verstuurd." onClose={() => setModal(null)}>
          <form onSubmit={(event) => { event.preventDefault(); if (!webhookName.trim() || !webhookUrl.trim() || webhookEvents.length === 0) return; state.addWebhook({ name: webhookName, url: webhookUrl, events: webhookEvents }); setWebhookName(''); setWebhookUrl(''); setWebhookEvents(['sale.created']); setModal(null); notify('Webhook toegevoegd.'); }} className="space-y-5 p-6">
            <label className="block space-y-1.5 text-xs font-bold text-slate-700">Naam<input required value={webhookName} onChange={(event) => setWebhookName(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-900" placeholder="Bijv. ERP productie" /></label>
            <label className="block space-y-1.5 text-xs font-bold text-slate-700">HTTPS endpoint<input required type="url" value={webhookUrl} onChange={(event) => setWebhookUrl(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-900" placeholder="https://erp.uwbedrijf.be/webhooks/pwayment" /></label>
            <div><div className="mb-2 text-xs font-bold text-slate-700">Gebeurtenissen</div><div className="grid gap-2 sm:grid-cols-2">{Object.entries(eventLabels).map(([value, label]) => { const checked = webhookEvents.includes(value); return <label key={value} className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-bold ${checked ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 text-slate-600'}`}><input type="checkbox" checked={checked} onChange={() => setWebhookEvents(checked ? webhookEvents.filter((item) => item !== value) : [...webhookEvents, value])} className="accent-slate-900" />{label}</label>; })}</div></div>
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" onClick={() => setModal(null)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer">Annuleren</button><button type="submit" className="rounded-xl border border-slate-900 bg-slate-900 px-4 py-2.5 text-xs font-bold text-white hover:bg-black cursor-pointer">Webhook opslaan</button></div>
          </form>
        </ModalShell>
      )}

      {modal === 'api-key' && (
        <ModalShell title="Nieuwe REST API-sleutel" subtitle="De volledige sleutel wordt na aanmaak slechts één keer getoond." onClose={() => { setModal(null); setNewSecret(null); }}>
          {newSecret ? <div className="space-y-5 p-6"><div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="flex items-center gap-2 text-sm font-black text-slate-900"><CheckCircle2 size={18} /> Sleutel aangemaakt</div><p className="mt-1 text-xs font-medium text-slate-600">Kopieer deze nu en bewaar ze veilig. U kunt ze hierna niet opnieuw bekijken.</p></div><div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3"><code className="min-w-0 flex-1 break-all text-xs font-bold text-slate-700">{newSecret}</code><button onClick={async () => { await copyText(newSecret); notify('API-sleutel gekopieerd.'); }} className="shrink-0 rounded-lg border border-slate-200 bg-white p-2 text-slate-800 hover:bg-slate-100 cursor-pointer"><Copy size={16} /></button></div><div className="flex justify-end"><button onClick={() => { setModal(null); setNewSecret(null); }} className="rounded-xl border border-slate-900 bg-slate-900 px-4 py-2.5 text-xs font-bold text-white cursor-pointer">Ik heb de sleutel veilig bewaard</button></div></div> : <form onSubmit={(event) => { event.preventDefault(); if (!keyName.trim() || keyScopes.length === 0) return; setNewSecret(state.createApiKey(keyName, keyScopes, keyExpiry)); }} className="space-y-5 p-6"><label className="block space-y-1.5 text-xs font-bold text-slate-700">Naam<input required value={keyName} onChange={(event) => setKeyName(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-900" /></label><label className="block space-y-1.5 text-xs font-bold text-slate-700">Vervaldatum (optioneel)<input type="date" value={keyExpiry} onChange={(event) => setKeyExpiry(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-900" /></label><div><div className="mb-2 text-xs font-bold text-slate-700">Rechten</div><div className="grid gap-2 sm:grid-cols-2">{['products:read', 'products:write', 'sales:read', 'customers:read', 'inventory:write', 'reports:read'].map((scope) => { const checked = keyScopes.includes(scope); return <label key={scope} className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2.5 font-mono text-[11px] font-bold ${checked ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 text-slate-500'}`}><input type="checkbox" checked={checked} onChange={() => setKeyScopes(checked ? keyScopes.filter((item) => item !== scope) : [...keyScopes, scope])} className="accent-slate-900" />{scope}</label>; })}</div></div><div className="flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" onClick={() => setModal(null)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer">Annuleren</button><button type="submit" className="rounded-xl border border-slate-900 bg-slate-900 px-4 py-2.5 text-xs font-bold text-white hover:bg-black cursor-pointer">Sleutel veilig aanmaken</button></div></form>}
        </ModalShell>
      )}
    </div>
  );
};
