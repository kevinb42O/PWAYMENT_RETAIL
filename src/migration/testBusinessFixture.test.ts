import { describe, expect, it } from "vitest";
import { inferMappings } from "../utils/integrationImport";
import { inferMigrationMappings, mapMigrationRecords } from "./recordMapper";
import { multiYearTelecomRetailFixture } from "./testBusinessFixture";

describe("multi-year telecom retail test fixture", () => {
  it("loads a substantial, fully mappable fictional business", () => {
    const fixture = multiYearTelecomRetailFixture();
    const catalog = mapMigrationRecords({
      kind: "catalog",
      parsed: fixture.catalog,
      mappings: inferMigrationMappings("catalog", fixture.catalog.headers, inferMappings),
      defaultVat: 21,
      existingCategories: [],
    });
    const customers = mapMigrationRecords({
      kind: "customers",
      parsed: fixture.customers,
      mappings: inferMigrationMappings("customers", fixture.customers.headers, inferMappings),
      defaultVat: 21,
      existingCategories: [],
    });

    expect(catalog.issues).toEqual([]);
    expect(customers.issues).toEqual([]);
    expect(catalog.products).toHaveLength(213);
    // The importer must retain the source taxonomy, not collapse every
    // subcategory into a display-only string. This fixture has six roots and
    // ten children (one child is used by each product family).
    expect(catalog.categories).toHaveLength(16);
    expect(catalog.categories.filter((category) => !category.parentId)).toHaveLength(6);
    expect(catalog.categories.filter((category) => category.parentId)).toHaveLength(10);
    expect(catalog.categories.every((category) => !category.parentId
      || catalog.categories.some((parent) => parent.id === category.parentId))).toBe(true);
    expect(catalog.products.some((product) => product.subCategory === "Android toestellen")).toBe(true);
    expect(customers.customers).toHaveLength(240);
    expect(catalog.products.some((product) => product.priceTiers?.["telenet-klant"] != null)).toBe(true);
    expect(catalog.products.some((product) => product.customFields?.["IMEI patroon"])).toBe(true);
  });
});
