import { describe, expect, it } from "vitest";
import { PACE_THINKING_GLYPH_SEQUENCE, resolvePaceGlyph, resolvePaceMotion } from "./PaceMark";
import { paceTonePalette } from "./pacePalette";
import { PACE_MORPH_BODY, PACE_MORPH_DOT } from "./paceMorphPaths";

const commandSignature = (path: string) => path.match(/[a-z]/gi)?.join("") ?? "";

describe("Pace motion resolution", () => {
  it("morphs through both the question and liquid silhouettes while thinking", () => {
    expect(PACE_THINKING_GLYPH_SEQUENCE).toContain("question");
    expect(PACE_THINKING_GLYPH_SEQUENCE).toContain("liquid");
    expect(PACE_THINKING_GLYPH_SEQUENCE.at(0)).toBe("pace");
    expect(PACE_THINKING_GLYPH_SEQUENCE.at(-1)).toBe("pace");
  });

  it("respects automatic reduced-motion and disabled preferences", () => {
    expect(resolvePaceMotion({ reducedMotion: true, motionMode: "full" })).toEqual({ canMove: false, fullMotion: false });
    expect(resolvePaceMotion({ reducedMotion: false, motionMode: "off" })).toEqual({ canMove: false, fullMotion: false });
  });

  it("allows an explicit one-shot Motion Lab preview", () => {
    expect(resolvePaceMotion({ reducedMotion: true, motionMode: "off", forceMotion: true })).toEqual({ canMove: true, fullMotion: true });
  });

  it("uses a red-orange body palette for attention and offline states", () => {
    expect(paceTonePalette("attention")).toEqual({ accent: "#ff6b00", start: "#ffbd18", end: "#f04400", depth: "#8f1f00" });
  });

  it("keeps every Pace silhouette topologically compatible for real path morphing", () => {
    const bodies = Object.values(PACE_MORPH_BODY);
    const dots = Object.values(PACE_MORPH_DOT);

    expect(new Set(bodies.map(commandSignature))).toEqual(new Set([commandSignature(PACE_MORPH_BODY.pace)]));
    expect(new Set(dots.map(commandSignature))).toEqual(new Set([commandSignature(PACE_MORPH_DOT.pace)]));
    expect(commandSignature(PACE_MORPH_BODY.pace)).toBe("MCCCCCCCCCCCCCCCZ");
    expect(commandSignature(PACE_MORPH_DOT.pace)).toBe("MCCCCZ");
  });

  it("uses punctuation as operational body language", () => {
    expect(resolvePaceGlyph({ state: "thinking", tone: "flow", active: true })).toBe("question");
    expect(resolvePaceGlyph({ state: "attentive", tone: "attention", active: true })).toBe("exclamation");
    expect(resolvePaceGlyph({ state: "idle", tone: "attention", active: false })).toBe("pace");
    expect(resolvePaceGlyph({ state: "thinking", tone: "attention", active: true, performance: "liquid" })).toBe("liquid");
    expect(resolvePaceGlyph({ state: "thinking", tone: "attention", active: true, expressive: false })).toBe("pace");
  });
});
