import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Clock3,
  Command,
  Gauge,
  Plus,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
import { derivePaceExpression, derivePaceTruthState, paceTruthStateLabel } from "./paceExperience";

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
}: {
  aiEnabled: boolean;
  liveStoreContext: boolean;
  slow: boolean;
}) => {
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

export type PaceResponseSource = "gemini" | "openai" | "analytics" | "records" | "local" | "history";

export const paceResponseSourceLabel = (source: PaceResponseSource) => {
  if (source === "gemini") return "GEMINI";
  if (source === "openai") return "OPENAI";
  if (source === "analytics" || source === "records") return "LIVE GEGEVENS";
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

export const PaceAssistant = (props: PaceAssistantProps) => {
  const {
    open,
    preferences,
    dismissedSignals,
    customerFeedback,
    toggle,
    setOpen,
    updatePreferences,
    dismissSignal,
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
  const [externalDialogOpen, setExternalDialogOpen] = useState(false);
  const [sessionDismissedSignals, setSessionDismissedSignals] = useState<string[]>([]);
  const [conversation, setConversation] = useState<PaceConversationTurn[]>([]);
  const [serverConversation, setServerConversation] = useState<PaceConversationSummary | null>(null);
  const [recentConversations, setRecentConversations] = useState<PaceConversationSummary[]>([]);
  const [citations, setCitations] = useState<PaceCitation[]>([]);
  const [clarification, setClarification] = useState<PaceClarification | null>(null);
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
      if (dismissedSignals.includes(signal.id) || sessionDismissedSignals.includes(signal.id)) return false;
      if (!signal.customerInsightId) return true;
      const feedback = customerFeedback.find((entry) => entry.insightId === signal.customerInsightId);
      return !feedback || (feedback.suppressUntil != null && feedback.suppressUntil <= Date.now());
    }),
    [context, preferences, dismissedSignals, sessionDismissedSignals, customerFeedback],
  );
  const primary = signals[0] ?? buildPaceSignals(context, preferences).at(-1)!;
  const shouldBadge = primary.priority >= 70 && preferences.proactivity !== "quiet";
  const canAnimate = !prefersReducedMotion && preferences.motion !== "off";
  const setupProgress = useMemo(() => paceSetupProgress(props.setupMilestones), [props.setupMilestones]);
  const unavailable = Boolean(props.suppressed || externalDialogOpen);
  const customerSignal = signals.find((signal) => signal.source === "Klantcontext");
  const queryHints = useMemo(() => getPaceQueryHints(context), [context]);
  const conversationActive = activeQuestion !== null;
  const usagePercent = quota ? (quota.tier === "basic" ? quota.daily_count / quota.quota : quota.monthly_count / quota.quota) * 100 : 0;
  const modeLabel = paceAssistantModeLabel({ aiEnabled: preferences.aiEnabled, liveStoreContext: preferences.liveStoreContext, thinking });
  const thinkingStatus = paceThinkingStatus({ aiEnabled: preferences.aiEnabled, liveStoreContext: preferences.liveStoreContext, slow: thinkingSlow });
  const truthState = derivePaceTruthState({
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
  const expression = derivePaceExpression(truthState, preferences.motion, primary.tone);
  const truthStateLabel = paceTruthStateLabel(truthState.phase);

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
    setQuery("");
    queryRunRef.current += 1;
  }, [props.storeId]);

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
    setThinking(true);
    try {
      const ai = await askPaceAi(question, context, conversation, local, {
        enabled: preferences.aiEnabled,
        includeLiveStoreContext: preferences.liveStoreContext,
        conversation: {
          id: serverConversation?.id,
          revision: serverConversation?.revision,
          clientTurnId: crypto.randomUUID(),
        },
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
          ? `${error.message} Je vraag is daarom alleen met lokale productkennis beantwoord.`
          : local.limitation,
      } : local);
      setResponseSource("local");
      setCitations([]);
      setClarification(null);
      remember(local.answer);
    } finally {
      if (queryRunRef.current === runId) setThinking(false);
    }
  };

  const returnToOverview = () => {
    queryRunRef.current += 1;
    setThinking(false);
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
          <PaceMark size={46} active={open || shouldBadge} emotion={expression.emotion} tone={expression.tone} performance={expression.performance} stateLabel={truthStateLabel} motionMode={preferences.motion} expressive={preferences.expressiveMorphs} />
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
                  <PaceMark size={52} active emotion={expression.emotion} tone={expression.tone} performance={expression.performance} stateLabel={truthStateLabel} motionMode={preferences.motion} expressive={preferences.expressiveMorphs} />
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
                            <PaceMark size={76} active emotion={expression.emotion} tone={expression.tone} performance={expression.performance} stateLabel={truthStateLabel} motionMode={preferences.motion} expressive={preferences.expressiveMorphs} />
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
