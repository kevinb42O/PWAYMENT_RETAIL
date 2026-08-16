/**
 * escpos.ts — Pure ESC/POS raw-byte builder for Epson TM-series thermal printers.
 *
 * This module is 100% browser-safe: it relies only on standard Web APIs
 * (Uint8Array) and produces raw byte sequences that are sent directly to the
 * printer via WebUSB `transferOut()`.
 *
 * References:
 *   • Epson ESC/POS Command Reference (epson.com/en_US/receipt-printers)
 *   • TM-T20II Technical Reference Guide (Rev. 1.05)
 *
 * Character encoding note:
 *   TextEncoder always produces UTF-8. Thermal printers operate on single-byte
 *   code pages. We select code page 19 (PC858) which has the Euro sign at
 *   byte 0xD5. All 7-bit ASCII chars (≤0x7E) are identical in every code page.
 */

// ---------------------------------------------------------------------------
// Primitive byte constants
// ---------------------------------------------------------------------------

/** ESC — prefixes most ESC/POS control sequences. */
const ESC = 0x1b;
/** GS — prefixes cut, barcode, and size commands. */
const GS = 0x1d;
/** LF — advances paper one line and executes the current print buffer. */
const LF = 0x0a;
/** NUL — parameter filler. */
const NUL = 0x00;

// ---------------------------------------------------------------------------
// EscPosBuilder — fluent byte-stream builder
// ---------------------------------------------------------------------------

/**
 * Fluent, chainable ESC/POS byte-stream builder.
 *
 * @example
 * ```ts
 * const bytes = new EscPosBuilder()
 *   .init()
 *   .codePage(19)        // PC858 — has € at 0xD5
 *   .alignCenter()
 *   .bold(true).doubleSize()
 *   .text('MY SHOP\n')
 *   .bold(false).normalSize()
 *   .alignLeft()
 *   .text('Item 1        € 3,50\n')
 *   .feedLines(4)
 *   .cut()
 *   .build();
 * ```
 */
export class EscPosBuilder {
  private readonly buf: number[] = [];

  // ── Internal helpers ────────────────────────────────────────────────────

  private push(...bytes: number[]): this {
    this.buf.push(...bytes);
    return this;
  }

  /**
   * Encode a JS string to single-byte Latin-1/PC858 bytes.
   *
   * Why not TextEncoder?  TextEncoder produces UTF-8 multi-byte sequences
   * for non-ASCII characters, which thermal printers misinterpret because
   * they use single-byte code pages.  We map only printable characters:
   *   - 0x20–0x7E  → identical in every code page (safe 7-bit ASCII)
   *   - '€' (U+20AC) → 0xD5 in PC858 (code page 19)
   *   - Western-European accents → explicit PC858 byte mapping
   *   - Everything else → '?' replacement
   */
  private encodeText(text: string): number[] {
    const pc858 = new Map<number, number>([
      [0x00c7, 0x80],
      [0x00fc, 0x81],
      [0x00e9, 0x82],
      [0x00e2, 0x83],
      [0x00e4, 0x84],
      [0x00e0, 0x85],
      [0x00e5, 0x86],
      [0x00e7, 0x87],
      [0x00ea, 0x88],
      [0x00eb, 0x89],
      [0x00e8, 0x8a],
      [0x00ef, 0x8b],
      [0x00ee, 0x8c],
      [0x00ec, 0x8d],
      [0x00c4, 0x8e],
      [0x00c5, 0x8f],
      [0x00c9, 0x90],
      [0x00f4, 0x93],
      [0x00f6, 0x94],
      [0x00f2, 0x95],
      [0x00fb, 0x96],
      [0x00f9, 0x97],
      [0x00ff, 0x98],
      [0x00d6, 0x99],
      [0x00dc, 0x9a],
      [0x00e1, 0xa0],
      [0x00ed, 0xa1],
      [0x00f3, 0xa2],
      [0x00fa, 0xa3],
      [0x00f1, 0xa4],
      [0x00d1, 0xa5],
      [0x00a1, 0xad],
      [0x00ab, 0xae],
      [0x00bb, 0xaf],
      [0x00b7, 0xfa],
    ]);
    const bytes: number[] = [];
    for (let i = 0; i < text.length; i++) {
      const cp = text.codePointAt(i) ?? 0x3f;
      // Skip low surrogate of a surrogate pair
      if (cp > 0xffff) {
        i++;
      }
      if (cp === 0x20ac) {
        bytes.push(0xd5); // € in PC858
      } else if (cp === 0x0a) {
        bytes.push(LF); // newline → LF
      } else if (cp <= 0x7e) {
        bytes.push(cp); // printable ASCII — safe in any code page
      } else if (pc858.has(cp)) {
        bytes.push(pc858.get(cp)!);
      } else if (cp === 0x2018 || cp === 0x2019) {
        bytes.push(0x27); // typographic apostrophe → ASCII apostrophe
      } else if (cp === 0x2013 || cp === 0x2014) {
        bytes.push(0x2d); // en/em dash → ASCII hyphen
      } else if (cp === 0x2022) {
        bytes.push(0x2a); // bullet → ASCII asterisk
      } else {
        bytes.push(0x3f); // unsupported → '?'
      }
    }
    return bytes;
  }

