import "fake-indexeddb/auto";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "../db/db";
import { OutboxRecoveryQueue } from "./OutboxRecoveryQueue";

describe("OutboxRecoveryQueue", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(async () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    if (!db.isOpen()) await db.open();
    await db.outbox.clear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    await db.outbox.clear();
  });

  it("renders a dead letter in human language without an integrations entitlement", async () => {
    await db.outbox.add({
      timestamp: Date.now(),
      kind: "webshop_email",
      payload: {},
      attempts: 1,
      deliveryStatus: "dead_letter",
      requiresManualResolution: true,
      lastError: "Webshop e-mail delivery is not configured",
    });

    await act(async () => {
      root.render(<OutboxRecoveryQueue focusRequestKey={1} />);
    });
    for (let attempt = 0; attempt < 20 && !container.querySelector("#outbox-recovery-queue"); attempt += 1) {
      await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));
    }

    expect(container.querySelector("#outbox-recovery-queue")).not.toBeNull();
    expect(container.textContent).toContain("Herstelwachtrij: 1 synchronisatie vraagt aandacht");
    expect(container.textContent).toContain("nog geen maildienst is gekoppeld");
    expect(container.textContent).toContain("Opnieuw proberen");
  });
});
