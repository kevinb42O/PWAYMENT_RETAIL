import { describe, expect, it } from "vitest";
import { planPaceRecordLookup } from "../../src/pace/paceRecordPlan";

describe("PACE selective record planner", () => {
  it.each([
    ["Zoek ticket 2026-00421", "transaction"],
    ["Toon product met SKU SK-42", "product"],
    ["Vind klant An Hermans", "customer"],
    ["Wat is het saldo van cadeaubon 1234?", "gift_card"],
    ["Toon het laatste Z-rapport", "daily_report"],
    ["Wat is de status van purchase order PO-2026-18?", "purchase_order"],
    ["Waar is webshoporder WEB-88?", "webshop_order"],
    ["Toon servicedossier REP-12", "service_order"],
    ["Toon de laatste voorraadbeweging van sneaker zwart", "stock_movement"],
    ["Vind medewerker Robin", "employee"],
    ["Wat is de status van verlofaanvraag van Robin?", "leave_request"],
    ["Toon recente auditregels", "audit_entry"],
  ])("routes %s", (question, entity) => {
    expect(planPaceRecordLookup(question)).toMatchObject({ entity, limit: expect.any(Number) });
  });

  it("does not hijack catalog how-to", () => {
    expect(planPaceRecordLookup("Waar voeg ik een product toe?")).toBeNull();
  });

  it("leaves generic rankings to the analytics planner", () => {
    expect(planPaceRecordLookup("Welke klant besteedde het meest?" )).toBeNull();
  });
});
