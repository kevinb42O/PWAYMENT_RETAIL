import type { InventoryAdjustmentReason, Product } from "../types";
import type { InventoryOperationMode } from "../services/inventoryOperations";
import { findProductByScanCode } from "./productLookup";

export interface InventoryCsvLine {
  productId: string;
  expectedStockQty: number;
  quantity: number;
  reason?: InventoryAdjustmentReason;
  note?: string;
}

export interface InventoryCsvIssue { line: number; message: string }

const cells = (line: string, delimiter: string) => line.split(delimiter).map((cell) => cell.trim().replace(/^"|"$/g, ""));

export const parseInventoryCsv = (
  text: string,
  products: Product[],
  mode: InventoryOperationMode,
  correctionReason: InventoryAdjustmentReason = "other",
): { lines: InventoryCsvLine[]; issues: InventoryCsvIssue[] } => {
  const raw = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (raw.length === 0) return { lines: [], issues: [{ line: 1, message: "Het bestand is leeg." }] };
  const delimiter = raw[0].includes(";") ? ";" : ",";
  const header = cells(raw[0], delimiter).map((value) => value.toLowerCase());
  const codeIndex = header.findIndex((value) => ["sku", "barcode", "code", "productcode"].includes(value));
  const quantityIndex = header.findIndex((value) => ["quantity", "aantal", "voorraad", "stockqty"].includes(value));
  const noteIndex = header.findIndex((value) => ["note", "notitie", "reden"].includes(value));
  if (codeIndex < 0 || quantityIndex < 0) {
    return { lines: [], issues: [{ line: 1, message: "Gebruik kolommen sku (of barcode) en aantal." }] };
  }
  const issues: InventoryCsvIssue[] = [];
  const result: InventoryCsvLine[] = [];
  const seen = new Set<string>();
  raw.slice(1).forEach((row, index) => {
    const lineNumber = index + 2;
    const values = cells(row, delimiter);
    const code = values[codeIndex] ?? "";
    const quantity = Number(values[quantityIndex]);
    const match = findProductByScanCode(products, code);
    if (!match || match.product.stockQty == null) {
      issues.push({ line: lineNumber, message: `${code || "Lege code"}: geen voorraadproduct gevonden.` });
      return;
    }
    if (seen.has(match.product.id)) {
      issues.push({ line: lineNumber, message: `${code}: product staat dubbel in het bestand.` });
      return;
    }
    if (!Number.isSafeInteger(quantity) || (mode === "delivery" && quantity <= 0) || (mode === "count" && quantity < 0) || (mode === "correction" && quantity === 0)) {
      issues.push({ line: lineNumber, message: `${code}: ongeldig geheel aantal voor ${mode}.` });
      return;
    }
    const note = noteIndex >= 0 ? values[noteIndex]?.trim() : undefined;
    if (mode === "correction" && correctionReason === "other" && !note) {
      issues.push({ line: lineNumber, message: `${code}: een notitie is verplicht bij Andere reden.` });
      return;
    }
    if (mode === "correction" && match.product.stockQty + quantity < 0) {
      issues.push({ line: lineNumber, message: `${code}: correctie zou voorraad onder nul brengen.` });
      return;
    }
    seen.add(match.product.id);
    result.push({
      productId: match.product.id,
      expectedStockQty: match.product.stockQty,
      quantity,
      reason: mode === "correction" ? correctionReason : undefined,
      note: note || undefined,
    });
  });
  return issues.length > 0 ? { lines: [], issues } : { lines: result, issues: [] };
};

export const inventoryCsvTemplate = () => "sku;aantal;notitie\nSKU-001;5;optionele toelichting\n";
