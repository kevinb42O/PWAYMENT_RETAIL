import { describe, expect, it } from "vitest";
import { parsePaceAnswer } from "./paceAnswerFormat";

describe("parsePaceAnswer", () => {
  it("turns Pace headings, bullets and paragraphs into safe display blocks", () => {
    expect(parsePaceAnswer(`## Trage voorraad
- Schoen A — 2 stuks · 239 dagen
- Hoodie B — 4 stuks · 67 dagen

## Beste bundelactie
Bundel Schoen A met Product C.`)).toEqual([
      { kind: "heading", text: "Trage voorraad" },
      { kind: "unordered-list", items: ["Schoen A — 2 stuks · 239 dagen", "Hoodie B — 4 stuks · 67 dagen"] },
      { kind: "heading", text: "Beste bundelactie" },
      { kind: "paragraph", text: "Bundel Schoen A met Product C." },
    ]);
  });

  it("keeps an unstructured fallback readable as a paragraph", () => {
    expect(parsePaceAnswer("Een kort antwoord zonder opmaak.")).toEqual([
      { kind: "paragraph", text: "Een kort antwoord zonder opmaak." },
    ]);
  });
});
