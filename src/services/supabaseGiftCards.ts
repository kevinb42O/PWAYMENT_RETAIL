import { supabase } from "../lib/supabase";
import type { GiftCard, GiftCardEvent, PaymentTender } from "../types";
import type { Json } from "../types/database.generated";
import { syncStoreFromSupabase } from "./supabaseStoreSync";

type GiftCardAction = "issue" | "recharge" | "activate" | "deactivate";

export interface GiftCardMutation {
  action: GiftCardAction;
  card: GiftCard;
  event: GiftCardEvent;
  paymentTenders?: PaymentTender[];
}

const friendlyGiftCardError = (message: string): Error => {
  const match = message.match(/giftcard:[a-z-]+:(.+)/s);
  return new Error(
    match?.[1]?.trim() ||
      "De cadeaubon kon niet veilig worden opgeslagen. Probeer opnieuw.",
  );
};

/** Commit only the authoritative ledger mutation; callers control cache refresh. */
export const pushSupabaseGiftCardMutation = async (
  storeId: string,
  mutation: GiftCardMutation,
): Promise<void> => {
  const payload = {
    action: mutation.action,
    card_id: mutation.card.id,
    event_id: mutation.event.id,
    code: mutation.card.code,
    customer_id: mutation.card.customerId,
    amount_cents: mutation.event.amountCents,
    occurred_at: new Date(mutation.event.timestamp).toISOString(),
    expires_at: mutation.card.expiresAt,
    note: mutation.event.note,
    payment_tenders: mutation.paymentTenders ?? [],
  };
  const { error } = await supabase.rpc("mutate_gift_card", {
    target_store_id: storeId,
    payload: payload as unknown as Json,
  });
  if (error) throw friendlyGiftCardError(error.message);
};

/** Commit a gift-card mutation on the tenant's server ledger, then refresh cache. */
export const mutateSupabaseGiftCard = async (
  storeId: string,
  mutation: GiftCardMutation,
): Promise<void> => {
  await pushSupabaseGiftCardMutation(storeId, mutation);
  await syncStoreFromSupabase(storeId);
};
