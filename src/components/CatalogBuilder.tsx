import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, Check, ChevronRight, Copy, FileSpreadsheet, Layers3,
  PackagePlus, Plus, RotateCcw, Save, X,
} from "lucide-react";
import type {
  ManualCatalogFamilyPayload, Product, ProductCategory, ProductIdentifier,
} from "../types";
import { formatEUR, parseDecimalToCents } from "../utils/money";
import { slugifyId } from "../utils/productCsv";

type BuilderView = "start" | "quick" | "variants";
type VariantDimension = { id: string; name: string; valuesText: string };
type VariantOverride = {
  sku?: string;
  barcode?: string;
  supplierCode?: string;
  priceText?: string;
  costText?: string;
  stockText?: string;
  minStockText?: string;
};
type Feedback = { tone: "error" | "success" | "info"; text: string };

interface SharedFields {
  category: string;
  subCategory: string;
  brand: string;
  supplier: string;
  supplierCode: string;
  tracksStock: boolean;
  minStock: string;
}

interface QuickFields extends SharedFields {
  name: string;
  price: string;
  cost: string;
  stock: string;
  sku: string;
  barcode: string;
}

interface FamilyFields extends SharedFields {
  name: string;
  price: string;
  cost: string;
  skuPrefix: string;
}

interface DraftState {
  view: BuilderView;
  quick: QuickFields;
  family: FamilyFields;
  dimensions: VariantDimension[];
  overrides: Record<string, VariantOverride>;
  excluded: string[];
}

export interface CatalogBuilderProps {
  categories: ProductCategory[];
  products: Product[];
  defaultVat: number;
  categoryVatById: Map<string, number>;
  draftKey: string;
  editingFamilyId?: string;
  onClose: () => void;
  onOpenFullEditor: (seed?: Product) => void;
  onOpenImport: () => void;
  onSaveProducts: (products: Product[], family?: ManualCatalogFamilyPayload) => Promise<void>;
}

const inputClass = "mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-900 outline-none transition focus:border-sky-700 focus:ring-4 focus:ring-sky-100";
const labelClass = "block text-[11px] font-black uppercase tracking-[0.12em] text-slate-500";
const clean = (value: string) => value.trim();
const cents = (value: string) => {
  const parsed = parseDecimalToCents(value);
  return parsed.ok ? parsed.cents : null;
};
const whole = (value: string) => {
  const parsed = Number(value.trim() || "0");
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
};
const uuid = () => globalThis.crypto?.randomUUID?.()
  ?? "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    return (character === "x" ? random : (random & 0x3) | 0x8).toString(16);
  });
const normalized = (value: string) => clean(value).toLocaleLowerCase("nl-BE");
const values = (text: string) => {
  const result = new Map<string, string>();
  for (const raw of text.split(/[,;\n]/)) {
    const value = clean(raw);
    if (value && !result.has(normalized(value))) result.set(normalized(value), value);
  }
  return [...result.values()];
};
const signature = (options: Record<string, string>) => Object.entries(options)
  .map(([name, value]) => [normalized(name), normalized(value)] as const)
  .sort(([left], [right]) => left.localeCompare(right, "nl-BE"))
  .map(([name, value]) => `${name}:${value}`)
  .join("|");
const labelFor = (options: Record<string, string>) => Object.entries(options)
  .map(([name, value]) => `${name}: ${value}`).join(" · ");
const combinationsFor = (dimensions: Array<{ name: string; values: string[] }>) =>
  dimensions.length === 0 ? [] : dimensions.reduce<Array<Record<string, string>>>(
    (rows, dimension) => rows.flatMap((row) => dimension.values.map((value) => ({ ...row, [dimension.name]: value }))),
    [{}],
  );
const uniqueProductId = (base: string, used: Set<string>) => {
  const safe = slugifyId(base) || "product";
  let candidate = safe;
  let suffix = 2;
  while (used.has(candidate)) candidate = `${safe}-${suffix++}`;
  used.add(candidate);
  return candidate;
};
const identifiersFor = (sku?: string, barcode?: string, supplierCode?: string, existing?: Product): ProductIdentifier[] => {
  const result: ProductIdentifier[] = [];
  if (sku) result.push({ type: "internal-sku", value: sku, isScannable: true, isPrimary: !barcode });
  if (barcode) {
    const digits = barcode.replace(/\s/g, "");
    const type = /^\d{12}$/.test(digits) ? "upc"
      : /^\d{8}$|^\d{13}$|^\d{14}$/.test(digits) ? "ean" : "alternate";
    result.push({ type, value: barcode, isScannable: true, isPrimary: true });
  }
  if (supplierCode) result.push({ type: "supplier-code", value: supplierCode, isScannable: false, isPrimary: false });
  const replacedValues = new Set([existing?.sku, existing?.barcode, existing?.supplierCode]
    .filter((value): value is string => Boolean(value))
    .map((value) => normalized(value.replace(/\s/g, ""))));
  const generatedValues = new Set(result.map((identifier) => normalized(identifier.value.replace(/\s/g, ""))));
  for (const identifier of existing?.identifiers ?? []) {
    const valueKey = normalized(identifier.value.replace(/\s/g, ""));
    if (replacedValues.has(valueKey) || generatedValues.has(valueKey)) continue;
    result.push({ ...identifier, isPrimary: result.length === 0 ? identifier.isPrimary : false });
  }
  return result;
};
const moneyText = (value?: number) => value == null ? "" : (value / 100).toFixed(2).replace(".", ",");

