import type {
  Customer,
  ImportFieldMapping,
  Product,
  ProductCategory,
} from "../types";
import type { ParsedImportFile } from "../utils/integrationImport";
import { parseDecimalToCents } from "../utils/money";
import { normalizePriceGroup } from "../utils/pricing";

export type MigrationSourceKind = "catalog" | "customers";

export interface MigrationMappingIssue {
  row: number;
  message: string;
}

export interface MappedMigrationRecords {
  products: Product[];
  customers: Customer[];
  categories: ProductCategory[];
  issues: MigrationMappingIssue[];
}

export const PRODUCT_MAPPING_TARGETS = [
  ["ignore", "Bewaar als eigen veld"],
  ["core:id", "Extern ID"],
  ["core:name", "Productnaam"],
  ["core:category", "Categorie"],
  ["core:sku", "SKU / artikelcode"],
  ["core:barcode", "Barcode / EAN / GTIN"],
  ["core:brand", "Merk"],
  ["core:supplier", "Leverancier"],
  ["core:supplierCode", "Leverancierscode"],
  ["core:variant", "Variant"],
  ["core:costPrice", "Aankoopprijs"],
  ["core:sellingPrice", "Standaard verkoopprijs"],
  ["core:vatRate", "BTW-percentage"],
  ["core:stockQty", "Voorraad"],
] as const;

export const CUSTOMER_MAPPING_TARGETS = [
  ["ignore", "Bewaar als eigen veld"],
  ["core:id", "Extern klant-ID"],
  ["core:customerName", "Naam klant"],
  ["core:customerEmail", "E-mail"],
  ["core:customerPhone", "Telefoon"],
  ["core:customerAddress", "Adres"],
  ["core:customerNotes", "Notities"],
  ["core:customerPriceGroup", "Klantprijsgroep"],
] as const;

const slugify = (value: string): string =>
  value
    .toLocaleLowerCase("nl-BE")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);

const valueFor = (
  row: string[],
  parsed: ParsedImportFile,
  mappings: ImportFieldMapping[],
  target: string,
): string => {
  const mapping = mappings.find((candidate) => candidate.target === target);
  if (!mapping) return "";
  const index = parsed.headers.indexOf(mapping.source);
  return index < 0 ? "" : row[index]?.trim() ?? "";
};

const rawCustomFields = (
  row: string[],
  parsed: ParsedImportFile,
  mappings: ImportFieldMapping[],
): Record<string, string> => Object.fromEntries(
  mappings
    .filter((mapping) => mapping.target === "ignore")
    .map((mapping) => [mapping.source, row[parsed.headers.indexOf(mapping.source)]?.trim() ?? ""])
    .filter(([, value]) => Boolean(value)),
);

const parsePrice = (value: string): number | null | undefined => {
  if (!value.trim()) return undefined;
  const parsed = parseDecimalToCents(value);
  return parsed.ok ? parsed.cents : null;
};

const parseVat = (value: string, fallback: number): number | null => {
  if (!value.trim()) return fallback;
  const parsed = Number(value.replace("%", "").replace(",", ".").trim());
  if (!Number.isFinite(parsed)) return null;
  const rate = parsed > 0 && parsed < 1 ? Math.round(parsed * 100) : Math.round(parsed);
  return [0, 6, 12, 21].includes(rate) ? rate : null;
};

