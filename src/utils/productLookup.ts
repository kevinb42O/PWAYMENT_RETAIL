import { Product } from '../types';

export interface ProductScanMatch {
  product: Product;
  matchedOn: 'barcode' | 'sku' | 'identifier';
}

const normalizeExactCode = (value?: string): string => (value ?? '').trim().toLowerCase();

const normalizeDigits = (value?: string): string => (value ?? '').replace(/\D/g, '');

export const normalizeCatalogQuery = (value?: string): string => normalizeExactCode(value);

export const matchesCatalogQuery = (product: Product, rawQuery: string): boolean => {
  if (product.isActive === false) return false;

  const term = normalizeCatalogQuery(rawQuery);
  if (!term) return true;

  return [
    product.name,
    product.sku,
    product.barcode,
    product.brand,
    product.subCategory,
    product.category,
    product.variant,
    ...(product.identifiers ?? []).map((identifier) => identifier.value),
  ].some((value) => normalizeExactCode(value).includes(term));
};

export const findProductByScanCode = (
  products: Product[],
  rawCode: string,
): ProductScanMatch | null => {
  const exactCode = normalizeCatalogQuery(rawCode);
  if (!exactCode) return null;

  const digitCode = normalizeDigits(rawCode);
  const activeProducts = products.filter((product) => product.isActive !== false);

  const barcodeMatch =
    activeProducts.find((product) => normalizeExactCode(product.barcode) === exactCode) ??
    (digitCode
      ? activeProducts.find((product) => {
          const barcodeDigits = normalizeDigits(product.barcode);
          return barcodeDigits.length > 0 && barcodeDigits === digitCode;
        })
      : undefined);

  if (barcodeMatch) {
    return {
      product: barcodeMatch,
      matchedOn: 'barcode',
    };
  }

  const identifierMatch = activeProducts.find((product) =>
    (product.identifiers ?? []).some((identifier) => {
      if (!identifier.isScannable) return false;
      const identifierCode = normalizeExactCode(identifier.value);
      if (!identifierCode) return false;
      if (identifierCode === exactCode) return true;
      const identifierDigits = normalizeDigits(identifier.value);
      return Boolean(
        digitCode
        && identifierDigits.length > 0
        && ["ean", "upc", "gtin", "alternate"].includes(identifier.type)
        && identifierDigits === digitCode,
      );
    }),
  );
  if (identifierMatch) {
    return { product: identifierMatch, matchedOn: 'identifier' };
  }

  const skuMatch = activeProducts.find((product) => normalizeExactCode(product.sku) === exactCode);

  return skuMatch
    ? {
        product: skuMatch,
        matchedOn: 'sku',
      }
    : null;
};
