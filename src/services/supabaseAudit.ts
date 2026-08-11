import { supabase } from "../lib/supabase";
import type { VoidEntry } from "../types";
import type { Json } from "../types/database.generated";

export const recordSupabaseVoid = async (
  storeId: string,
  requestId: string,
  entry: VoidEntry,
): Promise<void> => {
  const { error } = await supabase.rpc("record_void", {
    target_store_id: storeId,
    payload: {
      client_request_id: requestId,
      table_id: entry.tableId,
      product_id: entry.productId,
      product_name: entry.productName,
      quantity: entry.quantity,
      amount_cents: entry.amountCents,
      reason: entry.reason,
    },
  });
  if (error) throw new Error("De annulering kon niet veilig worden opgeslagen.");
};
