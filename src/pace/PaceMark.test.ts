import { describe, expect, it } from "vitest";
import { resolvePaceMotion } from "./PaceMark";

describe("Pace motion resolution", () => {
  it("respects automatic reduced-motion and disabled preferences", () => {
    expect(resolvePaceMotion({ reducedMotion: true, motionMode: "full" })).toEqual({ canMove: false, fullMotion: false });
    expect(resolvePaceMotion({ reducedMotion: false, motionMode: "off" })).toEqual({ canMove: false, fullMotion: false });
  });

  it("allows an explicit one-shot Motion Lab preview", () => {
    expect(resolvePaceMotion({ reducedMotion: true, motionMode: "off", forceMotion: true })).toEqual({ canMove: true, fullMotion: true });
  });
});
