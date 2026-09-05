import type { PaceSignalTone } from "./paceSignals";

export const paceTonePalette = (tone: PaceSignalTone) => tone === "attention"
  ? { accent: "#ff6b00", start: "#ffbd18", end: "#f04400", depth: "#8f1f00" }
  : { accent: "#0088ff", start: "#00f0ff", end: "#0055ff", depth: "#003399" };
