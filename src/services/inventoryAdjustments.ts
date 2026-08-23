import { useAuth } from "../auth/useAuth";
import { db } from "../db/db";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import { upsertSupabaseProducts } from "./supabaseMutations";
import type { Json } from "../types/database.generated";
import type {
  InventoryAdjustmentReason,
  Product,
  StockMovement,
} from "../types";

const adjustmentReasons: readonly InventoryAdjustmentReason[] = [
  "cycle-count",
  "opening-balance",
  "damage",
  "loss",
  "found",
  "other",
];

export class InventoryAdjustmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InventoryAdjustmentError";
  }
}

export interface InventoryCountInput {
  /** Stable retry key; a count may never be applied twice. */
  clientRequestId: string;
  productId: string;
  /** Quantity shown when the physical count was started. */
  expectedStockQty: number;
  /** Physically counted quantity, never a free relative delta. */
  countedStockQty: number;
  reason: InventoryAdjustmentReason;
  note?: string;
  userId?: string;
  userName?: string;
}

export interface InventoryCountResult {
  product: Product;
  movement?: StockMovement;
  duplicate: boolean;
}

const isWholeNonNegative = (value: number) =>
  Number.isSafeInteger(value) && value >= 0;

const normalizedNote = (note?: string) => note?.trim() || undefined;

const inventoryCountDetail = (detail: unknown) => {
  if (!detail || typeof detail !== "object" || Array.isArray(detail)) return null;
  const record = detail as Record<string, unknown>;
  return typeof record.clientRequestId === "string"
    && typeof record.productId === "string"
    ? { clientRequestId: record.clientRequestId, productId: record.productId }
    : null;
};

const validate = (input: InventoryCountInput) => {
  if (!input.clientRequestId.trim()) {
    throw new InventoryAdjustmentError("De voorraadcorrectie mist een unieke referentie.");
  }
  if (!input.productId.trim()) {
    throw new InventoryAdjustmentError("Selecteer eerst een product.");
  }
  if (!isWholeNonNegative(input.expectedStockQty) || !isWholeNonNegative(input.countedStockQty)) {
    throw new InventoryAdjustmentError("Voorraad moet een geheel getal van nul of meer zijn.");
  }
  if (!adjustmentReasons.includes(input.reason)) {
    throw new InventoryAdjustmentError("Kies een geldige reden voor de voorraadcorrectie.");
  }
  if (input.reason === "other" && !normalizedNote(input.note)) {
    throw new InventoryAdjustmentError("Licht deze voorraadcorrectie kort toe.");
  }
};

const localApply = async (
  input: InventoryCountInput,
  options: { forceServerConfirmed?: boolean } = {},
): Promise<InventoryCountResult> => {
  validate(input);
  const note = normalizedNote(input.note);

  return db.transaction(
    "rw",
    [db.products, db.stock_movements, db.audit],
    async () => {
      // A browser retry (or a response that arrived after a retry began) must
      // never create a second adjustment. The audit record also covers a
      // matching count, for which there intentionally is no stock movement.
      const recordedCount = await db.audit
        .where("action")
        .equals("inventory.count")
        .filter((entry) => inventoryCountDetail(entry.detail)?.clientRequestId === input.clientRequestId)
        .first();
      if (recordedCount) {
        const detail = inventoryCountDetail(recordedCount.detail);
        if (detail?.productId !== input.productId) {
          throw new InventoryAdjustmentError(
            "Deze telreferentie werd al voor een ander product gebruikt.",
          );
        }
        const recordedProduct = await db.products.get(input.productId);
        if (!recordedProduct) {
          throw new InventoryAdjustmentError("Dit product bestaat niet meer.");
        }
        const recordedMovement = await db.stock_movements
          .filter((movement) => movement.clientRequestId === input.clientRequestId)
          .first();
        return {
          product: recordedProduct,
          movement: recordedMovement,
          duplicate: true,
        };
      }

      const product = await db.products.get(input.productId);
      if (!product || product.stockQty == null) {
        throw new InventoryAdjustmentError("Dit product houdt geen voorraad bij.");
      }
      if (!options.forceServerConfirmed && product.stockQty !== input.expectedStockQty) {
        throw new InventoryAdjustmentError(
          "De systeemvoorraad veranderde ondertussen. Heropen de telling en bevestig het actuele aantal.",
        );
      }

      const quantityBefore = product.stockQty;
      const quantityAfter = input.countedStockQty;
      const quantityDelta = quantityAfter - quantityBefore;
      const updatedProduct: Product = { ...product, stockQty: quantityAfter };
      await db.products.put(updatedProduct);

      let movement: StockMovement | undefined;
      if (quantityDelta !== 0) {
        movement = {
          productId: product.id,
          productName: product.name,
          quantityDelta,
          reason: "manual-adjustment",
          timestamp: Date.now(),
          userId: input.userId,
          userName: input.userName,
          quantityBefore,
          quantityAfter,
          adjustmentReason: input.reason,
          note,
          clientRequestId: input.clientRequestId,
        };
        const id = await db.stock_movements.add(movement);
        movement = { ...movement, id };
      }

      await db.audit.add({
        timestamp: Date.now(),
        userId: input.userId ?? null,
        userName: input.userName ?? null,
        action: "inventory.count",
        detail: {
          clientRequestId: input.clientRequestId,
          productId: product.id,
          productName: product.name,
          expectedStockQty: input.expectedStockQty,
          quantityBefore,
          countedStockQty: quantityAfter,
          quantityDelta,
          reason: input.reason,
          note,
        },
      });

      return { product: updatedProduct, movement, duplicate: false };
    },
  );
};

