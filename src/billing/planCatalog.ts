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

export const PLAN_CATALOG: Record<PublicPlanCode, PlanCatalogEntry> = {
  basic: {
    code: 'basic',
    publicName: 'Basis',
    monthlyPriceCents: 0,
    yearlyEffectiveMonthlyCents: 0,
    audience: 'Voor pop-ups, markten en een eerste winkel.',
    cta: 'Start met Basis',
    href: '/register?plan=basis',
    features: ['1 locatie en 1 kassascherm', '250 actieve producten', 'Printer en barcodescanner', 'Basis voorraadbeheer', 'Z-rapport en 30 dagen historie', 'E-mailondersteuning'],
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
    features: ['3 kassaschermen inbegrepen', 'Onbeperkte producten en varianten', 'Hardware volgens compatibiliteitsmatrix', 'Voorraad, labels en besteladvies', 'Loyaliteit en cadeaubonnen', 'PWAYMENT Webshop en live sync', 'Integraties volgens publieke statusmatrix', 'Prioriteit e-mail en chat'],
  },
  enterprise: {
    code: 'enterprise',
    publicName: 'Enterprise & ketens',
    monthlyPriceCents: 14900,
    yearlyEffectiveMonthlyCents: 11900,
    audience: 'Voor ketens, franchises en multichannel retail.',
    cta: 'Kies Enterprise',
    href: '/register?plan=enterprise',
    features: ['Onbeperkte locaties en kassa’s', 'Transfers en lokale prijslijsten', 'Fijnmazige rechten en audit', 'Multi-storefront ecommerce', 'API en ERP volgens publieke statusmatrix', 'SLA en noodsupport volgens overeenkomst', 'Dedicated accountmanager', 'Begeleiding op locatie'],
  },
};

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
