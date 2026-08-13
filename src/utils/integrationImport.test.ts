import { describe, expect, it } from "vitest";
import { inferFieldMapping, parseDelimitedText } from "./integrationImport";

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

  it("preserves unknown columns as custom fields", () => {
    expect(inferFieldMapping("Framemaat").target).toBe("custom:framemaat");
  });
});
