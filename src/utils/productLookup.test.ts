import { describe, expect, it } from 'vitest';
import { Product } from '../types';
import { findProductByScanCode, matchesCatalogQuery } from './productLookup';

const makeProduct = (overrides: Partial<Product>): Product => ({
  id: overrides.id ?? 'p-1',
  name: overrides.name ?? 'Test Product',
  category: overrides.category ?? 'test',
  priceCents: overrides.priceCents ?? 1000,
  vatRate: overrides.vatRate ?? 21,
  ...overrides,
});

describe('findProductByScanCode', () => {
  it('matches barcodes even when scanner input includes spaces or separators', () => {
    const product = makeProduct({ barcode: '5407000000011' });

    expect(findProductByScanCode([product], '5407 0000 0001 1')?.product.id).toBe(product.id);
    expect(findProductByScanCode([product], '5407000000011')?.matchedOn).toBe('barcode');
  });

  it('matches SKU case-insensitively when no barcode match exists', () => {
    const product = makeProduct({ sku: 'deck-hsc-825' });

    const match = findProductByScanCode([product], 'DECK-HSC-825');

    expect(match?.product.id).toBe(product.id);
    expect(match?.matchedOn).toBe('sku');
  });

  it('matches an approved extra retail identifier, without treating supplier references as scan codes', () => {
    const product = makeProduct({
      identifiers: [
        { type: 'ean', value: '5410 0000 0001 1', isScannable: true, isPrimary: true },
        { type: 'supplier-code', value: 'SUP-42', isScannable: false, isPrimary: false },
      ],
    });

    expect(findProductByScanCode([product], '5410000000011')).toMatchObject({
      product: { id: product.id },
      matchedOn: 'identifier',
    });
    expect(findProductByScanCode([product], 'SUP-42')).toBeNull();
  });

  it('prefers an exact barcode match over a numeric SKU match', () => {
    const barcodeProduct = makeProduct({ id: 'barcode', barcode: '123456' });
    const skuProduct = makeProduct({ id: 'sku', sku: '123456' });

    const match = findProductByScanCode([skuProduct, barcodeProduct], '123456');

    expect(match?.product.id).toBe(barcodeProduct.id);
    expect(match?.matchedOn).toBe('barcode');
  });

  it('ignores inactive products', () => {
    const inactive = makeProduct({ id: 'inactive', barcode: '5407000000011', isActive: false });

    expect(findProductByScanCode([inactive], '5407000000011')).toBeNull();
  });

  it('matches catalog searches across product name and metadata', () => {
    const product = makeProduct({
      name: 'Maple Popsicle Deck 8.25',
      sku: 'DECK-HSC-825',
      barcode: '5407000000011',
      brand: 'House Skate Co.',
      identifiers: [{ type: 'alternate', value: 'ALT-DECK-1', isScannable: true, isPrimary: false }],
    });

    expect(matchesCatalogQuery(product, 'popsicle')).toBe(true);
    expect(matchesCatalogQuery(product, 'deck-hsc-825')).toBe(true);
    expect(matchesCatalogQuery(product, 'house skate')).toBe(true);
    expect(matchesCatalogQuery(product, 'alt-deck')).toBe(true);
    expect(matchesCatalogQuery(product, 'wheels')).toBe(false);
  });
});
