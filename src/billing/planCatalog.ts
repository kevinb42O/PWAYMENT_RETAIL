export type BillingCycle = 'monthly' | 'yearly';
export type PublicPlanCode = 'basic' | 'pro' | 'enterprise';

export interface PlanCatalogEntry {
  code: PublicPlanCode;
  publicName: string;
  monthlyPriceCents: number;
  yearlyEffectiveMonthlyCents: number;
  audience: string;
  cta: string;
  href: string;
  featured?: boolean;
  features: string[];
}

export interface PlanComparisonRow {
  label: string;
  basic: string;
  pro: string;
  enterprise: string;
}

export interface PlanComparisonGroup {
  category: string;
  rows: PlanComparisonRow[];
}

export const PLAN_CATALOG: Record<PublicPlanCode, PlanCatalogEntry> = {
  basic: {
    code: 'basic',
    publicName: 'Basis',
    monthlyPriceCents: 0,
    yearlyEffectiveMonthlyCents: 0,
    audience: 'Voor pop-ups, markten en een eerste winkel.',
    cta: 'Start met Basis',
    href: '/register?plan=basis',
    features: ['1 locatie en 1 kassascherm', '250 actieve producten', 'Pace-begeleiding + 5 AI-vragen per dag', 'Koppel je eigen printer en barcodescanner', 'Basis voorraadbeheer', 'Z-rapport en 30 dagen historie', 'E-mailondersteuning'],
  },
  pro: {
    code: 'pro',
    publicName: 'Retail Professional',
    monthlyPriceCents: 6900,
    yearlyEffectiveMonthlyCents: 5500,
    audience: 'Voor actieve winkels met één tot drie kassa’s.',
    cta: 'Probeer 30 dagen gratis',
    href: '/register?plan=professional',
    featured: true,
    features: ['Onbeperkte producten en varianten', 'Pace-begeleiding + 250 AI-vragen per maand', 'Dual-screen klantendisplay', 'ServiceDesk tot 50 actieve dossiers', 'Barcode-labels op Dymo en Zebra', 'CRM, loyaliteit, VIP en cadeaubonnen', 'PWAYMENT Webshop met live voorraad', 'Boekhouding en Peppol volgens connectorstatus', 'Prioriteit e-mail en chat'],
  },
  enterprise: {
    code: 'enterprise',
    publicName: 'Enterprise & ketens',
    monthlyPriceCents: 14900,
    yearlyEffectiveMonthlyCents: 11900,
    audience: 'Voor ketens, franchises en multichannel retail.',
    cta: 'Kies Enterprise',
    href: '/register?plan=enterprise',
    features: ['Meerdere locaties en voorraadoverdrachten', 'Pace-beleid per rol + 2.500 AI-vragen per maand', 'Personeelsplanning, uren en verlof', 'Voorraadprognose met AI en inkooporders', 'Onbeperkte ServiceDesk met uitgebreide werkwijze', 'Fijnmazige rechten en volledig auditlogboek', 'REST API en webhooks', 'Meerdere webshops', 'SLA en ondersteuning volgens overeenkomst'],
  },
};

