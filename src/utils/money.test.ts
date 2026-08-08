import { describe, expect, it } from 'vitest';
import { allocateCents, centsToDecimalString, parseDecimalToCents, toCents } from './money';

describe('toCents', () => {
  it('rounds half-up', () => {
    expect(toCents(3.10)).toBe(310);
    expect(toCents(3.105)).toBe(311);
    expect(toCents(0)).toBe(0);
  });
});

describe('parseDecimalToCents', () => {
  const cents = (txt: string) => parseDecimalToCents(txt).cents;

  it('parses both decimal separators', () => {
    expect(cents('12.50')).toBe(1250);
    expect(cents('12,50')).toBe(1250);
    expect(cents('64.95')).toBe(6495);
    expect(cents('0.05')).toBe(5);
    expect(cents('7')).toBe(700);
    expect(cents('€ 12,50')).toBe(1250);
  });

  it('parses grouped thousands in either convention', () => {
    expect(cents('1.234,56')).toBe(123456);
    expect(cents('1,234.56')).toBe(123456);
    expect(cents('1.234.567,89')).toBe(123456789);
  });

  it('rounds beyond two decimals half-up without float drift', () => {
    expect(cents('1.0050')).toBe(101);
    expect(cents('2.0049')).toBe(200);
    expect(cents('0.005')).toBe(1);
  });

  it('refuses to guess an ambiguous separator', () => {
    expect(parseDecimalToCents('1.234')).toMatchObject({ ok: false, reason: 'ambiguous' });
    expect(parseDecimalToCents('1,234')).toMatchObject({ ok: false, reason: 'ambiguous' });
  });

  it('rejects junk, empty and negative input', () => {
    expect(parseDecimalToCents('')).toMatchObject({ ok: false, reason: 'empty' });
    expect(parseDecimalToCents('abc')).toMatchObject({ ok: false, reason: 'invalid' });
    expect(parseDecimalToCents('12,')).toMatchObject({ ok: false, reason: 'invalid' });
    expect(parseDecimalToCents('-5.00')).toMatchObject({ ok: false, reason: 'negative' });
  });

  it('survives a serialize/parse round trip', () => {
    for (const value of [0, 5, 1250, 6495, 123456789]) {
      expect(cents(centsToDecimalString(value))).toBe(value);
    }
  });
});

describe('allocateCents', () => {
  it('sum equals total even with awkward proportions', () => {
    const out = allocateCents(100, [1, 1, 1]);
    expect(out.reduce((a, b) => a + b, 0)).toBe(100);
  });

  it('handles zero total', () => {
    expect(allocateCents(0, [1, 2])).toEqual([0, 0]);
  });

  it('handles all-zero parts', () => {
    expect(allocateCents(50, [0, 0])).toEqual([0, 0]);
  });

  it('proportional', () => {
    const [a, b] = allocateCents(200, [1000, 1000]);
    expect(a).toBe(100);
    expect(b).toBe(100);
  });
});
