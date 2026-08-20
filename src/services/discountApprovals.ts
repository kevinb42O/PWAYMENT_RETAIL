import { useAuth } from "../auth/useAuth";
import type { Json } from "../types/database.generated";
import { isSupabaseConfigured, supabase } from "../lib/supabase";

export interface DiscountApprovalIntent {
  cartId: number;
  discountCents: number;
  reason: string;
  approvalPin: string;
}

export interface DiscountApproval {
  approvalId: string;
  approvedByUserId: string;
  expiresAt: string;
}

type ApprovalResponse = {
  ok?: boolean;
  approvalId?: string;
  approvedByUserId?: string;
  expiresAt?: string;
  errorCode?: string;
};

const approvalError = (code?: string): string => {
  switch (code) {
    case "pin-not-configured":
      return "Nog geen managergoedkeurings-PIN ingesteld. Laat een eigenaar of manager dit eerst instellen in Beveiliging.";
    case "pin-locked":
      return "Te veel onjuiste PIN-pogingen. Probeer na 15 minuten opnieuw.";
    case "invalid-pin":
      return "Ongeldige manager-PIN.";
    default:
      return "Managergoedkeuring kon niet worden bevestigd.";
  }
};

const assertApprovalIntent = (intent: DiscountApprovalIntent): void => {
  if (!Number.isSafeInteger(intent.cartId) || intent.cartId < 1) {
    throw new Error("Ongeldige kassa voor managergoedkeuring.");
  }
  if (
    !Number.isSafeInteger(intent.discountCents)
    || intent.discountCents <= 0
    || intent.discountCents > 100_000_000
  ) {
    throw new Error("Ongeldige korting voor managergoedkeuring.");
  }
  if (!intent.reason.trim() || intent.reason.trim().length > 500) {
    throw new Error("Geef een geldige reden voor de korting.");
  }
  if (!/^\d{6}$/.test(intent.approvalPin)) {
    throw new Error("Voer de 6-cijferige manager-PIN in.");
  }
};

/**
 * Requests a short-lived, single-use server approval. This is intentionally
 * unavailable offline for production cashiers: a local PIN cache cannot prove
 * a manager's current employment or approval after access has been revoked.
 */
export const requestServerDiscountApproval = async (
  intent: DiscountApprovalIntent,
): Promise<DiscountApproval> => {
  assertApprovalIntent(intent);
  const { currentStoreId, currentStoreIsDemo } = useAuth.getState();
  if (currentStoreIsDemo || !isSupabaseConfigured) {
    throw new Error("Servergoedkeuring is alleen beschikbaar voor een verbonden winkelaccount.");
  }
  if (!currentStoreId) {
    throw new Error("Geen actieve winkel voor managergoedkeuring.");
  }

  const { data, error } = await supabase.rpc("approve_pos_discount", {
    target_store_id: currentStoreId,
    payload: {
      cartId: intent.cartId,
      discountCents: intent.discountCents,
      reason: intent.reason.trim(),
      approvalPin: intent.approvalPin,
    } as Json,
  });
  if (error) throw new Error(error.message);

  const response = data as ApprovalResponse | null;
  if (!response?.ok) throw new Error(approvalError(response?.errorCode));
  if (!response.approvalId || !response.approvedByUserId || !response.expiresAt) {
    throw new Error("De server gaf geen volledige managergoedkeuring terug.");
  }
  return {
    approvalId: response.approvalId,
    approvedByUserId: response.approvedByUserId,
    expiresAt: response.expiresAt,
  };
};

/** Set the calling active owner's or manager's six-digit POS approval PIN. */
export const setServerManagerApprovalPin = async (pin: string): Promise<void> => {
  if (!/^\d{6}$/.test(pin)) {
    throw new Error("De manager-PIN moet uit exact 6 cijfers bestaan.");
  }
  const { currentStoreId, currentStoreIsDemo } = useAuth.getState();
  if (currentStoreIsDemo || !isSupabaseConfigured) {
    throw new Error("Server-PINbeheer is alleen beschikbaar voor een verbonden winkelaccount.");
  }
  if (!currentStoreId) throw new Error("Geen actieve winkel voor PINbeheer.");
  const { data, error } = await supabase.rpc("set_pos_manager_approval_pin", {
    target_store_id: currentStoreId,
    payload: { pin } as Json,
  });
  if (error) throw new Error(error.message);
  if (!(data as { ok?: boolean } | null)?.ok) {
    throw new Error("Manager-PIN kon niet worden opgeslagen.");
  }
};