export const PLAN_COMPARISON_GROUPS: PlanComparisonGroup[] = [
  {
    category: 'Pace-begeleiding',
    rows: [
      { label: 'Contextuele setup en navigatie', basic: 'Inbegrepen', pro: 'Inbegrepen', enterprise: 'Inbegrepen' },
      { label: 'Generatieve AI-vragen', basic: '5 per dag', pro: '250 per maand', enterprise: '2.500 per maand' },
      { label: 'Pace-beleid en proactiviteit per rol', basic: '—', pro: 'Persoonlijke voorkeur', enterprise: 'Centraal beleid per rol' },
    ],
  },
  {
    category: 'Kassasoftware & compatibiliteit',
    rows: [
      { label: 'Kassaschermen in de software', basic: '1', pro: '1', enterprise: 'Volgens contract' },
      { label: 'Printer en barcodescanner koppelen', basic: 'Basis', pro: 'Uitgebreid', enterprise: 'Uitgebreid' },
      { label: 'Betaalterminal, weegschaal en kassalade koppelen', basic: '—', pro: 'Volgens compatibiliteitsstatus', enterprise: 'Volgens contract' },
      { label: 'Klantendisplay koppelen', basic: '—', pro: '1 per kassascherm', enterprise: 'Volgens contract' },
    ],
  },
  {
    category: 'Producten & voorraad',
    rows: [
      { label: 'Actieve producten', basic: '250', pro: 'Onbeperkt', enterprise: 'Onbeperkt' },
      { label: 'Hoofdcategorieën', basic: '5', pro: 'Onbeperkt', enterprise: 'Onbeperkt' },
      { label: 'Dymo/Zebra barcodelabels', basic: '—', pro: 'Inbegrepen', enterprise: 'Inbegrepen' },
      { label: 'AI-voorraadprognose', basic: '—', pro: '—', enterprise: 'Inbegrepen' },
      { label: 'Purchase orders & ontvangst', basic: '—', pro: '—', enterprise: 'Inbegrepen' },
    ],
  },
  {
    category: 'Klanten & ServiceDesk',
    rows: [
      { label: 'CRM, loyaliteit en VIP', basic: '—', pro: 'Inbegrepen', enterprise: 'Inbegrepen' },
      { label: 'Cadeaubonnen uitgeven en opladen', basic: '—', pro: 'Inbegrepen', enterprise: 'Inbegrepen' },
      { label: 'Actieve hersteldossiers', basic: '—', pro: 'Max. 50', enterprise: 'Onbeperkt' },
      { label: 'Foto-intake, SMS en techniekertoewijzing', basic: '—', pro: '—', enterprise: 'Inbegrepen' },
    ],
  },
  {
    category: 'Webshop & integraties',
    rows: [
      { label: 'PWAYMENT Webshop', basic: '—', pro: '1 webshop', enterprise: 'Meerdere webshops' },
      { label: 'Boekhouding & Peppol', basic: '—', pro: 'Volgens connectorstatus', enterprise: 'Inbegrepen/maatwerk' },
      { label: 'REST API & webhooks', basic: '—', pro: '—', enterprise: 'Inbegrepen' },
    ],
  },
  {
    category: 'Team, inzichten & controle',
    rows: [
      { label: 'Volledige transactiehistoriek', basic: '30 dagen', pro: 'Inbegrepen', enterprise: 'Inbegrepen' },
      { label: 'Verkoop-, marge- en klantinzichten', basic: '—', pro: 'Inbegrepen', enterprise: 'Inbegrepen' },
      { label: 'Personeelsplanning, uren en verlof', basic: '—', pro: '—', enterprise: 'Inbegrepen' },
      { label: 'Volledige auditviewer en export', basic: '—', pro: '—', enterprise: 'Inbegrepen' },
      { label: 'Multi-store en transfers', basic: '—', pro: '—', enterprise: 'Inbegrepen' },
    ],
  },
];

export const PUBLIC_PLAN_ORDER: PublicPlanCode[] = ['basic', 'pro', 'enterprise'];

export const planPriceCents = (plan: PublicPlanCode, cycle: BillingCycle): number => {
  const entry = PLAN_CATALOG[plan];
  return cycle === 'yearly' ? entry.yearlyEffectiveMonthlyCents : entry.monthlyPriceCents;
};

export const formatPlanMonthlyPrice = (plan: PublicPlanCode, cycle: BillingCycle): string =>
  `€ ${(planPriceCents(plan, cycle) / 100).toLocaleString('nl-BE', { maximumFractionDigits: 0 })}`;

export const yearlyTotalCents = (plan: PublicPlanCode): number =>
  PLAN_CATALOG[plan].yearlyEffectiveMonthlyCents * 12;

export const yearlySavingsCents = (plan: PublicPlanCode): number =>
  Math.max(0, PLAN_CATALOG[plan].monthlyPriceCents * 12 - yearlyTotalCents(plan));

export const formatEuroCents = (valueCents: number): string =>
  `€ ${(valueCents / 100).toLocaleString('nl-BE', { maximumFractionDigits: 0 })}`;
