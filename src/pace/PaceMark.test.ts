import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PaceMark, PACE_THINKING_GLYPH_SEQUENCE, resolvePaceGlyph, resolvePaceMotion } from "./PaceMark";
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

  it("exposes semantic choreography for inspection and assistive state labelling", () => {
    const markup = renderToStaticMarkup(createElement(PaceMark, {
      emotion: "thinking",
      pose: "gather",
      energy: "medium",
      stateLabel: "toegestane gegevens worden opgehaald",
    }));

    expect(markup).toContain('data-pace-pose="gather"');
    expect(markup).toContain('data-pace-energy="medium"');
    expect(markup).toContain('aria-label="Pace · toegestane gegevens worden opgehaald"');
    expect(markup).toContain("pace-source-node-a");
    expect(markup).toContain("pace-shield-trace");
  });

  it("does not let the legacy punctuation morph mask semantic work poses", () => {
    const focus = renderToStaticMarkup(createElement(PaceMark, {
      emotion: "thinking",
      pose: "focus",
      energy: "medium",
      motionMode: "full",
      forceMotion: true,
    }));
    const gather = renderToStaticMarkup(createElement(PaceMark, {
      emotion: "thinking",
      pose: "gather",
      energy: "medium",
      motionMode: "full",
      forceMotion: true,
    }));

    expect(focus).not.toContain("is-pondering");
    expect(gather).not.toContain("is-pondering");
    expect(focus).not.toContain(PACE_MORPH_BODY.question);
    expect(focus).not.toContain(PACE_MORPH_BODY.liquid);
    expect(focus).toContain('data-pace-pose="focus"');
    expect(gather).toContain('data-pace-pose="gather"');
  });
});
