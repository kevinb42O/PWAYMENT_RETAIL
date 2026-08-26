import { createHash } from "node:crypto";

export interface PaceEvidenceInput {
  sourceKind: "record" | "aggregate" | "product_knowledge" | "ui_context";
  sourceName: string;
  label: string;
  context: unknown;
  freshness?: "live" | "period" | "general" | "stale";
}

const object = (value: unknown): Record<string, unknown> | null => value && typeof value === "object" && !Array.isArray(value)
  ? value as Record<string, unknown> : null;

const bounded = (value: unknown, depth = 0): unknown => {
  if (depth > 5) return null;
  if (value === null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") return value.slice(0, 500);
  if (Array.isArray(value)) return value.slice(0, 25).map((item) => bounded(item, depth + 1));
  const raw = object(value);
  if (!raw) return null;
  return Object.fromEntries(Object.entries(raw)
    .filter(([key]) => !/(?:email|phone|address|notes?|pin|password|token|secret|authorization)/i.test(key))
    .slice(0, 40).map(([key, item]) => [key.slice(0, 80), bounded(item, depth + 1)]));
};

const stable = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  const raw = object(value);
  if (raw) return `{${Object.keys(raw).sort().map((key) => `${JSON.stringify(key)}:${stable(raw[key])}`).join(",")}}`;
  return JSON.stringify(value);
};

export const buildPaceEvidence = (inputs: PaceEvidenceInput[], observedAt = new Date().toISOString()) => inputs.flatMap((input, index) => {
  const raw = object(input.context);
  if (!raw || raw.unavailable === true) return [];
  const facts = bounded(raw);
  const period = object(raw.period) ?? undefined;
  const basis = typeof raw.basis === "string" ? raw.basis.slice(0, 1_200) : `PACE ${input.label}`;
  const dataQuality = object(raw.dataQuality) ?? {};
  const normalized = { sourceKind: input.sourceKind, sourceName: input.sourceName, observedAt: typeof raw.generatedAt === "string" ? raw.generatedAt : observedAt, period, basis, facts, dataQuality };
  return [{
    key: `E${index + 1}`,
    label: input.label.slice(0, 120),
    ...normalized,
    freshness: input.freshness ?? (period ? "period" : "live"),
    entityKeys: [],
    claimIndex: 0,
    relation: "supports",
    digest: createHash("sha256").update(stable(normalized)).digest("hex"),
  }];
});

export const publicCitations = (evidence: ReturnType<typeof buildPaceEvidence>) => evidence.map((item) => ({
  key: item.key, label: item.label, sourceKind: item.sourceKind, observedAt: item.observedAt, freshness: item.freshness,
}));

export const redactPaceSummary = (value: string) => value
  .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[e-mail verwijderd]")
  .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, "[id verwijderd]")
  .replace(/(?:\+?\d[\s()./-]*){9,}/g, "[telefoon verwijderd]")
  .slice(-8_000);
