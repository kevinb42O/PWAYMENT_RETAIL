import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  ArrowRight,
  Check,
  Command,
  Gauge,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
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
import { askPaceAi, type PaceConversationTurn } from "./paceAi";
import {
  paceSetupProgress,
  type PaceSetupMilestone,
} from "./setupMilestones";

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
  onOpenMilestone: (milestone: PaceSetupMilestone) => void;
}

const executeAction = (
  action: PaceAction,
  handlers: Pick<PaceAssistantProps, "onNavigate" | "onOpenSetup" | "onOpenProfile" | "onOpenCatalog">,
) => {
  if (action.kind === "navigate") handlers.onNavigate(action.view);
  if (action.kind === "setup") handlers.onOpenSetup();
  if (action.kind === "profile") handlers.onOpenProfile(action.tab);
  if (action.kind === "catalog") handlers.onOpenCatalog({ productIds: action.productIds, label: action.filterLabel });
};

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
  const [response, setResponse] = useState<PaceQueryAnswer | null>(null);
  const [responseSource, setResponseSource] = useState<"gemini" | "openai" | "local">("local");
  const [thinking, setThinking] = useState(false);
  const [externalDialogOpen, setExternalDialogOpen] = useState(false);
  const [sessionDismissedSignals, setSessionDismissedSignals] = useState<string[]>([]);
  const [conversation, setConversation] = useState<PaceConversationTurn[]>([]);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
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
  const conversationExpanded = thinking || response !== null;

  useEffect(() => {
    setSessionDismissedSignals([]);
  }, [props.customerName]);

  useEffect(() => {
    setConversation([]);
  }, [props.storeId]);

  useEffect(() => {
    void hydrateScope(props.storeId ?? null, props.userId);
  }, [hydrateScope, props.storeId, props.userId]);

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
    setResponse(null);
  }, [props.view]);

  const runQuery = async (rawQuestion: string) => {
    const question = rawQuestion.trim();
    if (!question || thinking) return;
    setQuery(question);
    const local = answerPaceQuery(question, context);
    const remember = (answer: string) => setConversation((current) => [
      ...current,
      { role: "user" as const, text: question },
      { role: "assistant" as const, text: answer },
    ].slice(-6));
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
      });
      setResponse({ ...local, title: local.matched ? local.title : "Dit heb ik voor je gevonden", answer: ai.answer });
      setResponseSource(ai.source);
      remember(ai.answer);
    } catch {
      setResponse(local);
      setResponseSource("local");
      remember(local.answer);
    } finally {
      setThinking(false);
    }
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    void runQuery(query);
  };

  const runAction = (action: PaceAction, customerInsightId?: string) => {
    executeAction(action, props);
    if (action.kind === "catalog" && customerInsightId) recordCustomerFeedback(customerInsightId, "used");
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
          <PaceMark size={46} active={open || shouldBadge} emotion={open ? "thinking" : undefined} tone={primary.tone} motionMode={preferences.motion} expressive={preferences.expressiveMorphs} />
          {shouldBadge && !open && <span className={`pace-signal-dot is-${primary.tone}`} />}
        </span>
        <span className="pace-trigger-label">Vraag Pace</span>
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
                <div className="pace-identity">
                  <PaceMark size={52} active thinking={thinking} tone={primary.tone} motionMode={preferences.motion} expressive={preferences.expressiveMorphs} />
                  <div><span>PWAYMENT · LIVE CONTEXT</span><h2>Pace</h2></div>
                </div>
                <div className="pace-header-actions">
                  <button type="button" onClick={() => { props.onOpenProfile("pace"); setOpen(false); }} aria-label="Open volledige Pace-instellingen" title="Pace-instellingen"><Settings2 size={17} /></button>
                  <button ref={closeButtonRef} type="button" onClick={() => setOpen(false)} aria-label="Sluit Pace"><X size={18} /></button>
                </div>
              </header>

              <motion.div className={`pace-scroll pace-live-layout${conversationExpanded ? " has-conversation" : ""}`} key="live" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}>
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

                    {(props.role === "owner" || props.role === "manager") && (
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
                    </div>

                    <section className={`pace-conversation-window${conversationExpanded ? " is-expanded" : " is-collapsed"}`}>
                      {conversationExpanded && <div className="pace-conversation-body">
                        <AnimatePresence mode="wait">
                          {(thinking || response) && (
                            <motion.section className="pace-response" key={thinking ? "thinking" : response?.title} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }}>
                              {thinking ? <div className="pace-thinking-performance">
                                <PaceMark size={76} active thinking tone={primary.tone} motionMode={preferences.motion} expressive={preferences.expressiveMorphs} />
                                <div className="pace-thinking-copy">
                                  <strong>Pace denkt met je mee</strong>
                                  <span className="pace-thinking-steps" aria-live="polite">
                                    <i>Je vraag begrijpen</i>
                                    <i>Je winkelcontext erbij nemen</i>
                                    <i>Een helder antwoord maken</i>
                                  </span>
                                </div>
                              </div> : response && <>
                                <div><Check size={14} /> PACE · {responseSource === "gemini" ? "GEMINI" : responseSource === "openai" ? "OPENAI" : "LOKALE KENNIS"}</div>
                                <h3>{response.title}</h3>
                                <p>{response.answer}</p>
                                {response.steps && response.steps.length > 0 && <ol className="pace-response-steps">{response.steps.map((step) => <li key={step}>{step}</li>)}</ol>}
                                {response.limitation && <p className="pace-response-limit"><ShieldCheck size={13} /> {response.limitation}</p>}
                                {response.actionLabel && <button type="button" onClick={() => runAction(response.action)}>{response.actionLabel}<ArrowRight size={14} /></button>}
                                {response.followUps && response.followUps.length > 0 && <div className="pace-response-followups">{response.followUps.slice(0, 3).map((followUp) => <button key={followUp} type="button" onClick={() => void runQuery(followUp)}>{followUp}</button>)}</div>}
                              </>}
                            </motion.section>
                          )}
                        </AnimatePresence>
                      </div>}

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
                          <button type="submit" disabled={!query.trim() || thinking} aria-label="Stuur vraag"><Send size={16} /></button>
                        </form>
                        {conversationExpanded && <div className="pace-query-hints">
                          {queryHints.map((hint) => <button key={hint} type="button" onClick={() => void runQuery(hint)}>{hint}</button>)}
                        </div>}
                      </section>

                      {conversationExpanded && <footer className="pace-trust-line"><ShieldCheck size={14} /> Pace voert geen financiële of gevoelige actie zelfstandig uit.</footer>}
                    </section>
              </motion.div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>, document.body)}
    </>
  );
};
