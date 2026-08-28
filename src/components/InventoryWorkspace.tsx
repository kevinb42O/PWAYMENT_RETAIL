import { useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  History,
  MinusCircle,
  PackageCheck,
  Layers3,
  Trash2,
  Upload,
  Download,
  ScanLine,
  Search,
  Truck,
} from "lucide-react";
import { useAuth } from "../auth/useAuth";
import { FEATURE_KEYS, isFeatureEnabledForSnapshot, useEntitlements } from "../billing/entitlements";
import { db } from "../db/db";
import { recordInventoryBatch, recordInventoryOperation, type InventoryOperationMode } from "../services/inventoryOperations";
import { loadInventoryProfiles, type InventoryProfileSummary } from "../services/inventoryProfiles";
import { useProducts } from "../store/useProducts";
import { useCategories } from "../store/useCategories";
import type { InventoryAdjustmentReason, Product } from "../types";
import { findProductByScanCode, matchesCatalogQuery } from "../utils/productLookup";
import { PurchaseOrderWorkflow } from "./PurchaseOrderWorkflow";
import { inventoryCsvTemplate, parseInventoryCsv } from "../utils/inventoryCsv";
import { isSupabaseConfigured } from "../lib/supabase";
import { inventoryCategoryFilterOptions } from "../inventory/categoryFilters";

type WorkspaceTab = "operations" | "orders";

const modes: Array<{
  key: InventoryOperationMode;
  label: string;
  detail: string;
  Icon: typeof Truck;
}> = [
  { key: "delivery", label: "Levering", detail: "Ontvangen stuks optellen", Icon: Truck },
  { key: "count", label: "Telling", detail: "Werkelijk aantal vastleggen", Icon: ClipboardCheck },
  { key: "correction", label: "Correctie", detail: "Schade, verlies of gevonden stock", Icon: MinusCircle },
];

const reasonLabels: Record<InventoryAdjustmentReason, string> = {
  "cycle-count": "Cyclustelling",
  "opening-balance": "Openingsvoorraad",
  damage: "Beschadigd",
  loss: "Verlies of diefstal",
  found: "Teruggevonden",
  other: "Andere reden",
};

const movementLabels = {
  "purchase-receipt": "Ontvangst",
  "webshop-reservation": "Webshopreservatie",
  "webshop-release": "Webshopvrijgave",
  "pos-sale": "Verkoop",
  "pos-refund": "Retour",
  "manual-adjustment": "Correctie",
} as const;

const newRequestId = () => globalThis.crypto?.randomUUID?.() ?? `inventory-${Date.now()}-${Math.random()}`;
const sessionKey = (storeId: string | null) => `pwayment:inventory-session-v2:${storeId ?? "local"}`;
type SavedInventorySession = {
  mode: InventoryOperationMode;
  lines: Array<{ productId: string; expectedStockQty: number; quantity: number; reason?: InventoryAdjustmentReason; note?: string }>;
  startedAt: number;
  source: "scan" | "csv";
};
const emptySession = (): SavedInventorySession => ({ mode: "delivery", lines: [], startedAt: Date.now(), source: "scan" });
const savedSession = (key: string): SavedInventorySession => {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? "null") as Record<string, unknown> | null;
    if (!value || !["delivery", "count", "correction"].includes(String(value.mode)) || !Array.isArray(value.lines)) return emptySession();
    const validLines = value.lines.every((line) => {
      if (!line || typeof line !== "object" || Array.isArray(line)) return false;
      const row = line as Record<string, unknown>;
      return typeof row.productId === "string" && row.productId.length > 0
        && Number.isSafeInteger(row.expectedStockQty) && Number(row.expectedStockQty) >= 0
        && Number.isSafeInteger(row.quantity);
    });
    if (!validLines) return emptySession();
    return {
      mode: value.mode as InventoryOperationMode,
      lines: value.lines as SavedInventorySession["lines"],
      startedAt: typeof value.startedAt === "number" && Number.isFinite(value.startedAt) ? value.startedAt : Date.now(),
      source: value.source === "csv" ? "csv" : "scan",
    };
  } catch { return emptySession(); }
};

