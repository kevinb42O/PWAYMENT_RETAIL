const parseBoolean = (value: string | undefined, defaultValue: boolean): boolean => {
  if (value == null) return defaultValue;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return defaultValue;
};

/**
 * Retail feature toggles controlled via Vite env vars.
 */
export const FEATURES = {
  seedDemoProducts: parseBoolean(import.meta.env.VITE_SEED_DEMO_PRODUCTS, false),
  seedRetailCatalog: parseBoolean(import.meta.env.VITE_SEED_RETAIL_CATALOG, true),
  autoResetLegacyCatalog: parseBoolean(import.meta.env.VITE_AUTO_RESET_LEGACY_CATALOG, true),
  /** Kill switch for gift-card tendering (audit A1/A2). Off until the on-device gate passes. */
  giftCardPayment: parseBoolean(import.meta.env.VITE_ENABLE_GIFT_CARD_PAYMENT, false),
  /** Kill switch for catalogue CSV import (audit A19/F1). Off until the on-device gate passes. */
  csvImport: parseBoolean(import.meta.env.VITE_ENABLE_CSV_IMPORT, false),
} as const;
