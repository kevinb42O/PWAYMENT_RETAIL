export type PaceEntityType =
  | "transaction" | "product" | "category" | "customer" | "gift_card"
  | "daily_report" | "purchase_order" | "webshop_order" | "service_order"
  | "stock_movement" | "employee" | "leave_request" | "audit_entry"
  | "inventory_location";

export interface PaceConversationSummary {
  id: string;
  title: string;
  status: "active" | "closed";
  revision: number;
  activeView: string;
  lastTurnAt: string;
  expiresAt: string;
}

export interface PaceServerTurn {
  id: string;
  sequence: number;
  clientTurnId: string;
  question: string;
  answer: string | null;
  status: "processing" | "completed" | "failed" | "clarification";
  view: string;
  startedAt: string;
  completedAt: string | null;
}

export interface PaceResolvedEntity {
  id: string;
  type: PaceEntityType;
  label: string;
  state: "resolved" | "ambiguous" | "stale" | "inaccessible";
  confidence: number;
}

export interface PaceCitation {
  key: string;
  label: string;
  sourceKind: "record" | "aggregate" | "product_knowledge" | "ui_context";
  observedAt: string;
  freshness: "live" | "period" | "general" | "stale";
}

export interface PaceConversationDetail extends PaceConversationSummary {
  storeId: string;
  state: Record<string, unknown>;
  summary: string;
  turns: PaceServerTurn[];
  entities: PaceResolvedEntity[];
}

export interface PaceClarification {
  prompt: string;
  candidates: Array<{ entityId: string; label: string }>;
}

export interface PaceConversationResponse {
  version: 2;
  conversation: PaceConversationSummary & { turnSequence: number };
  answer: string;
  model: string;
  source: "gemini" | "openai" | "analytics" | "records" | "local";
  entities: PaceResolvedEntity[];
  citations: PaceCitation[];
  clarification?: PaceClarification;
  quota?: unknown;
}
