import { describe, expect, it } from 'vitest';
import { Product } from '../types';
import { buildInventoryForecast } from './retailActionEngine';
import { buildDemoDemandProfiles, buildDemoRetailDataset, DemoDemandProfile } from './demoRetailData';

const products: Product[] = [
  { id: 'shirt', name: 'T-shirt', category: 'Kleding', priceCents: 2995, costPriceCents: 1200, vatRate: 21, isActive: true },
  { id: 'bag', name: 'Tas', category: 'Accessoires', priceCents: 4595, costPriceCents: 2100, vatRate: 21, isActive: true },
];

describe('buildDemoRetailDataset', () => {
  it('creates marked historical sales using only the supplied current products', () => {
    const now = new Date(2026, 7, 5, 12);
    const dataset = buildDemoRetailDataset(products, now);

    expect(dataset.transactions.length).toBeGreaterThan(900);
    expect(dataset.customers.length).toBeGreaterThan(70);
    expect(dataset.customers.every((customer) => customer.email && customer.phone && customer.address && customer.notes)).toBe(true);
    expect(dataset.transactions.every((transaction) => transaction.source === 'demo')).toBe(true);
    expect(dataset.transactions.every((transaction) => transaction.items.every((item) => ['shirt', 'bag'].includes(item.product.id)))).toBe(true);
    expect(new Set(dataset.transactions.map((transaction) => transaction.paymentMethod))).toEqual(new Set(['PIN', 'Cash', 'Cadeaubon']));
    expect(dataset.transactions.filter((transaction) => transaction.discountCents > 0).length).toBeGreaterThan(0);
    expect(dataset.customers.filter((customer) => customer.visitCount > 1).length).toBeGreaterThan(20);
    expect(dataset.customers.filter((customer) => customer.lastVisitAt && now.getTime() - new Date(customer.lastVisitAt).getTime() >= 60 * 24 * 60 * 60 * 1000).length).toBeGreaterThan(8);
    const earliest = new Date(Math.min(...dataset.transactions.map((transaction) => transaction.timestamp)));
    expect([earliest.getFullYear(), earliest.getMonth()]).toEqual([2024, 8]);
    expect(Math.max(...dataset.transactions.map((transaction) => transaction.timestamp))).toBeLessThanOrEqual(now.getTime());
  });

  it('contains reproducible histories for every forecast model that must be testable', () => {
    const now = new Date(2026, 7, 5, 12);
    const scenarioProducts: Product[] = Array.from({ length: 12 }, (_, index) => ({
      id: `forecast-${index + 1}`,
      name: `Forecastproduct ${index + 1}`,
      category: 'Forecasttest',
      supplier: `Leverancier ${(index % 3) + 1}`,
      priceCents: 2000 + index * 100,
      costPriceCents: 900 + index * 50,
      vatRate: 21,
      stockQty: 20,
      minStockQty: 5,
      isActive: true,
    }));
    const profiles = buildDemoDemandProfiles(scenarioProducts);
    const dataset = buildDemoRetailDataset(scenarioProducts, now);
    const forecast = buildInventoryForecast(scenarioProducts, dataset.transactions, now.getTime());
    const rowFor = (profile: DemoDemandProfile) => {
      const productId = Object.entries(profiles).reverse().find(([, candidate]) => candidate === profile)?.[0];
      return forecast.find((row) => row.productId === productId);
    };

    expect(rowFor('rising')).toEqual(expect.objectContaining({
      forecastModel: 'recent-blend',
      trend: 'rising',
      confidence: 'high',
    }));
    expect(rowFor('falling')).toEqual(expect.objectContaining({
      forecastModel: 'recent-blend',
      trend: 'falling',
      confidence: 'high',
    }));
    expect(rowFor('seasonal-summer')).toEqual(expect.objectContaining({
      forecastModel: 'seasonal-blend',
      confidence: 'high',
    }));
    expect(rowFor('intermittent')).toEqual(expect.objectContaining({
      forecastModel: 'intermittent',
      trend: 'unknown',
    }));
    expect(rowFor('insufficient')).toEqual(expect.objectContaining({
      forecastModel: 'insufficient',
      confidence: 'low',
      activeSalesDays: 1,
    }));
    expect(rowFor('dormant')?.soldLast90Days).toBe(0);
    expect(rowFor('new')?.soldLast90Days).toBeGreaterThan(0);
    expect(forecast.every((row) => row.observedDays >= 700)).toBe(true);
  });
});
