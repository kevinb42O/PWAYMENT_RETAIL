import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  ArrowRight,
  Check,
  ChevronLeft,
  CircleDot,
  Command,
  Eye,
  EyeOff,
  Gauge,
  RotateCcw,
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
} from "./paceSignals";
import { PaceMark, type PacePerformance } from "./PaceMark";
import { usePace, type PaceMotion, type PaceProactivity, type PaceTone } from "./usePace";
import { askPaceAi } from "./paceAi";
import {
  paceSetupProgress,
  type PaceSetupMilestone,
} from "./setupMilestones";

interface PaceAssistantProps extends PaceContext {
  userName: string | null;
  setupMilestones: PaceSetupMilestone[];
  customerName?: string;
  suppressed?: boolean;
  onNavigate: (view: MainView) => void;
  onOpenSetup: () => void;
  onOpenProfile: (tab: "billing" | "modules" | "catalog-products" | "webshop-general" | "integrations") => void;
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

const SelectRow = <T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) => (
  <label className="pace-setting-row">
    <span>{label}</span>
    <select value={value} onChange={(event) => onChange(event.target.value as T)}>
      {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  </label>
);

const ToggleRow = ({ label, detail, checked, onChange }: { label: string; detail: string; checked: boolean; onChange: (checked: boolean) => void }) => (
  <label className="pace-toggle-row">
    <span><strong>{label}</strong><small>{detail}</small></span>
    <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
  </label>
);

export const PaceAssistant = (props: PaceAssistantProps) => {
  const {
    open,
    settingsOpen,
    preferences,
    dismissedSignals,
    customerFeedback,
    toggle,
    setOpen,
    setSettingsOpen,
    updatePreferences,
    dismissSignal,
    resetDismissedSignals,
    recordCustomerFeedback,
  } = usePace();
  const prefersReducedMotion = useReducedMotion();
  const [query, setQuery] = useState("");
  const [response, setResponse] = useState<ReturnType<typeof answerPaceQuery> | null>(null);
  const [responseSource, setResponseSource] = useState<"openai" | "local">("local");
  const [thinking, setThinking] = useState(false);
  const [performance, setPerformance] = useState<PacePerformance | null>(null);
  const [performanceKey, setPerformanceKey] = useState(0);
  const [externalDialogOpen, setExternalDialogOpen] = useState(false);
  const [sessionDismissedSignals, setSessionDismissedSignals] = useState<string[]>([]);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const context: PaceContext = useMemo(() => ({
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
    customerInsights: props.customerInsights,
  }), [props.view, props.role, props.productCount, props.cartCount, props.firstRunCompleted, props.online, props.pendingSync, props.retryingSync, props.failedSync, props.syncIssueSummary, props.syncIssueResolution, props.customerInsights]);
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

  useEffect(() => {
    setSessionDismissedSignals([]);
  }, [props.customerName]);

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

  useEffect(() => {
    if (!performance) return;
    const timer = window.setTimeout(() => setPerformance(null), 3_050);
    return () => window.clearTimeout(timer);
  }, [performance, performanceKey]);

  useEffect(() => {
    if (!preferences.expressiveMorphs) setPerformance(null);
  }, [preferences.expressiveMorphs]);

  const playPerformance = (next: PacePerformance) => {
    setPerformance(next);
    setPerformanceKey((current) => current + 1);
  };
  const performanceLabel = performance === "question" ? "Vraagteken" : performance === "exclamation" ? "Uitroepteken" : performance === "liquid" ? "Blob" : null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!query.trim() || thinking) return;
    // A known local delivery failure has a deterministic, privacy-safe answer.
    // Prefer it over a generic AI response so "waarom?" always names the real
    // cause currently stored on this register.
    if (
      (context.failedSync > 0 || context.retryingSync > 0) &&
      /sync|offline|verbinding|wachtrij|fout|waarom|mislukt/.test(query.toLocaleLowerCase("nl-BE"))
    ) {
      setResponse(answerPaceQuery(query, context));
      setResponseSource("local");
      return;
    }
    setThinking(true);
    try {
      const ai = await askPaceAi(query, context);
      setResponse({
        title: "Antwoord vanuit Pace AI",
        answer: ai.answer,
        action: { kind: "none" },
      });
      setResponseSource("openai");
    } catch {
      setResponse(answerPaceQuery(query, context));
      setResponseSource("local");
    } finally {
      setThinking(false);
    }
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
            setSettingsOpen(true);
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
        <PaceMark size={46} active={open || shouldBadge} emotion={open ? "thinking" : undefined} tone={primary.tone} motionMode={preferences.motion} expressive={preferences.expressiveMorphs} />
        {shouldBadge && !open && <span className={`pace-signal-dot is-${primary.tone}`} aria-label="Pace heeft een relevant signaal" />}
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
                  <button type="button" onClick={() => setSettingsOpen(!settingsOpen)} aria-label="Pace-instellingen" title="Pace-instellingen"><Settings2 size={17} /></button>
                  <button ref={closeButtonRef} type="button" onClick={() => setOpen(false)} aria-label="Sluit Pace"><X size={18} /></button>
                </div>
              </header>

              <AnimatePresence mode="wait" initial={false}>
                {settingsOpen ? (
                  <motion.div className="pace-scroll" key="settings" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 8 }} transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}>
                    <button className="pace-back-link" type="button" onClick={() => setSettingsOpen(false)}><ChevronLeft size={15} /> Terug naar live context</button>
                    <div className="pace-section-heading"><span>Persoonlijke werking</span><h3>{props.userName ? `${props.userName}, jij bepaalt het tempo.` : "Jij bepaalt zijn tempo."}</h3><p>Deze voorkeuren blijven op dit toestel. Winkelrechten en beveiliging zijn altijd leidend.</p></div>
                    <section className="pace-motion-lab" aria-label="Pace Motion Lab">
                      <div className="pace-motion-lab-stage">
                        <PaceMark key={performanceKey} size={108} active emotion="attentive" performance={performance} motionMode="full" forceMotion expressive={preferences.expressiveMorphs} />
                        <span><Sparkles size={13} /> MOTION LAB</span>
                      </div>
                      <div className="pace-motion-lab-copy"><strong>Morph Pace.</strong><small>Elke test keert veilig terug naar het originele merkteken.</small></div>
                      <div className="pace-motion-lab-controls">
                        {([
                          ["question", "Vraagteken"],
                          ["exclamation", "Uitroepteken"],
                          ["liquid", "Blob"],
                        ] as Array<[PacePerformance, string]>).map(([mode, label]) => <button key={mode} type="button" className={performance === mode ? "is-playing" : ""} onClick={() => playPerformance(mode)} aria-pressed={performance === mode} disabled={!preferences.expressiveMorphs}>{label}</button>)}
                      </div>
                      <div className={`pace-motion-status${performance ? " is-playing" : ""}`} aria-live="polite"><i /> {!preferences.expressiveMorphs ? "Expressieve morphs staan uit" : performanceLabel ? `${performanceLabel} speelt nu` : "Kies een performance om hem direct af te spelen"}</div>
                      {(preferences.motion === "off" || prefersReducedMotion) && <p>Automatische beweging blijft uit; een bewust aangeklikte labpreview speelt één keer af.</p>}
                    </section>
                    <div className="pace-settings-card">
                      <ToggleRow label="Pace actief" detail="Toon Pace op dit toestel" checked={preferences.enabled} onChange={(enabled) => updatePreferences({ enabled })} />
                      <ToggleRow label="Expressieve morphs" detail="Vraagteken, uitroepteken en blob" checked={preferences.expressiveMorphs} onChange={(expressiveMorphs) => updatePreferences({ expressiveMorphs })} />
                      <ToggleRow label="Klantcontext" detail="Toon lokale service-inzichten na klantkoppeling" checked={preferences.customerGuidance} onChange={(customerGuidance) => updatePreferences({ customerGuidance })} />
                      <SelectRow<PaceProactivity> label="Proactiviteit" value={preferences.proactivity} onChange={(proactivity) => updatePreferences({ proactivity })} options={[{ value: "quiet", label: "Stil" }, { value: "balanced", label: "Gebalanceerd" }, { value: "coach", label: "Coach" }]} />
                      <SelectRow<PaceMotion> label="Beweging" value={preferences.motion} onChange={(motion) => updatePreferences({ motion })} options={[{ value: "full", label: "Volledig" }, { value: "subtle", label: "Subtiel" }, { value: "off", label: "Uit" }]} />
                      <SelectRow<PaceTone> label="Antwoorden" value={preferences.tone} onChange={(tone) => updatePreferences({ tone })} options={[{ value: "compact", label: "Kort" }, { value: "friendly", label: "Vriendelijk" }, { value: "explanatory", label: "Met uitleg" }]} />
                    </div>
                    <div className="pace-settings-card">
                      <ToggleRow label="Operationele signalen" detail="Offline status en lokale wachtrij" checked={preferences.operationalSignals} onChange={(operationalSignals) => updatePreferences({ operationalSignals })} />
                      <ToggleRow label="Configuratiehulp" detail="Volgende stap bij winkelinstellingen" checked={preferences.setupGuidance} onChange={(setupGuidance) => updatePreferences({ setupGuidance })} />
                      <ToggleRow label="Inzichtbegeleiding" detail="Van patroon naar controleerbare actie" checked={preferences.insightGuidance} onChange={(insightGuidance) => updatePreferences({ insightGuidance })} />
                    </div>
                    <button type="button" className="pace-reset-button" onClick={resetDismissedSignals}><RotateCcw size={15} /> Gesloten signalen herstellen</button>
                    <button type="button" className="pace-disable-button" onClick={() => updatePreferences({ enabled: false })}><EyeOff size={15} /> Pace nu uitschakelen</button>
                  </motion.div>
                ) : (
                  <motion.div className="pace-scroll" key="live" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}>
                    <div className="pace-context-rail" aria-label="Actieve Pace-context">
                      <span><CircleDot size={12} /> {props.online ? "Online" : "Offline-ready"}</span>
                      <span><Eye size={12} /> {props.view}</span>
                      <span><ShieldCheck size={12} /> {props.role ?? "gebruiker"}</span>
                      {props.customerName && <span><Eye size={12} /> Klant · {props.customerName}</span>}
                    </div>

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

                    <section className="pace-command-zone">
                      <div className="pace-stack-label"><Command size={14} /> Vraag vanuit deze context</div>
                      <form onSubmit={submit}>
                        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="bv. waar beheer ik producten?" aria-label="Vraag Pace" />
                        <button type="submit" disabled={!query.trim() || thinking} aria-label="Stuur vraag"><Send size={16} /></button>
                      </form>
                      <div className="pace-query-hints">
                        {["Syncstatus", "Product toevoegen", "Retour zoeken"].map((hint) => <button key={hint} type="button" onClick={() => setQuery(hint)}>{hint}</button>)}
                      </div>
                    </section>

                    <AnimatePresence mode="wait">
                      {(thinking || response) && (
                        <motion.section className="pace-response" key={thinking ? "thinking" : response?.title} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }}>
                          {thinking ? <><span className="pace-thinking-line" /><span className="pace-thinking-line is-short" /></> : response && <><div><Check size={14} /> PACE · {responseSource === "openai" ? "OPENAI" : "LOKALE CONTEXT"}</div><h3>{response.title}</h3><p>{response.answer}</p>{response.actionLabel && <button type="button" onClick={() => runAction(response.action)}>{response.actionLabel}<ArrowRight size={14} /></button>}</>}
                        </motion.section>
                      )}
                    </AnimatePresence>

                    <footer className="pace-trust-line"><ShieldCheck size={14} /> Pace voert geen financiële of gevoelige actie zelfstandig uit.</footer>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.aside>
          </>
        )}
      </AnimatePresence>, document.body)}
    </>
  );
};
