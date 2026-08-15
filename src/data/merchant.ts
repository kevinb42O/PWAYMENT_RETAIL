/**
 * Static merchant info shown on every receipt.
 * Replace these with the real BTW number, address, and contact details before
 * going live. Belgian receipts must show the BTW (VAT) number, business name,
 * and address — these fields are required by FOD Financiën.
 */
export interface MerchantInfo {
  name: string;
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
}

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
};

export const MERCHANT = DEFAULT_MERCHANT;
