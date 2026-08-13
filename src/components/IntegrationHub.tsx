import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronRight,
  Database,
  Download,
  FileJson,
  FileSpreadsheet,
  History,
  Layers3,
  RefreshCw,
  Sparkles,
  UploadCloud,
} from "lucide-react";
import { audit } from "../auth/useAuth";
import { db } from "../db/db";
import { useCategories } from "../store/useCategories";
import { useProducts } from "../store/useProducts";
import type {
  ImportFieldMapping,
  ImportJob,
  ImportMappingProfile,
  Product,
} from "../types";
import {
  inferMappings,
  parseImportFile,
  type ParsedImportFile,
} from "../utils/integrationImport";
import { formatEUR, parseDecimalToCents } from "../utils/money";
import { normalizePriceGroup } from "../utils/pricing";

const CORE_TARGETS = [
  ["ignore", "Niet importeren"],
  ["core:id", "Extern ID"],
  ["core:name", "Productnaam"],
  ["core:category", "Categorie"],
  ["core:sku", "SKU / artikelcode"],
  ["core:barcode", "Barcode / EAN / GTIN"],
  ["core:brand", "Merk"],
  ["core:supplier", "Leverancier"],
  ["core:supplierCode", "Leverancierscode"],
  ["core:variant", "Variant"],
  ["core:costPrice", "Aankoopprijs"],
  ["core:sellingPrice", "Standaard verkoopprijs"],
  ["core:vatRate", "BTW-percentage"],
  ["core:stockQty", "Voorraad"],
] as const;

const DEFAULT_PRICE_GROUPS = [
  "telenet-klant",
  "niet-klant",
  "b2b",
  "medewerker",
  "contract",
  "promo",
];

const valueFor = (
  row: string[],
  parsed: ParsedImportFile,
  mappings: ImportFieldMapping[],
  target: string,
): string => {
  const mapping = mappings.find((candidate) => candidate.target === target);
  if (!mapping) return "";
  const index = parsed.headers.indexOf(mapping.source);
  return index < 0 ? "" : row[index]?.trim() ?? "";
};

const slugify = (value: string): string =>
  value
    .toLocaleLowerCase("nl-BE")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);

