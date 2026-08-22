import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  AlertTriangle,
  Check,
  ChevronRight,
  CircleHelp,
  ClipboardCheck,
  Database,
  FileSpreadsheet,
  LoaderCircle,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  Users,
} from "lucide-react";
import { audit, useAuth } from "../auth/useAuth";
import { db } from "../db/db";
import { compileRetailConfiguration } from "../migration/configurationCompiler";
import { discoverRetailBusiness } from "../migration/businessDiscovery";
import { assessCatalogCapabilityReadiness } from "../migration/catalogCapabilityReadiness";
import { multiYearTelecomRetailFixture } from "../migration/testBusinessFixture";
import {
  CUSTOMER_MAPPING_TARGETS,
  inferMigrationMappings,
  mapMigrationRecords,
  PRODUCT_MAPPING_TARGETS,
  type MigrationSourceKind,
} from "../migration/recordMapper";
import { executeMigration, undoMigrationActivation } from "../services/migrationActivation";
import { migrationStoreScope } from "../services/migrationActivity";
import { synchronizeMigrationNow } from "../services/migrationSync";
import { recordIntegrationRun } from "../services/integrationOperations";
import { safeErrorFingerprint } from "../services/platformTelemetry";
import { useCategories } from "../store/useCategories";
import { useCustomers } from "../store/useCustomers";
import { useProducts } from "../store/useProducts";
import { configuredVatFallback } from "../onboarding/storeConfiguration";
import { useStoreConfiguration } from "../store/useStoreConfiguration";
import type { ImportFieldMapping } from "../types";
import { inferMappings, parseImportFile, type ParsedImportFile } from "../utils/integrationImport";

type SourceState = {
  fileName: string;
  parsed: ParsedImportFile | null;
  mappings: ImportFieldMapping[];
};

const emptySource = (): SourceState => ({ fileName: "", parsed: null, mappings: [] });

const sourceMeta: Record<MigrationSourceKind, { title: string; detail: string; Icon: typeof FileSpreadsheet }> = {
  catalog: { title: "Catalogus & voorraad", detail: "Artikelen, prijzen, barcodes, voorraad en eigen velden", Icon: FileSpreadsheet },
  customers: { title: "Klanten", detail: "Contacten, adressen, segmenten en klantprijzen", Icon: Users },
};

const fileTypeLabel = (format: ParsedImportFile["format"]): string =>
  format === "xlsx" ? "Excel" : format.toUpperCase();

