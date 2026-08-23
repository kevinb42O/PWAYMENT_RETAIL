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
import { PaceMark } from "./PaceMark";
import { usePace, type PaceMotion, type PaceProactivity, type PaceTone } from "./usePace";
import { askPaceAi } from "./paceAi";
import {
  paceSetupProgress,
  type PaceSetupMilestone,
} from "./setupMilestones";

interface PaceAssistantProps extends PaceContext {
  userName: string | null;
  setupMilestones: PaceSetupMilestone[];
  suppressed?: boolean;
  onNavigate: (view: MainView) => void;
  onOpenSetup: () => void;
  onOpenProfile: (tab: "billing" | "modules" | "catalog-products" | "webshop-general") => void;
  onOpenMilestone: (milestone: PaceSetupMilestone) => void;
}

const executeAction = (
  action: PaceAction,
  handlers: Pick<PaceAssistantProps, "onNavigate" | "onOpenSetup" | "onOpenProfile">,
) => {
  if (action.kind === "navigate") handlers.onNavigate(action.view);
  if (action.kind === "setup") handlers.onOpenSetup();
  if (action.kind === "profile") handlers.onOpenProfile(action.tab);
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
    toggle,
    setOpen,
    setSettingsOpen,
    updatePreferences,
    dismissSignal,
    resetDismissedSignals,
  } = usePace();
  const prefersReducedMotion = useReducedMotion();
  const [query, setQuery] = useState("");
  const [response, setResponse] = useState<ReturnType<typeof answerPaceQuery> | null>(null);
  const [responseSource, setResponseSource] = useState<"openai" | "local">("local");
  const [thinking, setThinking] = useState(false);
  const [externalDialogOpen, setExternalDialogOpen] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const context: PaceContext = useMemo(() => ({
    view: props.view,
    role: props.role,
    productCount: props.productCount,
    cartCount: props.cartCount,
    firstRunCompleted: props.firstRunCompleted,
    online: props.online,
    pendingSync: props.pendingSync,
  }), [props.view, props.role, props.productCount, props.cartCount, props.firstRunCompleted, props.online, props.pendingSync]);
  const signals = useMemo(
    () => buildPaceSignals(context, preferences).filter((signal) => !dismissedSignals.includes(signal.id)),
    [context, preferences, dismissedSignals],
  );
  const primary = signals[0] ?? buildPaceSignals(context, preferences).at(-1)!;
  const shouldBadge = primary.priority >= 70 && preferences.proactivity !== "quiet";
  const canAnimate = !prefersReducedMotion && preferences.motion !== "off";
  const setupProgress = useMemo(() => paceSetupProgress(props.setupMilestones), [props.setupMilestones]);
  const unavailable = Boolean(props.suppressed || externalDialogOpen);

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

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!query.trim() || thinking) return;
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

  const runAction = (action: PaceAction) => {
    executeAction(action, props);
    if (action.kind !== "none") setOpen(false);
  };

  return (
    <>
      {!unavailable && <button
        type="button"
        className={`pace-trigger ${open ? "is-open" : ""} ${!preferences.enabled ? "is-disabled" : ""}`}
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
        <PaceMark size={38} active={open || shouldBadge} tone={primary.tone} motionMode={preferences.motion} />
        <span className="pace-trigger-label">Pace</span>
        {shouldBadge && !open && <span className={`pace-signal-dot is-${primary.tone}`} aria-label="Pace heeft een relevant signaal" />}
      </button>}

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
              aria-modal="true"
              aria-label="Pace operationele assistent"
              initial={canAnimate ? { opacity: 0, x: 28, scale: 0.985 } : false}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={canAnimate ? { opacity: 0, x: 20, scale: 0.99 } : { opacity: 0 }}
              transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            >
              <header className="pace-panel-header">
                <div className="pace-identity">
                  <PaceMark size={52} active thinking={thinking} tone={primary.tone} motionMode={preferences.motion} />
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
                    <div className="pace-settings-card">
                      <ToggleRow label="Pace actief" detail="Toon Pace op dit toestel" checked={preferences.enabled} onChange={(enabled) => updatePreferences({ enabled })} />
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
                    </div>

                    <section className={`pace-live-brief is-${primary.tone}`}>
                      <div className="pace-brief-top"><span>{primary.source}</span><Gauge size={15} /></div>
                      <h3>{primary.title}</h3>
                      <p>{signalCopy(primary, preferences.tone)}</p>
                      <div className="pace-brief-actions">
                        {primary.actionLabel && <button type="button" onClick={() => runAction(primary.action)}>{primary.actionLabel}<ArrowRight size={15} /></button>}
                        {primary.priority >= 65 && <button type="button" className="is-quiet" onClick={() => dismissSignal(primary.id)}>Niet meer tonen</button>}
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
                          <button key={signal.id} type="button" onClick={() => signal.action.kind !== "none" ? runAction(signal.action) : undefined} className="pace-mini-signal">
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
