import type { PaceSignalTone } from "./paceSignals";

export const paceTonePalette = (tone: PaceSignalTone) => tone === "attention"
  ? { accent: "#ff6b00", start: "#ffbd18", end: "#f04400", depth: "#8f1f00" }
  : tone === "success"
    ? { accent: "#20e58f", start: "#69f5b2", end: "#00a86b", depth: "#006342" }
    : { accent: "#00d9ff", start: "#08cfff", end: "#1545ff", depth: "#002b9b" };
