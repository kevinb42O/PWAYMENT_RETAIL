import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  Clock3,
  Command,
  Gauge,
  PackageCheck,
  RefreshCw,
  Plus,
  Send,
  Settings2,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "../lib/supabase";
import { syncStoreFromSupabase } from "../services/supabaseStoreSync";
import type { MainView } from "../store/useStore";
import {
  answerPaceQuery,
  buildPaceSignals,
  signalCopy,
  type PaceAction,
  type PaceContext,
  type PaceProfileTab,
  type PaceQueryAnswer,
} from "./paceSignals";
import { getPaceQueryHints } from "./paceKnowledge";
import { PaceMark } from "./PaceMark";
import { usePace } from "./usePace";
import { askPaceAi, PaceQuotaExceededError, type PaceConversationTurn } from "./paceAi";
import { paceQuotaLabel, usePaceBilling } from "./usePaceBilling";
import { parsePaceAnswer } from "./paceAnswerFormat";
import { deletePaceConversation, getPaceConversation, listPaceConversations } from "./conversation/api";
import type { PaceCitation, PaceClarification, PaceConversationSummary } from "./conversation/types";
import {
  paceSetupProgress,
  type PaceSetupMilestone,
} from "./setupMilestones";
import { isPaceCatalogDestination, validatePaceDestination, type PaceDestinationAccess } from "./paceDestinations";
import {
  INITIAL_PACE_TRUTH_STATE,
  derivePaceExpression,
  derivePaceTruthState,
  paceTruthStateLabel,
  reducePaceTruthState,
  type PaceTruthState,
} from "./paceExperience";
import {
  buildPaceReplenishmentProposal,
  emptyPaceCustomerMarginWatch,
  emptyPacePredictiveReplenishment,
  emptyPaceTodayOperationalQueues,
  paceTodaySignalId,
  parsePaceCustomerMarginWatch,
  parsePacePredictiveReplenishment,
  parsePaceReplenishmentRows,
  parsePaceTodayBriefing,
  parsePaceTodayOperationalQueues,
  type PaceCustomerMarginWatch,
  type PacePredictiveReplenishment,
  type PaceTodayBriefing,
} from "./paceToday";
import { parsePaceReplenishmentActionResult, type PaceReplenishmentActionResult } from "./paceActions";

interface PaceAssistantProps extends PaceContext {
  userId: string | null;
  userName: string | null;
  setupMilestones: PaceSetupMilestone[];
  customerName?: string;
  suppressed?: boolean;
  onNavigate: (view: MainView) => void;
  onOpenSetup: () => void;
  onOpenProfile: (tab: PaceProfileTab) => void;
  onOpenCatalog: (filter: { productIds: string[]; label: string }) => void;
  onOpenDestination: (destination: Extract<PaceAction, { kind: "destination" }>["destination"]) => PaceDestinationAccess;
  onOpenMilestone: (milestone: PaceSetupMilestone) => void;
}

const executeAction = (
  action: PaceAction,
  handlers: Pick<PaceAssistantProps, "onNavigate" | "onOpenSetup" | "onOpenProfile" | "onOpenCatalog" | "onOpenDestination">,
): PaceDestinationAccess => {
  if (action.kind === "destination") return handlers.onOpenDestination(action.destination);
  if (action.kind === "navigate") handlers.onNavigate(action.view);
  if (action.kind === "setup") handlers.onOpenSetup();
  if (action.kind === "profile") handlers.onOpenProfile(action.tab);
  if (action.kind === "catalog") handlers.onOpenCatalog({ productIds: action.productIds, label: action.filterLabel });
  return { allowed: true };
};

export const paceAssistantModeLabel = ({
  aiEnabled,
  liveStoreContext,
  thinking,
}: {
  aiEnabled: boolean;
  liveStoreContext: boolean;
  thinking: boolean;
}) => {
  if (thinking) return "VRAAG WORDT VERWERKT";
  if (!aiEnabled) return "LOKALE KENNIS";
  return liveStoreContext ? "AI + WINKELGEGEVENS" : "AI · GEEN WINKELGEGEVENS";
};

export const paceThinkingStatus = ({
  aiEnabled,
  liveStoreContext,
  slow,
  truthState,
}: {
  aiEnabled: boolean;
  liveStoreContext: boolean;
  slow: boolean;
  truthState?: PaceTruthState;
}) => {
  if (truthState?.phase === "retrieving" && truthState.progress) {
    return `${truthState.progress.completed} van ${truthState.progress.total} toegestane gegevensbronnen gecontroleerd.`;
  }
  if (truthState?.phase === "resolving") return truthState.sourceCount
    ? `${truthState.sourceCount} toegestane gegevensbronnen geselecteerd.`
    : "Pace bepaalt welke productkennis nodig is.";
  if (truthState?.phase === "comparing") return "De opgehaalde resultaten worden controleerbaar vergeleken.";
  if (truthState?.phase === "composing") return "De gecontroleerde gegevens worden tot een antwoord samengesteld.";
  if (truthState?.phase === "verifying") return "Het antwoord wordt gecontroleerd op bron en actualiteit.";
  if (truthState?.phase === "awaiting_confirmation") return "Pace heeft een concrete keuze nodig om veilig verder te gaan.";
  if (slow) return "Dit duurt langer dan normaal. Pace schakelt automatisch terug als de service niet antwoordt.";
  if (!aiEnabled) return "De lokale PWAYMENT-productkennis wordt geraadpleegd.";
  if (!liveStoreContext) return "Je vraag is veilig verzonden zonder actuele winkelgegevens.";
  return "Je vraag is veilig verzonden. Alleen toegestane winkelgegevens kunnen worden opgehaald.";
};

export const composePaceQueryResponse = (
  local: PaceQueryAnswer,
  ai: Pick<Awaited<ReturnType<typeof askPaceAi>>, "answer" | "source">,
): PaceQueryAnswer => {
  const base = {
    ...local,
    title: local.matched ? local.title : "Dit heb ik voor je gevonden",
    answer: ai.answer,
  };
  if (ai.source === "local") return base;
  // Until server-authoritative action proposals exist, never attach a local
  // regex action or local instructional metadata to a remotely composed answer.
  return {
    ...base,
    action: { kind: "none" },
    actionLabel: undefined,
    steps: undefined,
    limitation: undefined,
    followUps: undefined,
  };
};

export const composeStoredPaceResponse = (local: PaceQueryAnswer, answer: string, title: string): PaceQueryAnswer => ({
  ...local,
  title,
  answer,
  action: { kind: "none" },
  actionLabel: undefined,
  steps: undefined,
  limitation: undefined,
  followUps: undefined,
});

export type PaceResponseSource = "gemini" | "openai" | "analytics" | "records" | "briefing" | "local" | "history";

export const paceResponseSourceLabel = (source: PaceResponseSource) => {
  if (source === "gemini") return "GEMINI";
  if (source === "openai") return "OPENAI";
  if (source === "analytics" || source === "records" || source === "briefing") return "LIVE GEGEVENS";
  if (source === "history") return "BEWAARD ANTWOORD";
  return "LOKALE KENNIS";
};

export const paceClarificationFollowUp = (label: string) => `Ik bedoel ${label.trim().slice(0, 160)}.`;

export const shouldUseLocalPaceDestination = (answer: PaceQueryAnswer) =>
  answer.matched && answer.confidence >= 0.9 && answer.action.kind === "destination";