const parseStock = (value: string): number | undefined | null => {
  if (!value.trim()) return undefined;
  const parsed = Number(value.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : null;
};

const makeUniqueId = (base: string, known: Set<string>, prefix: string): string => {
  const root = `${prefix}-${slugify(base) || globalThis.crypto.randomUUID()}`;
  let result = root;
  let suffix = 2;
  while (known.has(result.toLocaleLowerCase("nl-BE"))) result = `${root}-${suffix++}`;
  known.add(result.toLocaleLowerCase("nl-BE"));
  return result;
};

const customerTargetForHeader = (header: string): string => {
  const normalized = slugify(header).replaceAll("-", "");
  if (/^(id|customerid|klantid|clientid|externalid)$/.test(normalized)) return "core:id";
  if (/(naam|name|customer|klant|client|contact)/.test(normalized)) return "core:customerName";
  if (/(email|mail)/.test(normalized)) return "core:customerEmail";
  if (/(phone|telefoon|gsm|mobile|mobiel)/.test(normalized)) return "core:customerPhone";
  if (/(address|adres|straat|postcode|woonplaats|city)/.test(normalized)) return "core:customerAddress";
  if (/(pricegroup|prijsgroep|segment|tier|tariefgroep)/.test(normalized)) return "core:customerPriceGroup";
  if (/(note|notitie|opmerking|remark)/.test(normalized)) return "core:customerNotes";
  return "ignore";
};

export const inferMigrationMappings = (
  kind: MigrationSourceKind,
  headers: string[],
  inferProductMappings: (values: string[]) => ImportFieldMapping[],
): ImportFieldMapping[] => kind === "catalog"
  ? inferProductMappings(headers)
  : headers.map((source) => ({
    source,
    target: customerTargetForHeader(source),
    confidence: customerTargetForHeader(source) === "ignore" ? 0 : 0.9,
  }));

export const mapMigrationRecords = ({
  kind,
  parsed,
  mappings,
  defaultVat,
  existingCategories,
}: {
  kind: MigrationSourceKind;
  parsed: ParsedImportFile;
  mappings: ImportFieldMapping[];
  defaultVat: number;
  existingCategories: ProductCategory[];
}): MappedMigrationRecords => {
  const issues: MigrationMappingIssue[] = [];
  const products: Product[] = [];
  const customers: Customer[] = [];
  const categories: ProductCategory[] = [];
  const productIds = new Set<string>();
  const customerIds = new Set<string>();
  const categoryByName = new Map(existingCategories.map((category) => [category.name.toLocaleLowerCase("nl-BE"), category]));
  const categoryIds = new Set(existingCategories.map((category) => category.id.toLocaleLowerCase("nl-BE")));
  const identityKeys = new Set<string>();

  parsed.rows.forEach((row, index) => {
    const rowNumber = index + 2;
    if (kind === "customers") {
      const name = valueFor(row, parsed, mappings, "core:customerName");
      const email = valueFor(row, parsed, mappings, "core:customerEmail") || undefined;
      const phone = valueFor(row, parsed, mappings, "core:customerPhone") || undefined;
      const explicitId = valueFor(row, parsed, mappings, "core:id");
      if (!name) {
        issues.push({ row: rowNumber, message: "Klantnaam ontbreekt." });
        return;
      }
      if (!explicitId && !email && !phone) {
        issues.push({ row: rowNumber, message: "Geef minstens extern klant-ID, e-mail of telefoon op zodat deze klant later herkenbaar blijft." });
        return;
      }
      const identity = explicitId || email || phone || name;
      const identityKey = identity.toLocaleLowerCase("nl-BE");
      if (identityKeys.has(identityKey)) {
        issues.push({ row: rowNumber, message: "Dubbele klantidentiteit in dit bestand." });
        return;
      }
      identityKeys.add(identityKey);
      const now = new Date().toISOString();
      customers.push({
        id: makeUniqueId(explicitId || email || phone || name, customerIds, "migration-customer"),
        name,
        email,
        phone,
        address: valueFor(row, parsed, mappings, "core:customerAddress") || undefined,
        notes: valueFor(row, parsed, mappings, "core:customerNotes") || undefined,
        priceGroup: normalizePriceGroup(valueFor(row, parsed, mappings, "core:customerPriceGroup")) || undefined,
        totalSpentCents: 0,
        visitCount: 0,
        createdAt: now,
        isActive: true,
      });
      return;
    }

    const name = valueFor(row, parsed, mappings, "core:name");
    const standardPrice = parsePrice(valueFor(row, parsed, mappings, "core:sellingPrice"));
    const costPrice = parsePrice(valueFor(row, parsed, mappings, "core:costPrice"));
    const vatRate = parseVat(valueFor(row, parsed, mappings, "core:vatRate"), defaultVat);
    const stockQty = parseStock(valueFor(row, parsed, mappings, "core:stockQty"));
    if (!name || standardPrice == null || costPrice === null || vatRate == null || stockQty === null) {
      issues.push({ row: rowNumber, message: !name ? "Productnaam ontbreekt." : standardPrice == null ? "Standaard verkoopprijs ontbreekt of is ongeldig." : costPrice === null ? "Aankoopprijs is ongeldig." : vatRate == null ? "BTW moet 0, 6, 12 of 21% zijn." : "Voorraad is ongeldig." });
      return;
    }
    const explicitId = valueFor(row, parsed, mappings, "core:id");
    const sku = valueFor(row, parsed, mappings, "core:sku") || undefined;
    const barcode = valueFor(row, parsed, mappings, "core:barcode") || undefined;
    const identity = explicitId || sku || barcode || name;
    const identityKey = identity.toLocaleLowerCase("nl-BE");
    if (identityKeys.has(identityKey)) {
      issues.push({ row: rowNumber, message: "Dubbel extern ID, SKU, barcode of productnaam in dit bestand." });
      return;
    }
    identityKeys.add(identityKey);
    const categoryName = valueFor(row, parsed, mappings, "core:category") || "Geïmporteerd";
    const normalizedCategory = categoryName.toLocaleLowerCase("nl-BE");
    let category = categoryByName.get(normalizedCategory);
    if (!category) {
      category = {
        id: makeUniqueId(categoryName, categoryIds, "migration-category"),
        name: categoryName,
        vatRate,
        isActive: true,
      };
      categoryByName.set(normalizedCategory, category);
      categories.push(category);
    }
    const priceTiers: Record<string, number> = {};
    let invalidTier = false;
    mappings.filter((mapping) => mapping.target.startsWith("price:")).forEach((mapping) => {
      const value = row[parsed.headers.indexOf(mapping.source)]?.trim() ?? "";
      const price = parsePrice(value);
      if (price === null) invalidTier = true;
      if (price != null) priceTiers[normalizePriceGroup(mapping.target.slice(6))] = price;
    });
    if (invalidTier) {
      issues.push({ row: rowNumber, message: "Een klantprijs is ongeldig." });
      return;
    }
    products.push({
      id: makeUniqueId(explicitId || sku || barcode || name, productIds, "migration-product"),
      name,
      category: category.id,
      sku,
      barcode,
      brand: valueFor(row, parsed, mappings, "core:brand") || undefined,
      supplier: valueFor(row, parsed, mappings, "core:supplier") || undefined,
      supplierCode: valueFor(row, parsed, mappings, "core:supplierCode") || undefined,
      variant: valueFor(row, parsed, mappings, "core:variant") || undefined,
      priceCents: standardPrice,
      costPriceCents: costPrice,
      vatRate,
      stockQty,
      priceTiers,
      customFields: rawCustomFields(row, parsed, mappings),
      productType: "merchandise",
      isActive: true,
    });
  });

  return { products, customers, categories, issues };
};
