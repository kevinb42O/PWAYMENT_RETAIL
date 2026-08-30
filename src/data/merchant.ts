/**
 * Static merchant info shown on every receipt.
 * Replace these with the real BTW number, address, and contact details before
 * going live. Belgian receipts must show the BTW (VAT) number, business name,
 * and address — these fields are required by FOD Financiën.
 */
export interface MerchantInfo {
  name: string;
  /** Optional public logo used on customer-facing surfaces. */
  logoUrl?: string;
  legalName?: string;
  addressLine1: string;
  addressLine2: string;
  vatNumber: string; // BE0xxx.xxx.xxx
  phone?: string;
  email?: string;
  website?: string;
  iban?: string;
  bic?: string;
  rpr?: string;
  invoiceTerms?: string;
  footer?: string;
  returnPolicy?: string;
  /** Machine-readable commercial return policy used by local Pace guidance. */
  commercialReturnPolicy?: CommercialReturnPolicy;
  /** Store-wide switchboard; individual devices may still silence Pace. */
  customerInsightSettings?: CustomerInsightSettings;
  /** IANA timezone used for calendar-day policy deadlines. */
  timezone?: string;
}

export interface CommercialReturnPolicy {
  enabled: boolean;
  windowDays: number;
  reminderLeadDays: number;
  excludedProductTypes: Array<'service' | 'gift-card'>;
  excludedCategoryIds: string[];
  /** Only purchases on or after this ISO instant are eligible for guidance. */
  effectiveFrom: string;
}

export interface CustomerInsightSettings {
  enabled: boolean;
  returnRemindersEnabled: boolean;
  brandAffinityEnabled: boolean;
  brandLookbackDays: number;
  minimumBrandTransactions: number;
}


export const DISABLED_COMMERCIAL_RETURN_POLICY: CommercialReturnPolicy = {
  enabled: false,
  windowDays: 14,
  reminderLeadDays: 2,
  excludedProductTypes: ['service', 'gift-card'],
  excludedCategoryIds: [],
  effectiveFrom: new Date(0).toISOString(),
};

export const DEFAULT_CUSTOMER_INSIGHT_SETTINGS: CustomerInsightSettings = {
  enabled: true,
  returnRemindersEnabled: true,
  brandAffinityEnabled: true,
  brandLookbackDays: 540,
  minimumBrandTransactions: 2,
};

export const DEFAULT_MERCHANT: MerchantInfo = {
  name: 'PWAYMENT',
  legalName: 'PWAYMENT',
  addressLine1: 'Voorbeeldstraat 1',
  addressLine2: '9000 Gent',
  vatNumber: 'BE0123.456.789',
  phone: '+32 9 000 00 00',
  email: 'hallo@pwayment.be',
  website: 'www.pwayment.be',
  iban: '',
  bic: '',
  rpr: '',
  invoiceTerms: '',
  footer: 'Bedankt voor uw aankoop.',
  returnPolicy: 'Retour of omruiling volgens winkelvoorwaarden met origineel ticket.',
  commercialReturnPolicy: {
    ...DISABLED_COMMERCIAL_RETURN_POLICY,
    enabled: true,
    effectiveFrom: '2026-01-01T00:00:00.000Z',
  },
  customerInsightSettings: {
    ...DEFAULT_CUSTOMER_INSIGHT_SETTINGS,
    enabled: true,
  },
  timezone: 'Europe/Brussels',
};

export const MERCHANT = DEFAULT_MERCHANT;

const productionPlaceholderValues = new Set([
  'PWAYMENT',
  'Voorbeeldstraat 1',
  '9000 Gent',
  'BE0123.456.789',
  '+32 9 000 00 00',
]);

export const merchantIdentityIssues = (merchant: MerchantInfo): string[] => {
  const issues: string[] = [];
  if (!merchant.name.trim() || productionPlaceholderValues.has(merchant.name.trim())) issues.push('winkelnaam');
  if (!merchant.legalName?.trim() || productionPlaceholderValues.has(merchant.legalName.trim())) issues.push('officiële bedrijfsnaam');
  if (!merchant.addressLine1.trim() || productionPlaceholderValues.has(merchant.addressLine1.trim())) issues.push('straat en nummer');
  if (!merchant.addressLine2.trim() || productionPlaceholderValues.has(merchant.addressLine2.trim())) issues.push('postcode en gemeente');
  if (!/^BE\s?0?\d{3}[.]?\d{3}[.]?\d{3}$/.test(merchant.vatNumber.trim()) || productionPlaceholderValues.has(merchant.vatNumber.trim())) issues.push('geldig Belgisch btw-nummer');
  return issues;
};
