import { db } from "../db/db";
import { OutboxEntry } from "../types";

/** A browser tab may die mid-request; the next tab can safely reclaim after this. */
const OUTBOX_LEASE_MS = 60_000;
const MAX_RETRY_ATTEMPTS = 5;
const BASE_RETRY_DELAY_MS = 5_000;
const MAX_RETRY_DELAY_MS = 5 * 60_000;

export interface DrainOutboxResult {
  delivered: number;
  /** Entries which remain durable and will be retried after their backoff. */
  retried: OutboxEntry[];
  /** Entries that need an explicit operator/configuration resolution. */
  deadLettered: OutboxEntry[];
  /** Entries that were not due or were leased by another tab. */
  skipped: number;
  /** Compatibility field for callers that want the first error to surface. */
  failed?: OutboxEntry;
}

export interface DrainOutboxOptions {
  /** Injected by tests; normal callers use the current clock. */
  now?: number;
  /** A lease token is per drain, not a user or customer identifier. */
  workerId?: string;
  maxEntries?: number;
  /**
   * Lets a foreground workflow flush just the records it owns without
   * bypassing claims, backoff or multi-tab leases for every other record.
   */
  shouldProcess?: (entry: OutboxEntry) => boolean;
}

const deliveryStatus = (entry: OutboxEntry): NonNullable<OutboxEntry["deliveryStatus"]> =>
  entry.deliveryStatus ?? "pending";

const retryDelay = (attempt: number): number =>
  Math.min(MAX_RETRY_DELAY_MS, BASE_RETRY_DELAY_MS * 2 ** Math.max(0, attempt - 1));

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * These errors cannot become healthy merely because a browser tries them again.
 * They remain durable, but move to a visible/manual-resolution state instead of
 * starving every later sale or inventory update behind them.
 */
const isPermanentDeliveryError = (entry: OutboxEntry, message: string): boolean => {
  if (entry.kind === "webshop_email") return true;
  return [
    /unsupported outbox entry/i,
    /invalid (?:daily report|webshop order|audit) outbox payload/i,
    /not configured/i,
    /(?:checkout|refund|purchase|gift-card):(?:invalid|forbidden|product-not-found|customer-not-found|insufficient-stock|unsupported|discount-approval)/i,
    /retail-catalog:(?:not-authorized|invalid|duplicate|product-identity|category-not-found|create-conflict|update-conflict|special-product|family-identity|variant|option|archive-not-in-family|idempotency-conflict)/i,
  ].some((pattern) => pattern.test(message));
};

const isDueForClaim = (entry: OutboxEntry, now: number): boolean => {
  const status = deliveryStatus(entry);
  if (status === "dead_letter") return false;
  if (status === "in_flight" && (entry.leaseExpiresAt ?? 0) > now) return false;
  return (entry.nextAttemptAt ?? entry.timestamp) <= now;
};

/**
 * Append an outbound payload to the offline outbox.
 *
 * Failure is deliberately propagated. A caller that cannot durably queue a
 * remote mutation must not tell the cashier that the local mutation is safe.
 */
export const enqueueOutbox = async (
  kind: OutboxEntry["kind"],
  payload: unknown,
): Promise<void> => {
  const timestamp = Date.now();
  await db.outbox.add({
    timestamp,
    kind,
    payload,
    attempts: 0,
    deliveryStatus: "pending",
    nextAttemptAt: timestamp,
  });
};

const claimEntry = async (
  id: number,
  workerId: string,
  now: number,
): Promise<OutboxEntry | null> =>
  db.transaction("rw", db.outbox, async () => {
    const current = await db.outbox.get(id);
    if (!current || !isDueForClaim(current, now)) return null;
    const claimed: OutboxEntry = {
      ...current,
      deliveryStatus: "in_flight",
      lastAttemptAt: now,
      leaseOwner: workerId,
      leaseExpiresAt: now + OUTBOX_LEASE_MS,
    };
    await db.outbox.put(claimed);
    return claimed;
  });