export const InventoryWorkspace = () => {
  const role = useAuth((state) => state.currentRole);
  const currentStoreId = useAuth((state) => state.currentStoreId);
  const storageKey = useMemo(() => sessionKey(currentStoreId), [currentStoreId]);
  const initialSession = useMemo(() => savedSession(storageKey), [storageKey]);
  const products = useProducts((state) => state.list);
  const hydrate = useProducts((state) => state.hydrate);
  const refresh = useProducts((state) => state.refresh);
  const categories = useCategories((state) => state.list);
  const hydrateCategories = useCategories((state) => state.hydrate);
  const snapshot = useEntitlements((state) => state.snapshot);
  const [tab, setTab] = useState<WorkspaceTab>("operations");
  const [mode, setMode] = useState<InventoryOperationMode>(initialSession.mode);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState("1");
  const [reason, setReason] = useState<InventoryAdjustmentReason>("damage");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [profiles, setProfiles] = useState<Map<string, InventoryProfileSummary>>(new Map());
  const [profilesReady, setProfilesReady] = useState(!currentStoreId || !isSupabaseConfigured);
  const [batchActive, setBatchActive] = useState(initialSession.lines.length > 0);
  const [batchLines, setBatchLines] = useState(initialSession.lines);
  const [batchStartedAt, setBatchStartedAt] = useState(initialSession.startedAt);
  const [batchSource, setBatchSource] = useState<"scan" | "csv">(initialSession.source);
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("");
  const [changedLinesOnly, setChangedLinesOnly] = useState(false);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const canMutate = role === "owner" || role === "manager";
  const canUseOrders = isFeatureEnabledForSnapshot(snapshot, FEATURE_KEYS.purchaseOrdersCreate);
  const existingOrderCount = useLiveQuery(() => db.purchase_orders.count(), [], 0);
  const canManageOrders = canUseOrders || existingOrderCount > 0;

  useEffect(() => { void hydrate(); }, [hydrate]);
  useEffect(() => { void hydrateCategories(); }, [hydrateCategories]);
  useEffect(() => {
    let active = true;
    setProfilesReady(!currentStoreId || !isSupabaseConfigured);
    void loadInventoryProfiles().then((loaded) => {
      if (!active) return;
      setProfiles(loaded);
      setProfilesReady(true);
    }).catch(() => {
      if (!active) return;
      setProfiles(new Map());
      setProfilesReady(false);
    });
    return () => { active = false; };
  }, [currentStoreId]);
  useEffect(() => { localStorage.setItem(storageKey, JSON.stringify({ mode, lines: batchLines, startedAt: batchStartedAt, source: batchSource })); }, [storageKey, mode, batchLines, batchStartedAt, batchSource]);
  useEffect(() => { searchRef.current?.focus(); }, [mode, tab]);

  const matches = useMemo(() => {
    const candidates = products.filter((product) => product.stockQty != null
      && (!categoryFilter || product.category === categoryFilter)
      && (!supplierFilter || product.supplier === supplierFilter)
      && (
      !lowStockOnly || product.stockQty === 0 || (product.minStockQty != null && product.stockQty <= product.minStockQty)
    ));
    return query.trim() ? candidates.filter((product) => matchesCatalogQuery(product, query)).slice(0, 20) : lowStockOnly || categoryFilter || supplierFilter ? candidates.slice(0, 20) : [];
  }, [products, query, lowStockOnly, categoryFilter, supplierFilter]);
  const filterOptions = useMemo(() => ({
    categories: inventoryCategoryFilterOptions(products, categories),
    suppliers: [...new Set(products.map((product) => product.supplier).filter((value): value is string => Boolean(value)))].sort(),
  }), [categories, products]);
  const allMovements = useLiveQuery(
    async () => selected
      ? db.stock_movements.where("productId").equals(selected.id).reverse().sortBy("timestamp")
      : [],
    [selected?.id],
    [],
  );
  const orderInbox = useLiveQuery(async () => {
    const orders = await db.purchase_orders.toArray();
    const now = Date.now();
    return {
      open: orders.filter((order) => ["draft", "ordered", "partially-received"].includes(order.status)).length,
      overdue: orders.filter((order) => ["ordered", "partially-received"].includes(order.status) && order.expectedDeliveryAt != null && order.expectedDeliveryAt < now).length,
    };
  }, [], { open: 0, overdue: 0 });
  const stockInbox = useMemo(() => ({
    out: products.filter((product) => product.stockQty === 0).length,
    low: products.filter((product) => product.stockQty != null && product.stockQty > 0 && product.minStockQty != null && product.stockQty <= product.minStockQty).length,
  }), [products]);
  const relatedVariants = useMemo(() => selected ? products.filter((product) =>
    product.id !== selected.id && product.stockQty != null && (
      (selected.familyId && product.familyId === selected.familyId) || (!selected.familyId && product.name === selected.name)
    )).slice(0, 30) : [], [products, selected]);

  const choose = (product: Product, scanned = false) => {
    if (product.stockQty == null) {
      setFeedback({ tone: "error", text: "Voor dit product wordt geen voorraad bijgehouden." });
      return;
    }
    if (!profilesReady) {
      setFeedback({ tone: "error", text: "De voorraadmodus kon niet veilig worden gecontroleerd. Probeer opnieuw zodra de verbinding hersteld is." });
      return;
    }
    const profile = profiles.get(product.id);
    if (profile && profile.stockMode !== "simple") {
      setFeedback({ tone: "error", text: `${product.name} gebruikt ${profile.stockMode === "locations" ? "voorraadlocaties" : profile.stockMode === "lots" ? "lottracking" : "serienummers"}. Gebruik de gespecialiseerde workflow; de totaalstand wordt hier niet overschreven.` });
      return;
    }
    if (batchActive) {
      setBatchLines((current) => {
        const existing = current.find((line) => line.productId === product.id);
        if (existing) return current.map((line) => line.productId === product.id
          ? { ...line, quantity: mode === "delivery" ? line.quantity + 1 : line.quantity }
          : line);
        return [...current, {
          productId: product.id,
          expectedStockQty: product.stockQty!,
          quantity: mode === "count" ? product.stockQty! : 1,
          reason: mode === "correction" ? reason : undefined,
        }];
      });
      setQuery("");
      setFeedback({ tone: "success", text: `${product.name} staat in de ${mode === "delivery" ? "ontvangst" : mode === "count" ? "telsessie" : "correctiesessie"}.` });
      searchRef.current?.focus();
      return;
    }
    if (scanned && mode === "delivery" && selected?.id === product.id) {
      setQuantity((current) => String(Math.max(0, Number(current) || 0) + 1));
      setQuery("");
      setFeedback({ tone: "success", text: `${product.name}: één extra stuk in de ontvangst.` });
      searchRef.current?.focus();
      return;
    }
    setSelected(product);
    setQuantity(mode === "count" ? String(product.stockQty) : "1");
    setQuery("");
    setFeedback(null);
    searchRef.current?.focus();
  };

  const submitSearch = () => {
    const exact = findProductByScanCode(products, query);
    if (exact) {
      choose(exact.product, true);
      return;
    }
    if (matches.length === 1) choose(matches[0]);
    else if (matches.length === 0) setFeedback({ tone: "error", text: "Geen actief voorraadproduct gevonden voor deze barcode, SKU of naam." });
  };

  const changeMode = (next: InventoryOperationMode) => {
    if (batchLines.length > 0 && next !== mode) {
      setFeedback({ tone: "error", text: "Rond de actieve batch af of wis ze voordat u van bewerkingstype wisselt." });
      return;
    }
    setMode(next);
    setQuantity(next === "count" && selected?.stockQty != null ? String(selected.stockQty) : "1");
    setFeedback(null);
  };

  const parsedQuantity = Number(quantity);
  const projected = selected?.stockQty == null || !Number.isSafeInteger(parsedQuantity)
    ? null
    : mode === "count" ? parsedQuantity : selected.stockQty + parsedQuantity;

  const save = async () => {
    if (!selected || !canMutate) return;
    setBusy(true);
    setFeedback(null);
    try {
      const result = await recordInventoryOperation({
        clientRequestId: newRequestId(),
        productId: selected.id,
        expectedStockQty: selected.stockQty!,
        mode,
        quantity: parsedQuantity,
        reason: mode === "correction" ? reason : undefined,
        note,
      });
      useProducts.getState().syncPersisted([result.product]);
      setSelected(result.product);
      setQuantity(mode === "count" ? String(result.product.stockQty ?? 0) : "1");
      setNote("");
      setFeedback({
        tone: "success",
        text: result.duplicate
          ? "Deze bewerking was al verwerkt; er is niets dubbel geboekt."
          : `${result.product.name} staat nu op ${result.product.stockQty} stuks.`,
      });
      searchRef.current?.focus();
    } catch (error) {
      await refresh();
      const latest = useProducts.getState().list.find((product) => product.id === selected.id);
      if (latest) setSelected(latest);
      setFeedback({ tone: "error", text: error instanceof Error ? error.message : "De voorraadwijziging is mislukt." });
    } finally {
      setBusy(false);
    }
  };

  const saveBatch = async () => {
    if (!canMutate || batchLines.length === 0) return;
    setBusy(true);
    setFeedback(null);
    try {
      const result = await recordInventoryBatch({
        clientRequestId: newRequestId(),
        mode,
        lines: batchLines,
      });
      useProducts.getState().syncPersisted(result.products);
      setBatchLines([]);
      setBatchStartedAt(Date.now());
      setBatchSource("scan");
      setFeedback({ tone: "success", text: `${result.products.length} producten atomisch verwerkt. Iedere SKU heeft een eigen voorraadbeweging.` });
    } catch (error) {
      await refresh();
      setFeedback({ tone: "error", text: error instanceof Error ? error.message : "De volledige batch is mislukt; er is niets gedeeltelijk verwerkt." });
    } finally {
      setBusy(false);
      searchRef.current?.focus();
    }
  };

  const importInventoryFile = async (file: File) => {
    if (!profilesReady) {
      setFeedback({ tone: "error", text: "Import geweigerd: de voorraadmodi konden niet veilig worden gecontroleerd." });
      return;
    }
    const preview = parseInventoryCsv(await file.text(), products, mode, reason);
    if (preview.issues.length > 0) {
      setFeedback({ tone: "error", text: `Import niet verwerkt: ${preview.issues.slice(0, 3).map((issue) => `regel ${issue.line}: ${issue.message}`).join(" · ")}` });
      return;
    }
    const specialized = preview.lines.find((line) => profiles.get(line.productId)?.stockMode !== undefined && profiles.get(line.productId)?.stockMode !== "simple");
    if (specialized) {
      setFeedback({ tone: "error", text: `${batchProducts.get(specialized.productId)?.name ?? specialized.productId} gebruikt een gespecialiseerde voorraadmodus. De volledige import is geweigerd.` });
      return;
    }
    setBatchLines(preview.lines);
    setBatchActive(true);
    setBatchStartedAt(Date.now());
    setBatchSource("csv");
    setFeedback({ tone: "success", text: `${preview.lines.length} regels gevalideerd. Controleer de sessie en boek ze daarna atomisch.` });
  };

  const downloadText = (name: string, contents: string) => {
    const url = URL.createObjectURL(new Blob([contents], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url; link.download = name; link.click(); URL.revokeObjectURL(url);
  };

  const exportSelectedLedger = () => {
    if (!selected) return;
    const header = "tijdstip;product;sku;type;delta;voor;na;reden;actor;referentie\n";
    const rows = allMovements.map((movement) => [
      new Date(movement.timestamp).toISOString(), selected.name, selected.sku ?? "", movementLabels[movement.reason],
      movement.quantityDelta, movement.quantityBefore ?? "", movement.quantityAfter ?? "", movement.adjustmentReason ?? "",
      movement.userName ?? "", movement.clientRequestId ?? "",
    ].map((value) => `"${String(value).replaceAll('"', '""')}"`).join(";")).join("\n");
    downloadText(`voorraad-historiek-${selected.sku ?? selected.id}.csv`, header + rows);
  };

  const batchProducts = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const visibleBatchLines = useMemo(() => changedLinesOnly
    ? batchLines.filter((line) => mode !== "count" || line.quantity !== line.expectedStockQty)
    : batchLines, [batchLines, changedLinesOnly, mode]);

  return (
    <div className="h-full overflow-y-auto bg-slate-50">
      <div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6 lg:p-8">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-sky-700">Voorraadoperaties</p>
            <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-950">Scannen, boeken, klaar</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Leveringen, fysieke tellingen en correcties krijgen elk hun eigen controleerbare betekenis.</p>
          </div>
          <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
            <button type="button" onClick={() => setTab("operations")} className={`rounded-lg px-4 py-2 text-sm font-extrabold ${tab === "operations" ? "bg-slate-950 text-white" : "text-slate-600"}`}>Bijwerken</button>
            <button type="button" onClick={() => setTab("orders")} className={`rounded-lg px-4 py-2 text-sm font-extrabold ${tab === "orders" ? "bg-slate-950 text-white" : "text-slate-600"}`}>Inkooporders</button>
          </div>
        </header>

        <section aria-label="Voorraadinbox" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><button type="button" onClick={() => { setTab("operations"); setLowStockOnly(true); setQuery(""); }} className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-left"><span className="text-xs font-bold uppercase tracking-wide text-rose-700">Uitverkocht</span><strong className="mt-1 block text-2xl font-black text-rose-950">{stockInbox.out}</strong></button><button type="button" onClick={() => { setTab("operations"); setLowStockOnly(true); setQuery(""); }} className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-left"><span className="text-xs font-bold uppercase tracking-wide text-amber-700">Lage voorraad</span><strong className="mt-1 block text-2xl font-black text-amber-950">{stockInbox.low}</strong></button><button type="button" onClick={() => setTab("orders")} className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-left"><span className="text-xs font-bold uppercase tracking-wide text-sky-700">Open orders</span><strong className="mt-1 block text-2xl font-black text-sky-950">{orderInbox.open}</strong></button><button type="button" onClick={() => setTab("orders")} className="rounded-2xl border border-violet-200 bg-violet-50 p-4 text-left"><span className="text-xs font-bold uppercase tracking-wide text-violet-700">Te laat</span><strong className="mt-1 block text-2xl font-black text-violet-950">{orderInbox.overdue}</strong></button></section>

        {tab === "operations" ? (
          <>
            <div className="grid gap-3 md:grid-cols-3">
              {modes.map(({ key, label, detail, Icon }) => (
                <button key={key} type="button" onClick={() => changeMode(key)} className={`flex items-center gap-3 rounded-2xl border p-4 text-left shadow-sm transition ${mode === key ? "border-sky-300 bg-sky-50 ring-2 ring-sky-100" : "border-slate-200 bg-white hover:border-slate-300"}`}>
                  <span className={`rounded-xl p-2.5 ${mode === key ? "bg-sky-700 text-white" : "bg-slate-100 text-slate-600"}`}><Icon size={20} /></span>
                  <span><strong className="block text-sm text-slate-950">{label}</strong><span className="mt-0.5 block text-xs text-slate-500">{detail}</span></span>
                </button>
              ))}
            </div>
            <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
              <div><p className="flex items-center gap-2 text-sm font-black text-slate-900"><Layers3 size={17} className="text-sky-700" /> Persistente batchsessie</p><p className="mt-1 text-xs text-slate-500">Scans blijven bewaard na refresh. De volledige sessie slaagt of faalt als één transactie.</p></div>
              <div className="flex flex-wrap gap-2"><button type="button" onClick={() => downloadText("voorraad-import-template.csv", inventoryCsvTemplate())} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700"><Download size={14} /> Template</button><label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700"><Upload size={14} /> CSV preview<input type="file" accept=".csv,text/csv" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importInventoryFile(file); event.target.value = ""; }} /></label><button type="button" role="switch" aria-checked={batchActive} onClick={() => { if (batchActive && batchLines.length > 0) { setFeedback({ tone: "error", text: "Wis of verwerk de actieve sessie voordat u batchmodus afsluit." }); return; } if (!batchActive) { setBatchStartedAt(Date.now()); setBatchSource("scan"); } setBatchActive((active) => !active); }} className={`rounded-xl px-4 py-2 text-sm font-extrabold ${batchActive ? "bg-sky-700 text-white" : "border border-slate-300 bg-white text-slate-700"}`}>{batchActive ? `Batch actief · ${batchLines.length}` : "Batch starten"}</button></div>
            </div>

            <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
              <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                <label className="block text-sm font-extrabold text-slate-800" htmlFor="inventory-search"><span className="flex items-center gap-2"><ScanLine size={18} className="text-sky-700" /> Scan barcode of zoek product</span></label>
                <div className="mt-2 flex gap-2">
                  <div className="relative min-w-0 flex-1">
                    <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input ref={searchRef} id="inventory-search" value={query} onChange={(event) => { setQuery(event.target.value); setFeedback(null); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); submitSearch(); } }} autoComplete="off" placeholder="Barcode, SKU of productnaam" className="h-12 w-full rounded-xl border border-slate-300 pl-10 pr-3 text-sm font-semibold outline-none focus:border-sky-500 focus:ring-4 focus:ring-sky-100" />
                  </div>
                  <button type="button" onClick={submitSearch} className="h-12 rounded-xl bg-slate-950 px-4 text-sm font-extrabold text-white">Zoeken</button>
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <label className="text-xs font-bold text-slate-600">Categorie<select aria-label="Filter voorraad op categorie" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className="mt-1 h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm"><option value="">Alle categorieën</option>{filterOptions.categories.map((category) => <option key={category.value} value={category.value}>{category.label} · {category.productCount}</option>)}</select></label>
                  <label className="text-xs font-bold text-slate-600">Leverancier<select aria-label="Filter voorraad op leverancier" value={supplierFilter} onChange={(event) => setSupplierFilter(event.target.value)} className="mt-1 h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm"><option value="">Alle leveranciers</option>{filterOptions.suppliers.map((supplier) => <option key={supplier} value={supplier}>{supplier}</option>)}</select></label>
                </div>
                {lowStockOnly && <div className="mt-2 flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900"><span>Filter: lage of nulvoorraad</span><button type="button" onClick={() => setLowStockOnly(false)} className="underline">Filter wissen</button></div>}
                {matches.length > 0 && (query.trim() || lowStockOnly || categoryFilter || supplierFilter) && (
                  <div className="mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
                    {matches.map((product) => <button key={product.id} type="button" onClick={() => choose(product)} className="flex w-full items-center justify-between border-b border-slate-100 px-4 py-3 text-left last:border-0 hover:bg-sky-50"><span><strong className="block text-sm text-slate-900">{product.name}</strong><span className="text-xs text-slate-500">{product.sku || product.barcode || "Geen productcode"}{product.variant ? ` · ${product.variant}` : ""}</span></span><span className="rounded-lg bg-slate-100 px-2.5 py-1 text-sm font-black text-slate-700">{product.stockQty}</span></button>)}
                  </div>
                )}

                {selected ? (
                  <div className="mt-6 space-y-5 border-t border-slate-100 pt-5">
                    <div className="flex flex-col gap-3 rounded-2xl border border-sky-100 bg-sky-50/70 p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div><h2 className="text-lg font-black text-slate-950">{selected.name}</h2><p className="mt-1 text-xs font-semibold text-slate-500">{selected.sku ? `SKU ${selected.sku}` : "Geen SKU"}{selected.barcode ? ` · ${selected.barcode}` : ""}{selected.variant ? ` · ${selected.variant}` : ""}</p></div>
                      <div className="text-left sm:text-right"><span className="text-xs font-bold uppercase tracking-wide text-slate-500">Actuele voorraad</span><strong className="block text-3xl font-black text-slate-950">{selected.stockQty}</strong></div>
                    </div>
                    {relatedVariants.length > 0 && <div><p className="text-xs font-black uppercase tracking-wide text-slate-500">Variantenmatrix</p><div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{[selected, ...relatedVariants].map((variant) => <button key={variant.id} type="button" onClick={() => choose(variant)} className={`flex items-center justify-between rounded-xl border px-3 py-2 text-left ${variant.id === selected.id ? "border-sky-300 bg-sky-50" : "border-slate-200"}`}><span className="min-w-0"><strong className="block truncate text-xs text-slate-900">{variant.variant || variant.name}</strong><span className="text-[10px] text-slate-500">{variant.sku || "Geen SKU"}</span></span><span className="ml-2 font-black text-slate-800">{variant.stockQty}</span></button>)}</div></div>}
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="text-sm font-extrabold text-slate-700">{mode === "count" ? "Werkelijk geteld aantal" : mode === "delivery" ? "Ontvangen aantal" : "Correctie (+ of −)"}<input type="number" step="1" min={mode === "correction" ? undefined : mode === "delivery" ? 1 : 0} value={quantity} onChange={(event) => setQuantity(event.target.value)} className="mt-2 h-12 w-full rounded-xl border border-slate-300 px-3 text-lg font-black outline-none focus:border-sky-500 focus:ring-4 focus:ring-sky-100" /></label>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><span className="text-xs font-bold uppercase tracking-wide text-slate-500">Nieuwe voorraad</span><strong className={`mt-1 block text-3xl font-black ${projected != null && projected >= 0 ? "text-slate-950" : "text-rose-700"}`}>{projected ?? "—"}</strong></div>
                    </div>
                    {mode === "correction" && <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-extrabold text-slate-700">Reden<select value={reason} onChange={(event) => setReason(event.target.value as InventoryAdjustmentReason)} className="mt-2 h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm"><option value="damage">Beschadigd</option><option value="loss">Verlies of diefstal</option><option value="found">Teruggevonden</option><option value="other">Andere reden</option></select></label><label className="text-sm font-extrabold text-slate-700">Notitie {reason === "other" ? "(verplicht)" : "(optioneel)"}<input value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} className="mt-2 h-11 w-full rounded-xl border border-slate-300 px-3 text-sm" /></label></div>}
                    {!canMutate && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900">Alleen een manager of eigenaar kan voorraad boeken.</div>}
                    <button type="button" disabled={!canMutate || busy || projected == null || projected < 0} onClick={() => void save()} className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-sky-700 px-5 text-sm font-black text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-50"><PackageCheck size={18} />{busy ? "Veilig verwerken…" : mode === "delivery" ? "Ontvangst boeken" : mode === "count" ? "Telling bevestigen" : "Correctie boeken"}</button>
                  </div>
                ) : <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-10 text-center"><ScanLine size={30} className="mx-auto text-slate-400" /><p className="mt-3 text-sm font-extrabold text-slate-700">Scan of zoek het eerste product</p><p className="mt-1 text-xs text-slate-500">Een scan selecteert onmiddellijk de juiste SKU.</p></div>}
                {feedback && <div role={feedback.tone === "error" ? "alert" : "status"} className={`mt-4 flex items-start gap-2 rounded-xl border p-3 text-sm font-semibold ${feedback.tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"}`}>{feedback.tone === "success" ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}<span>{feedback.text}</span></div>}
                {batchActive && batchLines.length > 0 && <section className="mt-5 border-t border-slate-100 pt-5"><div className="flex items-start justify-between gap-3"><div><h2 className="text-sm font-black text-slate-900">Actieve sessie · {batchLines.length} SKU's</h2><p className="mt-1 text-[11px] font-semibold text-slate-500">{batchSource === "csv" ? "CSV-preview" : "Scansessie"} · gestart {new Intl.DateTimeFormat("nl-BE", { dateStyle: "short", timeStyle: "short" }).format(batchStartedAt)}</p></div><div className="flex flex-col items-end gap-1"><button type="button" onClick={() => setChangedLinesOnly((current) => !current)} className="text-xs font-bold text-sky-700">{changedLinesOnly ? "Toon alle lijnen" : "Alleen gewijzigd"}</button><button type="button" onClick={() => setBatchLines([])} className="inline-flex items-center gap-1 text-xs font-bold text-rose-700"><Trash2 size={14} /> Wissen</button></div></div><div className="mt-3 space-y-2">{visibleBatchLines.map((line) => { const product = batchProducts.get(line.productId); return <div key={line.productId} className="grid gap-2 rounded-xl border border-slate-200 p-3 sm:grid-cols-[minmax(0,1fr)_110px_36px] sm:items-center"><div><strong className="block truncate text-sm text-slate-900">{product?.name ?? line.productId}</strong><span className="text-xs text-slate-500">Startstand {line.expectedStockQty}</span></div><input aria-label={`Sessieaantal voor ${product?.name ?? line.productId}`} type="number" value={line.quantity} onChange={(event) => setBatchLines((current) => current.map((item) => item.productId === line.productId ? { ...item, quantity: Number(event.target.value) } : item))} className="h-9 rounded-lg border border-slate-300 px-2 text-center font-bold" /><button type="button" aria-label={`${product?.name ?? line.productId} uit sessie verwijderen`} onClick={() => setBatchLines((current) => current.filter((item) => item.productId !== line.productId))} className="text-slate-400 hover:text-rose-700"><Trash2 size={16} /></button></div>; })}{visibleBatchLines.length === 0 && <p className="rounded-xl bg-slate-50 p-3 text-xs font-semibold text-slate-500">Geen gewijzigde lijnen in deze telling.</p>}</div><button type="button" disabled={!canMutate || busy} onClick={() => void saveBatch()} className="mt-4 h-12 w-full rounded-xl bg-slate-950 text-sm font-black text-white disabled:opacity-50">{busy ? "Volledige batch valideren…" : `Verwerk ${batchLines.length} SKU's atomisch`}</button></section>}
              </section>

              <aside className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between gap-2"><h2 className="flex items-center gap-2 text-sm font-black text-slate-900"><History size={17} className="text-sky-700" /> Voorraadspoor</h2>{selected && allMovements.length > 0 && <button type="button" onClick={exportSelectedLedger} className="inline-flex items-center gap-1 text-xs font-bold text-sky-700"><Download size={13} /> Alles als CSV</button>}</div>
                {!selected ? <p className="mt-4 text-sm leading-6 text-slate-500">Selecteer een product om zijn controleerbare voorraadspoor te zien.</p> : allMovements.length === 0 ? <p className="mt-4 text-sm text-slate-500">Nog geen bewegingen voor dit product.</p> : <><ol className="mt-4 space-y-3">{allMovements.slice(0, 20).map((movement, index) => <li key={movement.id ?? `${movement.timestamp}-${index}`} className="rounded-xl border border-slate-100 bg-slate-50 p-3"><div className="flex items-center justify-between gap-3"><span className="text-xs font-extrabold text-slate-700">{movementLabels[movement.reason]}</span><strong className={movement.quantityDelta >= 0 ? "text-emerald-700" : "text-rose-700"}>{movement.quantityDelta >= 0 ? "+" : ""}{movement.quantityDelta}</strong></div><p className="mt-1 text-[11px] text-slate-500">{new Intl.DateTimeFormat("nl-BE", { dateStyle: "short", timeStyle: "short" }).format(movement.timestamp)}{movement.adjustmentReason ? ` · ${reasonLabels[movement.adjustmentReason]}` : ""}</p>{movement.quantityAfter != null && <p className="mt-1 text-xs font-semibold text-slate-600">Stand na boeking: {movement.quantityAfter}</p>}</li>)}</ol>{allMovements.length > 20 && <p className="mt-3 text-xs font-semibold text-slate-500">{allMovements.length - 20} oudere bewegingen staan mee in de volledige CSV-export.</p>}</>}
              </aside>
            </div>
          </>
        ) : canManageOrders ? (
          <section className="rounded-3xl bg-zinc-950 p-5 shadow-sm sm:p-7"><PurchaseOrderWorkflow refreshKey={0} onInventoryChanged={refresh} /></section>
        ) : (
          <section className="rounded-3xl border border-amber-200 bg-amber-50 p-8 text-center"><h2 className="font-black text-amber-950">Inkooporders zijn niet actief in dit abonnement</h2><p className="mt-2 text-sm text-amber-800">De operationele voorraadmodule blijft beschikbaar voor leveringen, tellingen en correcties.</p></section>
        )}
      </div>
    </div>
  );
};
