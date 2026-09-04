import { describe, expect, it } from "vitest";
import { describePaceInventoryQuery, planPaceInventoryQuery } from "./paceInventoryQuery";

describe("planPaceInventoryQuery", () => {
  it.each([
    ["Welke producten hebben minder dan drie stuks op voorraad?", { comparison: "lt", quantity: 3 }],
    ["Toon artikelen met maximaal 4 stuks voorraad", { comparison: "lte", quantity: 4 }],
    ["Welke producten hebben minstens 12 stuks op voorraad?", { comparison: "gte", quantity: 12 }],
    ["Wat heeft precies twee stuks op voorraad?", { comparison: "eq", quantity: 2 }],
  ])("keeps the requested stock predicate for %s", (question, stock) => {
    expect(planPaceInventoryQuery(question)).toMatchObject({ version: 1, target: "products", stock });
  });

  it("supports a minimum-stock predicate without inventing a numeric threshold", () => {
    const query = planPaceInventoryQuery("Welke artikelen staan onder de minimumvoorraad?");
    expect(query).toMatchObject({ minimumStock: "below" });
    expect(describePaceInventoryQuery(query!)).toBe("onder de minimumvoorraad");
  });

  it("does not reinterpret a general inventory ranking as a predicate", () => {
    expect(planPaceInventoryQuery("Welke producten hebben de hoogste voorraad?")).toBeNull();
  });
});