const parseInteger = (value: string): number | undefined => {
  if (!value.trim()) return undefined;
  const normalized = value.replace(/\s/g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : undefined;
};

const parseVat = (value: string, fallback: number): number | null => {
  if (!value.trim()) return fallback;
  const parsed = Number(value.replace("%", "").replace(",", ".").trim());
  if (!Number.isFinite(parsed)) return null;
  const rate = parsed > 0 && parsed < 1 ? Math.round(parsed * 100) : Math.round(parsed);
  return [0, 6, 12, 21].includes(rate) ? rate : null;
};

const readPrice = (value: string): number | null | undefined => {
  if (!value.trim()) return undefined;
  const parsed = parseDecimalToCents(value);
  return parsed.ok ? parsed.cents : null;
};

const formatDateTime = (timestamp: number): string =>
  new Intl.DateTimeFormat("nl-BE", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(timestamp);

const fileTypeLabel = (format: ParsedImportFile["format"]): string =>
  format === "xlsx" ? "Excel" : format.toUpperCase();

interface ImportPreview {
  valid: number;
  newCount: number;
  updateCount: number;
  issueCount: number;
  priceGroups: string[];
}

const computePreview = (
  parsed: ParsedImportFile | null,
  mappings: ImportFieldMapping[],
  products: Product[],
): ImportPreview => {
  if (!parsed) return { valid: 0, newCount: 0, updateCount: 0, issueCount: 0, priceGroups: [] };
  const existingKeys = new Set(
    products.flatMap((product) =>
      [product.id, product.sku, product.barcode]
        .filter((value): value is string => Boolean(value))
        .map((value) => value.toLocaleLowerCase("nl-BE")),
    ),
  );
  let valid = 0;
  let newCount = 0;
  let updateCount = 0;
  let issueCount = 0;
  parsed.rows.forEach((row) => {
    const name = valueFor(row, parsed, mappings, "core:name");
    const sellingPrice = readPrice(valueFor(row, parsed, mappings, "core:sellingPrice"));
    const vat = parseVat(valueFor(row, parsed, mappings, "core:vatRate"), 21);
    const candidateKeys = [
      valueFor(row, parsed, mappings, "core:id"),
      valueFor(row, parsed, mappings, "core:sku"),
      valueFor(row, parsed, mappings, "core:barcode"),
    ]
      .filter(Boolean)
      .map((value) => value.toLocaleLowerCase("nl-BE"));
    const updatesExisting = candidateKeys.some((key) => existingKeys.has(key));
    if (!name || sellingPrice === null || vat == null || (sellingPrice == null && !updatesExisting)) {
      issueCount += 1;
      return;
    }
    valid += 1;
    if (updatesExisting) updateCount += 1;
    else newCount += 1;
  });
  return {
    valid,
    newCount,
    updateCount,
    issueCount,
    priceGroups: Array.from(
      new Set(
        mappings
          .filter((mapping) => mapping.target.startsWith("price:"))
          .map((mapping) => mapping.target.slice(6)),
      ),
    ),
  };
};

export const IntegrationHub: React.FC = () => {
  const products = useProducts((state) => state.list);
  const hydrateProducts = useProducts((state) => state.hydrate);
  const bulkUpsert = useProducts((state) => state.bulkUpsert);
  const categories = useCategories((state) => state.list);
  const hydrateCategories = useCategories((state) => state.hydrate);
  const addCategory = useCategories((state) => state.addCategory);
  const jobs = useLiveQuery(() => db.import_jobs.orderBy("createdAt").reverse().limit(8).toArray()) ?? [];
  const profiles = useLiveQuery(() => db.import_mapping_profiles.orderBy("updatedAt").reverse().toArray()) ?? [];

  const inputRef = useRef<HTMLInputElement | null>(null);
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<ParsedImportFile | null>(null);
  const [mappings, setMappings] = useState<ImportFieldMapping[]>([]);
  const [profileName, setProfileName] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    void Promise.all([hydrateProducts(), hydrateCategories()]);
  }, [hydrateCategories, hydrateProducts]);

  const preview = useMemo(
    () => computePreview(parsed, mappings, products),
    [mappings, parsed, products],
  );
  const discoveredGroups = useMemo(
    () =>
      Array.from(
        new Set([
          ...DEFAULT_PRICE_GROUPS,
          ...mappings
            .filter((mapping) => mapping.target.startsWith("price:"))
            .map((mapping) => mapping.target.slice(6)),
        ]),
      ),
    [mappings],
  );

  const loadFile = async (file: File) => {
    setIsParsing(true);
    setMessage(null);
    try {
      const next = await parseImportFile(file);
      const inferred = inferMappings(next.headers);
      setFileName(file.name);
      setParsed(next);
      setMappings(inferred);
      setProfileName(`${file.name.replace(/\.[^.]+$/, "")} mapping`);
      await audit("import.preview", {
        fileName: file.name,
        format: next.format,
        rows: next.rows.length,
      });
    } catch (error) {
      setParsed(null);
      setMappings([]);
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Dit bestand kon niet worden gelezen.",
      });
    } finally {
      setIsParsing(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const updateMapping = (source: string, target: string) => {
    setMappings((current) =>
      current.map((mapping) =>
        mapping.source === source ? { ...mapping, target, confidence: 1 } : mapping,
      ),
    );
  };

  const applyProfile = (profile: ImportMappingProfile) => {
    if (!parsed) return;
    const bySource = new Map(profile.mappings.map((mapping) => [mapping.source, mapping]));
    setMappings(
      parsed.headers.map((header) => bySource.get(header) ?? inferMappings([header])[0]),
    );
    setProfileName(profile.name);
    setMessage({ tone: "success", text: `Mapping “${profile.name}” toegepast.` });
  };

  const performImport = async () => {
    if (!parsed || !fileName || isImporting) return;
    setIsImporting(true);
    setMessage(null);
    const jobId = globalThis.crypto.randomUUID();
    const issues: ImportJob["issues"] = [];
    try {
      const categoryNames = Array.from(
        new Set(
          parsed.rows
            .map((row) => valueFor(row, parsed, mappings, "core:category").trim())
            .filter(Boolean),
        ),
      );
      if (categoryNames.length === 0) categoryNames.push("Geïmporteerd");

      const categoryMap = new Map(
        useCategories
          .getState()
          .list.map((category) => [category.name.toLocaleLowerCase("nl-BE"), category.id]),
      );
      for (const name of categoryNames) {
        const key = name.toLocaleLowerCase("nl-BE");
        if (categoryMap.has(key)) continue;
        const added = await addCategory(name);
        const resolved = added ?? useCategories.getState().list.find(
          (category) => category.name.toLocaleLowerCase("nl-BE") === key,
        );
        if (resolved) categoryMap.set(key, resolved.id);
      }

      const currentProducts = useProducts.getState().list;
      const byId = new Map(currentProducts.map((product) => [product.id.toLocaleLowerCase("nl-BE"), product]));
      const bySku = new Map(
        currentProducts
          .filter((product) => product.sku)
          .map((product) => [product.sku!.toLocaleLowerCase("nl-BE"), product]),
      );
      const byBarcode = new Map(
        currentProducts
          .filter((product) => product.barcode)
          .map((product) => [product.barcode!.toLocaleLowerCase("nl-BE"), product]),
      );
      const prepared = new Map<string, Product>();
      const incomingIds = new Set<string>();
      const incomingSkus = new Set<string>();
      const incomingBarcodes = new Set<string>();
      let updatedCount = 0;

      parsed.rows.forEach((row, rowIndex) => {
        const rowNumber = rowIndex + 2;
        const name = valueFor(row, parsed, mappings, "core:name");
        if (!name) {
          issues.push({ row: rowNumber, message: "Productnaam ontbreekt." });
          return;
        }
        const explicitId = valueFor(row, parsed, mappings, "core:id");
        const incomingSku = valueFor(row, parsed, mappings, "core:sku") || undefined;
        const incomingBarcode = valueFor(row, parsed, mappings, "core:barcode") || undefined;
        const normalizedId = explicitId.toLocaleLowerCase("nl-BE");
        const normalizedSku = incomingSku?.toLocaleLowerCase("nl-BE");
        const normalizedBarcode = incomingBarcode?.toLocaleLowerCase("nl-BE");
        if (
          (normalizedId && incomingIds.has(normalizedId)) ||
          (normalizedSku && incomingSkus.has(normalizedSku)) ||
          (normalizedBarcode && incomingBarcodes.has(normalizedBarcode))
        ) {
          issues.push({ row: rowNumber, message: "Dubbel extern ID, SKU of barcode in het bestand." });
          return;
        }
        if (normalizedId) incomingIds.add(normalizedId);
        if (normalizedSku) incomingSkus.add(normalizedSku);
        if (normalizedBarcode) incomingBarcodes.add(normalizedBarcode);
        const existing =
          (explicitId ? byId.get(explicitId.toLocaleLowerCase("nl-BE")) : undefined) ??
          (incomingSku ? bySku.get(incomingSku.toLocaleLowerCase("nl-BE")) : undefined) ??
          (incomingBarcode ? byBarcode.get(incomingBarcode.toLocaleLowerCase("nl-BE")) : undefined);
        const sku = incomingSku ?? existing?.sku;
        const barcode = incomingBarcode ?? existing?.barcode;
        const standardPrice = readPrice(valueFor(row, parsed, mappings, "core:sellingPrice"));
        const costPrice = readPrice(valueFor(row, parsed, mappings, "core:costPrice"));
        const vatRate = parseVat(
          valueFor(row, parsed, mappings, "core:vatRate"),
          existing?.vatRate ?? 21,
        );
        if (standardPrice === null || costPrice === null) {
          issues.push({ row: rowNumber, message: "Prijsformaat is ongeldig of dubbelzinnig." });
          return;
        }
        if (standardPrice == null && !existing) {
          issues.push({ row: rowNumber, message: "Standaard verkoopprijs ontbreekt voor een nieuw product." });
          return;
        }
        if (vatRate == null) {
          issues.push({ row: rowNumber, message: "BTW moet 0, 6, 12 of 21% zijn." });
          return;
        }
        const importedCategoryName = valueFor(row, parsed, mappings, "core:category");
        const categoryName = importedCategoryName || "Geïmporteerd";
        const category = importedCategoryName
          ? categoryMap.get(categoryName.toLocaleLowerCase("nl-BE"))
          : existing?.category ?? categoryMap.get("geïmporteerd");
        if (!category) {
          issues.push({ row: rowNumber, message: `Categorie “${categoryName}” kon niet worden gemaakt.` });
          return;
        }
        const priceTiers = { ...(existing?.priceTiers ?? {}) };
        const customFields = { ...(existing?.customFields ?? {}) };
        mappings.forEach((mapping) => {
          const columnIndex = parsed.headers.indexOf(mapping.source);
          const rawValue = row[columnIndex]?.trim() ?? "";
          if (!rawValue) return;
          if (mapping.target.startsWith("price:")) {
            const tierPrice = readPrice(rawValue);
            if (tierPrice === null) {
              issues.push({ row: rowNumber, message: `Ongeldige prijs in “${mapping.source}”.` });
            } else if (tierPrice != null) {
              priceTiers[normalizePriceGroup(mapping.target.slice(6))] = tierPrice;
            }
          }
          if (mapping.target.startsWith("custom:")) {
            customFields[mapping.target.slice(7)] = rawValue;
          }
        });

        const baseId = slugify(explicitId || incomingSku || incomingBarcode || name) || globalThis.crypto.randomUUID();
        let id = existing?.id ?? baseId;
        if (!existing) {
          let suffix = 2;
          while (byId.has(id.toLocaleLowerCase("nl-BE")) || prepared.has(id)) {
            id = `${baseId}-${suffix}`;
            suffix += 1;
          }
        }
        const next: Product = {
          ...(existing ?? {}),
          id,
          name,
          category,
          sku,
          barcode,
          brand: valueFor(row, parsed, mappings, "core:brand") || existing?.brand,
          supplier: valueFor(row, parsed, mappings, "core:supplier") || existing?.supplier,
          supplierCode:
            valueFor(row, parsed, mappings, "core:supplierCode") || existing?.supplierCode,
          variant: valueFor(row, parsed, mappings, "core:variant") || existing?.variant,
          priceCents: standardPrice ?? existing?.priceCents ?? 0,
          costPriceCents: costPrice ?? existing?.costPriceCents,
          vatRate,
          stockQty:
            parseInteger(valueFor(row, parsed, mappings, "core:stockQty")) ??
            existing?.stockQty,
          priceTiers,
          customFields,
          productType: existing?.productType ?? "merchandise",
          isActive: true,
        };
        if (existing) updatedCount += 1;
        prepared.set(id, next);
      });

      const importedProducts = Array.from(prepared.values());
      if (importedProducts.length === 0) {
        throw new Error("Geen geldige producten gevonden. Controleer minstens de kolom Productnaam.");
      }
      await bulkUpsert(importedProducts);

      const now = Date.now();
      const profile: ImportMappingProfile = {
        id: globalThis.crypto.randomUUID(),
        name: profileName.trim() || `${fileName} mapping`,
        format: parsed.format,
        mappings,
        createdAt: now,
        updatedAt: now,
        lastUsedAt: now,
      };
      await db.import_mapping_profiles.put(profile);
      const job: ImportJob = {
        id: jobId,
        fileName,
        format: parsed.format,
        status: issues.length > 0 ? "completed-with-errors" : "completed",
        createdAt: now,
        completedAt: now,
        rowCount: parsed.rows.length,
        importedCount: importedProducts.length - updatedCount,
        updatedCount,
        skippedCount: parsed.rows.length - importedProducts.length,
        errorCount: issues.length,
        mappings,
        profileId: profile.id,
        affectedProductIds: importedProducts.map((product) => product.id),
        issues: issues.slice(0, 100),
      };
      await db.import_jobs.put(job);
      await audit("import.complete", {
        jobId,
        fileName,
        imported: job.importedCount,
        updated: job.updatedCount,
        skipped: job.skippedCount,
      });
      setMessage({
        tone: "success",
        text: `${job.importedCount} nieuwe en ${job.updatedCount} bestaande producten verwerkt. Ze staan meteen in de kassa.`,
      });
      setParsed(null);
      setMappings([]);
      setFileName("");
    } catch (error) {
      const text = error instanceof Error ? error.message : "Import mislukt.";
      await db.import_jobs.put({
        id: jobId,
        fileName,
        format: parsed.format,
        status: "failed",
        createdAt: Date.now(),
        completedAt: Date.now(),
        rowCount: parsed.rows.length,
        importedCount: 0,
        updatedCount: 0,
        skippedCount: parsed.rows.length,
        errorCount: 1,
        mappings,
        affectedProductIds: [],
        issues: [{ row: 0, message: text }],
      });
      setMessage({ tone: "error", text });
    } finally {
      setIsImporting(false);
    }
  };

  const downloadExample = () => {
    const content = [
      "Artikelcode;Productnaam;Categorie;Merk;Leverancier;Leverancierscode;EAN;Aankoopprijs;Verkoopprijs;Prijs Telenet klant;Prijs B2B;Voorraad;BTW;Kleur",
      "MOD-360;360-modem;Netwerk;Telenet;Telenet;TEL-MOD-360;5410000000011;64,00;99,00;79,00;74,00;12;21;Zwart",
      "REP-DIAG;Diagnose toestel;Services;;;SERV-DIAG;;0,00;35,00;25,00;30,00;;21;",
    ].join("\n");
    const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "pwayment-integration-hub-voorbeeld.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="flex-1 overflow-y-auto bg-slate-50">
      <div className="mx-auto max-w-[1500px] space-y-6 p-4 sm:p-6 lg:p-8">
        <section className="overflow-hidden rounded-3xl bg-slate-950 text-white shadow-xl">
          <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[1.35fr_0.65fr] lg:p-10">
            <div>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-sky-400/30 bg-sky-400/10 px-3 py-1 text-xs font-bold text-sky-200">
                <Sparkles size={14} /> Universele onboardinglaag
              </div>
              <h1 className="max-w-3xl text-3xl font-black tracking-tight sm:text-4xl">
                Integration Hub
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300 sm:text-base">
                Importeer de bestaande productwereld van een winkel zoals ze vandaag bestaat. Pwayment herkent kolommen, bewaart onbekende velden en maakt klantprijzen direct bruikbaar aan de kassa.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                {["CSV & TSV", "Excel .xlsx", "JSON", "Eigen velden", "Onbeperkte prijsgroepen"].map((label) => (
                  <span key={label} className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-bold text-white/90">
                    {label}
                  </span>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 self-end">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-2xl font-black">{products.length}</div>
                <div className="mt-1 text-xs font-semibold text-slate-400">producten klaar</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-2xl font-black">{jobs.filter((job) => job.status.startsWith("completed")).length}</div>
                <div className="mt-1 text-xs font-semibold text-slate-400">imports voltooid</div>
              </div>
              <div className="col-span-2 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-emerald-100">
                <div className="flex items-center gap-2 text-sm font-extrabold"><Check size={16} /> Geen vaste template vereist</div>
                <p className="mt-1 text-xs text-emerald-100/75">Kolommen worden gemapt vóór er ook maar één product wijzigt.</p>
              </div>
            </div>
          </div>
        </section>

        {message && (
          <div className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${message.tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-red-200 bg-red-50 text-red-900"}`} role={message.tone === "error" ? "alert" : "status"}>
            {message.text}
          </div>
        )}

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
            {!parsed ? (
              <>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="text-xs font-black uppercase tracking-[0.18em] text-sky-600">Stap 1</div>
                    <h2 className="mt-1 text-xl font-black text-slate-950">Breng uw bestand binnen</h2>
                    <p className="mt-1 text-sm text-slate-500">Geen kolommen hernoemen. Geen Pwayment-template invullen.</p>
                  </div>
                  <button type="button" onClick={downloadExample} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">
                    <Download size={15} /> Voorbeeldbestand
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  onDragEnter={(event) => { event.preventDefault(); setIsDragging(true); }}
                  onDragOver={(event) => event.preventDefault()}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(event) => {
                    event.preventDefault();
                    setIsDragging(false);
                    const file = event.dataTransfer.files[0];
                    if (file) void loadFile(file);
                  }}
                  className={`mt-6 flex min-h-64 w-full flex-col items-center justify-center rounded-3xl border-2 border-dashed px-6 text-center transition ${isDragging ? "border-sky-500 bg-sky-50" : "border-slate-300 bg-slate-50 hover:border-sky-400 hover:bg-sky-50/60"}`}
                >
                  <span className="rounded-2xl bg-white p-4 text-sky-600 shadow-sm"><UploadCloud size={32} /></span>
                  <span className="mt-4 text-base font-black text-slate-900">{isParsing ? "Bestand analyseren…" : "Sleep uw stockbestand hierheen"}</span>
                  <span className="mt-1 text-sm text-slate-500">of klik om CSV, TSV, Excel of JSON te kiezen</span>
                  <span className="mt-5 rounded-full bg-slate-200/70 px-3 py-1 text-[11px] font-bold text-slate-600">Uw bestaande structuur mag blijven bestaan</span>
                </button>
                <input ref={inputRef} type="file" accept=".csv,.tsv,.xlsx,.json,text/csv,text/tab-separated-values,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void loadFile(file); }} />
              </>
            ) : (
              <>
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-5">
                  <div>
                    <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-sky-600"><FileSpreadsheet size={15} /> Stap 2 · Slimme mapping</div>
                    <h2 className="mt-2 text-xl font-black text-slate-950">{fileName}</h2>
                    <p className="mt-1 text-sm text-slate-500">{fileTypeLabel(parsed.format)} · {parsed.rows.length} rijen · {parsed.headers.length} kolommen{parsed.sheetName ? ` · tabblad ${parsed.sheetName}` : ""}</p>
                  </div>
                  <button type="button" onClick={() => { setParsed(null); setMappings([]); setFileName(""); }} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">Ander bestand</button>
                </div>

                {profiles.length > 0 && (
                  <div className="mt-5 flex flex-wrap items-center gap-2">
                    <span className="mr-1 text-xs font-bold text-slate-500">Bewaarde mapping:</span>
                    {profiles.slice(0, 4).map((profile) => (
                      <button key={profile.id} type="button" onClick={() => applyProfile(profile)} className="rounded-full border border-slate-200 px-3 py-1 text-xs font-bold text-slate-700 hover:border-sky-300 hover:bg-sky-50">{profile.name}</button>
                    ))}
                  </div>
                )}

                <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
                  <div className="grid grid-cols-[minmax(130px,0.8fr)_36px_minmax(180px,1fr)_minmax(130px,0.8fr)] gap-2 bg-slate-50 px-4 py-3 text-[10px] font-black uppercase tracking-wider text-slate-500">
                    <span>Uw kolom</span><span /><span>Wordt in Pwayment</span><span>Voorbeeld</span>
                  </div>
                  <div className="max-h-[430px] divide-y divide-slate-100 overflow-y-auto">
                    {mappings.map((mapping) => {
                      const previewValue = parsed.rows.find((row) => row[parsed.headers.indexOf(mapping.source)]?.trim())?.[parsed.headers.indexOf(mapping.source)] ?? "—";
                      return (
                        <div key={mapping.source} className="grid grid-cols-[minmax(130px,0.8fr)_36px_minmax(180px,1fr)_minmax(130px,0.8fr)] items-center gap-2 px-4 py-3">
                          <div className="truncate text-sm font-bold text-slate-800" title={mapping.source}>{mapping.source}</div>
                          <ChevronRight size={16} className="text-slate-300" />
                          <select value={mapping.target} onChange={(event) => updateMapping(mapping.source, event.target.value)} className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-800 focus:border-sky-500 focus:outline-none">
                            {CORE_TARGETS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                            <optgroup label="Klantprijzen">
                              {discoveredGroups.map((group) => <option key={group} value={`price:${group}`}>Prijs · {group}</option>)}
                            </optgroup>
                            <option value={`custom:${normalizePriceGroup(mapping.source)}`}>Eigen veld · {mapping.source}</option>
                            {!CORE_TARGETS.some(([value]) => value === mapping.target) && !mapping.target.startsWith("price:") && !mapping.target.startsWith("custom:") && <option value={mapping.target}>{mapping.target}</option>}
                          </select>
                          <div className="truncate rounded-lg bg-slate-50 px-2.5 py-2 text-xs text-slate-500" title={previewValue}>{previewValue}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-6 grid gap-3 sm:grid-cols-4">
                  {[
                    [preview.valid, "geldige rijen", "text-slate-950"],
                    [preview.newCount, "nieuwe producten", "text-emerald-700"],
                    [preview.updateCount, "updates", "text-sky-700"],
                    [preview.issueCount, "te controleren", preview.issueCount ? "text-amber-700" : "text-slate-500"],
                  ].map(([value, label, tone]) => (
                    <div key={String(label)} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className={`text-xl font-black ${tone}`}>{value}</div><div className="mt-1 text-xs font-semibold text-slate-500">{label}</div>
                    </div>
                  ))}
                </div>
                {preview.priceGroups.length > 0 && (
                  <div className="mt-4 flex items-start gap-3 rounded-2xl border border-violet-200 bg-violet-50 p-4 text-violet-900">
                    <Layers3 size={19} className="mt-0.5 shrink-0" />
                    <div><div className="text-sm font-extrabold">{preview.priceGroups.length} klantprijsgroep{preview.priceGroups.length === 1 ? "" : "en"} herkend</div><div className="mt-1 text-xs">{preview.priceGroups.join(" · ")} — gekoppelde klanten krijgen deze prijs automatisch aan de kassa.</div></div>
                  </div>
                )}
                {preview.issueCount > 0 && (
                  <div className="mt-4 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900"><AlertTriangle size={19} className="mt-0.5 shrink-0" /><div className="text-xs leading-5"><strong>{preview.issueCount} rij(en) worden overgeslagen.</strong> Een productnaam ontbreekt, een prijs is dubbelzinnig, of het BTW-tarief is niet Belgisch ondersteund. Geldige rijen kunnen veilig verder.</div></div>
                )}
                <div className="mt-6 flex flex-col gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-end sm:justify-between">
                  <label className="block flex-1"><span className="mb-1.5 block text-xs font-bold text-slate-600">Naam van deze mapping</span><input value={profileName} onChange={(event) => setProfileName(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold focus:border-sky-500 focus:outline-none" /></label>
                  <button type="button" disabled={isImporting || preview.valid === 0} onClick={() => void performImport()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-sky-600 px-5 py-2.5 text-sm font-extrabold text-white shadow-sm hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50">
                    {isImporting ? <RefreshCw size={17} className="animate-spin" /> : <ArrowRight size={17} />}{isImporting ? "Importeren…" : `Importeer ${preview.valid} producten`}
                  </button>
                </div>
              </>
            )}
          </section>

          <aside className="space-y-6">
            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2"><Database size={18} className="text-sky-600" /><h2 className="text-sm font-black text-slate-900">Wat werkt nu</h2></div>
              <div className="mt-4 space-y-3">
                {([
                  [FileSpreadsheet, "Bestandsimport", "CSV, TSV en Excel met vrije kolommen", true],
                  [FileJson, "JSON-import", "Lijsten uit bestaande systemen", true],
                  [Layers3, "Prijsboeken", "Klant, B2B, medewerker, contract…", true],
                  [RefreshCw, "Automatische synchronisatie", "API- en leveranciersconnectors", false],
                ] as Array<[React.ElementType, string, string, boolean]>).map(([Icon, title, detail, live]) => {
                  const CardIcon = Icon as typeof FileSpreadsheet;
                  return <div key={String(title)} className="flex gap-3 rounded-2xl bg-slate-50 p-3"><CardIcon size={18} className={live ? "text-emerald-600" : "text-slate-400"} /><div className="min-w-0"><div className="flex items-center gap-2 text-xs font-extrabold text-slate-800">{title}<span className={`rounded-full px-2 py-0.5 text-[9px] uppercase ${live ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-500"}`}>{live ? "Live" : "Volgende fase"}</span></div><div className="mt-1 text-[11px] leading-4 text-slate-500">{detail}</div></div></div>;
                })}
              </div>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between"><div className="flex items-center gap-2"><History size={18} className="text-slate-500" /><h2 className="text-sm font-black text-slate-900">Laatste imports</h2></div><span className="text-[10px] font-bold text-slate-400">AUDIT TRAIL</span></div>
              <div className="mt-4 space-y-3">
                {jobs.length === 0 ? <p className="rounded-2xl bg-slate-50 p-4 text-xs leading-5 text-slate-500">Nog geen import uitgevoerd. Na de eerste import verschijnt hier exact wat nieuw, bijgewerkt en overgeslagen werd.</p> : jobs.map((job) => (
                  <div key={job.id} className="rounded-2xl border border-slate-100 p-3">
                    <div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="truncate text-xs font-extrabold text-slate-800">{job.fileName}</div><div className="mt-1 text-[10px] text-slate-400">{formatDateTime(job.createdAt)}</div></div><span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase ${job.status === "failed" ? "bg-red-100 text-red-700" : job.status === "completed-with-errors" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>{job.status === "failed" ? "Mislukt" : job.status === "completed-with-errors" ? "Deels" : "Klaar"}</span></div>
                    <div className="mt-3 grid grid-cols-3 gap-1 text-center"><div className="rounded-lg bg-emerald-50 px-1 py-2"><div className="text-xs font-black text-emerald-700">{job.importedCount}</div><div className="text-[9px] text-emerald-700">nieuw</div></div><div className="rounded-lg bg-sky-50 px-1 py-2"><div className="text-xs font-black text-sky-700">{job.updatedCount}</div><div className="text-[9px] text-sky-700">update</div></div><div className="rounded-lg bg-slate-50 px-1 py-2"><div className="text-xs font-black text-slate-600">{job.skippedCount}</div><div className="text-[9px] text-slate-500">over</div></div></div>
                  </div>
                ))}
              </div>
            </section>
          </aside>
        </div>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="grid gap-5 md:grid-cols-3">
            {[
              ["1", "Upload wat u al heeft", "Het bestand hoeft niet aan Pwayment aangepast te worden."],
              ["2", "Controleer de slimme mapping", "Financiële kernvelden blijven streng; eigen velden blijven volledig bewaard."],
              ["3", "Ga direct verkopen", `Standaardprijzen én klantprijzen zijn onmiddellijk actief. Voorbeeld: ${formatEUR(7900)} voor Telenet-klanten.`],
            ].map(([number, title, detail]) => <div key={number} className="flex gap-4"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-sm font-black text-white">{number}</div><div><h3 className="text-sm font-extrabold text-slate-900">{title}</h3><p className="mt-1 text-xs leading-5 text-slate-500">{detail}</p></div></div>)}
          </div>
        </section>
      </div>
    </main>
  );
};
