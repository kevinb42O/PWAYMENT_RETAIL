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
      'Boek,books,10.60,9',
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
    expect(issues[0].message).toMatch(/verplichte kolommen/);
  });

  it('parses a semicolon-delimited file with unquoted decimal commas', () => {
    const csv = [
      'id;name;category;sellingPrice;costPrice',
      'a;Deck A;skateboards;12,50;6,40',
      'b;Deck B;skateboards;1.234,56;',
    ].join('\n');

    const { products, issues } = parseProductsCsv(csv, ctx);
    expect(issues).toEqual([]);
    expect(products.map((p) => p.priceCents)).toEqual([1250, 123456]);
    expect(products[0].costPriceCents).toBe(640);
  });

  it('rejects rows whose column count does not match the header', () => {
    const csv = [
      'name,category,sellingPrice',
      'Deck,skateboards,12,50', // unquoted decimal comma in a comma file
    ].join('\n');

    const { products, issues } = parseProductsCsv(csv, ctx);
    expect(products).toEqual([]);
    expect(issues[0].message).toMatch(/kolommen/);
  });

  it('preserves fields whose columns are absent from a partial file', () => {
    const csv = ['id,name,category,sellingPrice', 'deck-1,Deck 8.25,skateboards,15.00'].join('\n');

    const { products, issues } = parseProductsCsv(csv, ctx);
    expect(issues).toEqual([]);
    const [p] = products;
    expect(p.priceCents).toBe(1500);
    // Everything the file did not mention survives from the catalogue.
    expect(p.costPriceCents).toBe(640);
    expect(p.sku).toBe('DCK-825');
    expect(p.barcode).toBe('5412345678901');
    expect(p.stockQty).toBe(12);
    expect(p.minStockQty).toBe(3);
    expect(p.vatRate).toBe(21);
  });

  it('never reactivates an archived product without an explicit isActive=true', () => {
    const archived: Product = { ...catalog[0], isActive: false };
    const partialCtx = { ...ctx, existing: [archived, catalog[1]] };

    const noColumn = parseProductsCsv(
      'id,name,category,sellingPrice\ndeck-1,Deck 8.25,skateboards,12.50',
      partialCtx,
    );
    expect(noColumn.issues).toEqual([]);
    expect(noColumn.products[0].isActive).toBe(false);

    const emptyCell = parseProductsCsv(
      'id,name,category,sellingPrice,isActive\ndeck-1,Deck 8.25,skateboards,12.50,',
      partialCtx,
    );
    expect(emptyCell.issues).toEqual([]);
    expect(emptyCell.products[0].isActive).toBe(false);

    const explicit = parseProductsCsv(
      'id,name,category,sellingPrice,isActive\ndeck-1,Deck 8.25,skateboards,12.50,true',
      partialCtx,
    );
    expect(explicit.issues).toEqual([]);
    expect(explicit.products[0].isActive).toBe(true);

    const invalid = parseProductsCsv(
      'id,name,category,sellingPrice,isActive\ndeck-1,Deck 8.25,skateboards,12.50,yes',
      partialCtx,
    );
    expect(invalid.products).toEqual([]);
    expect(invalid.issues[0].message).toMatch(/isActive/);
  });

  it('resolves a root plus subcategory to the canonical leaf id', () => {
    const taxonomyCtx = {
      existing: [],
      categoryVatById: new Map([['clothing', 21], ['clothing-hoodies', 21]]),
      categories: [
        { id: 'clothing', name: 'Kleding', vatRate: 21, isActive: true },
        { id: 'clothing-hoodies', parentId: 'clothing', name: 'Hoodies', vatRate: 21, isActive: true },
      ],
    };
    const result = parseProductsCsv(
      'name,category,subCategory,sellingPrice\nHoodie,clothing,Hoodies,50.00',
      taxonomyCtx,
    );
    expect(result.issues).toEqual([]);
    expect(result.products[0]).toMatchObject({
      category: 'clothing-hoodies',
      subCategory: 'Hoodies',
    });
  });

  it('rejects a subcategory that belongs to another root', () => {
    const result = parseProductsCsv(
      'name,category,subCategory,sellingPrice\nHoodie,accessories,Hoodies,50.00',
      {
        existing: [],
        categoryVatById: new Map([['accessories', 21], ['clothing-hoodies', 21]]),
        categories: [
          { id: 'clothing', name: 'Kleding', vatRate: 21, isActive: true },
          { id: 'accessories', name: 'Accessoires', vatRate: 21, isActive: true },
          { id: 'clothing-hoodies', parentId: 'clothing', name: 'Hoodies', vatRate: 21, isActive: true },
        ],
      },
    );
    expect(result.products).toEqual([]);
    expect(result.issues[0].message).toMatch(/onbekende subcategorie/);
  });
});
