import { describe, expect, it } from 'vitest';
import { parseProductsCsv, serializeProductsCsv } from './productCsv';
import { Product } from '../types';

const catalog: Product[] = [
  {
    id: 'deck-1',
    name: 'Deck 8.25',
    category: 'skateboards',
    sku: 'DCK-825',
    barcode: '5412345678901',
    priceCents: 1250,
    costPriceCents: 640,
    vatRate: 21,
    stockQty: 12,
    minStockQty: 3,
    isActive: true,
  },
  {
    id: 'wheels-1',
    name: 'Wielen 54mm',
    category: 'components',
    priceCents: 6495,
    costPriceCents: 3100,
    vatRate: 21,
    stockQty: 8,
    isActive: true,
  },
];

const ctx = {
  existing: catalog,
  categoryVatById: new Map([
    ['skateboards', 21],
    ['components', 21],
    ['books', 6],
  ]),
};

describe('product CSV round trip', () => {
  it('re-imports exported prices unchanged', () => {
    const csv = serializeProductsCsv(catalog);
    expect(csv).toContain('12.50');
    expect(csv).toContain('64.95');

    const { products, issues } = parseProductsCsv(csv, ctx);
    expect(issues).toEqual([]);
    expect(products.map((p) => p.priceCents)).toEqual([1250, 6495]);
    expect(products.map((p) => p.costPriceCents)).toEqual([640, 3100]);
    expect(products[0].stockQty).toBe(12);
    expect(products[0].minStockQty).toBe(3);
  });

  it('accepts both dot and comma decimals', () => {
    const csv = [
      'id,name,category,sellingPrice,vatRate',
      'a,Deck A,skateboards,12.50,21',
      'b,Deck B,skateboards,"1.234,56",21',
      'c,Deck C,skateboards,"1,234.56",21',
    ].join('\n');

    const { products, issues } = parseProductsCsv(csv, ctx);
    expect(issues).toEqual([]);
    expect(products.map((p) => p.priceCents)).toEqual([1250, 123456, 123456]);
  });

  it('rejects an ambiguous amount instead of guessing', () => {
    const csv = ['name,category,sellingPrice', 'Deck,skateboards,1.234'].join('\n');
    const { products, issues } = parseProductsCsv(csv, ctx);
    expect(products).toEqual([]);
    expect(issues[0].message).toMatch(/dubbelzinnig/);
  });

  it('rejects unsupported VAT rates', () => {
    const csv = [
      'name,category,sellingPrice,vatRate',
      'Deck,skateboards,12.50,21',
      'Boek,books,10.60,6',
    ].join('\n');

    const { issues } = parseProductsCsv(csv, ctx);
    expect(issues).toHaveLength(1);
    expect(issues[0].line).toBe(3);
    expect(issues[0].message).toMatch(/BTW-tarief/);
  });

  it('flags duplicate SKUs and barcodes against the existing catalogue', () => {
    const csv = [
      'id,name,category,sellingPrice,sku,barcode',
      'new-1,Nieuw deck,skateboards,20.00,DCK-825,',
      'new-2,Ander deck,skateboards,20.00,,5412345678901',
    ].join('\n');

    const { issues } = parseProductsCsv(csv, ctx);
    expect(issues).toHaveLength(2);
    expect(issues[0].message).toMatch(/SKU/);
    expect(issues[1].message).toMatch(/barcode/);
  });

  it('reports missing required columns without producing rows', () => {
    const { products, issues } = parseProductsCsv('name,category\nDeck,skateboards', ctx);
    expect(products).toEqual([]);
    expect(issues[0].message).toMatch(/sellingPrice/);
  });
});
