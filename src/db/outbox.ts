import { db } from '../db/db';
import { OutboxEntry } from '../types';

/**
 * Append an outbound payload to the offline outbox. A future sync worker
 * will drain this queue against the backend with exponential backoff.
 */
export const enqueueOutbox = async (
  kind: OutboxEntry['kind'],
  payload: unknown,
): Promise<void> => {
  const entry: OutboxEntry = {
    timestamp: Date.now(),
    kind,
    payload,
    attempts: 0,
  };
  try {
    await db.outbox.add(entry);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('outbox enqueue failed', err);
  }
};

/** Best-effort drain. No-op until a backend is configured. */
export const drainOutbox = async (
  send: (entry: OutboxEntry) => Promise<void>,
): Promise<void> => {
  const pending = await db.outbox.orderBy('id').toArray();
  for (const entry of pending) {
    try {
      await send(entry);
      if (entry.id != null) await db.outbox.delete(entry.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (entry.id != null) {
        await db.outbox.update(entry.id, {
          attempts: entry.attempts + 1,
          lastError: message,
        });
      }
      // Stop on first failure; retry next cycle.
      break;
    }
  }
};
