import { describe, expect, it } from "vitest";
import type { ServiceOrder } from "../types";
import { toPublicServiceOrder } from "./serviceOrders";

describe("public service tracking payload", () => {
  it("never exposes internal notes, contact details, attachments or staff identity", () => {
    const order: ServiceOrder = {
      id: "order-1",
      number: "HER-20260813-0001",
      trackingToken: "a".repeat(64),
      createdAt: 1,
      updatedAt: 2,
      status: "open",
      substatus: "Ontvangen",
      route: "internal-repair",
      customerName: "Testklant",
      customerEmail: "privé@example.be",
      customerPhone: "+32 470 00 00 00",
      assetType: "Modem",
      issue: "Start niet",
      internalNote: "Niet tonen",
      warranty: false,
      noCureNoPay: false,
      diagnosisFeeCents: 0,
      laborCents: 0,
      partsCents: 0,
      otherCents: 0,
      depositCents: 0,
      totalCents: 0,
      paidCents: 0,
      attachments: [
        {
          id: "photo",
          name: "private.jpg",
          contentType: "image/jpeg",
          size: 10,
          dataUrl: "data:image/jpeg;base64,secret",
          createdAt: 1,
        },
      ],
      events: [
        {
          id: "event-1",
          timestamp: 1,
          type: "created",
          label: "Dossier aangemaakt",
          userId: "staff-id",
          userName: "Medewerker",
        },
        {
          id: "event-2",
          timestamp: 2,
          type: "note",
          label: "Interne notitie",
          detail: "geheim",
        },
      ],
      merchantSnapshot: { name: "Winkel" },
    };

    const publicOrder = toPublicServiceOrder(order);
    const serialized = JSON.stringify(publicOrder);
    expect(serialized).not.toContain("privé@example.be");
    expect(serialized).not.toContain("Niet tonen");
    expect(serialized).not.toContain("base64");
    expect(serialized).not.toContain("Medewerker");
    expect(serialized).not.toContain("geheim");
    expect(publicOrder.events).toHaveLength(1);
  });
});
