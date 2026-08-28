import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  LoaderCircle,
  Minus,
  PackagePlus,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  Truck,
} from 'lucide-react';
import { audit, useAuth } from '../auth/useAuth';
import { db } from '../db/db';
import { saveSupabasePurchaseOrders } from '../services/supabasePurchaseOrders';
import {
  InventoryForecastConfidence,
  InventoryForecastModel,
  InventoryForecastTrend,
  InventoryForecastUrgency,
  Product,
  ReorderActionItem,
} from '../types';
import { formatEUR } from '../utils/money';
import { buildPurchaseOrderDrafts } from '../utils/purchaseOrders';
import { MISSING_SUPPLIER } from '../utils/retailActionEngine';
import { canUseFeature, FEATURE_KEYS } from '../billing/entitlements';
import { useStore } from '../store/useStore';
import { useStoreConfiguration } from '../store/useStoreConfiguration';
import { usePlatformFeatureFlag } from '../billing/usePlatformFeatureFlag';
import { inventoryWorkspaceBuildDefault } from '../inventory/access';

interface InventoryForecastProps {
  rows: ReorderActionItem[];
  recommendations: ReorderActionItem[];
  products: Product[];
  onInventoryChanged?: () => Promise<void>;
}

const INITIAL_VISIBLE_ROWS = 8;

const urgencyMeta: Record<InventoryForecastUrgency, { label: string; classes: string }> = {
  out: { label: 'Geen voorraad', classes: 'forecast-urgency forecast-urgency--out' },
  critical: { label: 'Onder minimum', classes: 'forecast-urgency forecast-urgency--critical' },
  soon: { label: 'Minimum binnen 30 dagen', classes: 'forecast-urgency forecast-urgency--soon' },
  watch: { label: 'Minimum binnen 60 dagen', classes: 'forecast-urgency forecast-urgency--watch' },
  healthy: { label: 'Geen actie binnen 60 dagen', classes: 'forecast-urgency forecast-urgency--healthy' },
  'no-sales': { label: 'Geen verkoopdata', classes: 'forecast-urgency forecast-urgency--quiet' },
};

const confidenceLabel: Record<InventoryForecastConfidence, string> = {
  low: 'Lage betrouwbaarheid',
  medium: 'Redelijke betrouwbaarheid',
  high: 'Hoge betrouwbaarheid',
};

const modelLabel: Record<InventoryForecastModel, string> = {
  insufficient: 'Voorlopig model',
  'recent-blend': 'Gewogen korte en lange verkooptrend',
  intermittent: 'Model voor sporadische verkoop',
  'seasonal-blend': 'Seizoenscorrectie actief',
};

const trendLabel: Record<InventoryForecastTrend, string> = {
  rising: 'Verkoop stijgt',
  stable: 'Verkoop blijft stabiel',
  falling: 'Verkoop daalt',
  unknown: 'Trend nog onzeker',
};

const formatDaysCover = (days: number | null) => {
  if (days == null) return '—';
  if (days < 1) return '< 1';
  if (days > 365) return '> 365';
  return String(Math.round(days));
};

const formatShortDate = (timestamp: number | null) => timestamp == null
  ? 'Nog onbekend'
  : new Intl.DateTimeFormat('nl-BE', { day: 'numeric', month: 'short' }).format(timestamp);

