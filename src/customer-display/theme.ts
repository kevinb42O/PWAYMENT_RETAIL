interface RgbColor {
  r: number;
  g: number;
  b: number;
}

const parseHex = (hex: string): RgbColor | null => {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  return {
    r: Number.parseInt(match[1].slice(0, 2), 16),
    g: Number.parseInt(match[1].slice(2, 4), 16),
    b: Number.parseInt(match[1].slice(4, 6), 16),
  };
};

const toHex = ({ r, g, b }: RgbColor): string =>
  `#${[r, g, b]
    .map((value) => Math.round(value).toString(16).padStart(2, "0"))
    .join("")}`;

const channelLuminance = (value: number): number => {
  const normalized = value / 255;
  return normalized <= 0.03928
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
};

const luminance = (color: RgbColor): number =>
  0.2126 * channelLuminance(color.r) +
  0.7152 * channelLuminance(color.g) +
  0.0722 * channelLuminance(color.b);

export const contrastRatio = (foreground: string, background: string): number => {
  const fg = parseHex(foreground);
  const bg = parseHex(background);
  if (!fg || !bg) return 1;
  const lighter = Math.max(luminance(fg), luminance(bg));
  const darker = Math.min(luminance(fg), luminance(bg));
  return (lighter + 0.05) / (darker + 0.05);
};

const mix = (from: RgbColor, to: RgbColor, amount: number): RgbColor => ({
  r: from.r + (to.r - from.r) * amount,
  g: from.g + (to.g - from.g) * amount,
  b: from.b + (to.b - from.b) * amount,
});

export interface AccessibleCustomerDisplayTheme {
  accent: string;
  accentText: string;
  onAccent: "#ffffff" | "#0f172a";
  adjustedForContrast: boolean;
}

export const createAccessibleCustomerDisplayTheme = (
  requestedAccent: string,
): AccessibleCustomerDisplayTheme => {
  const accent = parseHex(requestedAccent) ? requestedAccent.toLowerCase() : "#0891b2";
  const source = parseHex(accent)!;
  let accentText = accent;

  if (contrastRatio(accentText, "#ffffff") < 4.5) {
    const black: RgbColor = { r: 15, g: 23, b: 42 };
    for (let step = 1; step <= 20; step += 1) {
      const candidate = toHex(mix(source, black, step / 20));
      if (contrastRatio(candidate, "#ffffff") >= 4.5) {
        accentText = candidate;
        break;
      }
    }
  }

  const onAccent =
    contrastRatio("#ffffff", accent) >= 4.5 ? "#ffffff" : "#0f172a";
  return {
    accent,
    accentText,
    onAccent,
    adjustedForContrast: accentText !== accent,
  };
};
