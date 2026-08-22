import type {
  Customer,
  ImportFieldMapping,
  Product,
  ProductIdentifierType,
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
  catalogFamilies: RetailCatalogFamilyRelation[];
  issues: MigrationMappingIssue[];
}

export type RetailCatalogIdentifierType = ProductIdentifierType;

export interface RetailCatalogIdentifierRelation {
  identifierType: RetailCatalogIdentifierType;
  identifierValue: string;
  isScannable: boolean;
  isPrimary: boolean;
}

export interface RetailCatalogVariantOptionRelation {
  name: string;
  value: string;
}

export interface RetailCatalogVariantRelation {
  productExternalId: string;
  displayName?: string;
  options: RetailCatalogVariantOptionRelation[];
  identifiers: RetailCatalogIdentifierRelation[];
}

export interface RetailCatalogFamilyRelation {
  externalId: string;
  name: string;
  brand?: string;
  categoryExternalId?: string;
  variants: RetailCatalogVariantRelation[];
}

export const PRODUCT_MAPPING_TARGETS = [
  ["ignore", "Bewaar als eigen veld"],
  ["core:id", "Extern ID"],
  ["core:name", "Productnaam"],
  ["core:category", "Categorie"],
  ["core:subCategory", "Subcategorie"],
  ["core:sku", "SKU / artikelcode"],
  ["core:barcode", "Barcode / EAN / GTIN"],
  ["core:brand", "Merk"],
  ["core:supplier", "Leverancier"],
  ["core:supplierCode", "Leverancierscode"],
  ["core:variant", "Variant"],
  ["variant-option", "Variantoptie (naam uit bronkolom)"],
  ["identifier", "Extra productidentificatie (naam uit bronkolom)"],
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

const variantOptionsFor = (
  row: string[],
  parsed: ParsedImportFile,
  mappings: ImportFieldMapping[],
): RetailCatalogVariantOptionRelation[] =>
  mappings.flatMap((mapping) => {
    if (mapping.target !== "variant-option" && !mapping.target.startsWith("variant-option:")) return [];
    const name = (mapping.target === "variant-option"
      ? mapping.source
      : mapping.target.slice("variant-option:".length)).trim();
    const index = parsed.headers.indexOf(mapping.source);
    const value = index < 0 ? "" : row[index]?.trim() ?? "";
    return name && value ? [{ name, value }] : [];
  });

const identifierTypeForHeader = (header: string): RetailCatalogIdentifierType => {
  const normalized = header.toLocaleLowerCase("nl-BE");
  if (/\bupc\b/.test(normalized)) return "upc";
  if (/\bgtin\b/.test(normalized)) return "gtin";
  if (/\bean\b|barcode/.test(normalized)) return "ean";
  if (/supplier|leverancier|vendor/.test(normalized)) return "supplier-code";
  if (/sku|artikelcode|artikelnummer|productcode/.test(normalized)) return "internal-sku";
  return "alternate";
};

const additionalIdentifierRelationsFor = (
  row: string[],
  parsed: ParsedImportFile,
  mappings: ImportFieldMapping[],
): RetailCatalogIdentifierRelation[] =>
  mappings.flatMap((mapping) => {
    if (mapping.target !== "identifier" && !mapping.target.startsWith("identifier:")) return [];
    const index = parsed.headers.indexOf(mapping.source);
    const identifierValue = index < 0 ? "" : row[index]?.trim() ?? "";
    if (!identifierValue) return [];
    const requestedType = mapping.target.startsWith("identifier:")
      ? mapping.target.slice("identifier:".length) as RetailCatalogIdentifierType
      : identifierTypeForHeader(mapping.source);
    const identifierType: RetailCatalogIdentifierType = [
      "internal-sku", "ean", "upc", "gtin", "supplier-code", "alternate",
    ].includes(requestedType) ? requestedType : "alternate";
    return [{
      identifierType,
      identifierValue,
      isScannable: identifierType !== "supplier-code",
      isPrimary: false,
    }];
  });

const identifierRelationsFor = (
  product: Product,
  additional: RetailCatalogIdentifierRelation[] = [],
): RetailCatalogIdentifierRelation[] => {
  const values: RetailCatalogIdentifierRelation[] = [];
  const barcode = product.barcode?.trim();
  const sku = product.sku?.trim();
  const supplierCode = product.supplierCode?.trim();
  if (sku) {
    values.push({
      identifierType: "internal-sku",
      identifierValue: sku,
      isScannable: true,
      isPrimary: !barcode,
    });
  }
  if (barcode) {
    const digits = barcode.replace(/\s/g, "");
    values.push({
      identifierType: /^\d{12}$/.test(digits) ? "upc" : /^\d{8}$|^\d{13}$|^\d{14}$/.test(digits) ? "ean" : "alternate",
      identifierValue: barcode,
      isScannable: true,
      isPrimary: true,
    });
  }
  if (supplierCode) {
    values.push({
      identifierType: "supplier-code",
      identifierValue: supplierCode,
      isScannable: false,
      isPrimary: false,
    });
  }
  const seen = new Set<string>();
  return [...values, ...additional].filter((value) => {
    const key = `${value.identifierType}\u001f${value.identifierValue.replace(/\s/g, "").toLocaleLowerCase("nl-BE")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const catalogFamiliesFor = (
  products: Product[],
  variantOptionsByProductId: Map<string, RetailCatalogVariantOptionRelation[]>,
  additionalIdentifiersByProductId: Map<string, RetailCatalogIdentifierRelation[]>,
): RetailCatalogFamilyRelation[] => {
  const grouped = new Map<string, Product[]>();
  for (const product of products) {
    const options = variantOptionsByProductId.get(product.id) ?? [];
    // Only an explicit variant/option mapping groups multiple sellable SKUs.
    // Equal product names alone are never enough evidence for a family.
    const key = options.length > 0 || product.variant
      ? [product.category, product.brand ?? "", product.name].map((value) => value.toLocaleLowerCase("nl-BE").trim()).join("\u001f")
      : product.id;
    const current = grouped.get(key) ?? [];
    current.push(product);
    grouped.set(key, current);
  }
  const familyIds = new Set<string>();
  return Array.from(grouped.entries()).map(([key, familyProducts]) => {
    const first = familyProducts[0];
    return {
      externalId: makeUniqueId(key, familyIds, "migration-family"),
      name: first.name,
      brand: first.brand,
      categoryExternalId: first.category || undefined,
      variants: familyProducts.map((product) => {
        const explicitOptions = variantOptionsByProductId.get(product.id) ?? [];
        // `product.variant` is a readable POS label. When actual option
        // columns exist it is derived from those columns, so adding it as a
        // second option would create a fake dimension in the matrix.
        const options = explicitOptions.length === 0 && product.variant
          ? [{ name: "Variant", value: product.variant }]
          : explicitOptions;
        return {
          productExternalId: product.id,
          displayName: product.variant,
          options,
          identifiers: identifierRelationsFor(
            product,
            additionalIdentifiersByProductId.get(product.id),
          ),
        };
      }),
    };
  });
};

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
  const variantOptionsByProductId = new Map<string, RetailCatalogVariantOptionRelation[]>();
  const additionalIdentifiersByProductId = new Map<string, RetailCatalogIdentifierRelation[]>();
  const productIds = new Set<string>();
  const customerIds = new Set<string>();
  const categoryPathKey = (name: string, parentId?: string): string =>
    `${parentId ?? ""}\u001f${name.toLocaleLowerCase("nl-BE")}`;
  const categoryByPath = new Map(
    existingCategories.map((category) => [
      categoryPathKey(category.name, category.parentId),
      category,
    ]),
  );
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
    const categoryName = valueFor(row, parsed, mappings, "core:category") || "Geïmporteerd";
    const subCategory = valueFor(row, parsed, mappings, "core:subCategory") || undefined;
    const variantOptions = variantOptionsFor(row, parsed, mappings);
    const explicitVariant = valueFor(row, parsed, mappings, "core:variant") || undefined;
    const variant = explicitVariant
      ?? (variantOptions.length > 0
        ? variantOptions.map((option) => `${option.name}: ${option.value}`).join(" · ")
        : undefined);
    // A source may legitimately have no SKU/EAN yet. Its explicit category
    // path and option tuple still distinguish sellable variants; two rows with
    // the same tuple remain an import error instead of a guessed merge.
    const fallbackIdentity = [categoryName, subCategory ?? "", name, variant ?? ""].join("\u001f");
    const identity = explicitId || sku || barcode || fallbackIdentity;
    const identityKey = identity.toLocaleLowerCase("nl-BE");
    if (identityKeys.has(identityKey)) {
      issues.push({ row: rowNumber, message: "Dubbel extern ID, SKU, barcode of product/variantcombinatie in dit bestand." });
      return;
    }
    identityKeys.add(identityKey);
    let category = categoryByPath.get(categoryPathKey(categoryName));
    if (!category) {
      category = {
        id: makeUniqueId(categoryName, categoryIds, "migration-category"),
        name: categoryName,
        vatRate,
        isActive: true,
      };
      categoryByPath.set(categoryPathKey(categoryName), category);
      categories.push(category);
    }
    let productCategory = category;
    if (subCategory) {
      const childKey = categoryPathKey(subCategory, category.id);
      let childCategory = categoryByPath.get(childKey);
      if (!childCategory) {
        childCategory = {
          id: makeUniqueId(`${categoryName}-${subCategory}`, categoryIds, "migration-category"),
          parentId: category.id,
          name: subCategory,
          vatRate,
          isActive: true,
        };
        categoryByPath.set(childKey, childCategory);
        categories.push(childCategory);
      }
      productCategory = childCategory;
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
    const id = makeUniqueId(explicitId || sku || barcode || fallbackIdentity, productIds, "migration-product");
    const additionalIdentifiers = additionalIdentifierRelationsFor(row, parsed, mappings);
    const mappedProduct: Product = {
      id,
      name,
      category: productCategory.id,
      subCategory,
      sku,
      barcode,
      brand: valueFor(row, parsed, mappings, "core:brand") || undefined,
      supplier: valueFor(row, parsed, mappings, "core:supplier") || undefined,
      supplierCode: valueFor(row, parsed, mappings, "core:supplierCode") || undefined,
      variant,
      variantOptions: variantOptions.length > 0
        ? Object.fromEntries(variantOptions.map((option) => [option.name, option.value]))
        : undefined,
      priceCents: standardPrice,
      costPriceCents: costPrice,
      vatRate,
      stockQty,
      priceTiers,
      customFields: rawCustomFields(row, parsed, mappings),
      productType: "merchandise",
      isActive: true,
    };
    mappedProduct.identifiers = identifierRelationsFor(mappedProduct, additionalIdentifiers)
      .map((identifier) => ({
        type: identifier.identifierType,
        value: identifier.identifierValue,
        isScannable: identifier.isScannable,
        isPrimary: identifier.isPrimary,
      }));
    products.push(mappedProduct);
    variantOptionsByProductId.set(id, variantOptions);
    additionalIdentifiersByProductId.set(id, additionalIdentifiers);
  });

  const catalogFamilies = kind === "catalog"
    ? catalogFamiliesFor(products, variantOptionsByProductId, additionalIdentifiersByProductId)
    : [];
  for (const family of catalogFamilies) {
    for (const familyVariant of family.variants) {
      const product = products.find((candidate) => candidate.id === familyVariant.productExternalId);
      if (product) product.familyId = family.externalId;
    }
  }

  return {
    products,
    customers,
    categories,
    catalogFamilies,
    issues,
  };
};
