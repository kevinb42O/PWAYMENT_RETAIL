import { describe, expect, it } from "vitest";
import { encodePaceStreamEvent, parsePaceStreamEvent } from "./paceProgress";

describe("Pace public progress protocol", () => {
  it("round-trips bounded public progress", () => {
    const line = encodePaceStreamEvent({
      version: 1,
      type: "progress",
      sequence: 2,
      phase: "retrieving",
      interaction: "none",
      progress: { completed: 1, total: 3 },
      sourceCount: 3,
    });
    expect(parsePaceStreamEvent(line)).toEqual({
      version: 1,
      type: "progress",
      sequence: 2,
      phase: "retrieving",
      interaction: "none",
      severity: undefined,
      progress: { completed: 1, total: 3 },
      sourceCount: 3,
    });
  });

  it("rejects malformed, private or unknown events", () => {
    expect(parsePaceStreamEvent("not-json")).toBeNull();
    expect(parsePaceStreamEvent('{"version":1,"type":"progress","sequence":1,"phase":"chain_of_thought"}')).toBeNull();
    expect(parsePaceStreamEvent('{"version":1,"type":"answer","status":200,"payload":"private"}')).toBeNull();
  });
});
