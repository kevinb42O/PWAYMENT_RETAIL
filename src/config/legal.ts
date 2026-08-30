export const LEGAL_VERSION = "2026.08.30";
export const LEGAL_EFFECTIVE_DATE = "30 augustus 2026";

const value = (input: string | undefined, fallback: string) =>
  input?.trim() || fallback;

export const legalIdentity = {
  legalName: value(import.meta.env.VITE_LEGAL_NAME, "[JURIDISCHE NAAM INVULLEN]"),
  tradeName: value(import.meta.env.VITE_LEGAL_TRADE_NAME, "PWAYMENT"),
  legalForm: value(import.meta.env.VITE_LEGAL_FORM, "[RECHTSVORM INVULLEN]"),
  registeredAddress: value(import.meta.env.VITE_LEGAL_ADDRESS, "[MAATSCHAPPELIJKE ZETEL INVULLEN]"),
  enterpriseNumber: value(import.meta.env.VITE_LEGAL_ENTERPRISE_NUMBER, "[ONDERNEMINGSNUMMER INVULLEN]"),
  vatNumber: value(import.meta.env.VITE_LEGAL_VAT_NUMBER, "[BTW-NUMMER INVULLEN]"),
  rpr: value(import.meta.env.VITE_LEGAL_RPR, "[RPR EN BEVOEGDE RECHTBANK INVULLEN]"),
  email: value(import.meta.env.VITE_LEGAL_EMAIL, "legal@pwayment.be"),
  privacyEmail: value(import.meta.env.VITE_PRIVACY_EMAIL, "privacy@pwayment.be"),
  supportEmail: value(import.meta.env.VITE_SUPPORT_EMAIL, "support@pwayment.be"),
  phone: value(import.meta.env.VITE_LEGAL_PHONE, "[TELEFOONNUMMER INVULLEN]"),
};

export const legalPlaceholders = Object.entries(legalIdentity)
  .filter(([, entry]) => entry.startsWith("["))
  .map(([field]) => field);

export const legalIdentityComplete = legalPlaceholders.length === 0;

export const subprocessorPlaceholders = [
  {
    name: "Supabase",
    purpose: "Authenticatie, database, synchronisatie en back-endfuncties",
    location: "[REGIO EN CONTRACTERENDE ENTITEIT BEVESTIGEN]",
    safeguards: "DPA en, indien nodig, EU-modelcontractbepalingen",
  },
  {
    name: "Hostingprovider publieke applicatie",
    purpose: "Hosting, distributie en technische beveiligingslogs",
    location: "[VERCEL/SITES-KEUZE, REGIO EN ENTITEIT BEVESTIGEN]",
    safeguards: "DPA en, indien nodig, EU-modelcontractbepalingen",
  },
  {
    name: "Google Gemini",
    purpose: "Generatieve Pace-antwoorden wanneer de winkel deze functie activeert",
    location: "[CONTRACT, REGIO, RETENTIE EN TRAININGSGEBRUIK BEVESTIGEN]",
    safeguards: "Dataminimalisatie; geen activering zonder passende contractuele waarborgen",
  },
] as const;

export const hasUnconfirmedSubprocessors = subprocessorPlaceholders.some(
  (entry) => entry.location.startsWith("["),
);

export const legalDocumentUrl = (document: "terms" | "privacy" | "dpa") =>
  `/legal/${document}?version=${encodeURIComponent(LEGAL_VERSION)}`;
