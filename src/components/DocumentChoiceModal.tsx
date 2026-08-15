import React, { useEffect, useMemo, useState } from "react";
import { Building2, FileText, ReceiptText, UserRound } from "lucide-react";
import type {
  Customer,
  InvoiceRecipientSnapshot,
  SaleDocumentRequest,
  SaleDocumentType,
} from "../types";
import { Modal } from "./Modal";

interface Props {
  open: boolean;
  customer?: Customer | null;
  value: SaleDocumentRequest;
  onClose: () => void;
  onChange: (request: SaleDocumentRequest) => void;
}

type RecipientDraft = Omit<InvoiceRecipientSnapshot, "customerId">;

const emptyRecipient = (): RecipientDraft => ({
  name: "",
  companyName: "",
  addressLine1: "",
  postalCode: "",
  city: "",
  countryCode: "BE",
  vatNumber: "",
  email: "",
  purchaseOrderReference: "",
});

const fromCustomer = (customer?: Customer | null): RecipientDraft => ({
  ...emptyRecipient(),
  name: customer?.name ?? "",
  addressLine1: customer?.address ?? "",
  email: customer?.email ?? "",
});

const typeLabel: Record<SaleDocumentType, string> = {
  receipt: "Kassaticket",
  "invoice-b2c": "Factuur particulier",
  "invoice-b2b": "Factuur onderneming",
};

export const documentChoiceLabel = (request: SaleDocumentRequest): string =>
  typeLabel[request.type];

