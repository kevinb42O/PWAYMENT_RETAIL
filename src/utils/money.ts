/**
 * Money utilities. Internally all amounts are integer cents (EUR cents).
 * Never use floating point for storage or arithmetic.
 */
export type Cents = number; // integer

/** Convert euros (float, e.g. 3.10) to integer cents. Rounds half-up. */
export const toCents = (eur: number): Cents => Math.round(eur * 100);

/** Convert cents back to euros (float). For DISPLAY ONLY. */
export const fromCents = (cents: Cents): number => cents / 100;

/** Format cents as "âŦ 3,10" (Belgian locale). */
export const formatEUR = (cents: Cents): string =>
  new Intl.NumberFormat('nl-BE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);

/** Round-half-up for cent-level math. */
export const roundCents = (n: number): Cents => Math.round(n);

/**
 * Distribute a `total` of cents into `parts` proportions, preserving the sum.
 * Used for splitting a discount over multiple VAT buckets without rounding loss.
 *
 * Returns an array of integer cents whose sum equals `total`.
 */
export const allocateCents = (total: Cents, parts: number[]): Cents[] => {
  const sum = parts.reduce((a, b) => a + b, 0);
  if (sum === 0) return parts.map(() => 0);
  const raw = parts.map((p) => (total * p) / sum);
  const floored = raw.map((v) => Math.floor(v));
  let remainder = total - floored.reduce((a, b) => a + b, 0);
  // Distribute remainder cents to the parts with the largest fractional remainder.
  const order = raw
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);
  const result = [...floored];
  for (const { i } of order) {
    if (remainder <= 0) break;
    result[i] += 1;
    remainder -= 1;
  }
  return result;
};