export const InventoryForecast = ({ rows, recommendations, products }: InventoryForecastProps) => {
  const auth = useAuth();
  const setMainView = useStore((state) => state.setMainView);
  const inventoryModuleEnabled = useStoreConfiguration((state) => state.configuration.modules.inventory);
  const inventoryWorkspaceEnabled = usePlatformFeatureFlag(
    'inventory_workspace',
    inventoryWorkspaceBuildDefault,
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    setQuantities((current) => {
      const next = { ...current };
      for (const row of recommendations) {
        if (next[row.productId] == null) next[row.productId] = row.suggestedQty;
      }
      return next;
    });
  }, [recommendations]);

  const visibleRecommendations = expanded ? recommendations : recommendations.slice(0, INITIAL_VISIBLE_ROWS);
  const selectableRows = recommendations.filter((row) => row.supplier !== MISSING_SUPPLIER && row.suggestedQty > 0);
  const selectableIds = selectableRows.map((row) => row.productId);
  const allSelectableSelected = selectableIds.length > 0 && selectableIds.every((id) => selectedIds.has(id));
  const selectedRows = recommendations
    .filter((row) => selectedIds.has(row.productId) && row.supplier !== MISSING_SUPPLIER)
    .map((row) => ({ ...row, selectedQty: quantities[row.productId] ?? row.suggestedQty }))
    .filter((row) => row.selectedQty > 0);
  const selectedSuppliers = new Set(selectedRows.map((row) => row.supplier));
  const directCount = recommendations.filter((row) => row.urgency === 'out' || row.urgency === 'critical').length;
  const withinThirtyDaysCount = recommendations.filter((row) => row.urgency === 'soon').length;
  const supplierCount = new Set(selectableRows.map((row) => row.supplier)).size;
  const proposalValueCents = recommendations.reduce(
    (sum, row) => sum + (row.unitCostCents ?? 0) * row.suggestedQty,
    0,
  );
  const selectedValueCents = selectedRows.reduce(
    (sum, row) => sum + (row.unitCostCents ?? 0) * row.selectedQty,
    0,
  );
  const selectedHasMissingCost = selectedRows.some((row) => row.unitCostCents == null);
  const selectionAnimationKey = `${selectedRows.map((row) => row.productId).join(':')}:${selectedValueCents}`;
  const productSkus = useMemo(
    () => Object.fromEntries(products.map((product) => [product.id, product.sku])),
    [products],
  );

  const toggleAll = () => {
    setFeedback(null);
    setSelectedIds(allSelectableSelected ? new Set() : new Set(selectableIds));
  };

  const toggleRow = (productId: string) => {
    setFeedback(null);
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  };

  const updateQuantity = (productId: string, value: number) => {
    const safeValue = Number.isFinite(value) ? Math.max(0, Math.min(99_999, Math.round(value))) : 0;
    setQuantities((current) => ({ ...current, [productId]: safeValue }));
    setFeedback(null);
  };

  const createDraftOrders = async () => {
    if (selectedRows.length === 0 || saving) return;
    if (!canUseFeature(FEATURE_KEYS.purchaseOrdersCreate)) {
      setFeedback('Nieuwe inkooporders zijn beschikbaar in Enterprise.');
      return;
    }
    setSaving(true);
    setFeedback(null);
    try {
      const orders = buildPurchaseOrderDrafts(selectedRows, {
        userId: auth.currentUserId ?? undefined,
        userName: auth.currentUserName ?? undefined,
        productSkus,
      });
      if (auth.currentStoreId) {
        await saveSupabasePurchaseOrders(auth.currentStoreId, orders);
      } else {
        await db.purchase_orders.bulkAdd(orders);
        for (const order of orders) {
          await audit('purchase_order.create', {
            orderId: order.id,
            supplier: order.supplier,
            itemCount: order.items.length,
            totalCents: order.items.reduce((sum, item) => sum + (item.unitCostCents ?? 0) * item.orderedQty, 0),
          });
        }
      }
      setSelectedIds(new Set());
      setFeedback(`${orders.length} ${orders.length === 1 ? 'concept-inkooporder is' : 'concept-inkooporders zijn'} aangemaakt. Er is niets verzonden en de voorraad is niet aangepast.`);
    } catch (error) {
      console.error('Concept-inkooporders aanmaken mislukt', error);
      setFeedback('De concepten konden niet worden aangemaakt. Er is niets besteld of aangepast.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="inventory-forecast-light overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 shadow-sm">
      <header className="border-b border-zinc-800 px-5 py-5 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-sky-300">Conceptvoorstellen</div>
            <h2 className="mt-1 text-2xl font-bold tracking-tight text-white">Producten die een bestelbeslissing vragen</h2>
          </div>
          <div className="w-fit rounded-full border border-zinc-700 bg-zinc-950/70 px-3 py-1.5 text-xs font-semibold text-zinc-400">Niets wordt automatisch besteld</div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <ActionMetric label="Nu onder minimum" value={String(directCount)} detail="Geen voorraad of kritieke voorraad" tone="rose" />
          <ActionMetric label="Minimum binnen 30 dagen" value={String(withinThirtyDaysCount)} detail="Op basis van huidig verkooptempo" tone="amber" />
          <ActionMetric label="Voorgestelde aankoopwaarde" value={formatEUR(proposalValueCents)} detail="Aankoopprijzen, excl. btw" tone="sky" />
          <ActionMetric label="Leveranciers in voorstel" value={String(supplierCount)} detail="Conceptorders worden gegroepeerd" tone="emerald" />
        </div>
      </header>

      <div className="p-5 sm:p-6">
        {rows.length === 0 ? (
          <EmptyState title="Nog geen voorraad om te voorspellen" detail="Voeg voorraadniveaus toe aan producten om de inkoopprognose te activeren." />
        ) : recommendations.length === 0 ? (
          <EmptyState title="Geen inkoopactie nodig" detail="Geen product bereikt binnen 60 dagen de ingestelde minimumvoorraad." success />
        ) : (
          <>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h3 className="text-base font-semibold text-white">Bestelvoorstellen per product</h3>
                <p className="mt-1 text-sm text-zinc-500">Selecteer producten voor conceptorders per leverancier.</p>
              </div>
              <button type="button" onClick={toggleAll} aria-pressed={allSelectableSelected} className="w-fit rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs font-semibold text-zinc-300 transition hover:border-sky-400/40 hover:text-white">
                {allSelectableSelected ? 'Selectie wissen' : 'Alles selecteren'}
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {visibleRecommendations.map((row) => {
                const supplierMissing = row.supplier === MISSING_SUPPLIER;
                const selected = selectedIds.has(row.productId);
                const urgency = urgencyMeta[row.urgency];
                const quantity = quantities[row.productId] ?? row.suggestedQty;
                const reliabilityTitle = `${confidenceLabel[row.confidence]}. ${modelLabel[row.forecastModel]}. ${trendLabel[row.trend]}. Gebaseerd op ${row.observedDays} dagen historie.`;
                return (
                  <article key={row.productId} className={`overflow-hidden rounded-xl border transition-all duration-200 ${selected ? 'border-sky-400/50 bg-sky-400/[0.045] shadow-[0_0_0_1px_rgba(56,189,248,0.08)]' : 'border-zinc-800 bg-zinc-950/55'}`}>
                    <div className="grid lg:grid-cols-[minmax(230px,1.1fr)_minmax(390px,1.7fr)_230px] lg:items-stretch">
                      <div className="flex min-w-0 items-start gap-3 px-4 pb-4 pt-5">
                        <input type="checkbox" checked={selected} disabled={supplierMissing} onChange={() => toggleRow(row.productId)} aria-label={`Selecteer ${row.productName}`} className="mt-0.5 h-4 w-4 shrink-0 accent-sky-400 disabled:cursor-not-allowed disabled:opacity-30" />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="break-words text-sm font-bold text-white">{row.productName}</h4>
                            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${urgency.classes}`}>{urgency.label}</span>
                          </div>
                          <div className={`mt-2 flex items-center gap-1.5 text-xs ${supplierMissing ? 'text-amber-300' : 'text-zinc-500'}`}><Truck size={12} />{row.supplier}</div>
                          {supplierMissing && <div className="mt-2 flex items-start gap-1.5 text-xs leading-5 text-amber-300"><AlertTriangle size={13} className="mt-0.5 shrink-0" />Vul eerst een leverancier in.</div>}
                        </div>
                      </div>

                      <div className="border-t border-zinc-800 p-4 lg:border-l lg:border-t-0">
                        <div className="grid grid-cols-3 gap-3">
                          <ForecastNumber value={String(row.currentStockQty)} label="Huidige voorraad" suffix="st." />
                          <ForecastNumber value={String(row.soldLast30Days)} label="Verkocht laatste 30 dagen" suffix="st." />
                          <ForecastNumber value={formatDaysCover(row.estimatedDaysCover)} label="Geschatte voorraadduur" suffix="dagen" />
                        </div>
                        <div className="mt-5 flex flex-col gap-2 border-t border-zinc-800 pt-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="text-sm font-semibold text-zinc-200">Verwacht leeg: <span className="text-white">{formatShortDate(row.estimatedStockoutAt)}</span></div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Reliability confidence={row.confidence} title={reliabilityTitle} />
                            <Trend trend={row.trend} />
                          </div>
                        </div>
                        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-zinc-800" title={`${formatDaysCover(row.estimatedDaysCover)} dagen voorraaddekking`}>
                          <div className={`h-full rounded-full ${row.urgency === 'out' || row.urgency === 'critical' ? 'bg-rose-400' : row.urgency === 'soon' ? 'bg-amber-400' : 'bg-sky-400'}`} style={{ width: `${Math.max(4, Math.min(100, ((row.estimatedDaysCover ?? 60) / 60) * 100))}%` }} />
                        </div>
                      </div>

                      <div className="border-t border-zinc-800 bg-zinc-900/80 p-4 lg:border-l lg:border-t-0">
                        <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500">Voorgesteld aantal</div>
                        <div className="mt-2 flex items-center rounded-lg border border-zinc-700 bg-zinc-950 shadow-sm">
                          <button type="button" disabled={supplierMissing} onClick={() => updateQuantity(row.productId, quantity - 1)} className="flex h-10 w-10 items-center justify-center text-zinc-400 transition hover:text-white disabled:opacity-30" aria-label={`Verminder aantal voor ${row.productName}`}><Minus size={15} /></button>
                          <input id={`reorder-${row.productId}`} type="number" min="0" max="99999" inputMode="numeric" disabled={supplierMissing} value={quantity} onChange={(event) => updateQuantity(row.productId, Number(event.target.value))} aria-label={`Bestelaantal voor ${row.productName}`} className="h-10 min-w-0 flex-1 border-x border-zinc-700 bg-transparent text-center font-mono text-base font-bold text-white outline-none disabled:opacity-30" />
                          <button type="button" disabled={supplierMissing} onClick={() => updateQuantity(row.productId, quantity + 1)} className="flex h-10 w-10 items-center justify-center text-lg font-medium text-zinc-400 transition hover:text-white disabled:opacity-30" aria-label={`Verhoog aantal voor ${row.productName}`}>+</button>
                        </div>
                        <div className="mt-4 flex items-end justify-between gap-3 border-t border-zinc-800 pt-3">
                          <span className="text-[11px] font-medium text-zinc-500">Inkoopwaarde</span>
                          <strong className="text-base font-bold tracking-tight text-white">{row.unitCostCents == null ? 'Prijs ontbreekt' : formatEUR(row.unitCostCents * quantity)}</strong>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>

            {recommendations.length > INITIAL_VISIBLE_ROWS && (
              <button type="button" onClick={() => setExpanded((current) => !current)} className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2.5 text-sm font-semibold text-zinc-400 transition hover:border-zinc-700 hover:text-white">
                {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                {expanded ? 'Toon minder' : `Toon alle ${recommendations.length} producten`}
              </button>
            )}

            <div className="sticky bottom-3 z-10 mt-5 flex flex-col gap-4 rounded-xl border border-sky-400/25 bg-zinc-950/95 p-4 shadow-xl backdrop-blur lg:flex-row lg:items-center lg:justify-between" aria-live="polite">
              <div key={selectionAnimationKey} className="selection-summary-pop">
                <div className="text-sm font-bold text-white">{selectedRows.length} {selectedRows.length === 1 ? 'product' : 'producten'} · {selectedSuppliers.size} {selectedSuppliers.size === 1 ? 'leverancier' : 'leveranciers'}</div>
                <div className="mt-1 text-xs text-zinc-400">Inkoopwaarde: <strong className="text-zinc-200">{formatEUR(selectedValueCents)} excl. btw</strong>{selectedHasMissingCost ? ' · exclusief ontbrekende aankoopprijzen' : ''}</div>
              </div>
              <button type="button" disabled={!inventoryModuleEnabled || !inventoryWorkspaceEnabled || selectedRows.length === 0 || saving} onClick={() => void createDraftOrders()} className="inline-flex items-center justify-center gap-2 rounded-lg bg-sky-400 px-5 py-3 text-sm font-bold text-zinc-950 transition hover:bg-sky-300 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500">{saving ? <LoaderCircle size={17} className="animate-spin" /> : <PackagePlus size={17} />}{saving ? 'Concepten maken...' : inventoryModuleEnabled && inventoryWorkspaceEnabled ? 'Maak conceptorders' : 'Activeer Voorraad om te bestellen'}</button>
            </div>

            {feedback && <div role="status" aria-live="polite" className="purchase-feedback-enter mt-3 flex flex-col gap-3 rounded-lg border border-sky-400/20 bg-sky-400/[0.06] px-3 py-2.5 text-sm text-sky-100 sm:flex-row sm:items-center sm:justify-between"><span className="flex items-start gap-2"><Check size={16} className="mt-0.5 shrink-0" />{feedback}</span>{inventoryModuleEnabled && inventoryWorkspaceEnabled && <button type="button" onClick={() => setMainView('inventory')} className="shrink-0 rounded-md border border-sky-300/30 px-3 py-1.5 text-xs font-bold text-sky-100 hover:bg-sky-300/10">Open in Voorraad</button>}</div>}
          </>
        )}

      </div>
    </section>
  );
};

const ActionMetric = ({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: 'rose' | 'amber' | 'sky' | 'emerald' }) => {
  const toneClasses = { rose: 'text-rose-300', amber: 'text-amber-300', sky: 'text-sky-300', emerald: 'text-emerald-300' }[tone];
  return <div className="rounded-xl border border-zinc-800 bg-zinc-950/55 px-4 py-3"><div className="text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-500">{label}</div><div className={`mt-1 text-2xl font-bold tracking-tight ${toneClasses}`}>{value}</div><div className="mt-1 text-xs text-zinc-500">{detail}</div></div>;
};

const ForecastNumber = ({ value, label, suffix }: { value: string; label: string; suffix: string }) => (
  <div><div className="flex items-baseline gap-1"><strong className="text-xl font-bold tracking-tight text-white">{value}</strong><span className="text-[11px] font-medium text-zinc-500">{suffix}</span></div><div className="mt-0.5 text-[10px] font-bold uppercase leading-4 tracking-[0.1em] text-zinc-600">{label}</div></div>
);

const Reliability = ({ confidence, title }: { confidence: InventoryForecastConfidence; title: string }) => {
  const high = confidence === 'high';
  const Icon = high ? CheckCircle2 : ShieldCheck;
  return <span title={title} className={`inline-flex cursor-help items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold ${high ? 'border-emerald-400/20 bg-emerald-400/[0.06] text-emerald-300' : 'border-zinc-700 bg-zinc-800/60 text-zinc-400'}`}><Icon size={12} />{confidenceLabel[confidence]}</span>;
};

const Trend = ({ trend }: { trend: InventoryForecastTrend }) => {
  if (trend === 'rising') return <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-sky-300"><TrendingUp size={13} />Stijgt</span>;
  if (trend === 'falling') return <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-300"><TrendingDown size={13} />Daalt</span>;
  return <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-zinc-500"><Minus size={13} />{trend === 'stable' ? 'Stabiel' : 'Onzeker'}</span>;
};

const EmptyState = ({ title, detail, success = false }: { title: string; detail: string; success?: boolean }) => (
  <div className={`rounded-xl border p-6 text-center ${success ? 'border-emerald-400/20 bg-emerald-400/[0.05]' : 'border-dashed border-zinc-700 bg-zinc-950/40'}`}><CheckCircle2 className={`mx-auto ${success ? 'text-emerald-300' : 'text-zinc-600'}`} size={28} /><h3 className="mt-3 font-semibold text-white">{title}</h3><p className="mt-1 text-sm text-zinc-500">{detail}</p></div>
);
