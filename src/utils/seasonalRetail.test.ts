import { describe, expect, it } from 'vitest';
import { Transaction } from '../types';
import { buildSeasonalRetailSnapshot } from './seasonalRetail';

const sale = (date: string, category: string, totalCents: number, quantity = 1): Transaction => ({
  tableId: 1,
  items: [{
    lineId: `${date}-${category}`,
    quantity,
    product: {
      id: category,
      name: category,
      category,
      priceCents: Math.round(totalCents / quantity),
      costPriceCents: Math.round(totalCents / quantity / 2),
      vatRate: 21,
    },
  }],
  subtotalCents: totalCents,
  vat12Cents: 0,
  vat21Cents: 0,
  totalCents,
  discountCents: 0,
  paymentMethod: 'PIN',
  timestamp: new Date(date).getTime(),
  isFinalized: 1,
});

describe('buildSeasonalRetailSnapshot', () => {
  it('groups Belgian retail seasons and prepares the next season', () => {
    const snapshot = buildSeasonalRetailSnapshot([
      sale('2024-09-10T12:00:00Z', 'Kledij', 10_000, 2),
      sale('2024-10-10T12:00:00Z', 'Schoenen', 5_000),
      sale('2025-06-10T12:00:00Z', 'Skateboards', 20_000),
      sale('2025-07-10T12:00:00Z', 'Skateboards', 10_000),
    ], new Date('2025-08-10T12:00:00Z').getTime());

    expect(snapshot.currentSeason).toBe('summer');
    expect(snapshot.nextSeason).toBe('autumn');
    expect(snapshot.nextSeasonLabel).toBe('Herfst');
    expect(snapshot.upcomingProfile.averageRevenueCents).toBe(12_396);
    expect(snapshot.upcomingProfile.categories[0]).toMatchObject({ category: 'Kledij', revenueCents: 8_264 });
    expect(snapshot.daysUntilNextSeason).toBeGreaterThan(0);
  });

  it('ignores unfinished seasons when building historical profiles', () => {
    const snapshot = buildSeasonalRetailSnapshot([
      sale('2024-06-10T12:00:00Z', 'Skateboards', 12_000),
      sale('2025-06-10T12:00:00Z', 'Skateboards', 30_000),
    ], new Date('2025-07-01T12:00:00Z').getTime());

    const summer = snapshot.profiles.find((profile) => profile.season === 'summer');
    expect(summer?.completedOccurrences).toBe(1);
    expect(summer?.averageRevenueCents).toBe(9_917);
    expect(snapshot.currentRevenueCents).toBe(24_793);
  });
});
