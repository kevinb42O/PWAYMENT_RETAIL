import { describe, expect, it } from 'vitest';
import { allocateCents, toCents } from './money';

describe('toCents', () => {
  it('rounds half-up', () => {
    expect(toCents(3.10)).toBe(310);
    expect(toCents(3.105)).toBe(311);
    expect(toCents(0)).toBe(0);
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
