import { Product } from '../types';
import { centsToDecimalString, parseDecimalToCents } from './money';
import { isSupportedVatRate, SUPPORTED_VAT_RATES } from './vat';

export const PRODUCT_CSV_HEADERS = [
  'id',
  'name',
  'category',
  'subCategory',
  'brand',
  'supplier',
  'variant',
  'sku',
  'barcode',
  'costPrice',
  'sellingPrice',
  'vatRate',
  'stockQty',
  'minStockQty',
  'isActive',
] as const;

export const slugifyId = (s: string): string =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);

const escapeCsv = (value: unknown): string => {
  const s = String(value ?? '');
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const splitCsvLine = (line: string): string[] => {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if ((ch === ',' || ch === ';') && !quoted) {
      out.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
};

export const serializeProductsCsv = (products: Product[]): string => {
  const rows = products.map((p) => [
    p.id,
    p.name,
    p.category,
    p.subCategory ?? '',
    p.brand ?? '',
    p.supplier ?? '',
    p.variant ?? '',
    p.sku ?? '',
    p.barcode ?? '',
    centsToDecimalString(p.costPriceCents ?? 0),
    centsToDecimalString(p.priceCents),
    p.vatRate,
    p.stockQty ?? '',
    p.minStockQty ?? '',
    p.isActive !== false ? 'true' : 'false',
  ]);
  return [
    PRODUCT_CSV_HEADERS.join(','),
    ...rows.map((row) => row.map(escapeCsv).join(',')),
  ].join('\n');
};

export interface CsvIssue {
  /** 1-based line number in the source file. */
  line: number;
  message: string;
}

export interface ProductCsvParseResult {
  products: Product[];
  issues: CsvIssue[];
}

export interface ProductCsvContext {
  existing: Product[];
  /** VAT rate per known category id; a row without `vatRate` inherits it. */
  categoryVatById: Map<string, number>;
}

const parseWholeNumber = (txt: string): number | undefined | null => {
  const trimmed = txt.trim();
  if (!trimmed) return undefined;
  if (!/^\d+$/.test(trimmed)) return null;
  return Number(trimmed);
};

const moneyReasonText: Record<string, string> = {
  empty: 'ontbreekt',
  invalid: 'is geen geldig bedrag',
  ambiguous: 'is dubbelzinnig (gebruik 2 decimalen, bv. 1234.56)',
  negative: 'mag niet negatief zijn',
};

/**
 * Parse a catalogue CSV. Nothing is written here: the caller must check that
 * `issues` is empty and then persist `products` in a single transaction.
 */
export const parseProductsCsv = (
  text: string,
  ctx: ProductCsvContext,
): ProductCsvParseResult => {
  const issues: CsvIssue[] = [];
  const lines = text.split(/\r?\n/);
  const firstContent = lines.findIndex((l) => l.trim());
  if (firstContent === -1) {
    return { products: [], issues: [{ line: 1, message: 'Leeg bestand.' }] };
  }

  const headers = splitCsvLine(lines[firstContent]).map((h) => h.trim());
  const columnIndex = (name: string) => headers.findIndex((h) => h === name);
  const missing = ['name', 'category', 'sellingPrice'].filter((h) => columnIndex(h) === -1);
  if (missing.length > 0) {
    return {
      products: [],
      issues: [{ line: firstContent + 1, message: `CSV mist verplichte kolommen: ${missing.join(', ')}.` }],
    };
  }

  const existingById = new Map(ctx.existing.map((p) => [p.id, p]));
  const skuOwner = new Map<string, string>();
  const barcodeOwner = new Map<string, string>();
  for (const p of ctx.existing) {
    if (p.sku) skuOwner.set(p.sku.toLowerCase(), p.id);
    if (p.barcode) barcodeOwner.set(p.barcode, p.id);
  }

  const products: Product[] = [];
  const seenIds = new Set<string>();

  for (let i = firstContent + 1; i < lines.length; i += 1) {
    const rawLine = lines[i];
    if (!rawLine.trim()) continue;
    const lineNo = i + 1;
    const cells = splitCsvLine(rawLine);
    const cell = (name: string) => {
      const idx = columnIndex(name);
      return idx >= 0 ? (cells[idx] ?? '').trim() : '';
    };

    const name = cell('name');
    const category = cell('category');
    if (!name) {
      issues.push({ line: lineNo, message: 'name ontbreekt.' });
      continue;
    }
    if (!category) {
      issues.push({ line: lineNo, message: `${name}: category ontbreekt.` });
      continue;
    }
    if (!ctx.categoryVatById.has(category)) {
      issues.push({ line: lineNo, message: `${name}: onbekende categorie "${category}".` });
      continue;
    }

    const price = parseDecimalToCents(cell('sellingPrice'));
    if (!price.ok) {
      issues.push({ line: lineNo, message: `${name}: sellingPrice ${moneyReasonText[price.reason]}.` });
      continue;
    }
    if (price.cents <= 0) {
      issues.push({ line: lineNo, message: `${name}: sellingPrice moet groter zijn dan 0.` });
      continue;
    }

    const costText = cell('costPrice');
    let costPriceCents: number | undefined;
    if (costText) {
      const cost = parseDecimalToCents(costText);
      if (!cost.ok) {
        issues.push({ line: lineNo, message: `${name}: costPrice ${moneyReasonText[cost.reason]}.` });
        continue;
      }
      costPriceCents = cost.cents;
    }

    const vatText = cell('vatRate');
    const vatRate = vatText ? Number(vatText) : ctx.categoryVatById.get(category);
    if (!isSupportedVatRate(vatRate)) {
      issues.push({
        line: lineNo,
        message: `${name}: BTW-tarief "${vatText || String(vatRate)}" wordt niet ondersteund (enkel ${SUPPORTED_VAT_RATES.join('% en ')}%).`,
      });
      continue;
    }

    const stockQty = parseWholeNumber(cell('stockQty'));
    if (stockQty === null) {
      issues.push({ line: lineNo, message: `${name}: stockQty moet een geheel getal ≥ 0 zijn.` });
      continue;
    }
    const minStockQty = parseWholeNumber(cell('minStockQty'));
    if (minStockQty === null) {
      issues.push({ line: lineNo, message: `${name}: minStockQty moet een geheel getal ≥ 0 zijn.` });
      continue;
    }

    const id = cell('id') || slugifyId(`${cell('brand') || 'item'}-${name}`) || `product-${lineNo}`;
    if (seenIds.has(id)) {
      issues.push({ line: lineNo, message: `${name}: dubbele id "${id}" in het bestand.` });
      continue;
    }
    seenIds.add(id);

    const sku = cell('sku') || undefined;
    if (sku) {
      const owner = skuOwner.get(sku.toLowerCase());
      if (owner && owner !== id) {
        issues.push({ line: lineNo, message: `${name}: SKU "${sku}" is al in gebruik door "${owner}".` });
        continue;
      }
      skuOwner.set(sku.toLowerCase(), id);
    }

    const barcode = cell('barcode') || undefined;
    if (barcode) {
      const owner = barcodeOwner.get(barcode);
      if (owner && owner !== id) {
        issues.push({ line: lineNo, message: `${name}: barcode "${barcode}" is al in gebruik door "${owner}".` });
        continue;
      }
      barcodeOwner.set(barcode, id);
    }

    const isActiveCell = cell('isActive');
    products.push({
      ...existingById.get(id),
      id,
      name,
      category,
      subCategory: cell('subCategory') || undefined,
      brand: cell('brand') || undefined,
      supplier: cell('supplier') || undefined,
      variant: cell('variant') || undefined,
      sku,
      barcode,
      costPriceCents,
      priceCents: price.cents,
      vatRate,
      stockQty,
      minStockQty,
      isActive: isActiveCell !== 'false',
      color: existingById.get(id)?.color ?? 'bg-sky-700',
    });
  }

  return { products, issues };
};
