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

export type DecimalParseFailure = 'empty' | 'invalid' | 'ambiguous' | 'negative';

export interface DecimalParseResult {
  ok: boolean;
  /** Parsed amount, 0 when `ok` is false. */
  cents: Cents;
  reason?: DecimalParseFailure;
}

const fail = (reason: DecimalParseFailure): DecimalParseResult => ({ ok: false, cents: 0, reason });

const GROUPING_HEAD = /^[1-9]\d{0,2}$/;

/** Build cents from separate digit strings, half-up on the third decimal. */
const digitsToCents = (intDigits: string, fracDigits: string): Cents => {
  const whole = intDigits === '' ? 0 : Number(intDigits);
  const frac2 = Number((fracDigits + '00').slice(0, 2));
  const roundUp = (fracDigits[2] ?? '0') >= '5';
  return whole * 100 + frac2 + (roundUp ? 1 : 0);
};

/**
 * Parse a user- or CSV-supplied decimal amount into integer cents without
 * floating point. Accepts `12.50`, `12,50`, `1.234,56` and `1,234.56`.
 * Rejects values whose separator meaning cannot be determined (e.g. `1.234`)
 * rather than guessing — a wrong guess is a factor-1000 money error.
 */
export const parseDecimalToCents = (input: string): DecimalParseResult => {
  const raw = String(input ?? '')
    .replace(/[\s\u00a0\u202f]/g, '')
    .replace(/€|EUR/gi, '')
    .trim();
  if (!raw) return fail('empty');
  if (raw.startsWith('-')) return fail('negative');
  const body = raw.startsWith('+') ? raw.slice(1) : raw;
  if (!/^\d[\d.,]*$/.test(body)) return fail('invalid');

  const lastDot = body.lastIndexOf('.');
  const lastComma = body.lastIndexOf(',');

  let intPart: string;
  let fracPart: string;

  if (lastDot >= 0 && lastComma >= 0) {
    const decimalAt = Math.max(lastDot, lastComma);
    const groupChar = decimalAt === lastDot ? ',' : '.';
    intPart = body.slice(0, decimalAt).split(groupChar).join('');
    fracPart = body.slice(decimalAt + 1);
    if (body.slice(0, decimalAt).includes(decimalAt === lastDot ? '.' : ',')) {
      return fail('invalid');
    }
  } else if (lastDot >= 0 || lastComma >= 0) {
    const sep = lastDot >= 0 ? '.' : ',';
    const parts = body.split(sep);
    const tail = parts[parts.length - 1];
    if (parts.length > 2) {
      // Repeated separator can only be grouping.
      if (!parts.slice(1).every((p) => p.length === 3)) return fail('invalid');
      intPart = parts.join('');
      fracPart = '';
    } else if (tail.length === 3 && GROUPING_HEAD.test(parts[0])) {
      return fail('ambiguous');
    } else if (tail.length === 0) {
      return fail('invalid');
    } else {
      intPart = parts[0];
      fracPart = tail;
    }
  } else {
    intPart = body;
    fracPart = '';
  }

  if (!/^\d*$/.test(intPart) || !/^\d*$/.test(fracPart)) {
    return fail('invalid');
  }
  const cents = digitsToCents(intPart, fracPart);
  if (!Number.isSafeInteger(cents)) return fail('invalid');
  return { ok: true, cents };
};

/** Serialize cents as an unambiguous `1234.56` decimal string (CSV/export). */
export const centsToDecimalString = (cents: Cents): string => {
  const abs = Math.abs(Math.round(cents));
  return `${cents < 0 ? '-' : ''}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
};

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