const downloadExample = (kind: MigrationSourceKind) => {
  const content = kind === "catalog"
    ? [
      "Artikelcode;Productnaam;Categorie;Merk;EAN;Aankoopprijs;Verkoopprijs;Prijs Telenet klant;Voorraad;BTW;IMEI",
      "MOD-360;360-modem;Netwerk;Telenet;5410000000011;64,00;99,00;79,00;12;21;356789012345678",
      "REP-DIAG;Diagnose toestel;Services;;;0,00;35,00;25,00;;21;",
    ].join("\n")
    : [
      "Klant-ID;Naam;E-mail;Telefoon;Adres;Prijsgroep;Opmerking",
      "C-1001;Sofie Janssens;sofie@example.be;+32 470 12 34 56;Kerkstraat 1, 2000 Antwerpen;telenet-klant;Contractklant",
      "C-1002;Sam Peeters;sam@example.be;+32 471 98 76 54;Markt 9, 9000 Gent;b2b;Zakelijke klant",
    ].join("\n");
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `pwayment-${kind}-voorbeeld.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
};

export const IntegrationHub: React.FC = () => {
  const currentStoreId = useAuth((state) => state.currentStoreId);
  const products = useProducts((state) => state.list);
  const customers = useCustomers((state) => state.customers);
  const categories = useCategories((state) => state.list);
  const hydrateProducts = useProducts((state) => state.hydrate);
  const refreshProducts = useProducts((state) => state.refresh);
  const hydrateCustomers = useCustomers((state) => state.hydrate);
  const hydrateCategories = useCategories((state) => state.hydrate);
  const refreshCategories = useCategories((state) => state.refresh);
  const storeConfiguration = useStoreConfiguration((state) => state.configuration);
  const defaultVat = configuredVatFallback(storeConfiguration);
  const migrationStoreId = migrationStoreScope(currentStoreId);
  const catalogInputRef = useRef<HTMLInputElement | null>(null);
  const customerInputRef = useRef<HTMLInputElement | null>(null);
  const [activeSource, setActiveSource] = useState<MigrationSourceKind>("catalog");
  const [sources, setSources] = useState<Record<MigrationSourceKind, SourceState>>({
    catalog: emptySource(),
    customers: emptySource(),
  });
  const [isDragging, setIsDragging] = useState<MigrationSourceKind | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const activeMigration = useLiveQuery(
    () => db.migration_activations.where("[storeId+status]").equals([migrationStoreId, "active"]).first(),
    [migrationStoreId],
  );

  useEffect(() => {
    void Promise.all([hydrateProducts(), hydrateCustomers(), hydrateCategories()]);
  }, [hydrateCategories, hydrateCustomers, hydrateProducts]);

  const mappedCatalog = useMemo(() => {
    const source = sources.catalog;
    return source.parsed
      ? mapMigrationRecords({ kind: "catalog", parsed: source.parsed, mappings: source.mappings, defaultVat, existingCategories: categories })
      : null;
  }, [categories, defaultVat, sources.catalog]);
  const mappedCustomers = useMemo(() => {
    const source = sources.customers;
    return source.parsed
      ? mapMigrationRecords({ kind: "customers", parsed: source.parsed, mappings: source.mappings, defaultVat, existingCategories: categories })
      : null;
  }, [categories, defaultVat, sources.customers]);
  const catalogCapabilityReadiness = useMemo(() => {
    const source = sources.catalog;
    return source.parsed
      ? assessCatalogCapabilityReadiness(source.parsed, source.mappings, storeConfiguration)
      : null;
  }, [sources.catalog, storeConfiguration]);
  const source = sources[activeSource];
  const preview = activeSource === "catalog" ? mappedCatalog : mappedCustomers;
  const proposal = useMemo(() => {
    const parsed = sources.catalog.parsed ?? sources.customers.parsed;
    const fileName = sources.catalog.fileName || sources.customers.fileName;
    if (!parsed || !fileName) return null;
    return compileRetailConfiguration(discoverRetailBusiness(parsed, fileName));
  }, [sources.catalog.fileName, sources.catalog.parsed, sources.customers.fileName, sources.customers.parsed]);
  const totalIssues = (mappedCatalog?.issues.length ?? 0) + (mappedCustomers?.issues.length ?? 0);
  const totalRecords = (mappedCatalog?.products.length ?? 0) + (mappedCustomers?.customers.length ?? 0);
  const blockingQuestions = proposal?.questions.filter((question) => question.priority === "blocking") ?? [];
  const capabilityBlocks = catalogCapabilityReadiness?.blockingFindings ?? [];
  const canActivate = totalRecords > 0 && totalIssues === 0 && capabilityBlocks.length === 0 && reviewConfirmed && !activeMigration && !isWorking;

  const loadFile = async (kind: MigrationSourceKind, file: File) => {
    setIsWorking(true);
    setMessage(null);
    try {
      const parsed = await parseImportFile(file);
      const mappings = inferMigrationMappings(kind, parsed.headers, inferMappings);
      setSources((current) => ({ ...current, [kind]: { fileName: file.name, parsed, mappings } }));
      setActiveSource(kind);
      setReviewConfirmed(false);
      await audit("import.preview", { fileName: file.name, format: parsed.format, rows: parsed.rows.length, migrationKind: kind });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Dit bestand kon niet worden gelezen." });
    } finally {
      setIsWorking(false);
      if (kind === "catalog" && catalogInputRef.current) catalogInputRef.current.value = "";
      if (kind === "customers" && customerInputRef.current) customerInputRef.current.value = "";
    }
  };

  const updateMapping = (sourceHeader: string, target: string) => {
    setSources((current) => ({
      ...current,
      [activeSource]: {
        ...current[activeSource],
        mappings: current[activeSource].mappings.map((mapping) => mapping.source === sourceHeader ? { ...mapping, target, confidence: 1 } : mapping),
      },
    }));
    setReviewConfirmed(false);
  };

  const clearSource = (kind: MigrationSourceKind) => {
    setSources((current) => ({ ...current, [kind]: emptySource() }));
    setReviewConfirmed(false);
  };

  const loadRealisticTestBusiness = () => {
    if (activeMigration || isWorking) return;
    const fixture = multiYearTelecomRetailFixture();
    setSources({
      catalog: {
        fileName: `${fixture.businessName} · catalogus.csv`,
        parsed: fixture.catalog,
        mappings: inferMigrationMappings("catalog", fixture.catalog.headers, inferMappings),
      },
      customers: {
        fileName: `${fixture.businessName} · klanten.csv`,
        parsed: fixture.customers,
        mappings: inferMigrationMappings("customers", fixture.customers.headers, inferMappings),
      },
    });
    setActiveSource("catalog");
    setReviewConfirmed(false);
    setMessage({ tone: "success", text: "Volledige fictieve telecomzaak geladen: 213 catalogusregels, 240 klanten, prijsboeken, voorraad, garantie- en herstelvelden. Dit gaat door exact dezelfde mapping en safety ledger als uw eigen export." });
  };

  const activate = async () => {
    if (!proposal || !canActivate) return;
    setIsWorking(true);
    setMessage(null);
    const runId = globalThis.crypto.randomUUID();
    const sourceName = [sources.catalog.fileName, sources.customers.fileName].filter(Boolean).join(" + ") || "Migratiewerkruimte";
    const sourceFormat = [sources.catalog.parsed?.format, sources.customers.parsed?.format].filter(Boolean).join("+") || undefined;
    const mappingSummary = {
      graph_version: proposal.version,
      source_kinds: (Object.entries(sources).filter(([, source]) => source.parsed).map(([kind]) => kind)),
      mapped_fields: sources.catalog.mappings.length + sources.customers.mappings.length,
      validation_issues: totalIssues,
      mode: "creation_only_with_undo",
    };
    try {
      await recordIntegrationRun({
        storeId: migrationStoreId,
        runId,
        operation: "import",
        sourceName,
        sourceFormat,
        status: "running",
        rowCount: totalRecords,
        mappingSummary,
        eventType: "run.started",
        eventMessage: "Migratie lokaal gevalideerd en veilig geactiveerd.",
      });
      const result = await executeMigration(
        migrationStoreId,
        proposal,
        mappedCatalog?.products ?? [],
        mappedCustomers?.customers ?? [],
        mappedCatalog?.categories ?? [],
        {
          runId,
          operation: "import",
          sourceName,
          sourceFormat,
          rowCount: totalRecords,
          createdCount: totalRecords + (mappedCatalog?.categories.length ?? 0),
          mappingSummary,
        },
        mappedCatalog?.catalogFamilies ?? [],
      );
      const sync = await synchronizeMigrationNow(migrationStoreId);
      await Promise.all([refreshProducts(), hydrateCustomers(true), refreshCategories()]);
      await audit("migration.activate", {
        migrationId: result.activation.id,
        products: result.productCount,
        customers: result.customerCount,
        categories: result.categoryCount,
      });
      const serverMessage = sync.error
        ? "De serverbevestiging wacht veilig in de synchronisatiewachtrij."
        : sync.pending > 0
          ? "Deze lokale test wacht op een gekoppeld winkelaccount voor serveropslag."
          : "De serverreceipt is meteen bevestigd.";
      setMessage({ tone: "success", text: `Veilig geactiveerd: ${result.productCount} producten, ${result.customerCount} klanten, ${result.categoryCount} nieuwe categorieën en ${result.catalogFamilyCount} catalogusfamilies. ${serverMessage} U kunt dit volledig ongedaan maken tot de eerste echte activiteit.` });
      setReviewConfirmed(false);
    } catch (error) {
      await recordIntegrationRun({
        storeId: migrationStoreId,
        runId,
        operation: "import",
        sourceName,
        sourceFormat,
        status: "failed",
        rowCount: totalRecords,
        errorCount: 1,
        errorCode: "MIGRATION_ACTIVATION_FAILED",
        errorFingerprint: safeErrorFingerprint("migration.activate", error),
        mappingSummary,
        eventType: "delivery.failed",
        eventMessage: "Lokale activatie kon niet veilig worden voltooid.",
      });
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "De migratie kon niet veilig geactiveerd worden." });
    } finally {
      setIsWorking(false);
    }
  };

  const undo = async () => {
    if (!activeMigration || isWorking) return;
    setIsWorking(true);
    setMessage(null);
    try {
      await undoMigrationActivation(migrationStoreId, activeMigration.id);
      const sync = await synchronizeMigrationNow(migrationStoreId);
      await Promise.all([refreshProducts(), hydrateCustomers(true), refreshCategories()]);
      await audit("migration.undo", { migrationId: activeMigration.id });
      setMessage({ tone: "success", text: `De actieve migratie is volledig ongedaan gemaakt. Uw eerdere Pwayment-gegevens bleven onaangeraakt.${sync.error ? " De servercorrectie blijft veilig in de synchronisatiewachtrij." : ""}` });
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : "Ongedaan maken is niet gelukt." });
    } finally {
      setIsWorking(false);
    }
  };

  const mappingTargets = activeSource === "catalog" ? PRODUCT_MAPPING_TARGETS : CUSTOMER_MAPPING_TARGETS;
  const activeInputRef = activeSource === "catalog" ? catalogInputRef : customerInputRef;

  return (
    <main className="integration-hub-page app-page-content flex-1 overflow-y-auto">
      <div className="mx-auto max-w-[1500px] space-y-6 p-4 sm:p-6 lg:p-8">
        <header className="grid gap-5 border-b border-slate-200 pb-5 lg:grid-cols-[1.25fr_0.75fr] lg:items-end">
          <div>
            <h1 className="max-w-3xl text-2xl font-bold tracking-[-0.02em] text-slate-950">Gegevens importeren</h1>
            <p className="mt-1.5 max-w-2xl text-sm leading-6 text-slate-500">Upload catalogus- of klantgegevens, controleer de vertaling en activeer pas wanneer alles klopt.</p>
          </div>
          <dl className="grid grid-cols-3 gap-3 self-end">
            <div className="border-l border-slate-200 pl-3"><dt className="text-[11px] font-semibold text-slate-500">producten</dt><dd className="mt-1 text-2xl font-black text-slate-950">{products.length}</dd></div>
            <div className="border-l border-slate-200 pl-3"><dt className="text-[11px] font-semibold text-slate-500">klanten</dt><dd className="mt-1 text-2xl font-black text-slate-950">{customers.length}</dd></div>
            <div className="border-l border-cyan-200 pl-3"><dt className="text-[11px] font-semibold text-cyan-700">veiligheid</dt><dd className="mt-1 text-xs font-black text-cyan-800">{activeMigration ? "UNDO OPEN" : "VOORSTEL"}</dd></div>
          </dl>
        </header>

        {message && <div role={message.tone === "error" ? "alert" : "status"} className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${message.tone === "error" ? "border-red-200 bg-red-50 text-red-900" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`}>{message.text}</div>}

        {activeMigration && (
          <section className={`rounded-3xl border p-5 shadow-sm ${activeMigration.firstMeaningfulActivityAt == null ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex gap-3"><span className="rounded-xl bg-white p-2.5 text-emerald-700 shadow-sm"><ShieldCheck size={20} /></span><div><p className="text-xs font-black uppercase tracking-[0.14em] text-emerald-700">Actieve migratiereceipt</p><h2 className="mt-1 text-base font-black text-slate-950">{activeMigration.firstMeaningfulActivityAt == null ? "Uw volledige undo-venster staat nog open." : "De migratie is verzegeld door live activiteit."}</h2><p className="mt-1 text-xs leading-5 text-slate-600">{activeMigration.firstMeaningfulActivityAt == null ? "Nog geen verkoop of andere betekenisvolle activiteit gezien. Een volledige undo verwijdert uitsluitend de records op deze receipt." : "Volledige undo is nu veilig geblokkeerd; een toekomstige correctieworkflow werkt voorwaarts."}</p></div></div>
              {activeMigration.firstMeaningfulActivityAt == null && <button type="button" onClick={() => void undo()} disabled={isWorking} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-emerald-700 bg-white px-4 py-2 text-sm font-extrabold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"><RotateCcw size={16} /> Alles ongedaan maken</button>}
            </div>
          </section>
        )}

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_350px]">
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
            <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-[11px] font-bold uppercase tracking-[0.12em] text-cyan-700">Bronnen</p><h2 className="mt-1 text-xl font-bold text-slate-950">1. Voeg bestanden toe</h2><p className="mt-1 text-sm text-slate-500">CSV, TSV, Excel en JSON worden lokaal verwerkt.</p></div><button type="button" onClick={loadRealisticTestBusiness} disabled={isWorking || Boolean(activeMigration)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50">Testgegevens laden</button></div>

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {(["catalog", "customers"] as const).map((kind) => {
                const meta = sourceMeta[kind];
                const Icon = meta.Icon;
                const loaded = sources[kind].parsed;
                return <section key={kind} className={`rounded-2xl border p-4 transition ${activeSource === kind ? "border-cyan-400 bg-cyan-50/60" : "border-slate-200 bg-slate-50"}`}><div className="flex items-start justify-between gap-3"><button type="button" onClick={() => setActiveSource(kind)} className="flex min-w-0 items-start gap-3 text-left"><span className="rounded-xl bg-white p-2 text-cyan-700 shadow-sm"><Icon size={18} /></span><span><span className="block text-sm font-black text-slate-900">{meta.title}</span><span className="mt-1 block text-[11px] leading-4 text-slate-500">{loaded ? `${sources[kind].fileName} · ${loaded.rows.length} rijen` : meta.detail}</span></span></button>{loaded && <button type="button" onClick={() => clearSource(kind)} className="text-[11px] font-bold text-slate-500 hover:text-slate-950">Wissen</button>}</div><div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={() => { setActiveSource(kind); (kind === "catalog" ? catalogInputRef : customerInputRef).current?.click(); }} disabled={isWorking || Boolean(activeMigration)} className="inline-flex items-center gap-2 rounded-xl border border-cyan-700 bg-white px-3 py-2 text-xs font-extrabold text-cyan-800 hover:bg-cyan-50 disabled:opacity-50"><UploadCloud size={15} /> {loaded ? "Vervang bestand" : "Upload bestand"}</button><button type="button" onClick={() => downloadExample(kind)} className="rounded-xl px-3 py-2 text-xs font-bold text-slate-600 hover:bg-white">Voorbeeld</button></div></section>;
              })}
            </div>
            <input ref={catalogInputRef} type="file" accept=".csv,.tsv,.xlsx,.json,text/csv,text/tab-separated-values,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void loadFile("catalog", file); }} />
            <input ref={customerInputRef} type="file" accept=".csv,.tsv,.xlsx,.json,text/csv,text/tab-separated-values,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void loadFile("customers", file); }} />

            {!source.parsed ? (
              <button type="button" onClick={() => activeInputRef.current?.click()} onDragEnter={(event) => { event.preventDefault(); setIsDragging(activeSource); }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setIsDragging(null)} onDrop={(event) => { event.preventDefault(); setIsDragging(null); const file = event.dataTransfer.files[0]; if (file) void loadFile(activeSource, file); }} disabled={isWorking || Boolean(activeMigration)} className={`mt-6 flex min-h-48 w-full flex-col items-center justify-center rounded-3xl border-2 border-dashed px-6 text-center transition disabled:opacity-50 ${isDragging === activeSource ? "border-cyan-500 bg-cyan-50" : "border-slate-300 bg-slate-50 hover:border-cyan-400 hover:bg-cyan-50/60"}`}><span className="rounded-2xl bg-white p-4 text-cyan-700 shadow-sm"><UploadCloud size={30} /></span><span className="mt-3 text-sm font-black text-slate-900">Upload {sourceMeta[activeSource].title.toLocaleLowerCase()}</span><span className="mt-1 text-xs text-slate-500">Of sleep het bestand hierheen</span></button>
            ) : (
              <>
                <div className="mt-7 flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-700">2. Controleer de vertaling</p><h2 className="mt-1 text-xl font-black text-slate-950">{source.fileName}</h2><p className="mt-1 text-sm text-slate-500">{fileTypeLabel(source.parsed.format)} · {source.parsed.rows.length} rijen · {source.parsed.headers.length} kolommen</p></div><button type="button" onClick={() => clearSource(activeSource)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">Ander bestand</button></div>
                <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200"><div className="grid grid-cols-[minmax(105px,0.8fr)_28px_minmax(155px,1fr)_minmax(95px,0.65fr)] gap-2 bg-slate-50 px-3 py-3 text-[10px] font-black uppercase tracking-wider text-slate-500 sm:px-4"><span>Uw kolom</span><span /><span>Wordt in Pwayment</span><span>Voorbeeld</span></div><div className="max-h-[390px] divide-y divide-slate-100 overflow-y-auto">{source.mappings.map((mapping) => { const index = source.parsed!.headers.indexOf(mapping.source); const sample = source.parsed!.rows.find((row) => row[index]?.trim())?.[index] ?? "—"; return <div key={mapping.source} className="grid grid-cols-[minmax(105px,0.8fr)_28px_minmax(155px,1fr)_minmax(95px,0.65fr)] items-center gap-2 px-3 py-3 sm:px-4"><div className="truncate text-sm font-bold text-slate-800" title={mapping.source}>{mapping.source}</div><ChevronRight size={15} className="text-slate-300" /><select value={mapping.target} onChange={(event) => updateMapping(mapping.source, event.target.value)} disabled={Boolean(activeMigration)} className="min-w-0 rounded-xl border border-slate-200 bg-white px-2 py-2 text-xs font-bold text-slate-800 focus:border-cyan-500 focus:outline-none disabled:opacity-50">{mappingTargets.map(([value, label]) => <option key={value} value={value}>{label}</option>)}{activeSource === "catalog" && <optgroup label="Klantprijzen">{["telenet-klant", "niet-klant", "b2b", "medewerker", "contract", "promo"].map((group) => <option key={group} value={`price:${group}`}>Prijs · {group}</option>)}</optgroup>}{!mappingTargets.some((entry) => entry[0] === mapping.target) && !mapping.target.startsWith("price:") && <option value={mapping.target}>{mapping.target}</option>}</select><div className="truncate rounded-lg bg-slate-50 px-2 py-2 text-xs text-slate-500" title={sample}>{sample}</div></div>; })}</div></div>
                <p className="mt-3 text-xs leading-5 text-slate-500">Velden die niet bij de financiële kern horen, worden niet weggegooid: voor catalogusrijen blijven ze per product beschikbaar als eigen bronvelden. U kunt elke kolom hierboven alsnog expliciet koppelen.</p>
              </>
            )}
          </section>

          <aside className="space-y-6">
            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-2"><ClipboardCheck size={18} className="text-cyan-700" /><h2 className="text-sm font-black text-slate-900">3. Migratiereceipt</h2></div><p className="mt-2 text-xs leading-5 text-slate-500">Dit is wat er zal worden aangemaakt. Geen bestaande Pwayment-records worden overschreven.</p><div className="mt-4 grid grid-cols-3 gap-2 text-center"><div className="rounded-xl bg-emerald-50 p-3"><div className="text-lg font-black text-emerald-700">{mappedCatalog?.products.length ?? 0}</div><div className="text-[10px] font-bold text-emerald-700">producten</div></div><div className="rounded-xl bg-sky-50 p-3"><div className="text-lg font-black text-sky-700">{mappedCustomers?.customers.length ?? 0}</div><div className="text-[10px] font-bold text-sky-700">klanten</div></div><div className="rounded-xl bg-violet-50 p-3"><div className="text-lg font-black text-violet-700">{mappedCatalog?.categories.length ?? 0}</div><div className="text-[10px] font-bold text-violet-700">categorieën</div></div></div>{capabilityBlocks.length > 0 && <div className="mt-4 space-y-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs leading-5 text-rose-950"><div className="flex gap-2"><AlertTriangle size={17} className="mt-0.5 shrink-0 text-rose-700" /><span><strong>Deze catalogus vraagt diepte die niet veilig als losse SKU’s mag worden geïmporteerd.</strong> Pas de vereiste eerst aan via Instellingen → Modules & winkelprofiel, of wacht op de gespecialiseerde importworkflow.</span></div>{capabilityBlocks.map((finding) => <p key={finding.capability} className="rounded-lg border border-rose-100 bg-white/70 px-2.5 py-2"><strong>{finding.title}.</strong> {finding.detail}</p>)}</div>}{totalIssues > 0 && <div className="mt-4 flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900"><AlertTriangle size={17} className="mt-0.5 shrink-0" /><span><strong>{totalIssues} rij(en) vragen aandacht.</strong> Corrigeer de mapping of bron voordat u activeert. Pwayment slaat in deze veilige modus geen onvolledige rijen stilzwijgend over.</span></div>}{totalIssues === 0 && capabilityBlocks.length === 0 && totalRecords > 0 && <div className="mt-4 flex gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs leading-5 text-emerald-900"><Check size={17} className="mt-0.5 shrink-0" /><span>Alle geladen rijen zijn valide voor deze eerste, volledig omkeerbare migratie.</span></div>}</section>

            {proposal && <section className="rounded-3xl border border-cyan-200 bg-cyan-50/70 p-5 shadow-sm"><div className="flex gap-3"><span className="rounded-xl bg-white p-2 text-cyan-700 shadow-sm"><Sparkles size={18} /></span><div><p className="text-xs font-black uppercase tracking-[0.14em] text-cyan-700">Bedrijfsscan</p><h2 className="mt-1 text-sm font-black text-slate-950">Voorgesteld: {proposal.nodes.find((node) => node.key === "business.industry")?.value as string}</h2></div></div><div className="mt-4 space-y-2">{blockingQuestions.map((question) => <div key={question.id} className="flex gap-2 rounded-xl border border-cyan-100 bg-white/80 p-3 text-xs leading-5 text-slate-700"><CircleHelp size={16} className="mt-0.5 shrink-0 text-amber-600" />{question.detail}</div>)}{blockingQuestions.length === 0 && <p className="rounded-xl border border-cyan-100 bg-white/80 p-3 text-xs leading-5 text-slate-600">De scan heeft geen blokkerende opzetvraag voor deze bron. De voorgestelde winkelopzet wordt in de receipt bewaard, maar niet automatisch op uw account toegepast.</p>}</div></section>}

            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-2"><ShieldCheck size={18} className="text-emerald-600" /><h2 className="text-sm font-black text-slate-900">Veilig activeren</h2></div><label className="mt-4 flex cursor-pointer items-start gap-3 text-xs leading-5 text-slate-600"><input type="checkbox" checked={reviewConfirmed} onChange={(event) => setReviewConfirmed(event.target.checked)} disabled={Boolean(activeMigration) || totalRecords === 0 || totalIssues > 0 || capabilityBlocks.length > 0} className="mt-0.5 h-4 w-4 rounded accent-cyan-700" /><span>Ik heb de mapping en aantallen gecontroleerd. Ik begrijp dat deze V1-migratie alleen nieuwe catalogus-, categorie- en klantrecords maakt en dat ik die volledig kan undo’en vóór de eerste live activiteit.</span></label><button type="button" onClick={() => void activate()} disabled={!canActivate} className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-cyan-700 px-4 py-2.5 text-sm font-extrabold text-white hover:bg-cyan-800 disabled:cursor-not-allowed disabled:opacity-50">{isWorking ? <LoaderCircle size={17} className="animate-spin" /> : <ShieldCheck size={17} />}{isWorking ? "Bezig…" : `Activeer ${totalRecords || ""} veilige record${totalRecords === 1 ? "" : "s"}`}</button>{activeMigration && <p className="mt-3 text-center text-[11px] leading-4 text-slate-500">Rond of undo de actieve migratie af voor u een nieuwe start.</p>}</section>
          </aside>
        </div>
      </div>
    </main>
  );
};
