import type { PaceAnalyticsPlan } from "../../pace/paceAnalyticsPlan.js";
import type { PaceRecordPlan } from "../../pace/paceRecordPlan.js";
import type { PaceReadToolCall } from "../../pace/paceQuestionPlan.js";

const object = (value: unknown): Record<string, unknown> | null => value && typeof value === "object" && !Array.isArray(value)
  ? value as Record<string, unknown> : null;

const requestedPeriod = (question: string): PaceAnalyticsPlan["period"] | null => {
  const text = question.toLocaleLowerCase("nl-BE");
  if (/vorige maand|afgelopen maand/.test(text)) return { preset: "last_month" };
  if (/deze maand/.test(text)) return { preset: "this_month" };
  if (/vorige week|afgelopen week/.test(text)) return { preset: "last_week" };
  if (/deze week/.test(text)) return { preset: "this_week" };
  if (/vandaag/.test(text)) return { preset: "today" };
  if (/gisteren/.test(text)) return { preset: "yesterday" };
  return null;
};

export const inheritConversationPlan = (
  question: string,
  state: Record<string, unknown> | null,
  current: { analytics: PaceAnalyticsPlan[]; record: PaceRecordPlan | null; tools: PaceReadToolCall[] },
) => {
  const frame = object(state?.lastQueryFrame);
  if (!frame) return current;
  const isContinuation = /\b(en|daarvan|daarmee|dezelfde|die|dat|eerste|tweede|vorige maand|vorige week)\b/i.test(question);
  if (!isContinuation) return current;
  const previousAnalytics = Array.isArray(frame.analytics) ? frame.analytics as PaceAnalyticsPlan[] : [];
  const previousRecord = object(frame.record) as unknown as PaceRecordPlan | null;
  const previousTools = Array.isArray(frame.tools) ? frame.tools as PaceReadToolCall[] : [];
  const period = requestedPeriod(question);
  const analytics = current.analytics.length > 0 ? current.analytics : previousAnalytics;
  return {
    analytics: analytics.slice(0, 3).map((plan) => period ? { ...plan, period, comparison: "none" as const, rationale: "Vervolg op het vorige PACE-onderzoek" } : plan),
    record: current.record ?? (!analytics.length ? previousRecord : null),
    tools: current.tools.length > 0 ? current.tools : previousTools.map((tool) => period ? { ...tool, period } : tool),
  };
};
