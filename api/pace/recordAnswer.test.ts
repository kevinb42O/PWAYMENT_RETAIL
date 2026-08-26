import { describe, expect, it } from "vitest";
import { renderPaceRecordAnswer } from "../../src/pace/paceRecordAnswer";

describe("PACE deterministic record answers", () => {
  it("renders bounded order fields as nested bullets", () => {
    const answer = renderPaceRecordAnswer({
      entity: "webshop_order",
      basis: "webshop order lifecycle; customer and address snapshots excluded",
      rows: [{ orderNumber: "WEB-88", status: "processing", paymentStatus: "paid", totalCents: 12995 }],
    });
    expect(answer).toContain("## Webshoporders");
    expect(answer).toContain("- WEB-88\n  - Status: processing");
    expect(answer).toContain("Totaal: € 129,95");
    expect(answer).toContain("customer and address snapshots excluded");
  });

  it("renders an exact empty lookup", () => {
    expect(renderPaceRecordAnswer({ entity: "product", rows: [] })).toContain("Geen overeenkomende records gevonden");
  });
});
