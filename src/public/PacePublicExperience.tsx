import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowRight, Check, CloudOff, EyeOff, ShieldCheck, Sparkles } from "lucide-react";
import { useState } from "react";
import { PaceMark, type PaceEmotion } from "../pace/PaceMark";

type SceneId = "setup" | "rush" | "offline";

const SCENES: Record<SceneId, { label: string; eyebrow: string; title: string; body: string; note: string; emotion: PaceEmotion; tone: "flow" | "attention" | "success" }> = {
  setup: { label: "Opstarten", eyebrow: "Volgende stap · controleerbaar", title: "Je eerste categorie ontbreekt nog.", body: "Ik open de bestaande categorie-instellingen. Jij kiest en bewaart; ik neem niets over.", note: "3 van 4 basisstappen klaar", emotion: "guiding", tone: "flow" },
  rush: { label: "Spitsuur", eyebrow: "Stille modus · kassa actief", title: "Ik blijf uit de weg terwijl jij verkoopt.", body: "Geen pop-up, geen onderbreking. Alleen een subtiel signaal als iets de verkoop werkelijk blokkeert.", note: "Afrekenflow krijgt voorrang", emotion: "sleeping", tone: "flow" },
  offline: { label: "Offline", eyebrow: "Operationeel signaal", title: "Verbinding weg. Je kassa blijft klaar.", body: "Ik toon wat lokaal veilig doorgaat en hoeveel wijzigingen wachten op synchronisatie—zonder zelf financiële acties uit te voeren.", note: "2 wijzigingen veilig in wachtrij", emotion: "attentive", tone: "attention" },
};

export const PacePublicStory = ({ compact = false }: { compact?: boolean }) => {
  const [scene, setScene] = useState<SceneId>("setup");
  const [playback, setPlayback] = useState(0);
  const reducedMotion = useReducedMotion();
  const current = SCENES[scene];
  return (
    <section className={`pw-pace-story${compact ? " is-compact" : ""}`} aria-label="Interactieve demonstratie van Pace">
      <div className="pw-pace-story-copy"><span className="pw-eyebrow">Pace · context zonder ruis</span><h2>{compact ? <>Hulp die weet wanneer ze<br />moet verdwijnen.</> : <>Niet nog een chatbot.<br />Een rustige operationele laag.</>}</h2><p>Pace begrijpt waar je werkt, laat bestaande PWAYMENT-flows intact en maakt de volgende veilige stap zichtbaar.</p>{compact && <a className="pw-text-link" href="/pace">Ontmoet Pace <ArrowRight size={15} /></a>}</div>
      <div className="pw-pace-demo">
        <div className="pw-pace-tabs" role="tablist" aria-label="Pace-situaties">{(Object.keys(SCENES) as SceneId[]).map((id) => <button key={id} type="button" role="tab" aria-selected={scene === id} onClick={() => { setScene(id); setPlayback((value) => value + 1); }}>{SCENES[id].label}</button>)}</div>
        <AnimatePresence mode="wait" initial={false}><motion.div className="pw-pace-live" key={`${scene}-${playback}`} initial={reducedMotion ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={reducedMotion ? undefined : { opacity: 0, y: -8 }} transition={{ duration: .28, ease: [0.22, 1, 0.36, 1] }}><button className="pw-pace-character" type="button" onClick={() => setPlayback((value) => value + 1)} aria-label="Speel de Pace-animatie opnieuw"><PaceMark size={compact ? 154 : 184} active emotion={current.emotion} performance={scene === "setup" ? "stretch" : scene === "rush" ? "slither" : "liquid"} tone={current.tone} motionMode={reducedMotion ? "off" : "full"} /><span>Nog eens</span></button><div className="pw-pace-message"><span>{scene === "offline" ? <CloudOff size={13} /> : scene === "rush" ? <EyeOff size={13} /> : <Sparkles size={13} />} {current.eyebrow}</span><h3>{current.title}</h3><p>{current.body}</p><div><Check size={14} /> {current.note}</div></div></motion.div></AnimatePresence>
      </div>
    </section>
  );
};

export const PacePublicPage = () => (
  <>
    <section className="pw-pace-hero pw-shell"><motion.div initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .7, ease: [0.22, 1, 0.36, 1] }}><span className="pw-eyebrow">Maak kennis met Pace</span><h1>Software die aanvoelt<br />wanneer je hulp nodig hebt.</h1><p>Pace is de contextuele begeleider in PWAYMENT. Geen los chatvenster, geen autonome beslisser en geen irritante paperclip—wel een levende, rustige interface tussen jou en je winkel.</p><div className="pw-page-actions"><a className="pw-button pw-button-dark" href="/register">Start gratis <ArrowRight size={16} /></a><a className="pw-text-link" href="#pace-live">Zie hoe Pace reageert <ArrowRight size={15} /></a></div></motion.div><motion.div className="pw-pace-hero-mark" initial={{ opacity: 0, scale: .82, rotate: -5 }} animate={{ opacity: 1, scale: 1, rotate: 0 }} transition={{ duration: .9, delay: .12, ease: [0.22, 1, 0.36, 1] }}><i className="pw-pace-ring is-one" /><i className="pw-pace-ring is-two" /><PaceMark size={210} active emotion="attentive" tone="flow" motionMode="full" /></motion.div></section>
    <div id="pace-live" className="pw-shell"><PacePublicStory /></div>
    <section className="pw-pace-principles pw-shell">{[[EyeOff, "Kent het verschil tussen helpen en storen", "Bij betalen, PIN, kritieke modals en drukke kassamomenten trekt Pace zich automatisch terug."], [ShieldCheck, "Handelt nooit stiekem", "Pace opent bestaande schermen en verklaart status. Jij bevestigt gevoelige, financiële en definitieve acties."], [CloudOff, "Blijft nuttig zonder AI of internet", "Setup, context, signalen en navigatie werken lokaal. Externe AI is optioneel, standaard uit en niet nodig voor de kern."]].map(([Icon, title, body]) => <article key={String(title)}><Icon size={24} /><h2>{String(title)}</h2><p>{String(body)}</p></article>)}</section>
    <section className="pw-pace-boundary"><div className="pw-shell"><span className="pw-eyebrow">Het anti-Clippy contract</span><h2>Pace verdient aandacht.<br />Hij eist ze nooit op.</h2><p>Instelbare proactiviteit, beweging en antwoordstijl. Eén klik om signalen te dempen. Volledige ondersteuning voor reduced motion. Geen verkoopdata naar een AI-provider zolang je dat niet bewust activeert.</p><a href="/product" className="pw-button pw-button-light">Bekijk het platform <ArrowRight size={16} /></a></div></section>
  </>
);
