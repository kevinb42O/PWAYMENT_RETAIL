import { useAuth } from "../auth/useAuth";
import { db } from "../db/db";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import type { InventoryAdjustmentReason, Product, StockMovement } from "../types";
import type { Json } from "../types/database.generated";

type InventoryRpcClient = {
  rpc: (
    fn: "record_inventory_operation" | "record_inventory_batch",
    args: { target_store_id: string; payload: Json },
  ) => Promise<{ data: Json | null; error: { message: string } | null }>;
};
const inventoryRpc = supabase as unknown as InventoryRpcClient;

export type InventoryOperationMode = "delivery" | "count" | "correction";

export interface InventoryOperationInput {
  clientRequestId: string;
  productId: string;
  expectedStockQty: number;
  mode: InventoryOperationMode;
  /** Absolute observed quantity for a count; signed delta for other modes. */
  quantity: number;
  reason?: InventoryAdjustmentReason;
  note?: string;
}

export interface InventoryOperationResult {
  product: Product;
  movement?: StockMovement;
  duplicate: boolean;
}

export interface InventoryBatchInput {
  clientRequestId: string;
  mode: InventoryOperationMode;
  lines: Array<Omit<InventoryOperationInput, "clientRequestId" | "mode">>;
}

export interface InventoryBatchResult {
  products: Product[];
  movements: StockMovement[];
  duplicate: boolean;
}

export class InventoryOperationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InventoryOperationError";
  }
}

const whole = (value: number) => Number.isSafeInteger(value);
const requestDetail = (detail: unknown) => {
  if (!detail || typeof detail !== "object" || Array.isArray(detail)) return null;
  const value = detail as Record<string, unknown>;
  return typeof value.clientRequestId === "string" ? value : null;
};

const validate = (input: InventoryOperationInput) => {
  if (!input.clientRequestId.trim() || !input.productId.trim()) {
    throw new InventoryOperationError("Selecteer een product en probeer opnieuw.");
  }
  if (!whole(input.expectedStockQty) || input.expectedStockQty < 0 || !whole(input.quantity)) {
    throw new InventoryOperationError("Voorraad moet in gehele stuks worden ingevoerd.");
  }
  if (input.mode === "count" && input.quantity < 0) {
    throw new InventoryOperationError("Een getelde voorraad kan niet negatief zijn.");
  }
  if (input.mode === "delivery" && input.quantity <= 0) {
    throw new InventoryOperationError("Een levering moet minstens één ontvangen stuk bevatten.");
  }
  if (input.mode === "correction") {
    if (input.quantity === 0) throw new InventoryOperationError("Vul een positieve of negatieve correctie in.");
    if (!input.reason || !["damage", "loss", "found", "other"].includes(input.reason)) {
      throw new InventoryOperationError("Kies een geldige reden voor de correctie.");
    }
    if (input.reason === "other" && !input.note?.trim()) {
      throw new InventoryOperationError("Licht deze correctie kort toe.");
    }
  }
  const after = input.mode === "count" ? input.quantity : input.expectedStockQty + input.quantity;
  if (after < 0) throw new InventoryOperationError("Deze correctie zou de voorraad onder nul brengen.");
};

