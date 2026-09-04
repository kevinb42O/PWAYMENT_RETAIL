export type PaceStockComparison = "lt" | "lte" | "gt" | "gte" | "eq";

export interface PaceInventoryQuery {
  version: 1;
  target: "products";
  stock?: { comparison: PaceStockComparison; quantity: number };
  minimumStock?: "below" | "at_or_below";
  limit: number;
}

const NUMBER_WORDS: Record<string, number> = {
  nul: 0, een: 1, twee: 2, drie: 3, vier: 4, vijf: 5, zes: 6,
  zeven: 7, acht: 8, negen: 9, tien: 10, elf: 11, twaalf: 12,
};

const quantityFrom = (match: RegExpMatchArray) => {
  const value = match[1] ? Number(match[1]) : NUMBER_WORDS[match[2]];
  return Number.isInteger(value) && value >= 0 && value <= 10_000 ? value : null;
};

const stockComparisonFromQuestion = (question: string): PaceInventoryQuery["stock"] | undefined => {
  const patterns: Array<{ pattern: RegExp; comparison: PaceStockComparison }> = [
    { pattern: /\b(?:minder|lager|onder)\s+(?:dan\s+)?(?:(\d{1,4})|(nul|een|twee|drie|vier|vijf|zes|zeven|acht|negen|tien|elf|twaalf))\s*(?:stuks?|items?)?\s*(?:op\s+)?(?:voorraad|stock)\b/u, comparison: "lt" },
    { pattern: /\b(?:maximaal|maximum|ten\s+hoogste|niet\s+meer\s+dan)\s+(?:(\d{1,4})|(nul|een|twee|drie|vier|vijf|zes|zeven|acht|negen|tien|elf|twaalf))\s*(?:stuks?|items?)?\s*(?:op\s+)?(?:voorraad|stock)\b/u, comparison: "lte" },
    { pattern: /\b(?:meer|hoger|boven)\s+(?:dan\s+)?(?:(\d{1,4})|(nul|een|twee|drie|vier|vijf|zes|zeven|acht|negen|tien|elf|twaalf))\s*(?:stuks?|items?)?\s*(?:op\s+)?(?:voorraad|stock)\b/u, comparison: "gt" },
    { pattern: /\b(?:minimaal|minstens|ten\s+minste)\s+(?:(\d{1,4})|(nul|een|twee|drie|vier|vijf|zes|zeven|acht|negen|tien|elf|twaalf))\s*(?:stuks?|items?)?\s*(?:op\s+)?(?:voorraad|stock)\b/u, comparison: "gte" },
    { pattern: /\b(?:precies|exact|juist)\s+(?:(\d{1,4})|(nul|een|twee|drie|vier|vijf|zes|zeven|acht|negen|tien|elf|twaalf))\s*(?:stuks?|items?)?\s*(?:op\s+)?(?:voorraad|stock)\b/u, comparison: "eq" },
  ];
  for (const { pattern, comparison } of patterns) {
    const match = question.match(pattern);
    if (!match) continue;
    const quantity = quantityFrom(match);
    if (quantity !== null) return { comparison, quantity };
  }
  return undefined;
};

/**
 * Deterministic inventory predicates for questions that must be answered with
 * exact live facts. This is intentionally a small typed contract: future
 * sources can add their own contract instead of passing natural language or
 * SQL through to the database.
 */
export const planPaceInventoryQuery = (rawQuestion: string): PaceInventoryQuery | null => {
  const question = rawQuestion.trim().toLocaleLowerCase("nl-BE");
  if (!question || !/\b(producten?|artikelen?|voorraad|stock)\b/u.test(question)) return null;
  const stock = stockComparisonFromQuestion(question);
  const minimumStock = /\b(?:onder|lager\s+dan)\s+(?:de\s+)?minimum(?:voorraad|stock)\b/u.test(question)
    ? "below"
    : /\b(?:op\s+of\s+onder|onder\s+of\s+gelijk\s+aan)\s+(?:de\s+)?minimum(?:voorraad|stock)\b/u.test(question)
      ? "at_or_below"
      : undefined;
  if (!stock && !minimumStock) return null;
  return { version: 1, target: "products", ...(stock ? { stock } : {}), ...(minimumStock ? { minimumStock } : {}), limit: 25 };
};

export const describePaceInventoryQuery = (query: PaceInventoryQuery) => {
  const comparison = query.stock ? ({
    lt: `minder dan ${query.stock.quantity}`,
    lte: `maximaal ${query.stock.quantity}`,
    gt: `meer dan ${query.stock.quantity}`,
    gte: `minstens ${query.stock.quantity}`,
    eq: `precies ${query.stock.quantity}`,
  } satisfies Record<PaceStockComparison, string>)[query.stock.comparison] : null;
  if (comparison && query.minimumStock === "below") return `${comparison} stuks op voorraad én onder de minimumvoorraad`;
  if (comparison && query.minimumStock === "at_or_below") return `${comparison} stuks op voorraad én op of onder de minimumvoorraad`;
  if (comparison) return `${comparison} stuks op voorraad`;
  return query.minimumStock === "at_or_below" ? "op of onder de minimumvoorraad" : "onder de minimumvoorraad";
};