/**
 * Local/development implementation, exported for deterministic tests and for
 * a deliberately local demo store. A real tenant is always confirmed by the
 * server RPC before this cache is updated.
 */
export const applyLocalInventoryCount = (input: InventoryCountInput) => localApply(input);

const online = () => globalThis.navigator?.onLine !== false;

const remoteErrorMessage = (message: string) => {
  const match = message.match(/inventory-count:[a-z-]+:(.+)/s);
  return match?.[1]?.trim() || "De voorraadcorrectie kon niet centraal worden vastgelegd.";
};

const isProductNotYetSyncedError = (message: string): boolean =>
  /inventory-count:product-not-found|product.*(?:not found|bestaat niet)/i.test(message);

/**
 * Register a physical count as an absolute observed quantity. On a tenant the
 * server locks the product and rejects a stale expected quantity, so a count
 * never silently overwrites a sale or receipt from another terminal.
 */
export const recordInventoryCount = async (
  input: InventoryCountInput,
): Promise<InventoryCountResult> => {
  validate(input);
  const auth = useAuth.getState();
  const enriched: InventoryCountInput = {
    ...input,
    userId: input.userId ?? auth.currentUserId ?? undefined,
    userName: input.userName ?? auth.currentUserName ?? undefined,
  };

  if (!auth.currentStoreId || !isSupabaseConfigured) {
    return localApply(enriched);
  }
  if (!online()) {
    throw new InventoryAdjustmentError(
      "Maak verbinding met internet om een voorraadtelling centraal en controleerbaar vast te leggen.",
    );
  }

  const payload = {
    client_request_id: enriched.clientRequestId,
    product_id: enriched.productId,
    expected_stock_qty: enriched.expectedStockQty,
    counted_stock_qty: enriched.countedStockQty,
    reason: enriched.reason,
    note: normalizedNote(enriched.note),
  } as unknown as Json;
  const countOnServer = () => supabase.rpc("record_inventory_adjustment", {
    target_store_id: auth.currentStoreId!,
    payload,
  });
  let { data, error } = await countOnServer();

  // A just-created product is queued for normal offline-first sync. A count
  // submitted in the next second must not race that queue and look deleted to
  // the inventory RPC: publish the known local product once, then retry the
  // idempotent count with its original request id.
  if (error && isProductNotYetSyncedError(error.message)) {
    const product = await db.products.get(enriched.productId);
    if (product) {
      await upsertSupabaseProducts(auth.currentStoreId, [product]);
      ({ data, error } = await countOnServer());
    }
  }
  if (error) throw new InventoryAdjustmentError(remoteErrorMessage(error.message));

  const result = (data ?? {}) as {
    duplicate?: boolean;
    counted_stock_qty?: unknown;
  };
  if (Number(result.counted_stock_qty) !== enriched.countedStockQty) {
    throw new InventoryAdjustmentError("De server gaf geen geldige voorraadbevestiging terug.");
  }

  // The server has already performed the expected-quantity comparison. Its
  // accepted count is authoritative even if a realtime event reached this tab
  // while the request was in flight.
  const localResult = await localApply(enriched, { forceServerConfirmed: true });
  return { ...localResult, duplicate: result.duplicate === true };
};