const localApply = async (input: InventoryOperationInput, force = false): Promise<InventoryOperationResult> => {
  validate(input);
  const auth = useAuth.getState();
  return db.transaction("rw", [db.products, db.stock_movements, db.audit], async () => {
    const priorAudit = await db.audit
      .where("action")
      .equals("inventory.operation")
      .filter((row) => requestDetail(row.detail)?.clientRequestId === input.clientRequestId)
      .first();
    if (priorAudit) {
      const product = await db.products.get(input.productId);
      if (!product) throw new InventoryOperationError("Dit product bestaat niet meer.");
      const movement = await db.stock_movements
        .filter((row) => row.clientRequestId === input.clientRequestId)
        .first();
      return { product, movement, duplicate: true };
    }

    const product = await db.products.get(input.productId);
    if (!product || product.stockQty == null) {
      throw new InventoryOperationError("Dit product houdt geen voorraad bij.");
    }
    if (!force && product.stockQty !== input.expectedStockQty) {
      throw new InventoryOperationError("De voorraad veranderde ondertussen. Controleer de nieuwe stand en bevestig opnieuw.");
    }
    const quantityBefore = product.stockQty;
    const quantityAfter = input.mode === "count" ? input.quantity : quantityBefore + input.quantity;
    const quantityDelta = quantityAfter - quantityBefore;
    const updated = { ...product, stockQty: quantityAfter };
    await db.products.put(updated);

    let movement: StockMovement | undefined;
    if (quantityDelta !== 0) {
      movement = {
        productId: product.id,
        productName: product.name,
        quantityDelta,
        reason: input.mode === "delivery" ? "purchase-receipt" : "manual-adjustment",
        timestamp: Date.now(),
        userId: auth.currentUserId ?? undefined,
        userName: auth.currentUserName ?? undefined,
        quantityBefore,
        quantityAfter,
        adjustmentReason: input.mode === "count" ? "cycle-count" : input.reason,
        note: input.note?.trim() || undefined,
        clientRequestId: input.clientRequestId,
      };
      movement = { ...movement, id: await db.stock_movements.add(movement) };
    }
    await db.audit.add({
      timestamp: Date.now(),
      userId: auth.currentUserId,
      userName: auth.currentUserName,
      action: "inventory.operation",
      detail: {
        clientRequestId: input.clientRequestId,
        productId: product.id,
        productName: product.name,
        mode: input.mode,
        quantityBefore,
        quantityDelta,
        quantityAfter,
        reason: input.reason,
        note: input.note?.trim() || undefined,
      },
    });
    return { product: updated, movement, duplicate: false };
  });
};

const remoteMessage = (message: string) =>
  message.match(/inventory-operation:[a-z-]+:(.+)/s)?.[1]?.trim()
  || "De voorraadwijziging kon niet centraal worden vastgelegd.";

export const recordInventoryOperation = async (
  input: InventoryOperationInput,
): Promise<InventoryOperationResult> => {
  validate(input);
  const auth = useAuth.getState();
  if (!auth.currentStoreId || !isSupabaseConfigured) return localApply(input);
  if (globalThis.navigator?.onLine === false) {
    throw new InventoryOperationError("Maak verbinding met internet om deze voorraadwijziging veilig vast te leggen.");
  }
  const payload = {
    client_request_id: input.clientRequestId,
    product_id: input.productId,
    expected_stock_qty: input.expectedStockQty,
    mode: input.mode,
    quantity: input.quantity,
    reason: input.reason,
    note: input.note?.trim() || undefined,
  } as unknown as Json;
  const { data, error } = await inventoryRpc.rpc("record_inventory_operation", {
    target_store_id: auth.currentStoreId,
    payload,
  });
  if (error) throw new InventoryOperationError(remoteMessage(error.message));
  const result = (data ?? {}) as { quantity_after?: unknown; duplicate?: boolean };
  const expectedAfter = input.mode === "count" ? input.quantity : input.expectedStockQty + input.quantity;
  if (Number(result.quantity_after) !== expectedAfter) {
    throw new InventoryOperationError("De server gaf geen geldige voorraadbevestiging terug.");
  }
  const local = await localApply(input, true);
  return { ...local, duplicate: result.duplicate === true };
};

const validateBatch = (input: InventoryBatchInput) => {
  if (!input.clientRequestId.trim()) throw new InventoryOperationError("De batch mist een unieke referentie.");
  if (input.lines.length === 0) throw new InventoryOperationError("Voeg minstens één product aan de sessie toe.");
  if (input.lines.length > 500) throw new InventoryOperationError("Verwerk maximaal 500 producten per sessie.");
  const ids = new Set<string>();
  for (const line of input.lines) {
    if (ids.has(line.productId)) throw new InventoryOperationError("Eenzelfde product mag maar één keer in de batch staan.");
    ids.add(line.productId);
    validate({ ...line, clientRequestId: input.clientRequestId, mode: input.mode });
  }
};

