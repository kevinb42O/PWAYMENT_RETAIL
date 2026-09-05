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

  it("keeps the Pace character blue after a successful action", () => {
    expect(paceTonePalette("success")).toEqual(paceTonePalette("flow"));
    expect(paceTonePalette("success")).toEqual({ accent: "#0088ff", start: "#00f0ff", end: "#0055ff", depth: "#003399" });
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

  it("has no icon frame and keeps all motion off for still energy", () => {
    const markup = renderToStaticMarkup(createElement(PaceMark, {
      emotion: "thinking", pose: "gather", energy: "still", motionMode: "full",
    }));
    expect(markup).not.toContain("pace-mark-shell");
    expect(markup).toContain('data-motion="off"');
    expect(markup).not.toContain("<animate");
  });

  it("morphs during real work while preserving its semantic pose and truthful label", () => {
    const focus = renderToStaticMarkup(createElement(PaceMark, {
      emotion: "thinking",
      pose: "focus",
      energy: "medium",
      motionMode: "full",
      stateLabel: "antwoord wordt samengesteld",
    }));
    const gather = renderToStaticMarkup(createElement(PaceMark, {
      emotion: "thinking",
      pose: "gather",
      energy: "medium",
      motionMode: "full",
      stateLabel: "toegestane gegevens worden opgehaald",
    }));

    expect(focus).toContain("is-pondering");
    expect(gather).toContain("is-pondering");
    expect(focus).toContain(PACE_MORPH_BODY.question);
    expect(focus).toContain(PACE_MORPH_BODY.liquid);
    expect(focus).toContain('calcMode="spline"');
    expect(focus).toContain('repeatCount="indefinite"');
    expect(focus).toContain('data-pace-pose="focus"');
    expect(gather).toContain('data-pace-pose="gather"');
    expect(focus).toContain('aria-label="Pace · antwoord wordt samengesteld"');
    expect(gather).toContain('aria-label="Pace · toegestane gegevens worden opgehaald"');
  });

  it("welcomes and settles with a one-shot liquid morph that returns to the ribbon", () => {
    for (const props of [
      { tone: "flow" as const, pose: "focus" as const },
      { tone: "success" as const, pose: "settle" as const },
    ]) {
      const markup = renderToStaticMarkup(createElement(PaceMark, { ...props, active: true, emotion: "attentive", motionMode: "full" }));
      expect(markup).toContain("is-performing");
      expect(markup).toContain(PACE_MORPH_BODY.liquid);
      expect(markup).toContain(`${PACE_MORPH_BODY.liquid};${PACE_MORPH_BODY.pace}`);
      expect(markup).toContain('repeatCount="1"');
      expect(markup).not.toContain('repeatCount="indefinite"');
    }
  });

  it("does not run expressive loops with subtle, disabled or non-expressive preferences", () => {
    for (const props of [
      { motionMode: "subtle" as const },
      { motionMode: "off" as const },
      { motionMode: "full" as const, expressive: false },
    ]) {
      const markup = renderToStaticMarkup(createElement(PaceMark, { ...props, active: true, emotion: "thinking", pose: "gather" }));
      expect(markup).not.toContain("is-pondering");
      expect(markup).not.toContain(PACE_MORPH_BODY.liquid);
      expect(markup).not.toContain('repeatCount="indefinite"');
    }
  });
});