const acknowledgeClaim = async (id: number, workerId: string): Promise<boolean> =>
  db.transaction("rw", db.outbox, async () => {
    const current = await db.outbox.get(id);
    if (!current || current.leaseOwner !== workerId) return false;
    await db.outbox.delete(id);
    return true;
  });

const recordClaimFailure = async (
  id: number,
  workerId: string,
  error: unknown,
  now: number,
): Promise<OutboxEntry | null> =>
  db.transaction("rw", db.outbox, async () => {
    const current = await db.outbox.get(id);
    if (!current || current.leaseOwner !== workerId) return null;

    const message = errorMessage(error);
    const attempts = current.attempts + 1;
    const permanent = isPermanentDeliveryError(current, message) || attempts >= MAX_RETRY_ATTEMPTS;
    const updated: OutboxEntry = {
      ...current,
      attempts,
      lastError: message,
      deliveryStatus: permanent ? "dead_letter" : "retrying",
      nextAttemptAt: permanent ? undefined : now + retryDelay(attempts),
      lastAttemptAt: now,
      leaseOwner: undefined,
      leaseExpiresAt: undefined,
      requiresManualResolution: permanent,
    };
    await db.outbox.put(updated);
    return updated;
  });

/** Entries an operator can retry after correcting configuration or business data. */
export const getOutboxEntriesNeedingResolution = async (): Promise<OutboxEntry[]> =>
  (await db.outbox.toArray())
    .filter((entry) => deliveryStatus(entry) === "dead_letter")
    .sort((left, right) => (left.id ?? 0) - (right.id ?? 0));

/**
 * Requeue a dead letter without discarding its audit trail. The next worker
 * tick owns actual delivery; callers cannot accidentally send twice inline.
 */
export const retryOutboxEntry = async (id: number): Promise<boolean> => {
  const current = await db.outbox.get(id);
  if (!current) return false;
  const now = Date.now();
  await db.outbox.update(id, {
    deliveryStatus: "pending",
    nextAttemptAt: now,
    leaseOwner: undefined,
    leaseExpiresAt: undefined,
    requiresManualResolution: false,
  });
  return true;
};

/**
 * Drains every independently deliverable row in ID order. A broken email,
 * configuration item or rejected sale must never hold later financial rows
 * hostage. Dependencies still remain safe because every server command is
 * idempotent and rejected business commands become an explicit dead letter.
 */
export const drainOutbox = async (
  send: (entry: OutboxEntry) => Promise<void>,
  options: DrainOutboxOptions = {},
): Promise<DrainOutboxResult> => {
  const now = options.now ?? Date.now();
  const workerId = options.workerId ?? globalThis.crypto.randomUUID();
  const maxEntries = options.maxEntries ?? Number.POSITIVE_INFINITY;
  const candidates = await db.outbox.orderBy("id").toArray();
  const result: DrainOutboxResult = {
    delivered: 0,
    retried: [],
    deadLettered: [],
    skipped: 0,
  };

  for (const candidate of candidates) {
    if (result.delivered + result.retried.length + result.deadLettered.length >= maxEntries) break;
    if (options.shouldProcess && !options.shouldProcess(candidate)) {
      result.skipped += 1;
      continue;
    }
    if (candidate.id == null) {
      result.skipped += 1;
      continue;
    }
    const entry = await claimEntry(candidate.id, workerId, now);
    if (!entry) {
      result.skipped += 1;
      continue;
    }

    try {
      await send(entry);
      if (await acknowledgeClaim(candidate.id, workerId)) result.delivered += 1;
    } catch (error) {
      const failed = await recordClaimFailure(candidate.id, workerId, error, now);
      if (!failed) {
        result.skipped += 1;
        continue;
      }
      result.failed ??= failed;
      if (deliveryStatus(failed) === "dead_letter") result.deadLettered.push(failed);
      else result.retried.push(failed);
    }
  }
  return result;
};