const localApplyBatch = async (input: InventoryBatchInput, force = false): Promise<InventoryBatchResult> => {
  validateBatch(input);
  const auth = useAuth.getState();
  return db.transaction("rw", [db.products, db.stock_movements, db.audit], async () => {
    const prior = await db.audit.where("action").equals("inventory.batch")
      .filter((row) => requestDetail(row.detail)?.clientRequestId === input.clientRequestId).first();
    if (prior) {
      const products = (await db.products.bulkGet(input.lines.map((line) => line.productId)))
        .filter((product): product is Product => Boolean(product));
      const movements = await db.stock_movements
        .filter((movement) => movement.clientRequestId?.startsWith(`${input.clientRequestId}:`) === true).toArray();
      return { products, movements, duplicate: true };
    }
    const stored = await db.products.bulkGet(input.lines.map((line) => line.productId));
    const updates: Product[] = [];
    const movements: StockMovement[] = [];
    const now = Date.now();
    for (let index = 0; index < input.lines.length; index += 1) {
      const line = input.lines[index];
      const product = stored[index];
      if (!product || product.stockQty == null) throw new InventoryOperationError(`${product?.name ?? "Een product"} houdt geen voorraad bij.`);
      if (!force && product.stockQty !== line.expectedStockQty) {
        throw new InventoryOperationError(`${product.name}: de voorraad veranderde ondertussen. De volledige batch is niet verwerkt.`);
      }
      const after = input.mode === "count" ? line.quantity : product.stockQty + line.quantity;
      if (after < 0) throw new InventoryOperationError(`${product.name}: de voorraad zou onder nul komen.`);
      updates.push({ ...product, stockQty: after });
      const delta = after - product.stockQty;
      if (delta !== 0) movements.push({
        productId: product.id,
        productName: product.name,
        quantityDelta: delta,
        reason: input.mode === "delivery" ? "purchase-receipt" : "manual-adjustment",
        timestamp: now,
        userId: auth.currentUserId ?? undefined,
        userName: auth.currentUserName ?? undefined,
        quantityBefore: product.stockQty,
        quantityAfter: after,
        adjustmentReason: input.mode === "count" ? "cycle-count" : line.reason,
        note: line.note?.trim() || undefined,
        clientRequestId: `${input.clientRequestId}:${product.id}`,
      });
    }
    await db.products.bulkPut(updates);
    if (movements.length > 0) await db.stock_movements.bulkAdd(movements);
    await db.audit.add({
      timestamp: now,
      userId: auth.currentUserId,
      userName: auth.currentUserName,
      action: "inventory.batch",
      detail: {
        clientRequestId: input.clientRequestId,
        mode: input.mode,
        lineCount: input.lines.length,
        lines: input.lines.map((line, index) => ({
          productId: line.productId,
          quantityBefore: stored[index]!.stockQty,
          quantityDelta: updates[index].stockQty! - stored[index]!.stockQty!,
          quantityAfter: updates[index].stockQty,
        })),
      },
    });
    return { products: updates, movements, duplicate: false };
  });
};

export const recordInventoryBatch = async (input: InventoryBatchInput): Promise<InventoryBatchResult> => {
  validateBatch(input);
  const auth = useAuth.getState();
  if (!auth.currentStoreId || !isSupabaseConfigured) return localApplyBatch(input);
  if (globalThis.navigator?.onLine === false) throw new InventoryOperationError("Maak verbinding om de volledige batch veilig te verwerken.");
  const payload = {
    client_request_id: input.clientRequestId,
    mode: input.mode,
    lines: input.lines.map((line) => ({
      product_id: line.productId,
      expected_stock_qty: line.expectedStockQty,
      quantity: line.quantity,
      reason: line.reason,
      note: line.note?.trim() || undefined,
    })),
  } as unknown as Json;
  const { data, error } = await inventoryRpc.rpc("record_inventory_batch", {
    target_store_id: auth.currentStoreId,
    payload,
  });
  if (error) throw new InventoryOperationError(remoteMessage(error.message));
  const result = (data ?? {}) as { duplicate?: boolean; line_count?: unknown };
  if (Number(result.line_count) !== input.lines.length) throw new InventoryOperationError("De server bevestigde de batch niet volledig.");
  const local = await localApplyBatch(input, true);
  return { ...local, duplicate: result.duplicate === true };
};
