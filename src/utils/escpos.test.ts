import { describe, expect, it } from "vitest";
import { EscPosBuilder } from "./escpos";

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
});
