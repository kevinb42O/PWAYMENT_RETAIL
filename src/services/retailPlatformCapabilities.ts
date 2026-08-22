import { isSupabaseConfigured, supabase } from "../lib/supabase";
import type { SupportedVatRate } from "../utils/vat";

const CAPABILITY_TTL_MS = 24 * 60 * 60 * 1000;
const GENERIC_RETAIL_RATES: readonly SupportedVatRate[] = [0, 6];

type CachedCapability = {
  checkedAt: number;
  supportedVatRates: SupportedVatRate[];
  genericVatSnapshots: boolean;
  schemaVersion: number;
};

type RetailCapabilityRpc = {
  rpc: (name: string, args: Record<string, unknown>) => Promise<{
    data: unknown;
    error: { message: string } | null;
  }>;
};

const cacheKey = (storeId: string) => `pwayment.retail-capabilities:${storeId}`;

const parseCapability = (value: unknown): CachedCapability | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const rates = Array.isArray(row.supportedVatRates)
    ? row.supportedVatRates.filter(
      (rate): rate is SupportedVatRate => rate === 0 || rate === 6 || rate === 12 || rate === 21,
    )
    : [];
  const schemaVersion = Number(row.schemaVersion);
  return row.genericVatSnapshots === true && Number.isSafeInteger(schemaVersion)
    ? {
      checkedAt: Date.now(),
      supportedVatRates: [...new Set(rates)],
      genericVatSnapshots: true,
      schemaVersion,
    }
    : null;
};

const loadCached = (storeId: string): CachedCapability | null => {
  try {
    const raw = globalThis.localStorage?.getItem(cacheKey(storeId));
    if (!raw) return null;
    const cached = JSON.parse(raw) as CachedCapability;
    if (!Number.isSafeInteger(cached.checkedAt) || Date.now() - cached.checkedAt > CAPABILITY_TTL_MS) {
      return null;
    }
    const parsed = parseCapability(cached);
    return parsed ? { ...parsed, checkedAt: cached.checkedAt } : null;
  } catch {
    return null;
  }
};

const saveCached = (storeId: string, capability: CachedCapability) => {
  try {
    globalThis.localStorage?.setItem(cacheKey(storeId), JSON.stringify(capability));
  } catch {
    // Browser storage is only an offline convenience. The server remains the
    // authoritative check when a connection is available.
  }
};

const supportsRequiredRates = (
  capability: CachedCapability,
  requestedRates: readonly SupportedVatRate[],
) => capability.genericVatSnapshots &&
  requestedRates.every((rate) => capability.supportedVatRates.includes(rate));

/**
 * Reduced/zero VAT is never queued to an older server that still knows only
 * 12% and 21%. An already verified capability is retained for one day so a
 * store can keep selling offline after a successful online verification.
 */
export const assertRetailVatServerSupport = async (
  storeId: string | null,
  requestedRates: readonly SupportedVatRate[],
): Promise<void> => {
  if (!storeId || storeId === "local-device" || !requestedRates.some((rate) => GENERIC_RETAIL_RATES.includes(rate))) {
    return;
  }

  const cached = loadCached(storeId);
  if (globalThis.navigator?.onLine === false) {
    if (cached && supportsRequiredRates(cached, requestedRates)) return;
    throw new Error(
      "Deze winkel moet één keer online verifiëren dat de centrale retail-btwversie 0% en 6% ondersteunt voordat zulke verkopen offline mogen worden geboekt.",
    );
  }
  if (!isSupabaseConfigured) {
    throw new Error(
      "De centrale retail-btwversie kan niet worden gecontroleerd omdat Supabase niet is geconfigureerd.",
    );
  }
  if (cached && supportsRequiredRates(cached, requestedRates)) return;

  const { data, error } = await (supabase as unknown as RetailCapabilityRpc).rpc(
    "get_retail_platform_capabilities",
    { target_store_id: storeId },
  );
  if (error) {
    throw new Error(
      "De centrale winkel ondersteunt deze btw-tarieven nog niet. Werk eerst de retail-Supabase-migraties bij voordat je 0% of 6% verkoopt.",
    );
  }
  const capability = parseCapability(data);
  if (!capability || !supportsRequiredRates(capability, requestedRates)) {
    throw new Error(
      "De centrale winkel bevestigt geen volledige 0%/6%/12%/21%-btwketen. Deze verkoop is daarom niet geboekt.",
    );
  }
  saveCached(storeId, capability);
};
