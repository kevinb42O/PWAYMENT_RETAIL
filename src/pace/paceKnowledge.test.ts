import { describe, expect, it } from "vitest";
import { answerFromPaceKnowledge, getPaceQueryHints, PACE_KNOWLEDGE_INTENT_IDS } from "./paceKnowledge";
import type { PaceContext } from "./paceSignals";

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

describe("Pace product knowledge", () => {
  it("responds naturally to a simple greeting even during local fallback", () => {
    const answer = answerFromPaceKnowledge("hi", context());
    expect(answer.intentId).toBe("conversation.greeting");
    expect(answer.answer).toContain("Natuurlijk mag je gewoon hallo zeggen");
  });

  it("covers every merchant-facing Pace domain with reviewed intent families", () => {
    expect(PACE_KNOWLEDGE_INTENT_IDS).toEqual(expect.arrayContaining([
      "pos.payment",
      "history.return",
      "close.cash-difference",
      "catalog.variants-identifiers",
      "insights.forecast-po",
      "customers.giftcards",
      "webshop.orders",
      "service.workflow",
      "workforce.leave",
      "integration.undo",
      "hardware.customer-display",
      "sync.status",
      "account.modules-rights",
      "pace.preferences-privacy",
    ]));
  });

  it.each([
    ["Hoe splits ik een betaling over cash en PIN?", "pos.payment"],
    ["Hoe start ik een retour voor één artikel?", "history.return"],
    ["Waarom is er een kasverschil?", "close.cash-difference"],
    ["Hoe voeg ik maten en kleuren toe?", "catalog.variants-identifiers"],
    ["Wat betekent days of cover?", "insights.forecast-po"],
    ["Welke dag van de week is historisch gezien de alltime beste verkoopsdag?", "insights.best-sales-weekday"],
    ["Hoe waardeer ik een cadeaubon op?", "customers.giftcards"],
    ["Wie is mijn beste klant?", "customers.best"],
    ["Wanneer wordt webshopvoorraad gereserveerd?", "webshop.orders"],
    ["Waar noteer ik de diagnose van een herstelling?", "service.workflow"],
    ["Waarom mag ik mijn eigen verlof niet goedkeuren?", "workforce.leave"],
    ["Wanneer wordt een import-undo geblokkeerd?", "integration.undo"],
    ["Kan Pace mijn kassalade openen?", "hardware.limit"],
    ["Welke gegevens gebruikt Pace voor AI?", "pace.preferences-privacy"],
  ])("routes %s to %s", (question, intentId) => {
    expect(answerFromPaceKnowledge(question, context()).intentId).toBe(intentId);
  });

  it("never mistakes a sales weekday question for workforce scheduling", () => {
    const answer = answerFromPaceKnowledge(
      "Welke dag van de week is historisch gezien de alltime beste verkoopsdag?",
      context({ view: "workforce" }),
    );
    expect(answer).toMatchObject({
      intentId: "insights.best-sales-weekday",
      title: "Historisch beste verkoopsdag",
    });
  });

  it("uses live delivery state without sending the question to a model", () => {
    const answer = answerFromPaceKnowledge("Waarom is de sync mislukt?", context({
      failedSync: 1,
      syncIssueSummary: "Het product ontbreekt op de server.",
      syncIssueResolution: "Synchroniseer eerst het product.",
    }));
    expect(answer).toMatchObject({ intentId: "sync.status", title: "Herstel nodig", matched: true });
    expect(answer.answer).toContain("Het product ontbreekt");
    expect(answer.answer).toContain("Synchroniseer eerst");
  });

  it("changes suggestions with workspace and live context", () => {
    expect(getPaceQueryHints(context({ view: "z-report" }))).toContain("Waarom is er een kasverschil?");
    expect(getPaceQueryHints(context({ view: "service" }))).toContain("Hoe maak ik een hersteldossier?");
    expect(getPaceQueryHints(context({ failedSync: 1 }))[0]).toBe("Waarom is deze synchronisatie mislukt?");
  });

  it("keeps every visible suggestion useful without an AI provider", () => {
    const views: PaceContext["view"][] = ["pos", "audit-log", "z-report", "customers", "insights", "service", "workforce", "integration-hub", "profile", "admin"];
    const unmatched: string[] = [];
    for (const view of views) {
      for (const hint of getPaceQueryHints(context({ view }))) {
        if (!answerFromPaceKnowledge(hint, context({ view })).matched) unmatched.push(`${view}: ${hint}`);
      }
    }
    expect(unmatched).toEqual([]);
  });

  it("returns useful local discovery help for an unmatched question", () => {
    const answer = answerFromPaceKnowledge("blorpt deze instelling", context({ view: "workforce" }));
    expect(answer).toMatchObject({ matched: false, confidence: 0.2, action: { kind: "none" } });
    expect(answer.answer).toContain("Hoe voeg ik een shift toe?");
  });
});
