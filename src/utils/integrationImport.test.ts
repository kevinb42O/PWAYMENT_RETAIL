import { describe, expect, it } from "vitest";
import {
  inferFieldMapping,
  inferMappings,
  parseDelimitedText,
  parseImportFile,
} from "./integrationImport";

describe("integration import", () => {
  it("parses Belgian CSV with quoted delimiters and line breaks", () => {
    expect(
      parseDelimitedText('Artikel;Prijs;Notitie\r\nA1;"12,50";"regel 1\nregel 2"', ";"),
    ).toEqual([
      ["Artikel", "Prijs", "Notitie"],
      ["A1", "12,50", "regel 1\nregel 2"],
    ]);
  });

  it("recognizes a Telenet customer price as a dynamic price group", () => {
    expect(inferFieldMapping("Prijs Telenet klant").target).toBe(
      "price:telenet-klant",
    );
  });

  it("leaves unknown columns unmapped until a merchant reviews them", () => {
    expect(inferFieldMapping("Framemaat").target).toBe("ignore");
  });

  it("detects delimiters, escaped quotes, exact business fields and common price variants", () => {
    expect(parseDelimitedText('SKU,Naam\nA1,"Deck ""Pro"""')).toEqual([
      ["SKU", "Naam"],
      ["A1", 'Deck "Pro"'],
    ]);
    expect(inferFieldMapping("Artikelnummer")).toMatchObject({ target: "core:sku", confidence: 1 });
    expect(inferFieldMapping("Voorraad magazijn")).toMatchObject({ target: "core:stockQty", confidence: 0.72 });
    expect(inferFieldMapping("Regular prijs")).toMatchObject({ target: "core:sellingPrice", confidence: 0.9 });
    expect(inferFieldMapping("Aankoop prijs")).toMatchObject({ target: "core:costPrice", confidence: 1 });
    expect(inferMappings(["Naam", "Merk"]).map((mapping) => mapping.target)).toEqual([
      "core:name", "core:brand",
    ]);
  });

  it("normalizes CSV and JSON files into headers and non-empty rows", async () => {
    const fixtureFile = (name: string, type: string, text: string) =>
      ({ name, type, text: async () => text }) as File;
    const csv = fixtureFile("catalogus.csv", "text/csv", "\uFEFFNaam;Prijs\nDeck;12,50\n");
    await expect(parseImportFile(csv)).resolves.toEqual({
      format: "csv",
      headers: ["Naam", "Prijs"],
      rows: [["Deck", "12,50"]],
    });

    const json = fixtureFile(
      "catalogus.json",
      "application/json",
      JSON.stringify({ products: [{ naam: "Deck", enabled: true }, { naam: "Truck", createdAt: "2026-08-14" }] }),
    );
    const parsed = await parseImportFile(json);
    expect(parsed).toMatchObject({ format: "json", headers: ["naam", "enabled", "createdAt"] });
    expect(parsed.rows).toEqual([["Deck", "true", ""], ["Truck", "", "2026-08-14"]]);

    await expect(parseImportFile(fixtureFile("leeg.csv", "text/csv", "Naam\n"))).rejects.toThrow("geen gegevensrijen");
  });
});
