import React, { useEffect, useMemo, useState } from "react";
import { Building2, FileText, Search, UserRound } from "lucide-react";
import type { Customer, CustomerBillingProfile, SaleDocumentRequest } from "../types";
import { generateId, useCustomers } from "../store/useCustomers";
import { formattedBillingAddress, invoiceRequestFromCustomer } from "../utils/invoiceCustomer";
import { Modal } from "./Modal";

interface Props {
  open: boolean;
  linkedCustomer?: Customer | null;
  onClose: () => void;
  onComplete: (customer: Customer, request: SaleDocumentRequest) => void;
}

type Mode = "search" | "create" | "edit";

const blankProfile = (type: CustomerBillingProfile["type"] = "individual"): CustomerBillingProfile => ({
  type,
  companyName: "",
  contactName: "",
  addressLine1: "",
  postalCode: "",
  city: "",
  countryCode: "BE",
  vatNumber: "",
  email: "",
  purchaseOrderReference: "",
});

const profileFor = (customer?: Customer | null): CustomerBillingProfile =>
  customer?.billingProfile ? { ...customer.billingProfile } : blankProfile();

export const InvoiceCustomerModal: React.FC<Props> = ({ open, linkedCustomer, onClose, onComplete }) => {
  const { customers, upsertCustomer } = useCustomers();
  const [mode, setMode] = useState<Mode>("search");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Customer | null>(null);
  const [profile, setProfile] = useState<CustomerBillingProfile>(blankProfile());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSelected(linkedCustomer ?? null);
    setProfile(profileFor(linkedCustomer));
    setMode(linkedCustomer ? "edit" : "search");
    setError(null);
  }, [open, linkedCustomer]);

  const matches = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("nl-BE");
    return customers.filter((customer) => customer.isActive && (
      !term || customer.name.toLocaleLowerCase("nl-BE").includes(term) ||
      customer.email?.toLocaleLowerCase("nl-BE").includes(term) ||
      customer.phone?.toLocaleLowerCase("nl-BE").includes(term) ||
      customer.billingProfile?.vatNumber?.toLocaleLowerCase("nl-BE").includes(term)
    ));
  }, [customers, query]);

  const set = (key: keyof CustomerBillingProfile, value: string) => {
    setError(null);
    setProfile((current) => ({ ...current, [key]: value }));
  };

  const startCustomer = (customer: Customer) => {
    setSelected(customer);
    setProfile(profileFor(customer));
    setMode("edit");
    setError(null);
  };

  const save = async () => {
    const individual = profile.type === "individual";
    const contactName = profile.contactName.trim();
    const companyName = profile.companyName?.trim();
    if (!contactName || !profile.addressLine1.trim() || !profile.postalCode.trim() || !profile.city.trim() || !profile.countryCode.trim() || (!individual && (!companyName || !profile.vatNumber?.trim()))) {
      setError(individual
        ? "Vul naam, adres, postcode, plaats en land in voor de factuur."
        : "Vul bedrijfsnaam, contactpersoon, adres, postcode, plaats, land en btw-nummer in.");
      return;
    }
    const normalized: CustomerBillingProfile = {
      ...profile,
      companyName: companyName || undefined,
      contactName,
      addressLine1: profile.addressLine1.trim(),
      postalCode: profile.postalCode.trim(),
      city: profile.city.trim(),
      countryCode: profile.countryCode.trim().toUpperCase(),
      vatNumber: profile.vatNumber?.trim().toUpperCase() || undefined,
      email: profile.email?.trim().toLocaleLowerCase("nl-BE") || undefined,
      purchaseOrderReference: profile.purchaseOrderReference?.trim() || undefined,
    };
    const customer: Customer = {
      id: selected?.id ?? generateId(),
      name: normalized.type === "business" ? normalized.companyName! : normalized.contactName,
      email: normalized.email,
      phone: selected?.phone,
      address: formattedBillingAddress(normalized),
      notes: selected?.notes,
      priceGroup: selected?.priceGroup,
      billingProfile: normalized,
      totalSpentCents: selected?.totalSpentCents ?? 0,
      visitCount: selected?.visitCount ?? 0,
      lastVisitAt: selected?.lastVisitAt,
      createdAt: selected?.createdAt ?? new Date().toISOString(),
      isActive: true,
    };
    const request = invoiceRequestFromCustomer(customer);
    if (!request) {
      setError("De factuurgegevens zijn onvolledig.");
      return;
    }
    setSaving(true);
    try {
      // This persists the customer before payment and enqueues it before the
      // transaction outbox entry. The server checkout RPC validates it again.
      await upsertCustomer(customer);
      onComplete(customer, request);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Klant kon niet worden opgeslagen.");
    } finally {
      setSaving(false);
    }
  };

  const editing = mode === "create" || mode === "edit";
  return <Modal
    open={open}
    onClose={onClose}
    title="Factuur opmaken"
    size="lg"
    footer={editing ? <div className="flex justify-end gap-2">
      <button type="button" onClick={() => setMode("search")} disabled={saving} className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-50">Terug</button>
      <button type="button" onClick={() => void save()} disabled={saving} className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-bold text-white hover:bg-sky-500 disabled:opacity-50">{saving ? "Opslaan…" : selected ? "Bijwerken en koppelen" : "Klant toevoegen en koppelen"}</button>
    </div> : undefined}
  >
    <div className="space-y-5 text-white">
      {mode === "search" && <>
        <p className="text-sm leading-6 text-zinc-400">Kies de klant voor deze factuur, of maak meteen een nieuwe factuurklant aan. Zonder klant kan een factuur niet betaald worden.</p>
        <div className="relative"><Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" /><input autoFocus type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Zoek op naam, e-mail, telefoon of btw-nummer" className="w-full rounded-lg border border-zinc-700 bg-zinc-900 py-2.5 pl-10 pr-3 text-sm text-white outline-none focus:border-sky-400" /></div>
        <div className="max-h-64 space-y-2 overflow-y-auto">
          {matches.map((customer) => <button key={customer.id} type="button" onClick={() => startCustomer(customer)} className="flex w-full items-center justify-between rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-3 text-left hover:border-sky-400">
            <span><span className="block text-sm font-bold">{customer.name}</span><span className="mt-0.5 block text-xs text-zinc-400">{customer.billingProfile ? `${customer.billingProfile.city} · ${customer.billingProfile.type === "business" ? customer.billingProfile.vatNumber : "particulier"}` : "Factuurgegevens aanvullen"}</span></span>
            <FileText size={17} className="text-sky-300" />
          </button>)}
          {matches.length === 0 && <p className="px-1 py-6 text-center text-sm text-zinc-500">Geen klant gevonden.</p>}
        </div>
        <button type="button" onClick={() => { setSelected(null); setProfile(blankProfile()); setMode("create"); }} className="w-full rounded-xl border border-dashed border-sky-500/70 bg-sky-500/10 px-4 py-3 text-sm font-bold text-sky-200 hover:bg-sky-500/20">+ Nieuwe factuurklant toevoegen</button>
      </>}
      {editing && <>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Type factuurklant">
          <button type="button" role="radio" aria-checked={profile.type === "individual"} onClick={() => setProfile((value) => ({ ...value, type: "individual", companyName: "", vatNumber: "" }))} className={`rounded-xl border p-3 text-left ${profile.type === "individual" ? "border-sky-400 bg-sky-500/15" : "border-zinc-700 bg-zinc-950"}`}><UserRound size={18} className="text-sky-300" /><span className="mt-2 block text-sm font-bold">Particulier</span></button>
          <button type="button" role="radio" aria-checked={profile.type === "business"} onClick={() => setProfile((value) => ({ ...value, type: "business" }))} className={`rounded-xl border p-3 text-left ${profile.type === "business" ? "border-sky-400 bg-sky-500/15" : "border-zinc-700 bg-zinc-950"}`}><Building2 size={18} className="text-sky-300" /><span className="mt-2 block text-sm font-bold">Onderneming</span></button>
        </div>
        {profile.type === "business" && <Field label="Bedrijfsnaam" required><input value={profile.companyName ?? ""} onChange={(event) => set("companyName", event.target.value)} /></Field>}
        <div className="grid gap-3 sm:grid-cols-2"><Field label={profile.type === "business" ? "Contactpersoon" : "Naam"} required><input value={profile.contactName} onChange={(event) => set("contactName", event.target.value)} /></Field>{profile.type === "business" && <Field label="Btw-nummer" required><input value={profile.vatNumber ?? ""} onChange={(event) => set("vatNumber", event.target.value)} placeholder="BE0123.456.789" /></Field>}</div>
        <Field label="Straat en nummer" required><input value={profile.addressLine1} onChange={(event) => set("addressLine1", event.target.value)} /></Field>
        <div className="grid grid-cols-[0.7fr_1.3fr] gap-3"><Field label="Postcode" required><input value={profile.postalCode} onChange={(event) => set("postalCode", event.target.value)} /></Field><Field label="Gemeente" required><input value={profile.city} onChange={(event) => set("city", event.target.value)} /></Field></div>
        <div className="grid gap-3 sm:grid-cols-2"><Field label="Landcode" required><input value={profile.countryCode} onChange={(event) => set("countryCode", event.target.value)} maxLength={2} /></Field><Field label="E-mail voor PDF"><input type="email" value={profile.email ?? ""} onChange={(event) => set("email", event.target.value)} /></Field></div>
        {profile.type === "business" && <Field label="Bestelreferentie"><input value={profile.purchaseOrderReference ?? ""} onChange={(event) => set("purchaseOrderReference", event.target.value)} /></Field>}
      </>}
      {error && <p role="alert" className="rounded-lg border border-red-800 bg-red-950/50 p-3 text-sm text-red-200">{error}</p>}
    </div>
  </Modal>;
};

const Field: React.FC<{ label: string; required?: boolean; children: React.ReactNode }> = ({ label, required, children }) => <label className="block text-xs font-semibold text-zinc-300">{label}{required ? " *" : ""}<span className="mt-1 block [&_input]:w-full [&_input]:rounded-lg [&_input]:border [&_input]:border-zinc-700 [&_input]:bg-zinc-900 [&_input]:px-3 [&_input]:py-2 [&_input]:text-sm [&_input]:text-white [&_input]:outline-none [&_input]:focus:border-sky-400">{children}</span></label>;