export const DocumentChoiceModal: React.FC<Props> = ({
  open,
  customer,
  value,
  onClose,
  onChange,
}) => {
  const [type, setType] = useState<SaleDocumentType>(value.type);
  const [recipient, setRecipient] = useState<RecipientDraft>(
    value.recipient ?? fromCustomer(customer),
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setType(value.type);
    setRecipient(value.recipient ?? fromCustomer(customer));
    setError(null);
  }, [open, value, customer]);

  const needsInvoiceDetails = type !== "receipt";
  const isBusiness = type === "invoice-b2b";
  const missing = useMemo(() => {
    if (!needsInvoiceDetails) return false;
    return [recipient.name, recipient.addressLine1, recipient.postalCode, recipient.city, recipient.countryCode].some(
      (field) => !field.trim(),
    ) || (isBusiness && !recipient.vatNumber.trim());
  }, [isBusiness, needsInvoiceDetails, recipient]);

  const set = (key: keyof RecipientDraft, next: string) => {
    setError(null);
    setRecipient((current) => ({ ...current, [key]: next }));
  };

  const save = () => {
    if (missing) {
      setError(
        isBusiness
          ? "Vul bedrijfsnaam/contact, adres, postcode, plaats, land en btw-nummer in."
          : "Vul naam, adres, postcode, plaats en land in voor de factuur.",
      );
      return;
    }
    if (type === "receipt") {
      onChange({ type });
    } else {
      onChange({
        type,
        recipient: {
          ...recipient,
          customerId: customer?.id,
          name: recipient.name.trim(),
          companyName: recipient.companyName.trim() || undefined,
          addressLine1: recipient.addressLine1.trim(),
          postalCode: recipient.postalCode.trim(),
          city: recipient.city.trim(),
          countryCode: recipient.countryCode.trim().toUpperCase(),
          vatNumber: recipient.vatNumber.trim().toUpperCase() || undefined,
          email: recipient.email.trim().toLocaleLowerCase("nl-BE") || undefined,
          purchaseOrderReference: recipient.purchaseOrderReference.trim() || undefined,
        },
      });
    }
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Document voor deze verkoop"
      size="lg"
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700">
            Annuleren
          </button>
          <button type="button" onClick={save} className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-bold text-white hover:bg-sky-500">
            Documentkeuze bewaren
          </button>
        </div>
      }
    >
      <div className="space-y-5 text-white">
        <p className="text-sm leading-6 text-zinc-400">
          Kies vóór de betaling welk document de klant nodig heeft. Een factuur bewaart de ingevulde gegevens als onveranderlijke momentopname bij de verkoop.
        </p>

        <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Documenttype">
          {([
            ["receipt", "Ticket", "Thermische bon of herdruk na betaling", ReceiptText],
            ["invoice-b2c", "Particulier", "A4-PDF met facturatieadres", UserRound],
            ["invoice-b2b", "Onderneming", "Btw-nummer en B2B-documentgegevens", Building2],
          ] as const).map(([choice, title, detail, Icon]) => (
            <button
              type="button"
              key={choice}
              role="radio"
              aria-checked={type === choice}
              onClick={() => { setType(choice); setError(null); }}
              className={`rounded-xl border p-3 text-left transition-colors ${type === choice ? "border-sky-400 bg-sky-500/15 ring-1 ring-sky-400" : "border-zinc-700 bg-zinc-950 hover:border-zinc-500"}`}
            >
              <Icon size={18} className={type === choice ? "text-sky-300" : "text-zinc-400"} />
              <span className="mt-2 block text-sm font-bold">{title}</span>
              <span className="mt-1 block text-xs leading-5 text-zinc-400">{detail}</span>
            </button>
          ))}
        </div>

        {needsInvoiceDetails && (
          <div className="space-y-3 rounded-xl border border-zinc-700 bg-zinc-950/70 p-4">
            <div>
              <h3 className="flex items-center gap-2 text-sm font-bold"><FileText size={16} className="text-sky-300" /> Facturatiegegevens</h3>
              {customer && <p className="mt-1 text-xs text-zinc-400">Vooringevuld vanuit gekoppelde klant: {customer.name}. Wijzigingen hier gelden enkel voor deze factuur.</p>}
            </div>
            {isBusiness && (
              <Field label="Bedrijfsnaam">
                <input value={recipient.companyName} onChange={(event) => set("companyName", event.target.value)} placeholder="BV / handelsnaam" />
              </Field>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={isBusiness ? "Contactpersoon" : "Naam"} required>
                <input value={recipient.name} onChange={(event) => set("name", event.target.value)} />
              </Field>
              {isBusiness && <Field label="Btw-nummer" required><input value={recipient.vatNumber} onChange={(event) => set("vatNumber", event.target.value)} placeholder="BE0123.456.789" /></Field>}
            </div>
            <Field label="Adres" required>
              <input value={recipient.addressLine1} onChange={(event) => set("addressLine1", event.target.value)} placeholder="Straat en nummer" />
            </Field>
            <div className="grid grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)] gap-3">
              <Field label="Postcode" required><input value={recipient.postalCode} onChange={(event) => set("postalCode", event.target.value)} /></Field>
              <Field label="Plaats" required><input value={recipient.city} onChange={(event) => set("city", event.target.value)} /></Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Landcode" required><input value={recipient.countryCode} onChange={(event) => set("countryCode", event.target.value)} placeholder="BE" maxLength={2} /></Field>
              <Field label="E-mail voor PDF"><input type="email" value={recipient.email} onChange={(event) => set("email", event.target.value)} /></Field>
            </div>
            {isBusiness && <Field label="Bestelreferentie"><input value={recipient.purchaseOrderReference} onChange={(event) => set("purchaseOrderReference", event.target.value)} placeholder="Optioneel PO- of bestelnummer" /></Field>}
          </div>
        )}

        {isBusiness && <p className="rounded-lg border border-amber-400/30 bg-amber-500/10 p-3 text-xs leading-5 text-amber-100">Een A4-PDF is een leesbare kopie. Voor Belgische B2B is daadwerkelijke Peppol-verzending pas beschikbaar zodra een access point is geconfigureerd.</p>}
        {error && <p role="alert" className="rounded-lg border border-red-800 bg-red-950/50 p-3 text-sm text-red-200">{error}</p>}
      </div>
    </Modal>
  );
};

const Field: React.FC<{ label: string; required?: boolean; children: React.ReactNode }> = ({ label, required, children }) => (
  <label className="block text-xs font-semibold text-zinc-300">
    {label}{required ? " *" : ""}
    <span className="mt-1 block [&_input]:w-full [&_input]:rounded-lg [&_input]:border [&_input]:border-zinc-700 [&_input]:bg-zinc-900 [&_input]:px-3 [&_input]:py-2 [&_input]:text-sm [&_input]:text-white [&_input]:outline-none [&_input]:focus:border-sky-400">{children}</span>
  </label>
);
