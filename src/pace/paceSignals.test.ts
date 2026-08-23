import { describe, expect, it } from "vitest";
import { answerPaceQuery, buildPaceSignals, type PaceContext } from "./paceSignals";
import { DEFAULT_PACE_PREFERENCES } from "./usePace";

const context = (patch: Partial<PaceContext> = {}): PaceContext => ({
  view: "pos",
  role: "owner",
  productCount: 12,
  cartCount: 0,
  firstRunCompleted: true,
  online: true,
  pendingSync: 0,
  retryingSync: 0,
  failedSync: 0,
  ...patch,
});
describe("Pace signal engine", () => {
  it("prioritizes offline safety over contextual coaching", () => {
    const signals = buildPaceSignals(context({ online: false, pendingSync: 3 }), DEFAULT_PACE_PREFERENCES);
    expect(signals[0]).toMatchObject({ id: "offline", priority: 100, tone: "attention" });
  });

  it("offers setup only to a role allowed to configure the store", () => {
    const ownerSignals = buildPaceSignals(context({ productCount: 0 }), DEFAULT_PACE_PREFERENCES);
    const cashierSignals = buildPaceSignals(context({ productCount: 0, role: "cashier" }), DEFAULT_PACE_PREFERENCES);
    expect(ownerSignals.some((signal) => signal.id === "empty-catalog")).toBe(true);
    expect(cashierSignals.some((signal) => signal.id === "empty-catalog")).toBe(false);
  });

  it("never turns a billing question into an autonomous purchase", () => {
    const answer = answerPaceQuery("upgrade mijn abonnement", context());
    expect(answer.action).toEqual({ kind: "profile", tab: "billing" });
    expect(answer.answer).toContain("nooit zelfstandig");
  });

  it("warns against repeating queued mutations", () => {
    const answer = answerPaceQuery("wat is mijn syncstatus?", context({ pendingSync: 2 }));
    expect(answer.answer).toContain("Voer die niet opnieuw uit");
  });

  it("shows normal online delivery as flow instead of an offline warning", () => {
    const signals = buildPaceSignals(context({ pendingSync: 3 }), DEFAULT_PACE_PREFERENCES);
    expect(signals[0]).toMatchObject({ id: "pending-sync", priority: 60, tone: "flow" });
    expect(signals[0].compact).toContain("online");
  });

  it("does not promise automatic delivery for dead letters", () => {
    const signals = buildPaceSignals(
      context({
        pendingSync: 3,
        failedSync: 3,
        syncIssueSummary: "Een product bestaat nog niet op de server.",
        syncIssueResolution: "Synchroniseer het product eerst.",
      }),
      DEFAULT_PACE_PREFERENCES,
    );
    expect(signals[0]).toMatchObject({
      id: "failed-sync",
      action: { kind: "profile", tab: "integrations" },
      tone: "attention",
    });
    expect(signals[0].compact).toBe("Een product bestaat nog niet op de server.");
    expect(signals[0].detail).toBe("Synchroniseer het product eerst.");
  });

  it("identifies backoff retries separately from normal queue progress", () => {
    const signals = buildPaceSignals(
      context({ pendingSync: 2, retryingSync: 2 }),
      DEFAULT_PACE_PREFERENCES,
    );
    expect(signals[0]).toMatchObject({ id: "retrying-sync", priority: 85 });
  });

  it("answers why a known sync failed in human language", () => {
    const answer = answerPaceQuery("Waarom is dit mislukt?", context({
      pendingSync: 1,
      failedSync: 1,
      syncIssueSummary: "De webshopmail heeft nog geen gekoppelde maildienst.",
      syncIssueResolution: "Koppel eerst een mailprovider.",
    }));
    expect(answer.title).toBe("Herstel nodig");
    expect(answer.answer).toContain("geen gekoppelde maildienst");
    expect(answer.answer).toContain("Koppel eerst een mailprovider");
  });
});
