import { describe, expect, it } from "vitest";
import type { ParsedImportFile } from "../utils/integrationImport";
import { inferMappings } from "../utils/integrationImport";
import { inferMigrationMappings, mapMigrationRecords } from "./recordMapper";

const catalog: ParsedImportFile = {
  format: "csv",
  headers: ["Artikelcode", "Productnaam", "Categorie", "Verkoopprijs", "BTW", "IMEI"],
  rows: [["TEL-1", "Telefoon X", "Telefoons", "99,00", "21", "356789012345678"]],
};

describe("migration record mapping", () => {
  it("maps a retail catalog, creates its missing category, and retains unmatched source data", () => {
    const result = mapMigrationRecords({
      kind: "catalog",
      parsed: catalog,
      mappings: inferMigrationMappings("catalog", catalog.headers, inferMappings),
      defaultVat: 21,
      existingCategories: [],
    });

    expect(result.issues).toEqual([]);
    expect(result.categories).toMatchObject([{ name: "Telefoons", vatRate: 21 }]);
    expect(result.products).toMatchObject([{
      name: "Telefoon X",
      sku: "TEL-1",
      priceCents: 9900,
      vatRate: 21,
      customFields: { IMEI: "356789012345678" },
    }]);
    expect(result.products[0].category).toBe(result.categories[0].id);
  });

  it("maps customer contacts and rejects records that cannot be identified later", () => {
    const parsed: ParsedImportFile = {
      format: "csv",
      headers: ["Klant-ID", "Naam", "E-mail", "Telefoon", "Segment"],
      rows: [
        ["C-1", "Sofie Janssens", "sofie@example.be", "+32470123456", "Telenet klant"],
        ["", "Onbekend", "", "", "B2B"],
      ],
    };
    const result = mapMigrationRecords({
      kind: "customers",
      parsed,
      mappings: inferMigrationMappings("customers", parsed.headers, inferMappings),
      defaultVat: 21,
      existingCategories: [],
    });

    expect(result.customers).toMatchObject([{ name: "Sofie Janssens", priceGroup: "telenet-klant" }]);
    expect(result.issues).toEqual([{ row: 3, message: expect.stringContaining("extern klant-ID, e-mail of telefoon") }]);
  });
});
