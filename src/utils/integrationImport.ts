import readXlsxFile, { readSheetNames } from "read-excel-file";
import type {
  ImportFieldMapping,
  ImportSourceFormat,
} from "../types";
import { normalizePriceGroup } from "./pricing";

export interface ParsedImportFile {
  format: ImportSourceFormat;
  sheetName?: string;
  headers: string[];
  rows: string[][];
}

const stringifyCell = (value: unknown): string => {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value).trim();
};

const detectDelimiter = (text: string): "," | ";" | "\t" => {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const counts = ([",", ";", "\t"] as const).map((delimiter) => ({
    delimiter,
    count: firstLine.split(delimiter).length - 1,
  }));
  return counts.sort((left, right) => right.count - left.count)[0].delimiter;
};

/** RFC-4180 style parser with support for quoted delimiters and newlines. */
export const parseDelimitedText = (
  text: string,
  delimiter = detectDelimiter(text),
): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  const pushCell = () => {
    row.push(cell.trim());
    cell = "";
  };
  const pushRow = () => {
    pushCell();
    if (row.some((value) => value !== "")) rows.push(row);
    row = [];
  };

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (character === delimiter && !quoted) {
      pushCell();
      continue;
    }
    if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      pushRow();
      continue;
    }
    cell += character;
  }
  if (cell || row.length > 0) pushRow();
  return rows;
};

const parseJsonRecords = (text: string): string[][] => {
  const parsed = JSON.parse(text) as unknown;
  const records = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object"
      ? Object.values(parsed as Record<string, unknown>).find(Array.isArray)
      : undefined;
  if (!Array.isArray(records) || records.length === 0) {
    throw new Error("JSON bevat geen lijst met records.");
  }
  const objects = records.filter(
    (record): record is Record<string, unknown> =>
      Boolean(record) && typeof record === "object" && !Array.isArray(record),
  );
  if (objects.length === 0) {
    throw new Error("JSON-records moeten objecten met velden zijn.");
  }
  const headers = Array.from(
    new Set(objects.flatMap((record) => Object.keys(record))),
  );
  return [
    headers,
    ...objects.map((record) =>
      headers.map((header) => stringifyCell(record[header])),
    ),
  ];
};

export const parseImportFile = async (file: File): Promise<ParsedImportFile> => {
  const extension = file.name.split(".").pop()?.toLocaleLowerCase("nl-BE");
  let matrix: string[][];
  let format: ImportSourceFormat;
  let sheetName: string | undefined;

  if (extension === "xlsx") {
    format = "xlsx";
    const sheets = await readSheetNames(file);
    sheetName = sheets[0];
    const rows = await readXlsxFile(file, sheetName ? { sheet: sheetName } : undefined);
    matrix = rows.map((row) => row.map(stringifyCell));
  } else if (extension === "json" || file.type.includes("json")) {
    format = "json";
    matrix = parseJsonRecords(await file.text());
  } else {
    const text = (await file.text()).replace(/^\uFEFF/, "");
    const delimiter = detectDelimiter(text);
    format = delimiter === "\t" ? "tsv" : "csv";
    matrix = parseDelimitedText(text, delimiter);
  }

  const firstContent = matrix.findIndex((row) => row.some(Boolean));
  if (firstContent < 0) throw new Error("Het bestand is leeg.");
  const headers = matrix[firstContent].map((header, index) =>
    header || `Kolom ${index + 1}`,
  );
  const rows = matrix
    .slice(firstContent + 1)
    .filter((row) => row.some(Boolean))
    .map((row) => headers.map((_, index) => row[index] ?? ""));
  if (rows.length === 0) throw new Error("Het bestand bevat geen gegevensrijen.");
  return { format, sheetName, headers, rows };
};

const normalizeHeader = (header: string): string =>
  header
    .toLocaleLowerCase("nl-BE")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const exactMappings: Record<string, string> = {
  id: "core:id",
  externalid: "core:id",
  external_id: "core:id",
  sku: "core:sku",
  artikelnummer: "core:sku",
  artikelcode: "core:sku",
  productcode: "core:sku",
  reference: "core:sku",
  referentie: "core:sku",
  ean: "core:barcode",
  ean13: "core:barcode",
  gtin: "core:barcode",
  upc: "core:barcode",
  barcode: "core:barcode",
  name: "core:name",
  naam: "core:name",
  artikelnaam: "core:name",
  productnaam: "core:name",
  title: "core:name",
  omschrijving: "core:name",
  description: "core:name",
  category: "core:category",
  categorie: "core:category",
  productgroep: "core:category",
  brand: "core:brand",
  merk: "core:brand",
  supplier: "core:supplier",
  leverancier: "core:supplier",
  vendor: "core:supplier",
  suppliercode: "core:supplierCode",
  leverancierscode: "core:supplierCode",
  vendorcode: "core:supplierCode",
  variant: "core:variant",
  stock: "core:stockQty",
  voorraad: "core:stockQty",
  qty: "core:stockQty",
  quantity: "core:stockQty",
  voorraadstand: "core:stockQty",
  vat: "core:vatRate",
  btw: "core:vatRate",
  btwpercentage: "core:vatRate",
  cost: "core:costPrice",
  kostprijs: "core:costPrice",
  aankoopprijs: "core:costPrice",
  inkoopprijs: "core:costPrice",
  purchaseprice: "core:costPrice",
  sellingprice: "core:sellingPrice",
  verkoopprijs: "core:sellingPrice",
  winkelprijs: "core:sellingPrice",
  retailprice: "core:sellingPrice",
  standaardprijs: "core:sellingPrice",
};

const compactHeader = (header: string) => normalizeHeader(header).replaceAll(" ", "");

export const inferFieldMapping = (header: string): ImportFieldMapping => {
  const normalized = normalizeHeader(header);
  const compact = compactHeader(header);
  const exact = exactMappings[compact];
  if (exact) return { source: header, target: exact, confidence: 1 };

  if (
    /(niet klant|geen klant|standaard|regular|retail)/.test(normalized) &&
    /(prijs|price|vk)/.test(normalized)
  ) {
    return { source: header, target: "core:sellingPrice", confidence: 0.9 };
  }
  if (
    /(prijs|price|tarief|rate|vk)/.test(normalized) &&
    /(klant|member|b2b|medewerker|employee|contract|promo|vip|wholesale|dealer)/.test(
      normalized,
    )
  ) {
    const group = normalizePriceGroup(
      normalized
        .replace(/prijs|price|tarief|rate|vk|incl|excl|btw|vat/g, " ")
        .trim(),
    );
    return {
      source: header,
      target: `price:${group || "klant"}`,
      confidence: 0.86,
    };
  }
  if (/(voorraad|stock|quantity|qty)/.test(normalized)) {
    return { source: header, target: "core:stockQty", confidence: 0.72 };
  }
  if (/(verkoop|selling|retail).*(prijs|price)/.test(normalized)) {
    return { source: header, target: "core:sellingPrice", confidence: 0.78 };
  }
  if (/(aankoop|inkoop|cost|purchase).*(prijs|price)/.test(normalized)) {
    return { source: header, target: "core:costPrice", confidence: 0.78 };
  }
  return {
    source: header,
    // Unknown columns must be reviewed by a merchant; silently creating a
    // custom field makes imports impossible to reason about or roll back.
    target: "ignore",
    confidence: 0,
  };
};

export const inferMappings = (headers: string[]): ImportFieldMapping[] =>
  headers.map(inferFieldMapping);