  // ── ESC/POS commands ───────────────────────────────────────────────────

  /**
   * ESC @ — Initialize printer.
   * Clears the print buffer and resets all modes to factory defaults.
   * ⚠️  ALWAYS call this first to guarantee a predictable start state.
   */
  init(): this {
    return this.push(ESC, 0x40);
  }

  /**
   * ESC t n — Select character code table (code page).
   *
   * Recommended values for TM-T20II:
   *   0  = PC437  (USA, Standard Europe) — factory default, no €
   *   2  = PC850  (Multilingual, no €)
   *   16 = WPC1252 (Windows Western European, € at 0x80)
   *   19 = PC858  — ✅ RECOMMENDED: PC850 variant with € sign at 0xD5
   *
   * @param page  Code-page number 0–255 (printer-model dependent)
   */
  codePage(page: number): this {
    return this.push(ESC, 0x74, page & 0xff);
  }

  /**
   * ESC a n — Select justification (alignment).
   *   0 = left (default)
   *   1 = center
   *   2 = right
   */
  align(n: 0 | 1 | 2): this {
    return this.push(ESC, 0x61, n);
  }

  alignLeft(): this {
    return this.align(0);
  }
  alignCenter(): this {
    return this.align(1);
  }
  alignRight(): this {
    return this.align(2);
  }

  /**
   * ESC E n — Turn emphasis (bold) on/off.
   */
  bold(on: boolean): this {
    return this.push(ESC, 0x45, on ? 1 : 0);
  }

  /**
   * ESC - n — Turn underline on/off.
   *   0 = off, 1 = 1-dot thick, 2 = 2-dot thick
   */
  underline(n: 0 | 1 | 2): this {
    return this.push(ESC, 0x2d, n);
  }

  /**
   * GS ! n — Select character size multiplier.
   *
   * Byte `n` bit layout:
   *   bits 0–2: width  multiplier (0=×1, 1=×2 … 7=×8)
   *   bits 4–6: height multiplier (0=×1, 1=×2 … 7=×8)
   *
   * Common values:
   *   0x00 = normal  (×1 × ×1)
   *   0x01 = double height only  (×1 × ×2)
   *   0x10 = double width only   (×2 × ×1)
   *   0x11 = double size         (×2 × ×2) — good for shop name header
   */
  charSize(n: number): this {
    return this.push(GS, 0x21, n & 0xff);
  }

  normalSize(): this {
    return this.charSize(0x00);
  }
  doubleSize(): this {
    return this.charSize(0x11);
  }
  doubleHeight(): this {
    return this.charSize(0x01);
  }
  doubleWidth(): this {
    return this.charSize(0x10);
  }