export const CatalogBuilder: React.FC<CatalogBuilderProps> = ({
  categories, products, defaultVat, categoryVatById, draftKey, editingFamilyId,
  onClose, onOpenFullEditor, onOpenImport, onSaveProducts,
}) => {
  const activeCategories = categories.filter((category) => category.isActive !== false);
  const firstCategory = activeCategories[0]?.id ?? "";
  const familyMembers = useMemo(
    () => editingFamilyId ? products.filter((product) => product.familyId === editingFamilyId) : [],
    [editingFamilyId, products],
  );
  const activeFamilyMembers = useMemo(
    () => familyMembers.filter((product) => product.isActive !== false),
    [familyMembers],
  );
  const firstMember = activeFamilyMembers[0] ?? familyMembers[0];
  const initialDimensions = useMemo<VariantDimension[]>(() => {
    if (familyMembers.length === 0) return [
      { id: uuid(), name: "Maat", valuesText: "" },
      { id: uuid(), name: "Kleur", valuesText: "" },
    ];
    const grouped = new Map<string, { label: string; values: Map<string, string> }>();
    const dimensionSource = activeFamilyMembers.length > 0 ? activeFamilyMembers : familyMembers;
    for (const member of dimensionSource) for (const [name, value] of Object.entries(member.variantOptions ?? {})) {
      const key = normalized(name);
      const group = grouped.get(key) ?? { label: name, values: new Map() };
      group.values.set(normalized(value), value);
      grouped.set(key, group);
    }
    return [...grouped.values()].map((group) => ({
      id: uuid(), name: group.label, valuesText: [...group.values.values()].join(", "),
    }));
  }, [activeFamilyMembers, familyMembers]);
  const baseShared: SharedFields = {
    category: firstMember?.category ?? firstCategory,
    subCategory: firstMember?.subCategory ?? "",
    brand: firstMember?.brand ?? "",
    supplier: firstMember?.supplier ?? "",
    supplierCode: firstMember?.supplierCode ?? "",
    tracksStock: firstMember ? firstMember.stockQty != null : true,
    minStock: String(firstMember?.minStockQty ?? 0),
  };
  const defaultQuick: QuickFields = {
    ...baseShared, name: "", price: "", cost: "", stock: "0", sku: "", barcode: "",
  };
  const defaultFamily: FamilyFields = {
    ...baseShared,
    name: firstMember?.name ?? "",
    price: moneyText(firstMember?.priceCents),
    cost: moneyText(firstMember?.costPriceCents),
    skuPrefix: "",
  };
  const initialOverrides = useMemo(() => Object.fromEntries(familyMembers.map((member) => [
    signature(member.variantOptions ?? {}),
    {
      sku: member.sku ?? "", barcode: member.barcode ?? "",
      supplierCode: member.supplierCode ?? "",
      priceText: moneyText(member.priceCents), costText: moneyText(member.costPriceCents),
      stockText: String(member.stockQty ?? 0), minStockText: String(member.minStockQty ?? 0),
    } satisfies VariantOverride,
  ])), [familyMembers]);

  const [view, setView] = useState<BuilderView>(editingFamilyId ? "variants" : "start");
  const [quick, setQuick] = useState<QuickFields>(defaultQuick);
  const [family, setFamily] = useState<FamilyFields>(defaultFamily);
  const [dimensions, setDimensions] = useState<VariantDimension[]>(initialDimensions);
  const [overrides, setOverrides] = useState<Record<string, VariantOverride>>(initialOverrides);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [saving, setSaving] = useState(false);
  const [recent, setRecent] = useState<Product[]>([]);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [discardPrompt, setDiscardPrompt] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const quickNameRef = useRef<HTMLInputElement | null>(null);
  const initializedFamilyRef = useRef<string | null>(familyMembers.length > 0 ? editingFamilyId ?? null : null);
  const initializedExclusionsRef = useRef<string | null>(null);

  const variantDimensions = useMemo(() => dimensions
    .map((dimension) => ({ name: clean(dimension.name), values: values(dimension.valuesText) }))
    .filter((dimension) => dimension.name && dimension.values.length > 0), [dimensions]);
  const duplicateDimension = new Set(variantDimensions.map((dimension) => normalized(dimension.name))).size !== variantDimensions.length;
  const combinations = useMemo(() => combinationsFor(variantDimensions), [variantDimensions]);
  const existingBySignature = useMemo(() => new Map(familyMembers.map((member) => [
    signature(member.variantOptions ?? {}), member,
  ])), [familyMembers]);

  useEffect(() => {
    if (!editingFamilyId || familyMembers.length === 0 || initializedFamilyRef.current === editingFamilyId) return;
    setQuick(defaultQuick);
    setFamily(defaultFamily);
    setDimensions(initialDimensions);
    setOverrides(initialOverrides);
    setView("variants");
    setSaved(false);
    setDirty(false);
    initializedFamilyRef.current = editingFamilyId;
    initializedExclusionsRef.current = null;
  }, [editingFamilyId, familyMembers.length, initialDimensions, initialOverrides]);

  useEffect(() => {
    if (!editingFamilyId || combinations.length === 0 || initializedExclusionsRef.current === editingFamilyId) return;
    const activeSignatures = new Set(familyMembers.filter((member) => member.isActive !== false)
      .map((member) => signature(member.variantOptions ?? {})));
    setExcluded(new Set(combinations.map(signature).filter((key) => !activeSignatures.has(key))));
    initializedExclusionsRef.current = editingFamilyId;
  }, [editingFamilyId, combinations, familyMembers]);

  useEffect(() => {
    if (editingFamilyId) return;
    try {
      const stored = localStorage.getItem(draftKey);
      if (!stored) return;
      const draft = JSON.parse(stored) as Partial<DraftState>;
      if (draft.quick && draft.family && draft.dimensions) {
        setView(draft.view ?? "quick"); setQuick(draft.quick); setFamily(draft.family);
        setDimensions(draft.dimensions); setOverrides(draft.overrides ?? {});
        setExcluded(new Set(draft.excluded ?? [])); setDraftRestored(true); setDirty(true);
      }
    } catch { localStorage.removeItem(draftKey); }
  }, [draftKey, editingFamilyId]);

  useEffect(() => {
    if (!dirty || editingFamilyId || saved) return;
    const draft: DraftState = { view, quick, family, dimensions, overrides, excluded: [...excluded] };
    localStorage.setItem(draftKey, JSON.stringify(draft));
  }, [dirty, saved, view, quick, family, dimensions, overrides, excluded, draftKey, editingFamilyId]);

  const markDirty = () => { setDirty(true); setSaved(false); setFeedback(null); };
  const setQuickFields = (patch: Partial<QuickFields>) => { setQuick((current) => ({ ...current, ...patch })); markDirty(); };
  const setFamilyFields = (patch: Partial<FamilyFields>) => { setFamily((current) => ({ ...current, ...patch })); markDirty(); };
  const currentVat = (category: string) => categoryVatById.get(category) ?? defaultVat;
  const knownScanCode = useMemo(() => new Map<string, string>(products.flatMap((product) => [
    [normalized((product.sku ?? "").replace(/\s/g, "")), product.id] as const,
    [normalized((product.barcode ?? "").replace(/\s/g, "")), product.id] as const,
  ]).filter(([key]) => Boolean(key))), [products]);

  const buildQuick = (): Product | null => {
    const price = cents(quick.price); const cost = quick.cost ? cents(quick.cost) : 0;
    const stock = whole(quick.stock); const minStock = whole(quick.minStock);
    if (!clean(quick.name)) return setFeedback({ tone: "error", text: "Geef dit product een naam." }), null;
    if (!quick.category) return setFeedback({ tone: "error", text: "Kies een categorie." }), null;
    if (price == null || price <= 0 || cost == null || cost < 0) return setFeedback({ tone: "error", text: "Controleer verkoop- en aankoopprijs." }), null;
    if (quick.tracksStock && (stock == null || minStock == null)) return setFeedback({ tone: "error", text: "Voorraad moet een geheel getal van nul of meer zijn." }), null;
    const sku = clean(quick.sku); const barcode = clean(quick.barcode); const supplierCode = clean(quick.supplierCode);
    const skuKey = normalized(sku.replace(/\s/g, "")); const barcodeKey = normalized(barcode.replace(/\s/g, ""));
    if (sku && barcode && skuKey === barcodeKey) return setFeedback({ tone: "error", text: "SKU en barcode moeten verschillende scancodes zijn." }), null;
    if (sku && knownScanCode.has(skuKey)) return setFeedback({ tone: "error", text: `SKU ${sku} bestaat al als SKU of barcode.` }), null;
    if (barcode && knownScanCode.has(barcodeKey)) return setFeedback({ tone: "error", text: `Barcode ${barcode} bestaat al als SKU of barcode.` }), null;
    const used = new Set(products.map((product) => product.id));
    return {
      id: uniqueProductId(`${quick.brand || "product"}-${quick.name}`, used),
      name: clean(quick.name), category: quick.category, subCategory: clean(quick.subCategory) || undefined,
      brand: clean(quick.brand) || undefined, supplier: clean(quick.supplier) || undefined,
      supplierCode: supplierCode || undefined, sku: sku || undefined, barcode: barcode || undefined,
      identifiers: identifiersFor(sku, barcode, supplierCode), priceCents: price, costPriceCents: cost,
      vatRate: currentVat(quick.category), stockQty: quick.tracksStock ? stock! : undefined,
      minStockQty: quick.tracksStock ? minStock! : undefined, color: "bg-sky-700",
      productType: "merchandise", isActive: true,
    };
  };

  const saveQuick = async (next: "next" | "duplicate" | "done") => {
    const product = buildQuick(); if (!product) return;
    setSaving(true); setFeedback(null);
    try {
      await onSaveProducts([product]);
      setRecent((current) => [product, ...current].slice(0, 5));
      localStorage.removeItem(draftKey); setSaved(true); setDirty(false);
      if (next === "done") return onClose();
      setQuickFields({ name: next === "duplicate" ? `${product.name} kopie` : "", sku: "", barcode: "", stock: "0" });
      setSaved(false);
      setFeedback({ tone: "success", text: `${product.name} is veilig toegevoegd. De gedeelde gegevens blijven staan.` });
      requestAnimationFrame(() => quickNameRef.current?.focus());
    } catch (error) {
      setFeedback({ tone: "error", text: error instanceof Error ? error.message : "Opslaan is mislukt." });
    } finally { setSaving(false); }
  };

  const preview = useMemo(() => combinations.map((options) => {
    const key = signature(options); const override = overrides[key] ?? {}; const existing = existingBySignature.get(key);
    const suffix = Object.values(options).map((value) => slugifyId(value).toUpperCase()).filter(Boolean).join("-");
    return {
      key, options, existing, included: !excluded.has(key), label: labelFor(options),
      sku: override.sku ?? existing?.sku ?? (family.skuPrefix ? `${clean(family.skuPrefix)}-${suffix}` : ""),
      barcode: override.barcode ?? existing?.barcode ?? "",
      supplierCode: override.supplierCode ?? existing?.supplierCode ?? family.supplierCode,
      price: override.priceText ?? (moneyText(existing?.priceCents) || family.price),
      cost: override.costText ?? (moneyText(existing?.costPriceCents) || family.cost),
      stock: override.stockText ?? String(existing?.stockQty ?? 0),
      minStock: override.minStockText ?? String(existing?.minStockQty ?? whole(family.minStock) ?? 0),
    };
  }), [combinations, overrides, existingBySignature, excluded, family]);
  const activePreviewCount = preview.filter((row) => row.included).length;

  const updateOverride = (key: string, patch: VariantOverride) => {
    setOverrides((current) => ({ ...current, [key]: { ...current[key], ...patch } })); markDirty();
  };
  const toggleCombination = (key: string) => {
    setExcluded((current) => { const next = new Set(current); next.has(key) ? next.delete(key) : next.add(key); return next; }); markDirty();
  };
  const setAllCombinations = (included: boolean) => {
    setExcluded(included ? new Set() : new Set(preview.map((row) => row.key)));
    markDirty();
  };

  const saveFamily = async () => {
    const activeRows = preview.filter((row) => row.included);
    if (!clean(family.name) || !family.category) return setFeedback({ tone: "error", text: "Vul familienaam en categorie in." });
    if (duplicateDimension || variantDimensions.length === 0) return setFeedback({ tone: "error", text: "Gebruik minstens één unieke variantgroep met waarden." });
    if (activeRows.length === 0 || activeRows.length > 100) return setFeedback({ tone: "error", text: "Selecteer tussen 1 en 100 verkoopbare varianten." });
    const usedIds = new Set(products.map((product) => product.id));
    const scanCodeOwners = new Map(knownScanCode);
    const activeProducts: Product[] = [];
    for (const row of activeRows) {
      const price = cents(row.price); const cost = row.cost ? cents(row.cost) : 0;
      const stock = whole(row.stock); const minStock = whole(row.minStock);
      if (price == null || price <= 0 || cost == null || cost < 0 || (family.tracksStock && (stock == null || minStock == null))) {
        return setFeedback({ tone: "error", text: `Controleer prijs en voorraad voor ${row.label}.` });
      }
      const sku = clean(row.sku); const barcode = clean(row.barcode); const supplierCode = clean(row.supplierCode); const existingId = row.existing?.id;
      const skuKey = normalized(sku.replace(/\s/g, "")); const barcodeKey = normalized(barcode.replace(/\s/g, ""));
      if (sku && barcode && skuKey === barcodeKey) return setFeedback({ tone: "error", text: `SKU en barcode zijn gelijk voor ${row.label}. Gebruik twee verschillende codes.` });
      const skuOwner = scanCodeOwners.get(skuKey); const barcodeOwner = scanCodeOwners.get(barcodeKey);
      if (sku && skuOwner && skuOwner !== existingId) return setFeedback({ tone: "error", text: `SKU ${sku} wordt al als SKU of barcode gebruikt.` });
      if (barcode && barcodeOwner && barcodeOwner !== existingId) return setFeedback({ tone: "error", text: `Barcode ${barcode} wordt al als SKU of barcode gebruikt.` });
      const id = existingId ?? uniqueProductId(`${family.brand || "product"}-${family.name}-${row.label}`, usedIds);
      if (sku) scanCodeOwners.set(skuKey, id); if (barcode) scanCodeOwners.set(barcodeKey, id);
      activeProducts.push({
        ...row.existing, id, name: clean(family.name), category: family.category,
        subCategory: clean(family.subCategory) || undefined, brand: clean(family.brand) || undefined,
        supplier: clean(family.supplier) || undefined, supplierCode: supplierCode || undefined,
        variant: row.label, variantOptions: row.options, familyId: editingFamilyId ?? "",
        sku: sku || undefined, barcode: barcode || undefined, identifiers: identifiersFor(sku, barcode, supplierCode, row.existing),
        priceCents: price, costPriceCents: cost, vatRate: currentVat(family.category),
        stockQty: family.tracksStock ? (row.existing?.stockQty ?? stock!) : undefined,
        minStockQty: family.tracksStock ? minStock! : undefined, color: row.existing?.color ?? "bg-sky-700",
        productType: "merchandise", isActive: true,
      });
    }
    const familyId = editingFamilyId ?? uuid();
    for (const product of activeProducts) product.familyId = familyId;
    const activeIds = new Set(activeProducts.map((product) => product.id));
    const archived = familyMembers.filter((member) => !activeIds.has(member.id) && member.isActive !== false)
      .map((member) => ({ ...member, isActive: false }));
    const familyPayload: ManualCatalogFamilyPayload = {
      familyId, name: clean(family.name), brand: clean(family.brand) || undefined,
      categoryExternalId: family.category,
      variants: activeProducts.map((product) => ({
        productExternalId: product.id, displayName: product.variant ?? "Variant",
        options: Object.entries(product.variantOptions ?? {}).map(([name, value]) => ({ name, value })),
      })),
      archiveProductExternalIds: archived.map((product) => product.id),
    };
    setSaving(true); setFeedback(null);
    try {
      await onSaveProducts([...activeProducts, ...archived], familyPayload);
      localStorage.removeItem(draftKey); setRecent(activeProducts.slice(0, 5)); setSaved(true); setDirty(false);
      setFeedback({ tone: "success", text: `${activeProducts.length} varianten zijn als één productfamilie bewaard${archived.length ? `; ${archived.length} oude variant${archived.length === 1 ? " is" : "en zijn"} gearchiveerd` : ""}.` });
    } catch (error) {
      setFeedback({ tone: "error", text: error instanceof Error ? error.message : "De productfamilie kon niet worden bewaard." });
    } finally { setSaving(false); }
  };

  const requestClose = () => dirty && !saved ? setDiscardPrompt(true) : onClose();
  const clearDraft = () => { localStorage.removeItem(draftKey); setDirty(false); onClose(); };
  const openFullEditor = () => {
    const price = cents(quick.price); const cost = cents(quick.cost);
    const stock = whole(quick.stock); const minStock = whole(quick.minStock);
    const sku = clean(quick.sku); const barcode = clean(quick.barcode); const supplierCode = clean(quick.supplierCode);
    onOpenFullEditor({
      id: "", name: clean(quick.name), category: quick.category || firstCategory,
      subCategory: clean(quick.subCategory) || undefined, brand: clean(quick.brand) || undefined,
      supplier: clean(quick.supplier) || undefined, supplierCode: supplierCode || undefined,
      sku: sku || undefined, barcode: barcode || undefined,
      identifiers: identifiersFor(sku, barcode, supplierCode), priceCents: price ?? 0,
      costPriceCents: cost ?? 0, vatRate: currentVat(quick.category || firstCategory),
      stockQty: quick.tracksStock ? stock ?? 0 : undefined,
      minStockQty: quick.tracksStock ? minStock ?? 0 : undefined,
      color: "bg-sky-700", productType: "merchandise", isActive: true,
    });
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="flex flex-col gap-4 border-b border-slate-200 bg-white px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-7">
        <div className="flex items-start gap-3">
          {view !== "start" && !editingFamilyId && <button type="button" onClick={() => setView("start")} className="mt-0.5 rounded-xl p-2 text-slate-500 hover:bg-slate-100" aria-label="Terug"><ArrowLeft size={18} /></button>}
          <div><p className="text-[11px] font-black uppercase tracking-[0.14em] text-sky-800">Productbeheer</p>
            <h2 className="mt-0.5 text-xl font-black tracking-tight text-slate-950">{editingFamilyId ? `Familie bewerken · ${firstMember?.name ?? "Product"}` : view === "start" ? "Producten toevoegen" : view === "quick" ? "Snelle invoersessie" : "Variantenmatrix"}</h2>
            <p className="mt-1 max-w-3xl text-sm leading-5 text-slate-500">{view === "variants" ? "Gedeelde gegevens één keer; afwijkingen, openingsvoorraad en codes per variant." : "Werk product per product, plak waarden of open een importbestand. Je invoer wordt als concept bewaard."}</p>
          </div>
        </div>
        <button type="button" onClick={requestClose} className="self-start rounded-xl px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 sm:self-auto">Sluiten</button>
      </header>

      <div className="p-5 sm:p-7">
        {draftRestored && <Notice tone="info" text="Je onafgewerkte invoersessie is hersteld." action={<button onClick={() => setDraftRestored(false)} className="font-black underline">Melding sluiten</button>} />}
        {discardPrompt && <Notice tone="error" text="Je hebt nog niet opgeslagen werk. Wil je dit concept echt verwijderen?" action={<div className="flex gap-2"><button onClick={() => setDiscardPrompt(false)} className="font-black underline">Verderwerken</button><button onClick={clearDraft} className="font-black text-rose-800 underline">Concept verwijderen</button></div>} />}

        {view === "start" && <div className="grid gap-3 lg:grid-cols-3">
          <Choice icon={<PackagePlus size={22} />} title="Product per product" detail="Categorie, btw, merk en leverancier blijven staan. Ideaal met scanner en toetsenbord." action="Start invoeren" onClick={() => setView("quick")} />
          <Choice icon={<Layers3 size={22} />} title="Product met varianten" detail="Maak maten, kleuren of formaten in één controleerbare matrix." action="Open matrix" onClick={() => setView("variants")} />
          <Choice icon={<FileSpreadsheet size={22} />} title="Excel of CSV" detail="Voor grote bestaande lijsten blijft de gecontroleerde importflow het snelst." action="Open import" onClick={onOpenImport} subtle />
        </div>}

        {view === "quick" && <form onSubmit={(event) => { event.preventDefault(); void saveQuick("next"); }} className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
          <div className="space-y-5">
            <SharedPanel fields={quick} categories={activeCategories} vat={currentVat(quick.category)} onChange={setQuickFields} />
            <div className="rounded-2xl border border-slate-200 p-4 sm:p-5">
              <div className="mb-4"><h3 className="font-black text-slate-950">Volgend product</h3><p className="mt-1 text-xs text-slate-500">Druk op Enter om veilig op te slaan en meteen verder te gaan.</p></div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div className="sm:col-span-2 lg:col-span-3"><TextField ref={quickNameRef} label="Productnaam *" value={quick.name} onChange={(name) => setQuickFields({ name })} autoFocus /></div>
                <MoneyField label="Verkoopprijs incl. btw *" value={quick.price} onChange={(price) => setQuickFields({ price })} />
                <MoneyField label="Aankoopprijs excl. btw" value={quick.cost} onChange={(cost) => setQuickFields({ cost })} />
                {quick.tracksStock && <TextField label="Openingsvoorraad" value={quick.stock} onChange={(stock) => setQuickFields({ stock })} inputMode="numeric" />}
                <TextField label="SKU / artikelcode" value={quick.sku} onChange={(sku) => setQuickFields({ sku })} />
                <TextField label="Barcode / EAN" value={quick.barcode} onChange={(barcode) => setQuickFields({ barcode })} placeholder="scan of typ" />
              </div>
              <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
                <button type="button" onClick={openFullEditor} className="rounded-xl px-3 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50">Meer details</button>
                <button type="button" disabled={saving} onClick={() => void saveQuick("done")} className="rounded-xl px-3 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-50">Opslaan & klaar</button>
                <button type="button" disabled={saving} onClick={() => void saveQuick("duplicate")} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs font-black"><Copy size={14} /> Opslaan & dupliceren</button>
                <button type="submit" disabled={saving} className="inline-flex items-center gap-1.5 rounded-xl border border-[#0e7490] bg-[#0e7490] px-4 py-2.5 text-xs font-black text-white shadow-sm transition hover:border-[#0f6677] hover:bg-[#0f6677] disabled:cursor-not-allowed disabled:opacity-50"><Check size={15} /> {saving ? "Bewaren…" : "Opslaan & volgende"}</button>
              </div>
            </div>
          </div><SessionRail recent={recent} />
        </form>}

        {view === "variants" && <div className="space-y-5">
          <SharedPanel fields={family} categories={activeCategories} vat={currentVat(family.category)} family onChange={setFamilyFields} />
          <div className="rounded-2xl border border-slate-200 p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-black text-slate-950">2. Variantgroepen</h3><p className="mt-1 text-xs text-slate-500">Scheid waarden met komma, puntkomma of een nieuwe regel.</p></div><button type="button" onClick={() => { setDimensions((current) => [...current, { id: uuid(), name: "", valuesText: "" }]); markDirty(); }} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-black"><Plus size={14} /> Groep toevoegen</button></div>
            <div className="mt-4 space-y-3">{dimensions.map((dimension) => <div key={dimension.id} className="grid gap-3 rounded-xl bg-slate-50 p-3 sm:grid-cols-[180px_1fr_38px]"><TextField label="Groep" value={dimension.name} onChange={(name) => { setDimensions((current) => current.map((item) => item.id === dimension.id ? { ...item, name } : item)); markDirty(); }} placeholder="Maat" compact /><TextField label="Waarden" value={dimension.valuesText} onChange={(valuesText) => { setDimensions((current) => current.map((item) => item.id === dimension.id ? { ...item, valuesText } : item)); markDirty(); }} placeholder="S, M, L" compact /><button type="button" onClick={() => { setDimensions((current) => current.filter((item) => item.id !== dimension.id)); markDirty(); }} className="self-end rounded-lg p-2 text-slate-400 hover:bg-white hover:text-rose-700" aria-label="Variantgroep verwijderen"><X size={17} /></button></div>)}</div>
          </div>
          <div className="overflow-hidden rounded-2xl border border-slate-200">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
              <div><h3 className="font-black text-slate-950">3. Controleer de verkoopbare varianten</h3><p className="mt-1 text-xs text-slate-500">Vink combinaties uit die je niet verkoopt. Bestaande voorraad is alleen via een telling wijzigbaar.</p></div>
              <div className="flex flex-wrap items-center gap-2">
                {preview.length > 0 && <div className="inline-flex rounded-xl border border-slate-200 bg-white p-0.5">
                  <button type="button" onClick={() => setAllCombinations(true)} disabled={activePreviewCount === preview.length} className="rounded-lg px-2.5 py-1.5 text-[11px] font-black text-slate-700 hover:bg-slate-50 disabled:text-slate-300">Alles aan</button>
                  <button type="button" onClick={() => setAllCombinations(false)} disabled={activePreviewCount === 0} className="rounded-lg px-2.5 py-1.5 text-[11px] font-black text-slate-700 hover:bg-slate-50 disabled:text-slate-300">Alles uit</button>
                </div>}
                <span className={`rounded-full px-3 py-1 text-xs font-black ${activePreviewCount > 100 ? "bg-rose-100 text-rose-800" : "bg-sky-100 text-sky-800"}`}>{activePreviewCount}/100 actief</span>
              </div>
            </div>
            {preview.length === 0 ? <div className="p-8 text-center text-sm font-semibold text-slate-500">Vul hierboven minstens één variantgroep en waarde in.</div> : <>
              <div className="border-b border-slate-100 bg-white px-4 py-2 text-[11px] font-semibold text-slate-500">De selectie en variantnaam blijven zichtbaar terwijl je naar prijzen en codes schuift.</div>
              <div className="max-h-[480px] overflow-auto"><table className="min-w-[1260px] w-full text-left text-xs"><thead className="text-[10px] uppercase tracking-wider text-slate-400"><tr><th className="sticky left-0 top-0 z-30 w-[72px] bg-white px-4 py-3">Actief</th><th className="sticky left-[72px] top-0 z-30 min-w-56 bg-white px-3 py-3 shadow-[8px_0_12px_-12px_rgba(15,23,42,0.65)]">Variant</th><th className="sticky top-0 z-10 bg-white px-3 py-3">SKU</th><th className="sticky top-0 z-10 bg-white px-3 py-3">Barcode</th><th className="sticky top-0 z-10 bg-white px-3 py-3">Leverancierscode</th><th className="sticky top-0 z-10 bg-white px-3 py-3 text-right">Verkoop</th><th className="sticky top-0 z-10 bg-white px-3 py-3 text-right">Aankoop</th><th className="sticky top-0 z-10 bg-white px-3 py-3 text-right">Voorraad</th><th className="sticky top-0 z-10 bg-white px-4 py-3 text-right">Minimum</th></tr></thead><tbody className="divide-y divide-slate-100">{preview.map((row) => <tr key={row.key} className={row.included ? "group bg-white hover:bg-sky-50/35" : "group bg-slate-50 text-slate-400"}><td className={`sticky left-0 z-20 px-4 py-2 ${row.included ? "bg-white group-hover:bg-sky-50" : "bg-slate-50"}`}><input type="checkbox" checked={row.included} onChange={() => toggleCombination(row.key)} className="h-4 w-4 rounded border-slate-300 accent-[#0e7490]" aria-label={`${row.label} actief`} /></td><td className={`sticky left-[72px] z-20 px-3 py-2.5 font-bold shadow-[8px_0_12px_-12px_rgba(15,23,42,0.65)] ${row.included ? "bg-white text-slate-800 group-hover:bg-sky-50" : "bg-slate-50"}`}>{row.label}</td><GridInput label={`SKU voor ${row.label}`} value={row.sku} onChange={(sku) => updateOverride(row.key, { sku })} disabled={!row.included} /><GridInput label={`Barcode voor ${row.label}`} value={row.barcode} onChange={(barcode) => updateOverride(row.key, { barcode })} disabled={!row.included} /><GridInput label={`Leverancierscode voor ${row.label}`} value={row.supplierCode} onChange={(supplierCode) => updateOverride(row.key, { supplierCode })} disabled={!row.included} /><GridInput label={`Verkoopprijs voor ${row.label}`} value={row.price} onChange={(priceText) => updateOverride(row.key, { priceText })} right disabled={!row.included} /><GridInput label={`Aankoopprijs voor ${row.label}`} value={row.cost} onChange={(costText) => updateOverride(row.key, { costText })} right disabled={!row.included} /><td className="px-3 py-2 text-right">{row.existing ? <span className="font-black text-slate-700" title="Wijzig via voorraadtelling">{row.existing.stockQty ?? "—"}</span> : <input aria-label={`Openingsvoorraad voor ${row.label}`} value={row.stock} onChange={(event) => updateOverride(row.key, { stockText: event.target.value })} disabled={!row.included || !family.tracksStock} inputMode="numeric" className="w-20 rounded-lg border border-slate-200 px-2.5 py-1.5 text-right font-semibold outline-none focus:border-[#0e7490] focus:ring-2 focus:ring-cyan-100" />}</td><GridInput label={`Minimumvoorraad voor ${row.label}`} value={row.minStock} onChange={(minStockText) => updateOverride(row.key, { minStockText })} right disabled={!row.included || !family.tracksStock} /></tr>)}</tbody></table></div>
            </>}
          </div>
          <div className="sticky bottom-3 z-20 flex flex-col gap-3 rounded-2xl border border-cyan-200 bg-white/95 p-4 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-black text-slate-900">{editingFamilyId ? "Wijzigingen gecontroleerd opslaan" : "Productfamilie aanmaken"}</p><p className="mt-0.5 text-xs text-slate-500">{activePreviewCount} verkoopbare variant{activePreviewCount === 1 ? "" : "en"}. Producten, codes, familie en openingsbalansen worden als één opdracht bewaard.</p></div><button type="button" disabled={saving || saved || activePreviewCount === 0} onClick={() => void saveFamily()} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-[#0e7490] bg-[#0e7490] px-5 py-3 text-xs font-black text-white shadow-sm transition hover:border-[#0f6677] hover:bg-[#0f6677] disabled:cursor-not-allowed disabled:opacity-50">{saved ? <Check size={16} /> : <Save size={16} />} {saving ? "Bewaren…" : saved ? "Opgeslagen" : editingFamilyId ? "Familie bijwerken" : "Familie opslaan"}</button></div>
        </div>}

        {feedback && <Notice tone={feedback.tone} text={feedback.text} action={saved ? <button onClick={onClose} className="font-black underline">Terug naar catalogus</button> : undefined} />}
      </div>
    </section>
  );
};

const SharedPanel = ({ fields, categories, vat, family, onChange }: { fields: SharedFields & Partial<FamilyFields>; categories: ProductCategory[]; vat: number; family?: boolean; onChange: (patch: Partial<FamilyFields & QuickFields>) => void }) => <div className="rounded-2xl border border-sky-100 bg-sky-50/45 p-4 sm:p-5"><h3 className="font-black text-slate-950">{family ? "1. Gedeelde productgegevens" : "Deze gegevens blijven staan"}</h3><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{family && <div className="sm:col-span-2 lg:col-span-3"><TextField label="Naam productfamilie *" value={fields.name ?? ""} onChange={(name) => onChange({ name })} /></div>}<SelectField label="Categorie" value={fields.category} categories={categories} onChange={(category) => onChange({ category })} /><TextField label="Subcategorie" value={fields.subCategory} onChange={(subCategory) => onChange({ subCategory })} /><TextField label="Merk" value={fields.brand} onChange={(brand) => onChange({ brand })} /><TextField label="Leverancier" value={fields.supplier} onChange={(supplier) => onChange({ supplier })} /><TextField label="Leverancierscode" value={fields.supplierCode} onChange={(supplierCode) => onChange({ supplierCode })} />{family && <><MoneyField label="Basis verkoopprijs" value={fields.price ?? ""} onChange={(price) => onChange({ price })} /><MoneyField label="Basis aankoopprijs" value={fields.cost ?? ""} onChange={(cost) => onChange({ cost })} /><TextField label="SKU-prefix" value={fields.skuPrefix ?? ""} onChange={(skuPrefix) => onChange({ skuPrefix })} /></>}<TextField label="Minimumvoorraad" value={fields.minStock} onChange={(minStock) => onChange({ minStock })} inputMode="numeric" /><Toggle label="Voorraad volgen" checked={fields.tracksStock} onChange={(tracksStock) => onChange({ tracksStock })} /></div><p className="mt-3 text-[11px] font-semibold text-slate-500">BTW {vat}% wordt overgenomen van de gekozen categorie.</p></div>;
const Choice = ({ icon, title, detail, action, onClick, subtle }: { icon: React.ReactNode; title: string; detail: string; action: string; onClick: () => void; subtle?: boolean }) => <button type="button" onClick={onClick} className={`group flex min-h-48 flex-col items-start rounded-2xl border p-5 text-left transition ${subtle ? "border-slate-200 bg-slate-50 hover:bg-white" : "border-slate-200 bg-white hover:border-sky-300 hover:shadow-sm"}`}><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-sky-50 text-sky-800">{icon}</span><h3 className="mt-4 text-base font-black text-slate-950">{title}</h3><p className="mt-1.5 text-sm leading-5 text-slate-500">{detail}</p><span className="mt-auto inline-flex items-center gap-1 pt-4 text-xs font-black text-sky-800">{action}<ChevronRight size={14} /></span></button>;
const TextField = React.forwardRef<HTMLInputElement, { label: string; value: string; onChange: (value: string) => void; placeholder?: string; inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"]; autoFocus?: boolean; compact?: boolean }>(({ label, value, onChange, placeholder, inputMode, autoFocus, compact }, ref) => <label className={labelClass}>{label}<input ref={ref} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} inputMode={inputMode} autoFocus={autoFocus} className={compact ? "mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold outline-none focus:border-sky-700" : inputClass} /></label>);
TextField.displayName = "TextField";
const MoneyField = ({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) => <label className={labelClass}>{label}<span className="relative mt-1.5 block"><span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">€</span><input value={value} onChange={(event) => onChange(event.target.value)} inputMode="decimal" placeholder="0,00" className={`${inputClass} mt-0 pl-7`} /></span></label>;
const SelectField = ({ label, value, categories, onChange }: { label: string; value: string; categories: ProductCategory[]; onChange: (value: string) => void }) => <label className={labelClass}>{label}<select value={value} onChange={(event) => onChange(event.target.value)} className={inputClass}>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>;
const Toggle = ({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) => <label className={`${labelClass} flex min-h-[42px] cursor-pointer items-end gap-3 pb-2.5`}><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4 rounded border-slate-300" /><span className="normal-case tracking-normal text-sm font-bold text-slate-700">{label}</span></label>;
const GridInput = ({ label, value, onChange, disabled, right }: { label: string; value: string; onChange: (value: string) => void; disabled?: boolean; right?: boolean }) => <td className="px-3 py-2"><input aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} className={`w-full rounded-lg border border-slate-200 px-2.5 py-1.5 font-semibold outline-none focus:border-[#0e7490] focus:ring-2 focus:ring-cyan-100 disabled:bg-transparent ${right ? "text-right" : ""}`} /></td>;
const Notice = ({ tone, text, action }: { tone: Feedback["tone"]; text: string; action?: React.ReactNode }) => <div role={tone === "error" ? "alert" : "status"} className={`mt-4 flex flex-col gap-2 rounded-xl border px-4 py-3 text-sm font-semibold sm:flex-row sm:items-center sm:justify-between ${tone === "error" ? "border-rose-200 bg-rose-50 text-rose-900" : tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-sky-200 bg-sky-50 text-sky-900"}`}><span>{text}</span>{action}</div>;
const SessionRail = ({ recent }: { recent: Product[] }) => <aside className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="flex items-center gap-2 text-sm font-black text-slate-900"><RotateCcw size={16} className="text-sky-800" /> Invoersessie</div><p className="mt-2 text-xs leading-5 text-slate-500">Gedeelde gegevens en je onafgewerkte concept blijven behouden.</p><div className="mt-5 border-t border-slate-200 pt-4"><p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Recent toegevoegd</p>{recent.length === 0 ? <p className="mt-2 text-xs font-semibold text-slate-400">Je eerste product verschijnt hier.</p> : <ul className="mt-2 space-y-2">{recent.map((product) => <li key={product.id} className="rounded-xl bg-white px-3 py-2 text-xs"><p className="truncate font-black text-slate-800">{product.name}</p><p className="mt-0.5 text-slate-500">{formatEUR(product.priceCents)} · voorraad {product.stockQty ?? "—"}</p></li>)}</ul>}</div></aside>;
