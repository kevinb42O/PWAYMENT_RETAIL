import type { PaceEntityType } from "../../pace/conversation/types.js";
import type { PaceRpcConfig } from "./conversationState.js";

export interface EntityCandidate {
  canonicalId: string;
  type: PaceEntityType;
  label: string;
  attributes: Record<string, unknown>;
  score: number;
}

export interface EntityResolution {
  mentionKey: string;
  type: PaceEntityType;
  search: string;
  status: "resolved" | "ambiguous" | "unresolved";
  candidates: EntityCandidate[];
}

const requestsFromQuestion = (question: string) => {
  const patterns: Array<[PaceEntityType, RegExp]> = [
    ["product", /(?:product|artikel|sku|barcode)\s+["“]?([^?,”"]{2,80})/i],
    ["customer", /(?:klant)\s+["“]?([^?,”"]{2,80})/i],
    ["transaction", /(?:ticket|bon|transactie)\s*(?:nummer)?\s*[#:]?\s*([\w-]{2,80})/i],
    ["category", /(?:categorie)\s+["“]?([^?,”"]{2,80})/i],
    ["inventory_location", /(?:locatie|magazijn|filiaal)\s+["“]?([^?,”"]{2,80})/i],
  ];
  return patterns.flatMap(([type, pattern], index) => {
    const match = question.match(pattern);
    return match ? [{ mentionKey: `M${index + 1}`, type, search: match[1].trim() }] : [];
  }).slice(0, 8);
};

export const resolveQuestionEntities = async (config: PaceRpcConfig, storeId: string, question: string): Promise<EntityResolution[]> => {
  const requests = requestsFromQuestion(question);
  if (!requests.length) return [];
  const response = await fetch(`${config.supabaseUrl.replace(/\/$/, "")}/rest/v1/rpc/resolve_pace_entities`, {
    method: "POST",
    headers: { apikey: config.publishableKey, Authorization: config.authorization, "Content-Type": "application/json" },
    body: JSON.stringify({ target_store_id: storeId, resolution_requests: requests }),
    signal: AbortSignal.timeout(8_000),
  });
  if (response.status === 401 || response.status === 403) throw new Error("STORE_ACCESS_DENIED");
  if (!response.ok) return [];
  const rows = await response.json() as Array<Omit<EntityResolution, "status">>;
  return rows.map((row) => {
    const candidates = Array.isArray(row.candidates) ? row.candidates.slice(0, 5) : [];
    const first = candidates[0];
    const second = candidates[1];
    const status = first && first.score >= .9 && (!second || first.score - second.score >= .12)
      ? "resolved" : first && first.score >= .6 ? "ambiguous" : "unresolved";
    return { ...row, candidates, status };
  });
};

export const resolutionPersistence = (resolutions: EntityResolution[]) => ({
  entities: resolutions.flatMap((resolution) => resolution.status === "resolved" && resolution.candidates[0] ? [{
    clientKey: resolution.mentionKey,
    type: resolution.type,
    canonicalId: resolution.candidates[0].canonicalId,
    label: resolution.candidates[0].label,
    aliases: [resolution.search],
    state: "resolved",
    confidence: resolution.candidates[0].score,
    attributes: resolution.candidates[0].attributes ?? {},
  }] : []),
  mentions: resolutions.map((resolution) => ({
    text: resolution.search,
    type: resolution.type,
    entityKey: resolution.status === "resolved" ? resolution.mentionKey : undefined,
    method: resolution.status === "resolved" ? "bounded_fuzzy" : "unresolved",
    confidence: resolution.candidates[0]?.score ?? 0,
    candidateCount: resolution.candidates.length,
    status: resolution.status,
  })),
});