export const shouldShowPaceSetupProgress = ({
  role,
  ready,
}: {
  role: PaceContext["role"];
  ready: boolean;
}) => (role === "owner" || role === "manager") && !ready;

const paceTodayCurrency = (cents: number) => new Intl.NumberFormat("nl-BE", { style: "currency", currency: "EUR" }).format(cents / 100);
const paceTodayFulfillmentLabel = (status: string) => status === "processing" ? "wordt verwerkt" : "nog te verwerken";

export const PaceAssistant = (props: PaceAssistantProps) => {
  const {
    open,
    preferences,
    dismissedSignals,
    snoozedSignals,
    customerFeedback,
    toggle,
    setOpen,
    updatePreferences,
    dismissSignal,
    snoozeSignal,
    recordCustomerFeedback,
    hydrateScope,
  } = usePace();
  const prefersReducedMotion = useReducedMotion();
  const [query, setQuery] = useState("");
  const [activeQuestion, setActiveQuestion] = useState<string | null>(null);
  const [response, setResponse] = useState<PaceQueryAnswer | null>(null);
  const [responseSource, setResponseSource] = useState<PaceResponseSource>("local");
  const [thinking, setThinking] = useState(false);
  const [thinkingSlow, setThinkingSlow] = useState(false);
  const [streamTruthState, setStreamTruthState] = useState<PaceTruthState | null>(null);
  const [externalDialogOpen, setExternalDialogOpen] = useState(false);
  const [sessionDismissedSignals, setSessionDismissedSignals] = useState<string[]>([]);
  const [conversation, setConversation] = useState<PaceConversationTurn[]>([]);
  const [serverConversation, setServerConversation] = useState<PaceConversationSummary | null>(null);
  const [recentConversations, setRecentConversations] = useState<PaceConversationSummary[]>([]);
  const [citations, setCitations] = useState<PaceCitation[]>([]);
  const [clarification, setClarification] = useState<PaceClarification | null>(null);
  const [todayBriefing, setTodayBriefing] = useState<PaceTodayBriefing | null>(null);
  const [todayLoading, setTodayLoading] = useState(false);
  const [todayUnavailable, setTodayUnavailable] = useState(false);
  const [todayEvidenceOpen, setTodayEvidenceOpen] = useState<string[]>([]);
  const [todayRefreshToken, setTodayRefreshToken] = useState(0);
  const [replenishmentRows, setReplenishmentRows] = useState<ReturnType<typeof parsePaceReplenishmentRows>>([]);
  const [todayQueues, setTodayQueues] = useState(emptyPaceTodayOperationalQueues);
  const [customerMarginWatch, setCustomerMarginWatch] = useState<PaceCustomerMarginWatch>(emptyPaceCustomerMarginWatch);
  const [predictiveReplenishment, setPredictiveReplenishment] = useState<PacePredictiveReplenishment>(emptyPacePredictiveReplenishment);
  const [replenishmentConfirmationOpen, setReplenishmentConfirmationOpen] = useState(false);
  const [replenishmentActionBusy, setReplenishmentActionBusy] = useState(false);
  const [replenishmentActionResult, setReplenishmentActionResult] = useState<PaceReplenishmentActionResult | null>(null);
  const [replenishmentActionError, setReplenishmentActionError] = useState<string | null>(null);
  const replenishmentActionKeyRef = useRef<string | null>(null);
  const { quota, hardLimited, load: loadBilling, recordQuota, markExceeded } = usePaceBilling();
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const queryRunRef = useRef(0);
  const context: PaceContext = useMemo(() => ({
    storeId: props.storeId,
    view: props.view,
    role: props.role,
    productCount: props.productCount,
    cartCount: props.cartCount,
    firstRunCompleted: props.firstRunCompleted,
    online: props.online,
    pendingSync: props.pendingSync,
    retryingSync: props.retryingSync,
    failedSync: props.failedSync,
    syncIssueSummary: props.syncIssueSummary,
    syncIssueResolution: props.syncIssueResolution,
    cartSummary: props.cartSummary,
    customerInsights: props.customerInsights,
  }), [props.storeId, props.view, props.role, props.productCount, props.cartCount, props.firstRunCompleted, props.online, props.pendingSync, props.retryingSync, props.failedSync, props.syncIssueSummary, props.syncIssueResolution, props.cartSummary, props.customerInsights]);
  const signals = useMemo(
    () => buildPaceSignals(context, preferences).filter((signal) => {
      if (dismissedSignals.includes(signal.id) || sessionDismissedSignals.includes(signal.id) || (snoozedSignals[signal.id] ?? 0) > Date.now()) return false;
      if (!signal.customerInsightId) return true;
      const feedback = customerFeedback.find((entry) => entry.insightId === signal.customerInsightId);
      return !feedback || (feedback.suppressUntil != null && feedback.suppressUntil <= Date.now());
    }),
    [context, preferences, dismissedSignals, snoozedSignals, sessionDismissedSignals, customerFeedback],
  );
  const primary = signals[0] ?? buildPaceSignals(context, preferences).at(-1)!;
  const shouldBadge = primary.priority >= 70 && preferences.proactivity !== "quiet";
  const canAnimate = !prefersReducedMotion && preferences.motion !== "off";
  const setupProgress = useMemo(() => paceSetupProgress(props.setupMilestones), [props.setupMilestones]);
  const unavailable = Boolean(props.suppressed || externalDialogOpen);
  const customerSignal = signals.find((signal) => signal.source === "Klantcontext");
  const queryHints = useMemo(() => getPaceQueryHints(context), [context]);
  const conversationActive = activeQuestion !== null;
  const canLoadToday = Boolean(open && props.storeId && (props.role === "owner" || props.role === "manager") && preferences.liveStoreContext && preferences.insightGuidance);
  const visibleTodayItems = useMemo(() => todayBriefing?.items.filter((item) => {
    const id = paceTodaySignalId(item.id);
    const representedByQueue = (item.id === "webshop.paid_waiting" && todayQueues.webshopOrders.length > 0)
      || (item.id === "service.blocked" && todayQueues.blockedServiceOrders.length > 0);
    return !representedByQueue && !dismissedSignals.includes(id) && (snoozedSignals[id] ?? 0) <= Date.now();
  }) ?? [], [todayBriefing, todayQueues, dismissedSignals, snoozedSignals]);
  const replenishmentProposal = useMemo(() => buildPaceReplenishmentProposal(replenishmentRows), [replenishmentRows]);
  const usagePercent = quota ? (quota.tier === "basic" ? quota.daily_count / quota.quota : quota.monthly_count / quota.quota) * 100 : 0;
  const modeLabel = paceAssistantModeLabel({ aiEnabled: preferences.aiEnabled, liveStoreContext: preferences.liveStoreContext, thinking });
  const snapshotTruthState = derivePaceTruthState({
    enabled: preferences.enabled,
    open,
    online: context.online,
    thinking,
    slow: thinkingSlow,
    hardLimited: preferences.aiEnabled && hardLimited,
    hasResponse: Boolean(response),
    hasClarification: Boolean(clarification?.candidates.length),
    hasAction: Boolean(response && response.action.kind !== "none"),
    hasAttentionSignal: shouldBadge,
  });
  const truthState = streamTruthState
    ? thinkingSlow && streamTruthState.phase === "planning"
      ? { ...streamTruthState, phase: "degraded" as const, severity: "attention" as const, reasonCode: "slow" }
      : streamTruthState
    : snapshotTruthState;
  const expression = derivePaceExpression(truthState, preferences.motion, primary.tone);
  const truthStateLabel = paceTruthStateLabel(truthState.phase);
  const thinkingStatus = paceThinkingStatus({
    aiEnabled: preferences.aiEnabled,
    liveStoreContext: preferences.liveStoreContext,
    slow: thinkingSlow,
    truthState,
  });

  useEffect(() => {
    setSessionDismissedSignals([]);
  }, [props.customerName]);

  useEffect(() => {
    setConversation([]);
    setServerConversation(null);
    setRecentConversations([]);
    setCitations([]);
    setClarification(null);
    setActiveQuestion(null);
    setResponse(null);
    setStreamTruthState(null);
    setQuery("");
    queryRunRef.current += 1;
  }, [props.storeId]);

  useEffect(() => {
    let cancelled = false;
    if (!canLoadToday || !props.storeId) {
      setTodayBriefing(null);
      setReplenishmentRows([]);
      setTodayQueues(emptyPaceTodayOperationalQueues());
      setCustomerMarginWatch(emptyPaceCustomerMarginWatch());
      setPredictiveReplenishment(emptyPacePredictiveReplenishment());
      setTodayUnavailable(false);
      return;
    }
    setTodayLoading(true);
    setTodayUnavailable(false);
    void (async () => {
      const briefingRequest = supabase.rpc("get_pace_owner_briefing", { target_store_id: props.storeId! });
      const replenishmentRequest = preferences.actionProposalsEnabled
        ? supabase.rpc("get_pace_inventory_query_context", {
          target_store_id: props.storeId!,
          query_spec: { version: "1", target: "products", minimumStock: "at_or_below", limit: 12 },
        })
        : Promise.resolve({ data: null, error: null });
      const queuesRequest = supabase.rpc("get_pace_today_operational_queues", { target_store_id: props.storeId! });
      const customerMarginRequest = supabase.rpc("get_pace_customer_margin_watch", { target_store_id: props.storeId! });
      const predictiveRequest = supabase.rpc("get_pace_predictive_replenishment_context", { target_store_id: props.storeId! });
      const [briefingResult, replenishmentResult, queuesResult, customerMarginResult, predictiveResult] = await Promise.all([briefingRequest, replenishmentRequest, queuesRequest, customerMarginRequest, predictiveRequest]);
      if (cancelled) return;
      if (briefingResult.error) {
        setTodayBriefing(null);
        setReplenishmentRows([]);
        setTodayQueues(emptyPaceTodayOperationalQueues());
        setCustomerMarginWatch(emptyPaceCustomerMarginWatch());
        setPredictiveReplenishment(emptyPacePredictiveReplenishment());
        setTodayUnavailable(true);
      } else {
        setTodayBriefing(parsePaceTodayBriefing(briefingResult.data));
        setReplenishmentRows(replenishmentResult.error ? [] : parsePaceReplenishmentRows(replenishmentResult.data));
        setTodayQueues(queuesResult.error ? emptyPaceTodayOperationalQueues() : parsePaceTodayOperationalQueues(queuesResult.data));
        setCustomerMarginWatch(customerMarginResult.error ? emptyPaceCustomerMarginWatch() : parsePaceCustomerMarginWatch(customerMarginResult.data));
        setPredictiveReplenishment(predictiveResult.error ? emptyPacePredictiveReplenishment() : parsePacePredictiveReplenishment(predictiveResult.data));
      }
      setTodayLoading(false);
    })();
    return () => { cancelled = true; };
  }, [canLoadToday, preferences.actionProposalsEnabled, props.storeId, todayRefreshToken]);

  useEffect(() => {
    let cancelled = false;
    if (!props.storeId || !props.userId || !preferences.aiEnabled) return;
    void listPaceConversations(props.storeId).then(async (items) => {
      setRecentConversations(items);
      const latest = items.find((item) => item.status === "active");
      if (!latest || cancelled) return;
      const detail = await getPaceConversation(latest.id);
      if (cancelled) return;
      setServerConversation(latest);
      setConversation(detail.turns.filter((turn) => turn.status === "completed" || turn.status === "clarification").flatMap((turn) => [
        { role: "user" as const, text: turn.question },
        ...(turn.answer ? [{ role: "assistant" as const, text: turn.answer }] : []),
      ]).slice(-6));
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [preferences.aiEnabled, props.storeId, props.userId]);

  const openConversation = async (item: PaceConversationSummary) => {
    const detail = await getPaceConversation(item.id);
    setServerConversation(item);
    setCitations([]);
    setClarification(null);
    setConversation(detail.turns.filter((turn) => turn.status === "completed" || turn.status === "clarification").flatMap((turn) => [
      { role: "user" as const, text: turn.question },
      ...(turn.answer ? [{ role: "assistant" as const, text: turn.answer }] : []),
    ]).slice(-6));
    const last = [...detail.turns].reverse().find((turn) => turn.answer && (turn.status === "completed" || turn.status === "clarification"));
    if (last?.answer) {
      setActiveQuestion(last.question);
      setResponse(composeStoredPaceResponse(answerPaceQuery(last.question, context), last.answer, item.title));
      setResponseSource(last.source ?? "history");
      setCitations(last.citations ?? []);
    }
  };

  const removeConversation = async (item: PaceConversationSummary) => {
    await deletePaceConversation(item.id);
    setRecentConversations((current) => current.filter((candidate) => candidate.id !== item.id));
    if (serverConversation?.id === item.id) {
      setServerConversation(null);
      setConversation([]);
      setActiveQuestion(null);
      setResponse(null);
    }
  };

  useEffect(() => {
    void hydrateScope(props.storeId ?? null, props.userId);
    void loadBilling(props.storeId ?? null);
  }, [hydrateScope, loadBilling, props.storeId, props.userId]);

  useEffect(() => {
    const detectDialogs = () => {
      const dialogs = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]'));
      setExternalDialogOpen(dialogs.some((dialog) => dialog.id !== "pace-assistant-panel"));
    };
    detectDialogs();
    const observer = new MutationObserver(detectDialogs);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["role", "aria-modal"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (unavailable && open) setOpen(false);
  }, [open, setOpen, unavailable]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, setOpen]);

  useEffect(() => {
    if (!thinking) {
      setThinkingSlow(false);
      return;
    }
    const timer = window.setTimeout(() => setThinkingSlow(true), 6_000);
    return () => window.clearTimeout(timer);
  }, [thinking]);

  useEffect(() => {
    // Navigation changes the available UI context, but it should not erase the
    // conversation that caused that navigation. Only cancel an in-flight turn.
    queryRunRef.current += 1;
    setThinking(false);
    setStreamTruthState(null);
  }, [props.view]);

  const runQuery = async (rawQuestion: string) => {
    const question = rawQuestion.trim();
    if (!question || thinking || (preferences.aiEnabled && hardLimited)) return;
    const runId = queryRunRef.current + 1;
    queryRunRef.current = runId;
    setActiveQuestion(question);
    setQuery("");
    setResponse(null);
    setClarification(null);
    const local = answerPaceQuery(question, context);
    const remember = (answer: string) => setConversation((current) => [
      ...current,
      { role: "user" as const, text: question },
      { role: "assistant" as const, text: answer },
    ].slice(-6));
    // Reviewed high-confidence navigation help is faster and safer locally:
    // answer and typed destination originate from the same knowledge entry.
    // Complex or unmatched questions continue through the AI endpoint.
    if (shouldUseLocalPaceDestination(local)) {
      setResponse(local);
      setResponseSource("local");
      setCitations([]);
      remember(local.answer);
      return;
    }
    // A known local delivery failure has a deterministic, privacy-safe answer.
    // Prefer it over a generic AI response so "waarom?" always names the real
    // cause currently stored on this register.
    if (
      (context.failedSync > 0 || context.retryingSync > 0) &&
      /sync|offline|verbinding|wachtrij|fout|waarom|mislukt/.test(question.toLocaleLowerCase("nl-BE"))
    ) {
      setResponse(local);
      setResponseSource("local");
      remember(local.answer);
      return;
    }
    const clientTurnId = crypto.randomUUID();
    const startedTruthState = reducePaceTruthState(INITIAL_PACE_TRUTH_STATE, { type: "turn_started", turnId: clientTurnId });
    setStreamTruthState(startedTruthState);
    setThinking(true);
    try {
      const ai = await askPaceAi(question, context, conversation, local, {
        enabled: preferences.aiEnabled,
        includeLiveStoreContext: preferences.liveStoreContext,
        actionProposalsEnabled: preferences.actionProposalsEnabled,
        conversation: {
          id: serverConversation?.id,
          revision: serverConversation?.revision,
          clientTurnId,
        },
        onProgress: (event) => setStreamTruthState((current) => reducePaceTruthState(current ?? startedTruthState, {
          type: "progress",
          turnId: clientTurnId,
          sequence: event.sequence,
          phase: event.phase,
          interaction: event.interaction,
          severity: event.severity,
          progress: event.progress,
          sourceCount: event.sourceCount,
        })),
      });
      if (queryRunRef.current !== runId) return;
      setResponse(composePaceQueryResponse(local, ai));
      setResponseSource(ai.source);
      if (ai.conversation) {
        setServerConversation(ai.conversation);
        setRecentConversations((current) => [ai.conversation!, ...current.filter((item) => item.id !== ai.conversation!.id)].slice(0, 20));
      }
      setCitations(ai.citations ?? []);
      setClarification(ai.clarification ?? null);
      if (ai.quota) recordQuota(ai.quota);
      remember(ai.answer);
    } catch (error) {
      if (queryRunRef.current !== runId) return;
      if (error instanceof PaceQuotaExceededError) {
        markExceeded(error.quota);
        setActiveQuestion(null);
        return;
      }
      setResponse(error instanceof Error ? {
        ...local,
        title: preferences.aiEnabled ? "PACE AI kon deze vraag niet verwerken" : local.title,
        limitation: preferences.aiEnabled
          ? `${error.message} Ik heb daarom alleen de lokale productkennis gebruikt.`
          : local.limitation,
      } : local);
      setResponseSource("local");
      setCitations([]);
      setClarification(null);
      remember(local.answer);
    } finally {
      if (queryRunRef.current === runId) {
        setThinking(false);
        setStreamTruthState(null);
      }
    }
  };

  const returnToOverview = () => {
    queryRunRef.current += 1;
    setThinking(false);
    setStreamTruthState(null);
    setActiveQuestion(null);
    setResponse(null);
    setClarification(null);
    setQuery("");
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    void runQuery(query);
  };

  const runAction = (action: PaceAction, customerInsightId?: string) => {
    if (action.kind === "destination") {
      const access = validatePaceDestination(action.destination, context.role);
      if (!access.allowed) {
        setResponse((current) => current ? { ...current, limitation: access.message, action: { kind: "none" }, actionLabel: undefined } : current);
        return;
      }
    }
    const outcome = executeAction(action, props);
    if (!outcome.allowed) {
      setResponse((current) => current ? { ...current, limitation: outcome.message, action: { kind: "none" }, actionLabel: undefined } : current);
      return;
    }
    if ((action.kind === "catalog" || (action.kind === "destination" && isPaceCatalogDestination(action.destination))) && customerInsightId) recordCustomerFeedback(customerInsightId, "used");
    if (action.kind !== "none") setOpen(false);
  };

  const openReplenishmentConfirmation = () => {
    replenishmentActionKeyRef.current = crypto.randomUUID();
    setReplenishmentActionError(null);
    setReplenishmentActionResult(null);
    setReplenishmentConfirmationOpen(true);
  };

  const createReplenishmentDrafts = async () => {
    if (!props.storeId || !replenishmentProposal || replenishmentActionBusy) return;
    setReplenishmentActionBusy(true);
    setReplenishmentActionError(null);
    try {
      const actionKey = replenishmentActionKeyRef.current ?? crypto.randomUUID();
      replenishmentActionKeyRef.current = actionKey;
      const { data, error } = await supabase.rpc("create_pace_replenishment_drafts", {
        target_store_id: props.storeId,
        action_idempotency_key: actionKey,
        requested_items: replenishmentProposal.rows.map((row) => ({ productId: row.id })),
      });
      if (error) throw new Error(error.message.replace(/^pace-action:[a-z-]+:/, "").trim() || "Het concept kon niet veilig worden aangemaakt.");
      const result = parsePaceReplenishmentActionResult(data);
      if (!result) throw new Error("Pace kon het resultaat van deze actie niet betrouwbaar bevestigen.");
      if (result.createdOrderCount > 0) await syncStoreFromSupabase(props.storeId);
      setReplenishmentActionResult(result);
      setReplenishmentConfirmationOpen(false);
    } catch (error) {
      setReplenishmentActionError(error instanceof Error ? error.message : "Het concept kon niet veilig worden aangemaakt.");
    } finally {
      setReplenishmentActionBusy(false);
    }
  };

  const giveCustomerFeedback = (insightId: string, disposition: "used" | "later" | "not-relevant") => {
    recordCustomerFeedback(insightId, disposition);
    setSessionDismissedSignals((current) => current.includes(`customer:${insightId}`) ? current : [...current, `customer:${insightId}`]);
  };

  return (
    <>
      <button
        type="button"
        className={`pace-trigger ${open ? "is-open" : ""} ${!preferences.enabled ? "is-disabled" : ""} ${unavailable ? "is-unavailable" : ""}`}
        disabled={unavailable}
        onClick={() => {
          if (!preferences.enabled) {
            updatePreferences({ enabled: true });
            setOpen(true);
            return;
          }
          toggle();
        }}
        title={preferences.enabled ? "Open Pace" : "Pace is uitgeschakeld — open instellingen"}
        aria-label={open ? "Sluit Pace" : preferences.enabled ? "Open Pace, operationele assistent" : "Open Pace-instellingen en schakel Pace in"}
        aria-expanded={open}
        aria-controls="pace-assistant-panel"
      >
        <span className="pace-trigger-mark" aria-hidden="true">
          <PaceMark size={46} active={open || shouldBadge} emotion={expression.emotion} tone={expression.tone} performance={expression.performance} pose={expression.pose} energy={expression.energy} stateLabel={truthStateLabel} motionMode={preferences.motion} expressive={preferences.expressiveMorphs} />
          {shouldBadge && !open && <span className={`pace-signal-dot is-${primary.tone}`} />}
        </span>
        <span className="pace-trigger-label" aria-hidden="true">
          <span className="pace-trigger-brand">PWAYMENT</span>
          <span className="pace-trigger-action">Vraag Pace</span>
        </span>
      </button>

      {customerSignal && props.view === "pos" && !open && !unavailable && preferences.enabled && (
        <button
          type="button"
          className={`pace-customer-edge is-${customerSignal.tone}`}
          onClick={() => setOpen(true)}
          aria-label="Open Pace-klantcontext"
          title="Pace heeft relevante klantcontext"
        >
          <span className="pace-customer-edge-dot" />
          <span>Pace · klantcontext</span>
        </button>
      )}

      {createPortal(<AnimatePresence>
        {open && !unavailable && (
          <>
            <motion.button
              type="button"
              className="pace-backdrop"
              aria-label="Sluit Pace"
              onClick={() => setOpen(false)}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            />
            <motion.aside
              id="pace-assistant-panel"
              className="pace-panel"
              role="dialog"
              aria-modal="false"
              aria-label="Pace operationele assistent"
              initial={canAnimate ? { opacity: 0, x: -28, scale: 0.985 } : false}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={canAnimate ? { opacity: 0, x: -20, scale: 0.99 } : { opacity: 0 }}
              transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            >
              <header className="pace-panel-header">
                <div className="pace-header-leading">
                  {conversationActive && <button type="button" className="pace-header-back" onClick={returnToOverview} aria-label="Terug naar Nu belangrijk" title="Terug naar Nu belangrijk"><ArrowLeft size={18} /></button>}
                  <div className="pace-identity">
                  <PaceMark size={52} active emotion={expression.emotion} tone={expression.tone} performance={expression.performance} pose={expression.pose} energy={expression.energy} stateLabel={truthStateLabel} motionMode={preferences.motion} expressive={preferences.expressiveMorphs} />
                  <div><span>PWAYMENT · {modeLabel}</span><h2>Pace</h2></div>
                  </div>
                </div>
                <div className="pace-header-actions">
                  {conversationActive && <button type="button" onClick={() => {
                    setServerConversation(null);
                    setConversation([]);
                    setCitations([]);
                    setClarification(null);
                    setActiveQuestion(null);
                    setResponse(null);
                    setQuery("");
                  }} aria-label="Start nieuw PACE-onderzoek" title="Nieuw onderzoek"><Plus size={17} /></button>}
                  <button type="button" onClick={() => { props.onOpenProfile("pace"); setOpen(false); }} aria-label="Open volledige Pace-instellingen" title="Pace-instellingen"><Settings2 size={17} /></button>
                  <button ref={closeButtonRef} type="button" onClick={() => setOpen(false)} aria-label="Sluit Pace"><X size={18} /></button>
                </div>
              </header>

              <AnimatePresence mode="wait" initial={false}>
                {!conversationActive ? <motion.div className="pace-scroll pace-live-layout" key="overview" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}>
                    <div className="pace-overview-window">
                      <div className="pace-overview-heading"><span>Nu belangrijk</span><small>{signals.length} {signals.length === 1 ? "aandachtspunt" : "aandachtspunten"}</small></div>

                    {canLoadToday && <section className="pace-today" aria-label="Vandaag in Pace">
                      <header className="pace-today-heading"><span><Sparkles size={14} /> Vandaag</span><button type="button" onClick={() => setTodayRefreshToken((value) => value + 1)} disabled={todayLoading} aria-label="Vernieuw dagbriefing" title="Vernieuw dagbriefing"><RefreshCw size={13} /></button></header>
                      {todayLoading && <p className="pace-today-status">Pace controleert de toegestane winkelgegevens…</p>}
                      {!todayLoading && todayUnavailable && <p className="pace-today-status is-muted">De live dagbriefing is tijdelijk niet beschikbaar. Je lokale Pace-hulp blijft werken.</p>}
                      {!todayLoading && todayBriefing && <>
                        {visibleTodayItems.length > 0 && <p className="pace-today-summary"><ShieldCheck size={12} /> {visibleTodayItems.length} {visibleTodayItems.length === 1 ? "controleerbaar aandachtspunt" : "controleerbare aandachtspunten"} uit je winkel van vandaag.</p>}
                        {visibleTodayItems.slice(0, 4).map((item) => {
                          const signalId = paceTodaySignalId(item.id);
                          const evidenceOpen = todayEvidenceOpen.includes(item.id);
                          return <article className="pace-today-item" key={item.id}>
                            <div><span>{item.priority <= 1 ? "Nu" : "Vandaag"}</span><strong>{item.title}</strong></div>
                            <p>{item.detail}</p>
                            {evidenceOpen && <div className="pace-today-evidence"><ShieldCheck size={12} /><span>{todayBriefing.basis ?? "Actuele, toegestane winkelgegevens voor deze winkel."}</span></div>}
                            <footer>
                              <button type="button" className="is-evidence" onClick={() => setTodayEvidenceOpen((openItems) => evidenceOpen ? openItems.filter((id) => id !== item.id) : [...openItems, item.id])}>{evidenceOpen ? <>Verberg bewijs <ChevronUp size={13} /></> : <>Waarom? <ChevronDown size={13} /></>}</button>
                              {item.nextQuestion && <button type="button" className="is-primary" onClick={() => void runQuery(item.nextQuestion)}>Onderzoek <ArrowRight size={13} /></button>}
                              <button type="button" className="is-quiet" onClick={() => snoozeSignal(signalId)}>4 uur later</button>
                              <button type="button" className="is-quiet" onClick={() => dismissSignal(signalId)}>Negeer</button>
                            </footer>
                          </article>;
                        })}
                        {todayQueues.webshopOrders.length > 0 && !dismissedSignals.includes(paceTodaySignalId("webshop-review")) && (snoozedSignals[paceTodaySignalId("webshop-review")] ?? 0) <= Date.now() && <article className="pace-today-queue">
                          <div><span><ShoppingBag size={13} /> Werkqueue · webshop</span><strong>{todayQueues.webshopOrders.length} {todayQueues.webshopOrders.length === 1 ? "betaalde order wacht" : "betaalde orders wachten"}</strong></div>
                          <p>Deze orders zijn betaald en staan nog {todayQueues.webshopOrders.some((order) => order.fulfillmentStatus === "unfulfilled") ? "klaar om verwerkt te worden" : "in verwerking"}.</p>
                          <ul>{todayQueues.webshopOrders.slice(0, 3).map((order) => <li key={order.id}><b>{order.number}</b><span>{paceTodayFulfillmentLabel(order.fulfillmentStatus)} · {order.deliveryMode === "pickup" ? "afhalen" : "verzenden"} · {paceTodayCurrency(order.totalCents)}</span></li>)}</ul>
                          <footer><button type="button" className="is-primary" onClick={() => { props.onOpenProfile("webshop-orders"); setOpen(false); }}>Open orderwerkqueue <ArrowRight size={13} /></button><button type="button" className="is-quiet" onClick={() => snoozeSignal(paceTodaySignalId("webshop-review"))}>4 uur later</button><button type="button" className="is-quiet" onClick={() => dismissSignal(paceTodaySignalId("webshop-review"))}>Negeer</button></footer>
                          <em>Alleen de orderstatus wordt getoond. Geen klant-, adres- of betaalreferentiegegevens komen in Pace.</em>
                        </article>}
                        {todayQueues.blockedServiceOrders.length > 0 && !dismissedSignals.includes(paceTodaySignalId("service-review")) && (snoozedSignals[paceTodaySignalId("service-review")] ?? 0) <= Date.now() && <article className="pace-today-queue is-service">
                          <div><span><Wrench size={13} /> Werkqueue · service</span><strong>{todayQueues.blockedServiceOrders.length} {todayQueues.blockedServiceOrders.length === 1 ? "herstelling is geblokkeerd" : "herstellingen zijn geblokkeerd"}</strong></div>
                          <p>Deze dossiers hebben de status geblokkeerd en vragen een bewuste interne, klant- of leveranciersopvolging.</p>
                          <ul>{todayQueues.blockedServiceOrders.slice(0, 3).map((order) => <li key={order.id}><b>{order.number}</b><span>{order.assetType}{order.substatus ? ` · ${order.substatus}` : ""}</span></li>)}</ul>
                          <footer><button type="button" className="is-primary" onClick={() => { props.onNavigate("service"); setOpen(false); }}>Open herstellingen <ArrowRight size={13} /></button><button type="button" className="is-quiet" onClick={() => snoozeSignal(paceTodaySignalId("service-review"))}>4 uur later</button><button type="button" className="is-quiet" onClick={() => dismissSignal(paceTodaySignalId("service-review"))}>Negeer</button></footer>
                          <em>Alleen dossiernummer, toesteltype en blokkadestatus worden getoond. Contactgegevens en privé-dossierinhoud blijven uitgesloten.</em>
                        </article>}
                        {customerMarginWatch.customerSignals.length > 0 && !dismissedSignals.includes(paceTodaySignalId("customer-radar")) && (snoozedSignals[paceTodaySignalId("customer-radar")] ?? 0) <= Date.now() && <article className="pace-today-queue is-customer-radar">
                          <div><span><Sparkles size={13} /> Customer Radar</span><strong>{customerMarginWatch.customerSignals.length} {customerMarginWatch.customerSignals.length === 1 ? "klantsignaal" : "klantsignalen"}</strong></div>
                          <p>Terugkerende klanten en aantoonbare afhakers op basis van gekoppelde, finale verkopen.</p>
                          <ul>{customerMarginWatch.customerSignals.slice(0, 3).map((signal) => <li key={`${signal.kind}:${signal.id}`}><b>{signal.name}</b><span>{signal.title} · {signal.detail}</span></li>)}</ul>
                          <footer><button type="button" className="is-primary" onClick={() => void runQuery(customerMarginWatch.customerSignals[0].nextQuestion)}>Onderzoek klanten <ArrowRight size={13} /></button><button type="button" className="is-quiet" onClick={() => snoozeSignal(paceTodaySignalId("customer-radar"))}>4 uur later</button><button type="button" className="is-quiet" onClick={() => dismissSignal(paceTodaySignalId("customer-radar"))}>Negeer</button></footer>
                          <em>{customerMarginWatch.customerAttributionPercent === null ? "Nog geen klantgekoppelde verkoopdata in de voorbije 90 dagen." : `${customerMarginWatch.customerAttributionPercent}% van de verkopen in de voorbije 90 dagen is aan een klant gekoppeld.`} Geen e-mail, telefoon, adres of notities komen in Pace.</em>
                        </article>}
                        {(customerMarginWatch.marginSignals.length > 0 || customerMarginWatch.costCoveragePercent !== null) && !dismissedSignals.includes(paceTodaySignalId("margin-watch")) && (snoozedSignals[paceTodaySignalId("margin-watch")] ?? 0) <= Date.now() && <article className="pace-today-queue is-margin-watch">
                          <div><span><Gauge size={13} /> Margin Watch</span><strong>{customerMarginWatch.marginSignals.length > 0 ? `${customerMarginWatch.marginSignals.length} ${customerMarginWatch.marginSignals.length === 1 ? "signaal" : "signalen"}` : "Datakwaliteit controleren"}</strong></div>
                          {customerMarginWatch.marginSignals.length > 0 ? <><p>Signalen zijn berekend op finale verkopen van de voorbije 30 dagen, exclusief btw.</p><ul>{customerMarginWatch.marginSignals.slice(0, 3).map((signal) => <li key={`${signal.kind}:${signal.id}`}><b>{signal.name}</b><span>{signal.title} · {signal.detail}</span></li>)}</ul><footer><button type="button" className="is-primary" onClick={() => void runQuery(customerMarginWatch.marginSignals[0].nextQuestion)}>Onderzoek marge <ArrowRight size={13} /></button><button type="button" className="is-quiet" onClick={() => snoozeSignal(paceTodaySignalId("margin-watch"))}>4 uur later</button><button type="button" className="is-quiet" onClick={() => dismissSignal(paceTodaySignalId("margin-watch"))}>Negeer</button></footer></> : <p>Er worden nog geen definitieve margesignalen getoond, omdat de kostprijsdekking onvoldoende is.</p>}
                          <em>{customerMarginWatch.costCoveragePercent === null ? "Nog geen verkoopregels met kostprijs in de voorbije 30 dagen." : `${customerMarginWatch.costCoveragePercent}% van de netto-omzet heeft een historische kostprijs. ${customerMarginWatch.marginReady ? "Margebewaking is voldoende betrouwbaar." : "Pace wacht met definitieve margeclaims tot minstens 80% dekking."}`}</em>
                        </article>}
                        {predictiveReplenishment.rows.length > 0 && !dismissedSignals.includes(paceTodaySignalId("predictive-replenishment")) && (snoozedSignals[paceTodaySignalId("predictive-replenishment")] ?? 0) <= Date.now() && <article className="pace-today-queue is-predictive-replenishment">
                          <div><span><PackageCheck size={13} /> Predictive Replenishment</span><strong>{predictiveReplenishment.rows.length} bestelrisico{predictiveReplenishment.rows.length === 1 ? "" : "'s"}</strong></div>
                          <p>Vraagtempo, werkelijke leverancierslevertijd, seizoenscontext en reeds open bestellingen bepalen dit voorstel.</p>
                          <ul>{predictiveReplenishment.rows.slice(0, 3).map((row) => <li key={row.id}><b>{row.name}{row.variant ? ` · ${row.variant}` : ""}</b><span>{row.risk === "stockout_before_delivery" ? "dreigt op vóór levering" : "aanvullen"} · +{row.recommendedQty} · {row.confidence === "high" ? "hoge" : row.confidence === "medium" ? "gemiddelde" : "lage"} zekerheid</span></li>)}</ul>
                          <footer><button type="button" className="is-primary" onClick={() => { props.onOpenCatalog({ productIds: predictiveReplenishment.rows.map((row) => row.id), label: "Pace · voorspellend bestelrisico" }); setOpen(false); }}>Controleer voorstel <ArrowRight size={13} /></button><button type="button" className="is-quiet" onClick={() => snoozeSignal(paceTodaySignalId("predictive-replenishment"))}>4 uur later</button><button type="button" className="is-quiet" onClick={() => dismissSignal(paceTodaySignalId("predictive-replenishment"))}>Negeer</button></footer>
                          <em>Dit is een read-only voorspelling. Pace maakt nog geen voorspellend concept aan zolang je de berekening niet eerst zelf controleert.</em>
                        </article>}
                        {preferences.actionProposalsEnabled && replenishmentProposal && !dismissedSignals.includes(paceTodaySignalId("replenishment-proposal")) && (snoozedSignals[paceTodaySignalId("replenishment-proposal")] ?? 0) <= Date.now() && <article className="pace-replenishment-proposal">
                          <div><span><PackageCheck size={13} /> Concept · voorraad</span><strong>Bestelcontrole voorbereiden</strong></div>
                          <p><b>{replenishmentProposal.productCount}</b> {replenishmentProposal.productCount === 1 ? "artikel staat" : "artikelen staan"} op of onder het ingestelde minimum. <b>{replenishmentProposal.quantityToMinimum}</b> {replenishmentProposal.quantityToMinimum === 1 ? "stuk" : "stuks"} brengt de voorraad minimaal terug tot die drempels.</p>
                          <small>{replenishmentProposal.rows.slice(0, 3).map((row) => `${row.name}${row.variant ? ` · ${row.variant}` : ""} (${row.stockQty}/${row.minStockQty})`).join(" · ")}{replenishmentProposal.rows.length > 3 ? ` + ${replenishmentProposal.rows.length - 3} meer` : ""}</small>
                          <footer><button type="button" className="is-primary" onClick={() => { props.onOpenCatalog({ productIds: replenishmentProposal.rows.map((row) => row.id), label: "Pace · voorraadcontrole" }); setOpen(false); }}>Controleer artikelen <ArrowRight size={13} /></button><button type="button" className="is-confirm" onClick={openReplenishmentConfirmation}>Maak intern concept</button><button type="button" className="is-quiet" onClick={() => snoozeSignal(paceTodaySignalId("replenishment-proposal"))}>4 uur later</button><button type="button" className="is-quiet" onClick={() => dismissSignal(paceTodaySignalId("replenishment-proposal"))}>Negeer</button></footer>
                          {replenishmentConfirmationOpen && <div className="pace-action-confirmation" role="alert">
                            <strong>Maak je deze concept-inkooporders aan?</strong>
                            <p>Pace hercontroleert eerst de actuele voorraad en minimumdrempel. Alleen producten met een bekende leverancier blijven over; per leverancier ontstaat één interne conceptorder.</p>
                            <ul>{replenishmentProposal.rows.slice(0, 4).map((row) => <li key={row.id}>{row.name}{row.variant ? ` · ${row.variant}` : ""}<span>{Math.max(1, (row.minStockQty ?? 0) - row.stockQty)} stuks tot minimum</span></li>)}</ul>
                            <small>Dit verzendt niets, boekt geen voorraad bij en markeert geen bestelling als geplaatst. De actie wordt gelogd in de audittrail.</small>
                            {replenishmentActionError && <p className="is-error">{replenishmentActionError}</p>}
                            <footer><button type="button" className="is-confirm" onClick={() => void createReplenishmentDrafts()} disabled={replenishmentActionBusy}>{replenishmentActionBusy ? "Concepten maken…" : "Bevestig: maak interne concepten"}</button><button type="button" className="is-quiet" disabled={replenishmentActionBusy} onClick={() => { setReplenishmentConfirmationOpen(false); setReplenishmentActionError(null); }}>Annuleer</button></footer>
                          </div>}
                          {replenishmentActionResult && <div className="pace-action-result"><Check size={13} /><span>{replenishmentActionResult.message}{replenishmentActionResult.skippedCount > 0 ? ` ${replenishmentActionResult.skippedCount} ${replenishmentActionResult.skippedCount === 1 ? "product werd" : "producten werden"} overgeslagen na de live hercontrole.` : ""}</span>{replenishmentActionResult.createdOrderCount > 0 && <button type="button" onClick={() => { props.onNavigate("inventory"); setOpen(false); }}>Open conceptorders <ArrowRight size={13} /></button>}</div>}
                          <em>Dit is geen bestelling: aantallen, leverancier en verzending worden niet gewijzigd tot jij verder werkt in Inkoop.</em>
                        </article>}
                        {visibleTodayItems.length === 0 && todayQueues.webshopOrders.length === 0 && todayQueues.blockedServiceOrders.length === 0 && customerMarginWatch.customerSignals.length === 0 && customerMarginWatch.marginSignals.length === 0 && predictiveReplenishment.rows.length === 0 && !replenishmentProposal && <p className="pace-today-status is-clear"><Check size={13} /> Geen open aandachtspunten in de huidige briefing.</p>}
                      </>}
                    </section>}

                    <section className={`pace-live-brief is-${primary.tone}`}>
                      <div className="pace-brief-top"><span>{primary.source}</span><Gauge size={15} /></div>
                      <h3>{primary.title}</h3>
                      <p>{signalCopy(primary, preferences.tone)}</p>
                      {primary.evidenceLabel && <div className="pace-evidence-line"><ShieldCheck size={13} /> {primary.evidenceLabel}</div>}
                      <div className="pace-brief-actions">
                        {primary.actionLabel && <button type="button" onClick={() => runAction(primary.action, primary.customerInsightId)}>{primary.actionLabel}<ArrowRight size={15} /></button>}
                        {primary.customerInsightId ? <>
                          <button type="button" className="is-quiet" onClick={() => giveCustomerFeedback(primary.customerInsightId!, "used")}>Gebruikt</button>
                          <button type="button" className="is-quiet" onClick={() => giveCustomerFeedback(primary.customerInsightId!, "later")}>Later</button>
                          <button type="button" className="is-quiet" onClick={() => giveCustomerFeedback(primary.customerInsightId!, "not-relevant")}>Niet relevant</button>
                        </> : primary.priority >= 65 && <button type="button" className="is-quiet" onClick={() => dismissSignal(primary.id)}>Niet meer tonen</button>}
                      </div>
                    </section>

                    {shouldShowPaceSetupProgress({ role: props.role, ready: setupProgress.ready }) && (
                      <section className="pace-setup-progress" aria-label="Winkelsetup voortgang">
                        <div className="pace-setup-progress-head">
                          <span><Check size={14} /> WINKELSETUP</span>
                          <strong>{setupProgress.percent}%</strong>
                        </div>
                        <div className="pace-setup-progress-bar" aria-hidden="true"><span style={{ width: `${setupProgress.percent}%` }} /></div>
                        {setupProgress.next ? (
                          <button type="button" onClick={() => { props.onOpenMilestone(setupProgress.next!); setOpen(false); }}>
                            <span><small>Volgende controleerbare stap</small><strong>{setupProgress.next.label}</strong></span>
                            <ArrowRight size={15} />
                          </button>
                        ) : (
                          <div className="pace-setup-ready"><Check size={15} /> Verkoopbasis staat klaar</div>
                        )}
                      </section>
                    )}

                    {signals.slice(1, 3).length > 0 && (
                      <section className="pace-signal-stack">
                        <div className="pace-stack-label"><Sparkles size={14} /> Daarna relevant</div>
                        {signals.slice(1, 3).map((signal) => (
                          <button key={signal.id} type="button" onClick={() => signal.action.kind !== "none" ? runAction(signal.action, signal.customerInsightId) : undefined} className="pace-mini-signal">
                            <span className={`pace-mini-orb is-${signal.tone}`} />
                            <span><strong>{signal.title}</strong><small>{signal.compact}</small></span>
                            {signal.action.kind !== "none" && <ArrowRight size={14} />}
                          </button>
                        ))}
                      </section>
                    )}
                    {recentConversations.length > 0 && <section className="pace-recent-conversations" aria-label="Recente PACE-onderzoeken">
                      <div className="pace-stack-label"><Clock3 size={14} /> Recente onderzoeken</div>
                      {recentConversations.slice(0, 4).map((item) => <div key={item.id} className="pace-recent-row">
                        <button type="button" onClick={() => void openConversation(item)}>
                          <strong>{item.title}</strong><small>{new Date(item.lastTurnAt).toLocaleDateString("nl-BE")}</small>
                        </button>
                        <button type="button" className="is-delete" onClick={() => void removeConversation(item)} aria-label={`Verwijder ${item.title}`}><Trash2 size={13} /></button>
                      </div>)}
                    </section>}
                    </div>

                    <section className="pace-conversation-window is-collapsed">
                      <section className="pace-command-zone">
                        <div className="pace-conversation-heading"><span><Command size={14} /> Vraag Pace</span><small>{preferences.aiEnabled ? preferences.liveStoreContext ? "AI + winkelgegevens" : "AI zonder winkelgegevens" : "Lokale hulp"}</small></div>
                        <form onSubmit={submit}>
                          <input
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
                              event.preventDefault();
                              void runQuery(query);
                            }}
                            placeholder="Stel je vraag…"
                            aria-label="Vraag Pace"
                          />
                          <button type="submit" disabled={!query.trim() || thinking || (preferences.aiEnabled && hardLimited)} aria-label="Stuur vraag"><Send size={16} /></button>
                        </form>
                        {preferences.aiEnabled && <div className={`pace-quota-badge${usagePercent >= 80 ? " is-warning" : ""}`} aria-live="polite">{usagePercent >= 80 && !hardLimited ? "Bijna op · " : ""}{paceQuotaLabel(quota)}</div>}
                        {preferences.aiEnabled && hardLimited && <div className="pace-quota-wall" role="alert"><strong>Je bent door je vragen heen.</strong><span>Upgrade naar Pro of koop 50 losse credits voor €5.</span><button type="button" onClick={() => { props.onOpenProfile("pace"); setOpen(false); }}>Bekijk opties <ArrowRight size={14} /></button></div>}
                      </section>
                    </section>
                </motion.div> : <motion.div className="pace-conversation-layout" key="conversation" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 8 }} transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}>
                  <section className="pace-question-card" aria-label="Jouw vraag">
                    <span>Jouw vraag</span>
                    <h3>{activeQuestion}</h3>
                  </section>

                  <div className="pace-conversation-body" aria-live="polite" aria-busy={thinking}>
                    <AnimatePresence mode="wait">
                      {(thinking || response) && (
                        <motion.section className="pace-response" key={thinking ? `thinking-${activeQuestion}` : `${activeQuestion}-${response?.title}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }}>
                          {thinking ? <div className="pace-thinking-performance">
                            <PaceMark size={76} active emotion={expression.emotion} tone={expression.tone} performance={expression.performance} pose={expression.pose} energy={expression.energy} stateLabel={truthStateLabel} motionMode={preferences.motion} expressive={preferences.expressiveMorphs} />
                            <div className="pace-thinking-copy">
                              <strong>{thinkingSlow ? "Pace werkt nog aan je vraag" : "Pace verwerkt je vraag"}</strong>
                              <span className="pace-thinking-status">{thinkingStatus}</span>
                            </div>
                          </div> : response && <>
                            <div><Check size={14} /> PACE · {paceResponseSourceLabel(responseSource)}</div>
                            <h3>{response.title}</h3>
                            <div className="pace-response-content">
                              {parsePaceAnswer(response.answer).map((block, index) => {
                                if (block.kind === "heading") return <h4 key={`${block.kind}-${index}`}>{block.text}</h4>;
                                if (block.kind === "unordered-list") return <ul key={`${block.kind}-${index}`}>{block.items.map((item) => <li key={item.text}><span>{item.text}</span>{item.details.length > 0 && <ul>{item.details.map((detail) => <li key={detail}>{detail}</li>)}</ul>}</li>)}</ul>;
                                if (block.kind === "ordered-list") return <ol key={`${block.kind}-${index}`}>{block.items.map((item) => <li key={item}>{item}</li>)}</ol>;
                                return <p key={`${block.kind}-${index}`}>{block.text}</p>;
                              })}
                            </div>
                            {citations.length > 0 && <div className="pace-response-citations" aria-label="Bronnen voor dit antwoord">
                              {citations.map((citation) => <span key={citation.key} title={`${citation.label} · ${new Date(citation.observedAt).toLocaleString("nl-BE")}`}>
                                <ShieldCheck size={12} /> {citation.label} · {citation.freshness === "live" ? "actueel" : citation.freshness === "period" ? "periode" : "algemeen"}
                              </span>)}
                            </div>}
                            {clarification && clarification.candidates.length > 0 && <div className="pace-clarification" aria-label="Kies wat je bedoelt">
                              <strong>{clarification.prompt}</strong>
                              <div>{clarification.candidates.map((candidate) => <button key={candidate.entityId} type="button" onClick={() => void runQuery(paceClarificationFollowUp(candidate.label))}>{candidate.label}</button>)}</div>
                            </div>}
                            {response.steps && response.steps.length > 0 && <ol className="pace-response-steps">{response.steps.map((step) => <li key={step}>{step}</li>)}</ol>}
                            {response.limitation && <p className="pace-response-limit"><ShieldCheck size={13} /> {response.limitation}</p>}
                            {response.actionLabel && <button type="button" onClick={() => runAction(response.action)}>{response.actionLabel}<ArrowRight size={14} /></button>}
                            {response.followUps && response.followUps.length > 0 && <div className="pace-response-followups">{response.followUps.slice(0, 3).map((followUp) => <button key={followUp} type="button" onClick={() => void runQuery(followUp)}>{followUp}</button>)}</div>}
                          </>}
                        </motion.section>
                      )}
                    </AnimatePresence>
                  </div>

                  <section className="pace-command-zone pace-conversation-composer">
                    <div className="pace-conversation-heading"><span><Command size={14} /> Vervolgvraag</span><small>{preferences.aiEnabled ? preferences.liveStoreContext ? "AI + winkelgegevens" : "AI zonder winkelgegevens" : "Lokale hulp"}</small></div>
                    <form onSubmit={submit}>
                      <input
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
                          event.preventDefault();
                          void runQuery(query);
                        }}
                        placeholder="Stel een vervolgvraag…"
                        aria-label="Vervolgvraag aan Pace"
                      />
                      <button type="submit" disabled={!query.trim() || thinking || (preferences.aiEnabled && hardLimited)} aria-label="Stuur vervolgvraag"><Send size={16} /></button>
                    </form>
                    {preferences.aiEnabled && <div className={`pace-quota-badge${usagePercent >= 80 ? " is-warning" : ""}`} aria-live="polite">{usagePercent >= 80 && !hardLimited ? "Bijna op · " : ""}{paceQuotaLabel(quota)}</div>}
                    {preferences.aiEnabled && hardLimited && <div className="pace-quota-wall" role="alert"><strong>Je bent door je vragen heen.</strong><span>Upgrade naar Pro of koop 50 losse credits voor €5.</span><button type="button" onClick={() => { props.onOpenProfile("pace"); setOpen(false); }}>Bekijk opties <ArrowRight size={14} /></button></div>}
                    <div className="pace-query-hints">
                      {queryHints.map((hint) => <button key={hint} type="button" onClick={() => void runQuery(hint)}>{hint}</button>)}
                    </div>
                    <footer className="pace-trust-line"><ShieldCheck size={14} /> Pace voert geen financiële of gevoelige actie zelfstandig uit.</footer>
                  </section>
                </motion.div>}
              </AnimatePresence>
            </motion.aside>
          </>
        )}
      </AnimatePresence>, document.body)}
    </>
  );
};
