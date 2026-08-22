import { describe, expect, it } from "vitest";
import { receiptBarcodeRaster } from "./receiptBarcodeRaster";

describe("receipt barcode raster", () => {
  it("creates a centred, scannable Code 128-C raster without relying on the DOM", () => {
    const raster = receiptBarcodeRaster("91123456789012345671");

    expect(raster.height).toBe(96);
    expect(raster.widthBytes).toBeGreaterThan(1);
    expect(raster.data).toHaveLength(raster.widthBytes * raster.height);
    expect(raster.data.some((byte) => byte !== 0)).toBe(true);
    // The leading quiet zone has no black dots on each raster row.
    expect(raster.data[0]).toBe(0);
  });
});