  /**
   * Append a text string, encoding to single-byte code-page bytes.
   * Use '\n' within the string to trigger line execution (LF).
   */
  text(s: string): this {
    this.buf.push(...this.encodeText(s));
    return this;
  }

  /**
   * Append a single LF — executes and feeds one line.
   */
  lf(): this {
    return this.push(LF);
  }

  /**
   * ESC d n — Print and feed n lines.
   * Preferred over repeated LF for consistent inter-section spacing.
   */
  feedLines(n: number): this {
    return this.push(ESC, 0x64, Math.min(n, 255));
  }

  /**
   * Append a horizontal separator composed of repeated ASCII characters.
   * @param char       Character to repeat (default '-')
   * @param lineWidth  Characters per line (42 for 80mm, 32 for 58mm)
   */
  separator(char = "-", lineWidth = 42): this {
    return this.text(char.repeat(lineWidth) + "\n");
  }

  /**
   * GS V m n — Execute paper cut.
   *
   * @param full
   *   false (default) → partial cut (0x41) — recommended for TM-T20II.
   *     Leaves a small paper bridge; receipt stays attached until torn.
   *   true            → full cut    (0x42) — severs completely.
   *
   * The second parameter `n` (= 0x00) means "feed 0 extra lines before cut".
   * Increase feedLines() before cut() if you need extra whitespace.
   */
  cut(full = false): this {
    const mode = full ? 0x42 : 0x41;
    return this.push(GS, 0x56, mode, NUL);
  }

  /** GS k (Function B), CODE128 subset C: compact numeric receipt code. */
  code128C(digits: string): this {
    if (!/^\d{2,}$/.test(digits) || digits.length % 2 !== 0) {
      throw new Error("CODE128-C requires an even numeric value.");
    }
    const data = this.encodeText(`{C${digits}`);
    return this.push(GS, 0x6b, 73, data.length, ...data);
  }

  /**
   * Push raw bytes verbatim — escape hatch for commands not covered above.
   */
  raw(...bytes: number[]): this {
    return this.push(...bytes);
  }

  /**
   * Build and return the final immutable Uint8Array.
   * Call this once at the end of your chain; the builder instance is reusable.
   */
  build(): Uint8Array {
    return new Uint8Array(this.buf);
  }
}

// ---------------------------------------------------------------------------
// Layout helper functions (pure, stateless)
// ---------------------------------------------------------------------------

/**
 * Format a line-item row as fixed-width monospace text.
 *
 * Layout:  `QTYx NAME.............PRICE\n`
 * Total width = `lineWidth` characters.
 *
 * @param qty        Numeric quantity
 * @param name       Product name (truncated with '…' if too long)
 * @param priceStr   Pre-formatted price string (e.g. "€ 3,50")
 * @param lineWidth  CPL (chars per line): 42 for 80mm, 32 for 58mm
 */
export function formatItemLine(
  qty: number,
  name: string,
  priceStr: string,
  lineWidth = 42,
): string {
  const qtyStr = `${qty}x `;
  const rightWidth = priceStr.length;
  const maxNameWidth = lineWidth - qtyStr.length - rightWidth - 1;
  const displayName =
    name.length > maxNameWidth ? name.slice(0, maxNameWidth - 1) + ">" : name;
  const padding = lineWidth - qtyStr.length - displayName.length - rightWidth;
  return `${qtyStr}${displayName}${" ".repeat(Math.max(1, padding))}${priceStr}\n`;
}

/**
 * Format a key-value summary row (totals, VAT, payment…).
 *
 * Layout:  `KEY.....................VALUE\n`
 *
 * @param key        Left-aligned label (e.g. "TOTAAL")
 * @param value      Right-aligned value (e.g. "€ 12,50")
 * @param lineWidth  CPL (default 42)
 */
export function formatTotalLine(
  key: string,
  value: string,
  lineWidth = 42,
): string {
  const padding = lineWidth - key.length - value.length;
  return `${key}${" ".repeat(Math.max(1, padding))}${value}\n`;
}
