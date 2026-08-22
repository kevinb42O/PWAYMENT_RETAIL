import JsBarcode from "jsbarcode";

export interface ReceiptBarcodeRaster {
  /** Number of eight-dot columns in a raster row. */
  widthBytes: number;
  /** Number of rows. */
  height: number;
  /** ESC/POS raster data: black pixel is the most-significant set bit. */
  data: Uint8Array;
}

interface Code128Encoding {
  valid(): boolean;
  encode(): { data: string };
}

type Code128Constructor = new (value: string, options: Record<string, never>) => Code128Encoding;

/**
 * Produces the exact Code 128-C bars used by the on-screen JsBarcode renderer,
 * then turns them into a printer-independent monochrome raster. This avoids
 * printers and USB bridges that discard the native GS k barcode command.
 */
export const receiptBarcodeRaster = (
  value: string,
  moduleWidth = 2,
  height = 96,
  quietZoneModules = 12,
): ReceiptBarcodeRaster => {
  const module = (JsBarcode as unknown as {
    getModule(name: "CODE128C"): Code128Constructor | undefined;
  }).getModule("CODE128C");
  if (!module) throw new Error("Code 128-C encoder is unavailable.");

  const encoder = new module(value, {});
  if (!encoder.valid()) throw new Error("Invalid Code 128-C receipt barcode.");

  const bars = encoder.encode().data;
  const modules = `${"0".repeat(quietZoneModules)}${bars}${"0".repeat(quietZoneModules)}`;
  const pixelWidth = modules.length * moduleWidth;
  const widthBytes = Math.ceil(pixelWidth / 8);
  const data = new Uint8Array(widthBytes * height);

  for (let moduleIndex = 0; moduleIndex < modules.length; moduleIndex += 1) {
    if (modules[moduleIndex] !== "1") continue;
    for (let x = moduleIndex * moduleWidth; x < (moduleIndex + 1) * moduleWidth; x += 1) {
      const byteIndex = Math.floor(x / 8);
      const bit = 0x80 >> (x % 8);
      for (let y = 0; y < height; y += 1) data[y * widthBytes + byteIndex] |= bit;
    }
  }

  return { widthBytes, height, data };
};
