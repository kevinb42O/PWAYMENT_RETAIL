import React, { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { QRCodeSVG } from "qrcode.react";
import {
  ArchiveRestore,
  Banknote,
  BellRing,
  Camera,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  Copy,
  ExternalLink,
  FileText,
  Mail,
  PackageCheck,
  Phone,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  ShoppingCart,
  Smartphone,
  Upload,
  UserRound,
  Wrench,
  XCircle,
} from "lucide-react";
import { audit, useAuth } from "../auth/useAuth";
import { db } from "../db/db";
import {
  hydrateRemoteServiceOrders,
  persistServiceOrder,
} from "../services/serviceOrders";
import { useCategories } from "../store/useCategories";
import { useCustomers } from "../store/useCustomers";
import { useMerchantProfile } from "../store/useMerchantProfile";
import { useProducts } from "../store/useProducts";
import { useStore } from "../store/useStore";
import type {
  Customer,
  ServiceOrder,
  ServiceOrderAttachment,
  ServiceOrderRoute,
  ServiceOrderSystemStatus,
} from "../types";
import { formatEUR, parseDecimalToCents } from "../utils/money";
import { Modal } from "./Modal";
import { canUseFeature, FEATURE_KEYS } from "../billing/entitlements";

const STATUS_META: Record<
  ServiceOrderSystemStatus,
  { label: string; className: string; defaultSubstatus: string }
> = {
  open: {
    label: "Ontvangen",
    className: "bg-sky-100 text-sky-800 border-sky-200",
    defaultSubstatus: "Ontvangen in de winkel",
  },
  "in-progress": {
    label: "In behandeling",
    className: "bg-violet-100 text-violet-800 border-violet-200",
    defaultSubstatus: "Diagnose of herstelling bezig",
  },
  blocked: {
    label: "Wacht op actie",
    className: "bg-amber-100 text-amber-800 border-amber-200",
    defaultSubstatus: "Wacht op onderdeel of goedkeuring",
  },
  ready: {
    label: "Klaar",
    className: "bg-emerald-100 text-emerald-800 border-emerald-200",
    defaultSubstatus: "Klaar voor afhaling",
  },
  closed: {
    label: "Afgehaald",
    className: "bg-slate-200 text-slate-700 border-slate-300",
    defaultSubstatus: "Afgehaald en afgesloten",
  },
  cancelled: {
    label: "Geannuleerd",
    className: "bg-red-100 text-red-800 border-red-200",
    defaultSubstatus: "Dossier geannuleerd",
  },
};

const ROUTE_META: Record<ServiceOrderRoute, { label: string; icon: React.ElementType }> = {
  "internal-repair": { label: "Herstelling in de winkel", icon: Wrench },
  "external-repair": { label: "Externe hersteller", icon: ExternalLink },
  exchange: { label: "Omruiling", icon: ArchiveRestore },
  "warranty-return": { label: "Garantie / retour fabrikant", icon: ShieldCheck },
};

const moneyInputToCents = (value: string): number => {
  if (!value.trim()) return 0;
  const result = parseDecimalToCents(value);
  return result.ok ? result.cents : 0;
};

const toMoneyInput = (cents: number): string => (cents / 100).toFixed(2).replace(".", ",");

const formatDateTime = (timestamp: number): string =>
  new Intl.DateTimeFormat("nl-BE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(timestamp);

const formatDate = (timestamp?: number): string =>
  timestamp
    ? new Intl.DateTimeFormat("nl-BE", { dateStyle: "medium" }).format(timestamp)
    : "Niet afgesproken";

const routeLabel = (route: ServiceOrderRoute): string => ROUTE_META[route].label;

const serviceTrackingUrl = (trackingToken: string): string =>
  `${window.location.origin}/service/${encodeURIComponent(trackingToken)}`;

const createTrackingToken = (): string =>
  `${globalThis.crypto.randomUUID().replaceAll("-", "")}${globalThis.crypto.randomUUID().replaceAll("-", "")}`;

const makeServiceNumber = (count: number): string => {
  const now = new Date();
  const date = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("");
  return `HER-${date}-${String(count + 1).padStart(4, "0")}`;
};

interface IntakeDraft {
  customerId: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  priceGroup: string;
  assetType: string;
  brand: string;
  model: string;
  identifierType: string;
  identifierValue: string;
  accessories: string;
  issue: string;
  intakeCondition: string;
  route: ServiceOrderRoute;
  promisedDate: string;
  warranty: boolean;
  noCureNoPay: boolean;
  diagnosisFee: string;
  labor: string;
  parts: string;
  other: string;
  deposit: string;
  internalNote: string;
}

const EMPTY_DRAFT: IntakeDraft = {
  customerId: "",
  customerName: "",
  customerEmail: "",
  customerPhone: "",
  priceGroup: "",
  assetType: "",
  brand: "",
  model: "",
  identifierType: "Serienummer",
  identifierValue: "",
  accessories: "",
  issue: "",
  intakeCondition: "",
  route: "internal-repair",
  promisedDate: "",
  warranty: false,
  noCureNoPay: false,
  diagnosisFee: "0,00",
  labor: "0,00",
  parts: "0,00",
  other: "0,00",
  deposit: "0,00",
  internalNote: "",
};

const StatusBadge = ({ order }: { order: ServiceOrder }) => {
  const meta = STATUS_META[order.status];
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${meta.className}`}>
      {meta.label}
    </span>
  );
};

export const ServiceDesk: React.FC = () => {
  const orders = useLiveQuery(
    () => db.service_orders.orderBy("updatedAt").reverse().toArray(),
    [],
  ) ?? [];
  const customers = useCustomers((state) => state.customers);
  const hydrateCustomers = useCustomers((state) => state.hydrate);
  const merchant = useMerchantProfile((state) => state.profile);
  const currentStoreName = useAuth((state) => state.currentStoreName);
  const currentUserId = useAuth((state) => state.currentUserId);
  const currentUserName = useAuth((state) => state.currentUserName);
  const hydrateProducts = useProducts((state) => state.hydrate);
  const upsertProduct = useProducts((state) => state.upsert);
  const hydrateCategories = useCategories((state) => state.hydrate);
  const addCategory = useCategories((state) => state.addCategory);
  const addOrderItem = useStore((state) => state.addOrderItem);
  const setMainView = useStore((state) => state.setMainView);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ServiceOrderSystemStatus | "all">("all");
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [draft, setDraft] = useState<IntakeDraft>(EMPTY_DRAFT);
  const [attachments, setAttachments] = useState<ServiceOrderAttachment[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "warning"; text: string } | null>(null);
  const [diagnosisDraft, setDiagnosisDraft] = useState("");
  const [resolutionDraft, setResolutionDraft] = useState("");
  const [externalReferenceDraft, setExternalReferenceDraft] = useState("");
  const [substatusDraft, setSubstatusDraft] = useState("");
  const [priceDraft, setPriceDraft] = useState({ diagnosis: "0,00", labor: "0,00", parts: "0,00", other: "0,00", paid: "0,00" });

  const selected = orders.find((order) => order.id === selectedId) ?? orders[0] ?? null;

  useEffect(() => {
    void Promise.all([
      hydrateCustomers(true),
      hydrateProducts(),
      hydrateCategories(),
      hydrateRemoteServiceOrders(),
    ]);
  }, [hydrateCategories, hydrateCustomers, hydrateProducts]);

  useEffect(() => {
    if (!selectedId && orders[0]) setSelectedId(orders[0].id);
  }, [orders, selectedId]);

  useEffect(() => {
    if (!selected) return;
    setDiagnosisDraft(selected.diagnosis ?? "");
    setResolutionDraft(selected.resolution ?? "");
    setExternalReferenceDraft(selected.externalReference ?? "");
    setSubstatusDraft(selected.substatus);
    setPriceDraft({
      diagnosis: toMoneyInput(selected.diagnosisFeeCents),
      labor: toMoneyInput(selected.laborCents),
      parts: toMoneyInput(selected.partsCents),
      other: toMoneyInput(selected.otherCents),
      paid: toMoneyInput(selected.paidCents),
    });
  }, [selected?.id]);

  const filteredOrders = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("nl-BE");
    return orders.filter((order) => {
      if (statusFilter !== "all" && order.status !== statusFilter) return false;
      if (!query) return true;
      return [
        order.number,
        order.customerName,
        order.customerEmail,
        order.customerPhone,
        order.assetType,
        order.brand,
        order.model,
        order.identifierValue,
      ].some((value) => value?.toLocaleLowerCase("nl-BE").includes(query));
    });
  }, [orders, search, statusFilter]);

  const counters = useMemo(
    () => ({
      open: orders.filter((order) => order.status === "open").length,
      active: orders.filter((order) => order.status === "in-progress" || order.status === "blocked").length,
      ready: orders.filter((order) => order.status === "ready").length,
      unpaid: orders.reduce((sum, order) => sum + Math.max(0, order.totalCents - order.paidCents), 0),
    }),
    [orders],
  );

  const setDraftField = <K extends keyof IntakeDraft>(key: K, value: IntakeDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const chooseCustomer = (customer: Customer | undefined) => {
    if (!customer) {
      setDraft((current) => ({ ...current, customerId: "", priceGroup: "" }));
      return;
    }
    setDraft((current) => ({
      ...current,
      customerId: customer.id,
      customerName: customer.name,
      customerEmail: customer.email ?? "",
      customerPhone: customer.phone ?? "",
      priceGroup: customer.priceGroup ?? "",
    }));
  };

  const addFiles = async (fileList: FileList | null) => {
    if (!fileList) return;
    if (!canUseFeature(FEATURE_KEYS.serviceAttachments)) {
      setMessage({
        tone: "warning",
        text: "Foto-intake is beschikbaar in Enterprise. Het dossier kan zonder foto's worden aangemaakt.",
      });
      return;
    }
    const files = Array.from(fileList).slice(0, Math.max(0, 5 - attachments.length));
    const accepted: ServiceOrderAttachment[] = [];
    for (const file of files) {
      if (!file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) continue;
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      accepted.push({
        id: globalThis.crypto.randomUUID(),
        name: file.name,
        contentType: file.type,
        size: file.size,
        dataUrl,
        createdAt: Date.now(),
      });
    }
    setAttachments((current) => [...current, ...accepted]);
  };

  const createOrder = async () => {
    if (!draft.customerName.trim() || !draft.assetType.trim() || !draft.issue.trim()) {
      setMessage({ tone: "warning", text: "Klant, toestel/product en probleemomschrijving zijn verplicht." });
      return;
    }
    setIsSaving(true);
    try {
      const now = Date.now();
      const diagnosisFeeCents = moneyInputToCents(draft.diagnosisFee);
      const laborCents = moneyInputToCents(draft.labor);
      const partsCents = moneyInputToCents(draft.parts);
      const otherCents = moneyInputToCents(draft.other);
      const depositCents = moneyInputToCents(draft.deposit);
      const storeName = currentStoreName?.trim() || merchant.name;
      const order: ServiceOrder = {
        id: globalThis.crypto.randomUUID(),
        number: makeServiceNumber(orders.length),
        trackingToken: createTrackingToken(),
        createdAt: now,
        updatedAt: now,
        promisedAt: draft.promisedDate ? new Date(`${draft.promisedDate}T12:00:00`).getTime() : undefined,
        status: "open",
        substatus: STATUS_META.open.defaultSubstatus,
        route: draft.route,
        customerId: draft.customerId || undefined,
        customerName: draft.customerName.trim(),
        customerEmail: draft.customerEmail.trim() || undefined,
        customerPhone: draft.customerPhone.trim() || undefined,
        assetType: draft.assetType.trim(),
        brand: draft.brand.trim() || undefined,
        model: draft.model.trim() || undefined,
        identifierType: draft.identifierType.trim() || undefined,
        identifierValue: draft.identifierValue.trim() || undefined,
        accessories: draft.accessories.trim() || undefined,
        issue: draft.issue.trim(),
        intakeCondition: draft.intakeCondition.trim() || undefined,
        internalNote: draft.internalNote.trim() || undefined,
        warranty: draft.warranty,
        noCureNoPay: draft.noCureNoPay,
        diagnosisFeeCents,
        laborCents,
        partsCents,
        otherCents,
        depositCents,
        totalCents: diagnosisFeeCents + laborCents + partsCents + otherCents,
        paidCents: depositCents,
        attachments,
        events: [
          {
            id: globalThis.crypto.randomUUID(),
            timestamp: now,
            type: "created",
            label: "Dossier aangemaakt",
            detail: `${draft.assetType.trim()} ontvangen via ${routeLabel(draft.route).toLocaleLowerCase("nl-BE")}.`,
            userId: currentUserId ?? undefined,
            userName: currentUserName ?? undefined,
          },
        ],
        merchantSnapshot: {
          name: storeName,
          phone: merchant.phone,
          email: merchant.email,
          addressLine1: merchant.addressLine1,
          addressLine2: merchant.addressLine2,
        },
      };
      const result = await persistServiceOrder(order, "service_order.create");
      setSelectedId(order.id);
      setIntakeOpen(false);
      setDraft(EMPTY_DRAFT);
      setAttachments([]);
      setMessage({
        tone: result.remote ? "success" : "warning",
        text: result.remote
          ? `${order.number} is aangemaakt en online opvolgbaar.`
          : `${order.number} is veilig lokaal aangemaakt. Online synchronisatie volgt zodra de servermodule actief is.`,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const saveOrder = async (next: ServiceOrder, action: "service_order.update" | "service_order.status" = "service_order.update") => {
    const result = await persistServiceOrder(next, action);
    setMessage({
      tone: result.remote ? "success" : "warning",
      text: result.remote ? `${next.number} is opgeslagen en gesynchroniseerd.` : `${next.number} is lokaal opgeslagen; online sync wordt opnieuw geprobeerd.`,
    });
  };

  const changeStatus = async (status: ServiceOrderSystemStatus) => {
    if (!selected || status === selected.status) return;
    const now = Date.now();
    const next: ServiceOrder = {
      ...selected,
      status,
      substatus: STATUS_META[status].defaultSubstatus,
      updatedAt: now,
      events: [
        ...selected.events,
        {
          id: globalThis.crypto.randomUUID(),
          timestamp: now,
          type: "status",
          label: STATUS_META[status].label,
          detail: STATUS_META[status].defaultSubstatus,
          userId: currentUserId ?? undefined,
          userName: currentUserName ?? undefined,
        },
      ],
    };
    await saveOrder(next, "service_order.status");
  };

  const saveDetails = async () => {
    if (!selected) return;
    const diagnosisFeeCents = moneyInputToCents(priceDraft.diagnosis);
    const laborCents = moneyInputToCents(priceDraft.labor);
    const partsCents = moneyInputToCents(priceDraft.parts);
    const otherCents = moneyInputToCents(priceDraft.other);
    const next: ServiceOrder = {
      ...selected,
      diagnosis: diagnosisDraft.trim() || undefined,
      resolution: resolutionDraft.trim() || undefined,
      externalReference: externalReferenceDraft.trim() || undefined,
      substatus: substatusDraft.trim() || STATUS_META[selected.status].defaultSubstatus,
      diagnosisFeeCents,
      laborCents,
      partsCents,
      otherCents,
      totalCents: diagnosisFeeCents + laborCents + partsCents + otherCents,
      paidCents: moneyInputToCents(priceDraft.paid),
      updatedAt: Date.now(),
    };
    await saveOrder(next);
  };

  const recordCommunication = async (channel: "email" | "phone", label: string) => {
    if (!selected) return;
    const now = Date.now();
    const next: ServiceOrder = {
      ...selected,
      updatedAt: now,
      events: [
        ...selected.events,
        {
          id: globalThis.crypto.randomUUID(),
          timestamp: now,
          type: "communication",
          label,
          detail: channel === "email" ? selected.customerEmail : selected.customerPhone,
          userId: currentUserId ?? undefined,
          userName: currentUserName ?? undefined,
        },
      ],
    };
    await persistServiceOrder(next, "service_order.update");
    await audit("service_order.communication", {
      number: selected.number,
      channel,
    });
  };

  const openCustomerEmail = () => {
    if (!selected?.customerEmail) return;
    const link = serviceTrackingUrl(selected.trackingToken);
    const isReady = selected.status === "ready";
    const subject = encodeURIComponent(
      `${selected.merchantSnapshot.name} · ${isReady ? "uw herstelling is klaar" : "bevestiging herstelling"} · ${selected.number}`,
    );
    const body = encodeURIComponent(
      `Beste ${selected.customerName},\n\n${
        isReady
          ? `Uw ${selected.assetType} is klaar voor afhaling.`
          : `Wij bevestigen de ontvangst van uw ${selected.assetType}.`
      }\n\nStatus: ${selected.substatus}\nDossier: ${selected.number}\nVolg uw dossier: ${link}\n\nMet vriendelijke groeten,\n${selected.merchantSnapshot.name}`,
    );
    window.location.href = `mailto:${encodeURIComponent(selected.customerEmail)}?subject=${subject}&body=${body}`;
    void recordCommunication("email", isReady ? "E-mail ‘klaar voor afhaling’ geopend" : "Ontvangstbevestiging per e-mail geopend");
  };

  const callCustomer = () => {
    if (!selected?.customerPhone) return;
    window.location.href = `tel:${selected.customerPhone.replace(/[^+\d]/g, "")}`;
    void recordCommunication("phone", "Klantoproep gestart");
  };

  const copyTrackingLink = async () => {
    if (!selected) return;
    await navigator.clipboard.writeText(serviceTrackingUrl(selected.trackingToken));
    setMessage({ tone: "success", text: "Publieke opvolglink gekopieerd." });
  };

  const addBalanceToCart = async () => {
    if (!selected) return;
    const balance = Math.max(0, selected.totalCents - selected.paidCents);
    if (balance <= 0) {
      setMessage({ tone: "warning", text: "Dit dossier heeft geen openstaand saldo." });
      return;
    }
    let servicesCategory = useCategories.getState().list.find(
      (category) => category.name.toLocaleLowerCase("nl-BE") === "services",
    );
    if (!servicesCategory) {
      servicesCategory = (await addCategory("Services")) ?? undefined;
    }
    if (!servicesCategory) throw new Error("Categorie Services kon niet worden aangemaakt.");
    const product = {
      id: `service-${selected.id}`,
      name: `Herstelling ${selected.number}`,
      category: servicesCategory.id,
      sku: selected.number,
      priceCents: balance,
      vatRate: 21,
      productType: "service" as const,
      customFields: {
        serviceOrderId: selected.id,
        serviceOrderNumber: selected.number,
      },
      isActive: true,
    };
    await upsertProduct(product);
    addOrderItem(product);
    setMainView("pos");
  };

  return (
    <main className="app-page-content flex-1 overflow-hidden print:overflow-visible">
      <div className="flex h-full flex-col print:hidden">
        <section className="border-b border-slate-200 bg-white px-4 py-5 sm:px-6 lg:px-8">
          <div className="mx-auto flex max-w-[1600px] flex-col gap-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold tracking-[-0.02em] text-slate-950">Hersteldienst</h1>
                <p className="mt-1 text-sm text-slate-500">Intake, opvolging en afrekening op één plek.</p>
              </div>
              <button type="button" onClick={() => { setDraft(EMPTY_DRAFT); setAttachments([]); setIntakeOpen(true); }} className="inline-flex items-center gap-2 rounded-xl border border-[#0e7490] bg-[#0e7490] px-4 py-2.5 text-sm font-extrabold text-white shadow-[0_1px_2px_rgba(15,23,42,0.08)] transition hover:border-[#0f6677] hover:bg-[#0f6677]"><Plus size={17} /> Nieuw dossier</button>
            </div>
            <div className="grid grid-cols-2 border-t border-slate-200 pt-4 lg:grid-cols-4">
              {([
                [counters.open, "Nieuw ontvangen", ClipboardCheck],
                [counters.active, "In behandeling", Wrench],
                [counters.ready, "Klaar voor afhaling", PackageCheck],
                [formatEUR(counters.unpaid), "Openstaand", Banknote],
              ] as Array<[string | number, string, React.ElementType]>).map(([value, label, Icon]) => {
                const MetricIcon = Icon as React.ElementType;
                return <div key={String(label)} className="flex items-center gap-3 border-b border-slate-200 px-1 py-3 even:border-l even:pl-4 lg:border-b-0 lg:border-l lg:px-5 lg:first:border-l-0"><span className="rounded-xl border border-[#bae6fd] bg-[#f0f9ff] p-2 text-[#0e7490]"><MetricIcon size={18} /></span><div><div className="text-lg font-black text-slate-950">{value}</div><div className="text-[11px] font-semibold text-slate-500">{label}</div></div></div>;
              })}
            </div>
          </div>
        </section>

        {message && <div className={`mx-4 mt-4 rounded-2xl border px-4 py-3 text-sm font-semibold sm:mx-6 lg:mx-8 ${message.tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}>{message.text}</div>}

        <div className="mx-auto grid min-h-0 w-full max-w-[1600px] flex-1 gap-4 px-4 pb-4 pt-4 sm:px-6 lg:grid-cols-[350px_minmax(0,1fr)] lg:px-8">
          <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <div className="space-y-3 border-b border-slate-100 p-4">
              <div className="relative"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Zoek dossier, klant, IMEI…" className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm font-semibold focus:border-sky-500 focus:outline-none" /></div>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700"><option value="all">Alle statussen</option>{Object.entries(STATUS_META).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}</select>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {filteredOrders.length === 0 ? <div className="m-2 rounded-2xl bg-slate-50 p-6 text-center"><Wrench size={28} className="mx-auto text-slate-300" /><div className="mt-3 text-sm font-extrabold text-slate-700">Geen dossiers gevonden</div><div className="mt-1 text-xs leading-5 text-slate-500">Maak een intake aan of wijzig de filter.</div></div> : filteredOrders.map((order) => (
                <button key={order.id} type="button" onClick={() => setSelectedId(order.id)} className={`mb-2 w-full rounded-xl border p-3.5 text-left transition ${selected?.id === order.id ? "border-[#bae6fd] bg-[#f0f9ff] shadow-none" : "border-transparent hover:border-slate-200 hover:bg-slate-50"}`}>
                  <div className="flex items-start justify-between gap-2"><div className="text-[11px] font-black text-slate-500">{order.number}</div><StatusBadge order={order} /></div>
                  <div className="mt-2 truncate text-sm font-black text-slate-900">{order.customerName}</div>
                  <div className="mt-1 truncate text-xs text-slate-500">{[order.brand, order.model, order.assetType].filter(Boolean).join(" · ")}</div>
                  <div className="mt-3 flex items-center justify-between text-[10px] font-semibold text-slate-400"><span>{formatDateTime(order.updatedAt)}</span><ChevronRight size={14} /></div>
                </button>
              ))}
            </div>
          </section>

          <section className="min-h-0 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            {!selected ? (
              <div className="flex min-h-96 flex-col items-center justify-center p-10 text-center"><span className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-slate-400"><ClipboardCheck size={32} /></span><h2 className="mt-4 text-lg font-bold text-slate-800">Nog geen dossiers</h2><p className="mt-1.5 max-w-sm text-sm leading-6 text-slate-500">Maak je eerste dossier aan met de actie rechtsboven.</p></div>
            ) : (
              <div className="p-5 sm:p-7">
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-5">
                  <div><div className="flex items-center gap-2"><StatusBadge order={selected} /><span className="text-xs font-black text-slate-400">{selected.number}</span></div><h2 className="mt-3 text-2xl font-black text-slate-950">{selected.assetType}</h2><p className="mt-1 text-sm text-slate-500">{[selected.brand, selected.model, selected.identifierValue].filter(Boolean).join(" · ")}</p></div>
                  <div className="flex flex-wrap gap-2"><button type="button" onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"><Printer size={15} /> Bon</button><button type="button" onClick={() => void copyTrackingLink()} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"><Copy size={15} /> Link</button></div>
                </div>

                <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
                  <div className="space-y-6">
                    <section className="rounded-2xl border border-slate-200 p-5">
                      <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-sm font-black text-slate-900">Workflowstatus</h3><select value={selected.status} onChange={(event) => void changeStatus(event.target.value as ServiceOrderSystemStatus)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-800">{Object.entries(STATUS_META).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}</select></div>
                      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]"><input value={substatusDraft} onChange={(event) => setSubstatusDraft(event.target.value)} placeholder="Specifieke substatus" className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold focus:border-sky-500 focus:outline-none" /><button type="button" onClick={() => void saveDetails()} className="rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-extrabold text-white">Statusdetail bewaren</button></div>
                      <div className="mt-4 flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">{React.createElement(ROUTE_META[selected.route].icon, { size: 15, className: "text-sky-600" })}<strong>{routeLabel(selected.route)}</strong>{selected.externalReference ? ` · ${selected.externalReference}` : ""}</div>
                    </section>

                    <section className="rounded-2xl border border-slate-200 p-5">
                      <h3 className="text-sm font-black text-slate-900">Diagnose en oplossing</h3>
                      <div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="text-xs font-bold text-slate-600">Diagnose<textarea value={diagnosisDraft} onChange={(event) => setDiagnosisDraft(event.target.value)} rows={4} className="mt-1.5 w-full rounded-xl border border-slate-200 p-3 text-sm font-normal focus:border-sky-500 focus:outline-none" placeholder="Wat is vastgesteld?" /></label><label className="text-xs font-bold text-slate-600">Uitgevoerde oplossing<textarea value={resolutionDraft} onChange={(event) => setResolutionDraft(event.target.value)} rows={4} className="mt-1.5 w-full rounded-xl border border-slate-200 p-3 text-sm font-normal focus:border-sky-500 focus:outline-none" placeholder="Wat is hersteld, vervangen of omgeruild?" /></label></div>
                      <label className="mt-4 block text-xs font-bold text-slate-600">Externe referentie<input value={externalReferenceDraft} onChange={(event) => setExternalReferenceDraft(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold focus:border-sky-500 focus:outline-none" placeholder="RMA, ticket- of leveranciersnummer" /></label>
                    </section>

                    <section className="rounded-2xl border border-slate-200 p-5">
                      <div className="flex items-center justify-between"><h3 className="text-sm font-black text-slate-900">Prijsopbouw</h3>{selected.warranty && <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-black uppercase text-emerald-700">Garantie</span>}</div>
                      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">{[
                        ["diagnosis", "Diagnose"], ["labor", "Werkuren"], ["parts", "Onderdelen"], ["other", "Overig"], ["paid", "Reeds betaald"],
                      ].map(([key, label]) => <label key={key} className="text-[11px] font-bold text-slate-600">{label}<div className="relative mt-1.5"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">€</span><input inputMode="decimal" value={priceDraft[key as keyof typeof priceDraft]} onChange={(event) => setPriceDraft((current) => ({ ...current, [key]: event.target.value }))} className="w-full rounded-xl border border-slate-200 py-2 pl-7 pr-2 text-sm font-bold focus:border-sky-500 focus:outline-none" /></div></label>)}</div>
                      <div className="service-total-action mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#0e7490] bg-[#0e7490] p-4 text-white"><div><div className="text-[10px] font-bold uppercase tracking-wider text-white/70">Totaal / openstaand</div><div className="mt-1 text-xl font-black">{formatEUR(selected.totalCents)} <span className="text-sm font-semibold text-white/70">/ {formatEUR(Math.max(0, selected.totalCents - selected.paidCents))}</span></div></div><div className="flex gap-2"><button type="button" onClick={() => void saveDetails()} className="rounded-xl bg-white/10 px-3 py-2 text-xs font-bold text-white hover:bg-white/20">Prijzen bewaren</button><button type="button" onClick={() => void addBalanceToCart()} className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-xs font-black text-[#0e7490] hover:bg-[#f0f9ff]"><ShoppingCart size={15} /> Naar kassa</button></div></div>
                    </section>

                    <section className="rounded-2xl border border-slate-200 p-5"><h3 className="text-sm font-black text-slate-900">Dossierhistoriek</h3><div className="mt-5 space-y-0">{[...selected.events].reverse().map((event, index) => <div key={event.id} className="relative flex gap-3 pb-5 last:pb-0"><div className="relative z-10 mt-0.5 h-7 w-7 shrink-0 rounded-full border-4 border-white bg-sky-500" />{index < selected.events.length - 1 && <div className="absolute bottom-0 left-[13px] top-6 w-px bg-slate-200" />}<div><div className="text-xs font-extrabold text-slate-800">{event.label}</div>{event.detail && <div className="mt-0.5 text-xs text-slate-500">{event.detail}</div>}<div className="mt-1 text-[10px] text-slate-400">{formatDateTime(event.timestamp)}{event.userName ? ` · ${event.userName}` : ""}</div></div></div>)}</div></section>
                  </div>

                  <aside className="space-y-5">
                    <section className="rounded-2xl border border-slate-200 p-4"><div className="flex items-center gap-2"><UserRound size={17} className="text-[#0e7490]" /><h3 className="text-sm font-black text-slate-900">Klant</h3></div><div className="mt-3 text-sm font-extrabold text-slate-900">{selected.customerName}</div>{selected.customerEmail && <div className="mt-1 break-all text-xs text-slate-500">{selected.customerEmail}</div>}{selected.customerPhone && <div className="mt-1 text-xs text-slate-500">{selected.customerPhone}</div>}<div className="mt-4 grid gap-2"><button type="button" disabled={!selected.customerEmail} onClick={openCustomerEmail} className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#0e7490] bg-[#0e7490] px-3 py-2.5 text-xs font-extrabold text-white shadow-[0_1px_2px_rgba(15,23,42,0.08)] transition hover:bg-[#0f6677] disabled:opacity-40"><Mail size={15} /> {selected.status === "ready" ? "E-mail: klaar" : "E-mail bevestigen"}</button><button type="button" disabled={!selected.customerPhone} onClick={callCustomer} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-extrabold text-slate-700 hover:border-[#8bdce8] hover:bg-[#f3fbfc] hover:text-[#0f6f7e] disabled:opacity-40"><Phone size={15} /> Bel klant</button></div></section>

                    <section className="rounded-2xl border border-slate-200 p-4 text-center"><div className="mx-auto inline-block rounded-2xl bg-white p-2 shadow-sm ring-1 ring-slate-200"><QRCodeSVG value={serviceTrackingUrl(selected.trackingToken)} size={148} level="M" /></div><div className="mt-3 text-xs font-black text-slate-900">Publieke opvolging</div><p className="mt-1 text-[11px] leading-4 text-slate-500">De klant ziet alleen veilige dossierinformatie en de status in de huisstijl van {selected.merchantSnapshot.name}.</p><button type="button" onClick={() => void copyTrackingLink()} className="mt-3 inline-flex items-center gap-2 text-xs font-bold text-sky-700"><Copy size={14} /> Kopieer link</button></section>

                    <section className="rounded-2xl border border-slate-200 p-4"><div className="flex items-center gap-2"><Camera size={17} className="text-slate-500" /><h3 className="text-sm font-black text-slate-900">Intakefoto’s</h3></div>{selected.attachments.length === 0 ? <p className="mt-3 text-xs leading-5 text-slate-500">Geen foto’s toegevoegd.</p> : <div className="mt-3 grid grid-cols-2 gap-2">{selected.attachments.map((attachment) => attachment.dataUrl ? <img key={attachment.id} src={attachment.dataUrl} alt={attachment.name} className="aspect-square w-full rounded-xl object-cover" /> : <div key={attachment.id} className="flex aspect-square items-center justify-center rounded-xl bg-slate-100"><FileText size={24} className="text-slate-400" /></div>)}</div>}</section>

                    <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="flex items-center gap-2 text-xs font-black text-[#0e7490]"><Clock3 size={15} /> Belofte</div><div className="mt-2 text-sm font-extrabold text-slate-900">{formatDate(selected.promisedAt)}</div><div className="mt-1 text-[11px] text-slate-500">Aangemaakt {formatDateTime(selected.createdAt)}</div></section>
                  </aside>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>

      {selected && (
        <div className="hidden print:block print:p-8">
          <div className="mx-auto max-w-2xl border border-black p-8 text-black">
            <div className="flex items-start justify-between gap-8 border-b border-black pb-5"><div><div className="text-2xl font-black">{selected.merchantSnapshot.name}</div><div className="mt-1 text-sm">{selected.merchantSnapshot.addressLine1}<br />{selected.merchantSnapshot.addressLine2}<br />{selected.merchantSnapshot.phone}</div></div><div className="text-right"><div className="text-sm font-bold">HERSTELBON</div><div className="mt-1 font-mono text-lg font-black">{selected.number}</div></div></div>
            <div className="grid grid-cols-2 gap-8 py-6 text-sm"><div><strong>Klant</strong><br />{selected.customerName}<br />{selected.customerEmail}<br />{selected.customerPhone}</div><div><strong>Toestel / product</strong><br />{selected.assetType}<br />{[selected.brand, selected.model].filter(Boolean).join(" · ")}<br />{selected.identifierType}: {selected.identifierValue}</div></div>
            <div className="border-y border-black py-5 text-sm"><strong>Gemeld probleem</strong><p className="mt-2 whitespace-pre-wrap">{selected.issue}</p>{selected.accessories && <p className="mt-3"><strong>Meegeleverd:</strong> {selected.accessories}</p>}</div>
            <div className="mt-6 flex items-center justify-between gap-8"><div className="text-sm"><strong>Status:</strong> {selected.substatus}<br /><strong>Route:</strong> {routeLabel(selected.route)}<br /><strong>Verwacht:</strong> {formatDate(selected.promisedAt)}<br /><strong>Raming:</strong> {formatEUR(selected.totalCents)}</div><QRCodeSVG value={serviceTrackingUrl(selected.trackingToken)} size={130} /></div>
            <div className="mt-5 break-all border-t border-black pt-4 text-[10px]">Volg uw dossier: {serviceTrackingUrl(selected.trackingToken)}</div>
          </div>
        </div>
      )}

      <Modal open={intakeOpen} onClose={() => setIntakeOpen(false)} title="Nieuw hersteldossier" subtitle="Leg klant, toestel, probleem en afspraak in één duidelijke stap vast." icon={<Wrench size={19} />} size="5xl" footer={<div className="flex w-full items-center justify-between gap-3"><div className="text-xs text-slate-500"><strong>{attachments.length}</strong> foto{attachments.length === 1 ? "" : "’s"} · route: <strong>{routeLabel(draft.route)}</strong></div><div className="flex gap-2"><button type="button" onClick={() => setIntakeOpen(false)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700">Annuleren</button><button type="button" disabled={isSaving} onClick={() => void createOrder()} className="inline-flex items-center gap-2 rounded-xl border border-[#0e7490] bg-[#0e7490] px-5 py-2.5 text-sm font-extrabold text-white shadow-[0_1px_2px_rgba(15,23,42,0.08)] transition hover:bg-[#0f6677] disabled:opacity-50">{isSaving ? <RefreshCw size={16} className="animate-spin" /> : <CheckCircle2 size={16} />} Dossier aanmaken</button></div></div>}>
        <div className="overflow-y-auto p-5 sm:p-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <section className="space-y-4"><div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-sky-700"><UserRound size={15} /> 1. Klant</div><label className="block text-xs font-bold text-slate-600">Bestaande klant<select value={draft.customerId} onChange={(event) => chooseCustomer(customers.find((customer) => customer.id === event.target.value))} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold"><option value="">Nieuwe / losse klant</option>{customers.filter((customer) => customer.isActive).map((customer) => <option key={customer.id} value={customer.id}>{customer.name}{customer.priceGroup ? ` · ${customer.priceGroup}` : ""}</option>)}</select></label><div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-bold text-slate-600">Naam *<input value={draft.customerName} onChange={(event) => setDraftField("customerName", event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold" /></label><label className="text-xs font-bold text-slate-600">Tariefgroep<input value={draft.priceGroup} onChange={(event) => setDraftField("priceGroup", event.target.value)} placeholder="bv. telenet-klant" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold" /></label><label className="text-xs font-bold text-slate-600">E-mail<input type="email" value={draft.customerEmail} onChange={(event) => setDraftField("customerEmail", event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold" /></label><label className="text-xs font-bold text-slate-600">Telefoon<input type="tel" value={draft.customerPhone} onChange={(event) => setDraftField("customerPhone", event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold" /></label></div></section>

            <section className="space-y-4"><div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-sky-700"><Smartphone size={15} /> 2. Product / toestel</div><div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-bold text-slate-600">Type *<input value={draft.assetType} onChange={(event) => setDraftField("assetType", event.target.value)} placeholder="Digibox, modem, fiets, laptop…" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold" /></label><label className="text-xs font-bold text-slate-600">Merk<input value={draft.brand} onChange={(event) => setDraftField("brand", event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold" /></label><label className="text-xs font-bold text-slate-600">Model<input value={draft.model} onChange={(event) => setDraftField("model", event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold" /></label><label className="text-xs font-bold text-slate-600">Identificatietype<select value={draft.identifierType} onChange={(event) => setDraftField("identifierType", event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold"><option>Serienummer</option><option>IMEI</option><option>MAC-adres</option><option>Framenummer</option><option>Artikelnummer</option><option>Ander</option></select></label><label className="sm:col-span-2 text-xs font-bold text-slate-600">Identificatiewaarde<input value={draft.identifierValue} onChange={(event) => setDraftField("identifierValue", event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-mono text-sm" /></label><label className="sm:col-span-2 text-xs font-bold text-slate-600">Meegeleverde accessoires<input value={draft.accessories} onChange={(event) => setDraftField("accessories", event.target.value)} placeholder="Voeding, afstandsbediening, hoes…" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" /></label></div></section>

            <section className="space-y-4"><div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-sky-700"><ClipboardCheck size={15} /> 3. Probleem en staat</div><label className="block text-xs font-bold text-slate-600">Probleemomschrijving *<textarea value={draft.issue} onChange={(event) => setDraftField("issue", event.target.value)} rows={4} className="mt-1.5 w-full rounded-xl border border-slate-200 p-3 text-sm" placeholder="Noteer de klacht in de woorden van de klant." /></label><label className="block text-xs font-bold text-slate-600">Staat bij binnenkomst<textarea value={draft.intakeCondition} onChange={(event) => setDraftField("intakeCondition", event.target.value)} rows={2} className="mt-1.5 w-full rounded-xl border border-slate-200 p-3 text-sm" placeholder="Krassen, schade, ontbrekende onderdelen…" /></label><label className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 p-4 text-xs font-bold text-slate-600 hover:border-sky-300 hover:bg-sky-50"><Upload size={16} /> Voeg intakefoto’s toe (max. 5 × 5 MB)<input type="file" accept="image/*" multiple className="hidden" onChange={(event) => void addFiles(event.target.files)} /></label>{attachments.length > 0 && <div className="grid grid-cols-5 gap-2">{attachments.map((attachment) => <div key={attachment.id} className="group relative"><img src={attachment.dataUrl} alt={attachment.name} className="aspect-square w-full rounded-xl object-cover" /><button type="button" onClick={() => setAttachments((current) => current.filter((item) => item.id !== attachment.id))} className="absolute -right-1 -top-1 rounded-full bg-red-600 p-1 text-white"><XCircle size={13} /></button></div>)}</div>}</section>

            <section className="space-y-4"><div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-sky-700"><Send size={15} /> 4. Route en afspraak</div><div className="grid gap-2 sm:grid-cols-2">{(Object.entries(ROUTE_META) as Array<[ServiceOrderRoute, typeof ROUTE_META[ServiceOrderRoute]]>).map(([value, meta]) => { const RouteIcon = meta.icon; return <button key={value} type="button" onClick={() => setDraftField("route", value)} className={`flex items-center gap-2 rounded-2xl border p-3 text-left text-xs font-bold ${draft.route === value ? "border-sky-400 bg-sky-50 text-sky-900" : "border-slate-200 text-slate-700"}`}><RouteIcon size={16} />{meta.label}</button>; })}</div><label className="block text-xs font-bold text-slate-600">Beloofde datum<input type="date" value={draft.promisedDate} onChange={(event) => setDraftField("promisedDate", event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold" /></label><div className="grid grid-cols-2 gap-3"><label className="flex items-center gap-2 rounded-xl bg-slate-50 p-3 text-xs font-bold text-slate-700"><input type="checkbox" checked={draft.warranty} onChange={(event) => setDraftField("warranty", event.target.checked)} className="h-4 w-4" /> Garantiegeval</label><label className="flex items-center gap-2 rounded-xl bg-slate-50 p-3 text-xs font-bold text-slate-700"><input type="checkbox" checked={draft.noCureNoPay} onChange={(event) => setDraftField("noCureNoPay", event.target.checked)} className="h-4 w-4" /> No cure, no pay</label></div></section>
          </div>

          <section className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-sky-700"><Banknote size={15} /> 5. Prijs en voorschot</div><div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">{[["diagnosisFee", "Diagnose"], ["labor", "Werkuren"], ["parts", "Onderdelen"], ["other", "Overig"], ["deposit", "Voorschot"]].map(([key, label]) => <label key={key} className="text-[11px] font-bold text-slate-600">{label}<div className="relative mt-1.5"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">€</span><input inputMode="decimal" value={draft[key as keyof IntakeDraft] as string} onChange={(event) => setDraftField(key as keyof IntakeDraft, event.target.value as never)} className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-7 pr-2 text-sm font-bold" /></div></label>)}</div><label className="mt-4 block text-xs font-bold text-slate-600">Interne notitie<textarea value={draft.internalNote} onChange={(event) => setDraftField("internalNote", event.target.value)} rows={2} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm" placeholder="Nooit zichtbaar voor de klant." /></label></section>
        </div>
      </Modal>
    </main>
  );
};
