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
} as const;
