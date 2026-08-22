import { describe, expect, it } from "vitest";
import { EscPosBuilder, formatItemLine, formatTotalLine, formatWrappedItemLines } from "./escpos";

describe("EscPosBuilder PC858 encoding", () => {
  it("encodes Belgian receipt accents and the euro sign as single bytes", () => {
    const bytes = new EscPosBuilder().codePage(19).text("Café · één €").build();

    expect([...bytes]).toEqual([
      0x1b, 0x74, 19, 0x43, 0x61, 0x66, 0x82, 0x20, 0xfa, 0x20, 0x82, 0x82,
      0x6e, 0x20, 0xd5,
    ]);
  });

  it("replaces unsupported characters without leaking UTF-8 byte sequences", () => {
    expect([...new EscPosBuilder().text("Skate 🛹").build()]).toEqual([
      0x53, 0x6b, 0x61, 0x74, 0x65, 0x20, 0x3f,
    ]);
  });

  it("emits every standard formatting command with bounded feed and cut modes", () => {
    const bytes = new EscPosBuilder()
      .init()
      .alignLeft().alignCenter().alignRight()
      .bold(true).bold(false)
      .underline(1).underline(2).underline(0)
      .normalSize().doubleSize().doubleHeight().doubleWidth()
      .lf()
      .feedLines(999)
      .separator("=", 3)
      .raw(0xaa, 0xbb)
      .cut().cut(true)
      .build();

    expect([...bytes]).toEqual(expect.arrayContaining([
      0x1b, 0x40, 0x1b, 0x61, 0, 0x1b, 0x61, 1, 0x1b, 0x61, 2,
      0x1b, 0x45, 1, 0x1b, 0x45, 0, 0x1b, 0x2d, 1, 0x1d, 0x21, 0x11,
      0x1b, 0x64, 255, 0xaa, 0xbb, 0x1d, 0x56, 0x41, 0, 0x1d, 0x56, 0x42, 0,
    ]));
  });

  it("emits a complete, explicitly sized Code 128-C barcode command", () => {
    const bytes = new EscPosBuilder()
      .barcodeWidth(3)
      .barcodeHeight(96)
      .barcodeHriPosition(0)
      .code128C("91123456789012345671")
      .build();

    expect([...bytes.slice(0, 9)]).toEqual([
      0x1d, 0x77, 3,
      0x1d, 0x68, 96,
      0x1d, 0x48, 0,
    ]);
    expect([...bytes.slice(9, 14)]).toEqual([0x1d, 0x6b, 73, 22, 0x7b]);
    expect(String.fromCharCode(...bytes.slice(-21))).toBe("C91123456789012345671");
  });

  it("emits a GS v 0 raster image with its dimensions and all image bytes", () => {
    const bytes = new EscPosBuilder().rasterImage(2, 3, new Uint8Array([0x80, 0, 0x40, 0, 0x20, 0])).build();
    expect([...bytes]).toEqual([
      0x1d, 0x76, 0x30, 0,
      2, 0, 3, 0,
      0x80, 0, 0x40, 0, 0x20, 0,
    ]);
  });

  it("keeps narrow receipt rows readable even when names or totals exceed the width", () => {
    expect(formatItemLine(2, "Een heel lange productnaam", "€ 12,50", 18)).toMatch(/^2x .*€ 12,50\n$/);
    expect(formatItemLine(1, "Deck", "€ 123456789", 8)).toContain("€ 123456789");
    expect(formatTotalLine("TOTAAL", "€ 12,50", 20)).toHaveLength(21);
    expect(formatTotalLine("TE LANGE SLEUTEL", "€ 12,50", 8)).toContain("€ 12,50");
  });

  it("wraps a long product description without losing any words", () => {
    const lines = formatWrappedItemLines(
      2,
      "Professioneel skateboard deck met extra lange productomschrijving",
      "€ 129,95",
      32,
    );

    expect(lines[0]).toContain("2x ");
    expect(lines[0]).toContain("€ 129,95");
    expect(lines.join("").replace(/\s/g, "")).toContain("extralangeproductomschrijving");
    expect(lines.every((line) => line.trimEnd().length <= 32)).toBe(true);
  });
});
