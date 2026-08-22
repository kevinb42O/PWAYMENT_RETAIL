import { describe, expect, it } from "vitest";
import type { ParsedImportFile } from "../utils/integrationImport";
import { inferMappings } from "../utils/integrationImport";
import { findProductByScanCode } from "../utils/productLookup";
import { inferMigrationMappings, mapMigrationRecords } from "./recordMapper";

const catalog: ParsedImportFile = {
  format: "csv",
  headers: ["Artikelcode", "Productnaam", "Categorie", "Subcategorie", "Verkoopprijs", "BTW", "IMEI"],
  rows: [["TEL-1", "Telefoon X", "Telefoons", "Android", "99,00", "21", "356789012345678"]],
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
    expect(result.categories).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "Telefoons", vatRate: 21 }),
    ]));
    expect(result.products).toMatchObject([{
      name: "Telefoon X",
      sku: "TEL-1",
      subCategory: "Android",
      priceCents: 9900,
      vatRate: 21,
      customFields: { IMEI: "356789012345678" },
    }]);
    expect(result.products[0].category).toBe(
      result.categories.find((category) => category.name === "Android")?.id,
    );
  });

  it("makes an explicitly mapped subcategory a child category instead of a flat product label", () => {
    const result = mapMigrationRecords({
      kind: "catalog",
      parsed: catalog,
      mappings: inferMigrationMappings("catalog", catalog.headers, inferMappings),
      defaultVat: 21,
      existingCategories: [],
    });

    const root = result.categories.find((category) => category.name === "Telefoons");
    const child = result.categories.find((category) => category.name === "Android");
    expect(child).toMatchObject({ parentId: root?.id });
    expect(result.products[0].category).toBe(child?.id);
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

  it("keeps an explicit variant matrix and a second EAN as relational retail data", () => {
    const parsed: ParsedImportFile = {
      format: "csv",
      headers: ["SKU", "Productnaam", "Categorie", "Verkoopprijs", "Maat", "Kleur", "EAN 2"],
      rows: [
        ["TEE-S-BLU", "T-shirt", "Kleding", "19,95", "S", "Blauw", "5410000000011"],
        ["TEE-M-BLU", "T-shirt", "Kleding", "19,95", "M", "Blauw", "5410000000012"],
      ],
    };
    const result = mapMigrationRecords({
      kind: "catalog",
      parsed,
      mappings: inferMigrationMappings("catalog", parsed.headers, inferMappings),
      defaultVat: 21,
      existingCategories: [],
    });

    expect(result.issues).toEqual([]);
    expect(result.catalogFamilies).toHaveLength(1);
    expect(result.catalogFamilies[0]).toMatchObject({
      name: "T-shirt",
      variants: [
        { options: [{ name: "Maat", value: "S" }, { name: "Kleur", value: "Blauw" }] },
        { options: [{ name: "Maat", value: "M" }, { name: "Kleur", value: "Blauw" }] },
      ],
    });
    expect(result.catalogFamilies[0].variants[0].identifiers).toContainEqual({
      identifierType: "ean",
      identifierValue: "5410000000011",
      isScannable: true,
      isPrimary: false,
    });
    expect(result.products[0]).toMatchObject({
      variantOptions: { Maat: "S", Kleur: "Blauw" },
      identifiers: expect.arrayContaining([
        expect.objectContaining({ type: "ean", value: "5410000000011", isScannable: true }),
      ]),
    });
    expect(findProductByScanCode(result.products, "5410000000011")).toMatchObject({
      product: { id: result.products[0].id },
      matchedOn: "identifier",
    });
  });

  it("accepts distinct option tuples even when a source has not assigned SKU or EAN yet", () => {
    const parsed: ParsedImportFile = {
      format: "csv",
      headers: ["Productnaam", "Categorie", "Verkoopprijs", "Maat"],
      rows: [["T-shirt", "Kleding", "19,95", "S"], ["T-shirt", "Kleding", "19,95", "M"]],
    };
    const result = mapMigrationRecords({
      kind: "catalog",
      parsed,
      mappings: inferMigrationMappings("catalog", parsed.headers, inferMappings),
      defaultVat: 21,
      existingCategories: [],
    });

    expect(result.issues).toEqual([]);
    expect(result.products.map((product) => product.variant)).toEqual(["Maat: S", "Maat: M"]);
    expect(result.catalogFamilies).toHaveLength(1);
  });
});
