import { describe, expect, it } from "vitest";
import { resolvePaceMotion } from "./PaceMark";
import { paceTonePalette } from "./pacePalette";

describe("Pace motion resolution", () => {
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
});
