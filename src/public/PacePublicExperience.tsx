import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import {
  ArrowRight,
  CalendarClock,
  Check,
  CloudOff,
  EyeOff,
  ListChecks,
  PackageSearch,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Store,
  UserRoundCheck,
} from "lucide-react";
import { PaceMark } from "../pace/PaceMark";

const setupImage = "/mail-assets/screenshot_0_guided_store_setup.png";
const paceContextImage = "/mail-assets/screenshot_2_pace_context.png";
const inventoryImage = "/website/pwayment-insights-inventory-current.jpg";

const HOME_SCENARIOS = [
  {
    tab: "Opstarten",
    eyebrow: "Nieuwe winkel · volgende veilige stap",
    title: "Je eerste categorie ontbreekt nog.",
    body: "Pace volgt de echte winkelstatus en opent de bestaande categorie-instellingen. Jij kiest en bewaart; Pace neemt niets over.",
    meta: "3 van 4 basisstappen klaar",
    icon: Store,
  },
  {
    tab: "Spitsuur",
    eyebrow: "Verkoop in opbouw · bewust stil",
    title: "Twee artikelen staan klaar om af te rekenen.",
    body: "Pace begrijpt dat betalen nu voorrang krijgt, onderbreekt de kassaflow niet en bewaart de setupactie voor daarna.",
    meta: "Kassa in focus",
    icon: EyeOff,
  },
  {
    tab: "Voorraad",
    eyebrow: "Voorraadcontext · verklaarbaar advies",
    title: "Dit product loopt sneller dan je huidige dekking.",
    body: "Pace verbindt voorraad, verkooptempo, minimumgrens en leverancier. Het toont de reden en opent het bestelvoorstel; jij beslist.",
    meta: "Geen automatische bestelling",
    icon: PackageSearch,
  },
] as const;

export const PaceHomeTeaser = () => {
  const [active, setActive] = useState(0);
  const reducedMotion = useReducedMotion();
  const scenario = HOME_SCENARIOS[active];
  const Icon = scenario.icon;

  return (
    <section id="pace-in-action" className="pw-pace-story is-compact" aria-label="Pace in drie winkelsituaties">
      <div className="pw-pace-story-copy">
        <span className="pw-eyebrow">Geen extra dashboard. Geen losse chatbot.</span>
        <h2>Pace werkt waar<br />je winkel werkt.</h2>
        <p>Pace begrijpt de actieve werkruimte, de rol van de medewerker en de echte winkelstatus. Zo verschijnt hulp op het juiste moment—en verdwijnt ze wanneer snelheid of aandacht telt.</p>
        <a className="pw-text-link" href="/pace">Ontdek de visie achter Pace <ArrowRight size={15} /></a>
      </div>

      <div className="pw-pace-demo">
        <div className="pw-pace-tabs" role="tablist" aria-label="Kies een Pace-situatie">
          {HOME_SCENARIOS.map((item, index) => (
            <button key={item.tab} type="button" role="tab" aria-selected={active === index} onClick={() => setActive(index)}>{item.tab}</button>
          ))}
        </div>
        <div className="pw-pace-live">
          <motion.button
            type="button"
            className="pw-pace-character"
            aria-label="Speel de Pace-animatie opnieuw"
            onClick={() => setActive((active + 1) % HOME_SCENARIOS.length)}
            key={`mark-${active}`}
            initial={reducedMotion ? false : { opacity: 0, scale: .9 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <PaceMark size={138} active emotion={active === 1 ? "idle" : "guiding"} tone={active === 2 ? "attention" : "flow"} motionMode={reducedMotion ? "off" : "full"} />
            <span>Volgende situatie</span>
          </motion.button>
          <motion.article className="pw-pace-message" key={scenario.title} initial={reducedMotion ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .35 }}>
            <span><Icon size={13} />{scenario.eyebrow}</span>
            <h3>{scenario.title}</h3>
            <p>{scenario.body}</p>
            <div><Check size={13} />{scenario.meta}</div>
          </motion.article>
        </div>
      </div>
    </section>
  );
};

export const PaceCustomerStory = () => {
  const reducedMotion = useReducedMotion();

  return (
    <section className="pw-pace-customer-story" aria-label="Pace voorbeeld voor een terugkerende klant">
      <motion.div className="pw-pace-customer-copy" initial={reducedMotion ? false : { opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.35 }} transition={{ duration: .55, ease: [0.22, 1, 0.36, 1] }}>
        <span className="pw-eyebrow">Pace · op het juiste moment</span>
        <h2>Persoonlijke service,<br />zonder giswerk.</h2>
        <p>Wanneer een medewerker bewust een klant koppelt, berekent Pace relevante service-inzichten lokaal op de kassa. Eén bruikbare gesprekstip—geen dossier om uit te pluizen.</p>
        <a className="pw-text-link" href="/customers">Bekijk klanten &amp; loyaliteit <ArrowRight size={15} /></a>
      </motion.div>

      <motion.div className="pw-pace-customer-demo" initial={reducedMotion ? false : { opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.25 }} transition={{ duration: .65, delay: .08, ease: [0.22, 1, 0.36, 1] }}>
        <div className="pw-pace-demo-bar"><div><span /><span /><span /></div><strong>Voorbeeld · terugkerende klant</strong><span className="pw-pace-consent"><ShieldCheck size={12} /> Klant bewust gekoppeld</span></div>
        <div className="pw-pace-demo-body">
          <div className="pw-pace-returning-customer">
            <span className="pw-pace-demo-label">Klant herkend</span>
            <div className="pw-pace-customer-name"><span>AV</span><div><strong>Anneke V.</strong><small>Terug in de winkel</small></div></div>
            <div className="pw-pace-purchase-row"><span>11 dagen geleden</span><strong>Blazer · maat M</strong><small>Samsøe Samsøe</small></div>
            <div className="pw-pace-cart-total"><span>Huidig mandje</span><strong>€ 89,00</strong></div>
          </div>
          <div className="pw-pace-insight-panel">
            <div className="pw-pace-insight-heading"><PaceMark size={42} active emotion="attentive" tone="attention" motionMode={reducedMotion ? "off" : "subtle"} /><div><span>Pace klanteninzicht</span><strong>Voor Anneke</strong></div></div>
            <article className="is-urgent"><CalendarClock size={18} /><div><span>Ruiltermijn</span><strong>Vraag of de blazer goed zit.</strong><p>Vandaag is volgens het winkelbeleid de laatste dag om maat M te ruilen.</p></div></article>
            <article><ListChecks size={18} /><div><span>Merkinteresse</span><strong>2 eerdere aankopen bij Samsøe Samsøe</strong><p>4 artikelen van dit merk zijn beschikbaar. Een feitelijk patroon, geen voorspeld smaakprofiel.</p></div></article>
            <div className="pw-pace-conversation-tip"><UserRoundCheck size={16} /><p><span>Gesprekstip</span>“Hoe bevalt de blazer? Zit maat M goed?”</p></div>
          </div>
        </div>
        <div className="pw-pace-demo-foot"><ShieldCheck size={13} /><span>Pace suggereert. De medewerker beslist. Alleen gegevens uit deze winkel.</span></div>
      </motion.div>
    </section>
  );
};

const PACE_CAPABILITIES = [
  [ListChecks, "Begrijpt de context", "Pace leest de actieve werkruimte, rol, winkelstatus en verbindingsstatus. Daardoor hoef je niet eerst uit te leggen waar je bezig bent."],
  [Sparkles, "Maakt betekenis zichtbaar", "Pace verbindt de relevante signalen en legt in mensentaal uit waarom iets nu aandacht verdient."],
  [RefreshCw, "Opent de veilige volgende stap", "Pace stuurt naar de bestaande PWAYMENT-workflow. Geen parallel proces en geen verborgen mutatie."],
  [UserRoundCheck, "Laat de beslissing bij jou", "Betalingen, voorraadwijzigingen, publicaties en gevoelige handelingen blijven bij de bevoegde medewerker."],
] as const;

const PaceCapabilities = () => (
  <section className="pw-pace-capabilities pw-shell">
    <div className="pw-pace-capabilities-heading"><span className="pw-eyebrow">Van context naar controle</span><h2>Vier stappen.<br />Eén duidelijke grens.</h2><p>Pace koppelt signalen aan de plek waar je werkt en maakt één veilige volgende stap zichtbaar. De operationele waarheid blijft in PWAYMENT; de beslissing blijft bij jou.</p></div>
    <div className="pw-pace-capability-grid">{PACE_CAPABILITIES.map(([Icon, title, body], index) => <article key={title}><span>0{index + 1}</span><Icon size={22} /><h3>{title}</h3><p>{body}</p></article>)}</div>
    <div className="pw-pace-control-strip">
      <div><ShieldCheck size={18} /><span><strong>Jij bevestigt</strong><small>Financiële en definitieve acties blijven bij de medewerker.</small></span></div>
      <div><EyeOff size={18} /><span><strong>Pace trekt zich terug</strong><small>Geen onderbreking tijdens betalen, PIN of kritieke schermen.</small></span></div>
      <div><SlidersHorizontal size={18} /><span><strong>Afstelbaar per gebruiker</strong><small>Kies proactiviteit, beweging, antwoordstijl en winkelcontext.</small></span></div>
    </div>
  </section>
);

const PaceRealWork = () => (
  <section className="pw-pace-real-work pw-shell">
    <div className="pw-pace-real-heading"><span className="pw-eyebrow">Geen conceptdemo</span><h2>Pace werkt in de echte werkruimte.</h2><p>De begeleiding gebruikt dezelfde winkelstatus, rechten en workflows als de rest van PWAYMENT.</p></div>
    <article>
      <div><span>01 / Nieuwe winkel</span><h3>Van leeg account naar een verkoopbare winkel.</h3><p>Pace volgt wat al klaar is en brengt de eigenaar naar ticketgegevens, categorieën, producten en barcode-etiketten.</p><a href="/start" className="pw-text-link">Bekijk de startroutes <ArrowRight size={15} /></a></div>
      <figure><img src={setupImage} alt="Pace begeleidt een nieuwe winkeleigenaar door de eerste winkelsetup" loading="lazy" /><figcaption>De volgende stap komt uit de echte winkelstatus.</figcaption></figure>
    </article>
    <article className="is-reverse">
      <div><span>02 / Winkelvloer</span><h3>Hulp wanneer ze helpt. Stilte wanneer snelheid telt.</h3><p>Pace ziet een verkoop in opbouw, onderbreekt het afrekenen niet en houdt alleen de relevante vervolgactie beschikbaar.</p><a href="/pos" className="pw-text-link">Bekijk de kassawerking <ArrowRight size={15} /></a></div>
      <figure><img src={paceContextImage} alt="Pace toont context naast een verkoop in opbouw" loading="lazy" /><figcaption>De betaalflow krijgt altijd voorrang.</figcaption></figure>
    </article>
    <article>
      <div><span>03 / Voorraadbeslissing</span><h3>Niet alleen melden dat iets opraakt.</h3><p>Pace kan voorraad, verkooptempo, historische vraag en leverancier samenbrengen en de onderliggende PWAYMENT-actie openen.</p><a href="/inventory" className="pw-text-link">Bekijk voorraad &amp; inkoop <ArrowRight size={15} /></a></div>
      <figure><img src={inventoryImage} alt="PWAYMENT voorraadsturing met waarde, stilstand en besteladvies" loading="lazy" /><figcaption>Een inzicht blijft verklaarbaar en controleerbaar.</figcaption></figure>
    </article>
  </section>
);

export const PacePublicPage = () => (
  <>
    <section className="pw-pace-hero pw-shell">
      <motion.div initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .7, ease: [0.22, 1, 0.36, 1] }}>
        <span className="pw-eyebrow">Pace by PWAYMENT</span>
        <h1>De intelligente laag<br />voor de echte winkelvloer.</h1>
        <p>Pace begrijpt waar je werkt, wat al klaar is en welke stap veilig volgt. Geen losse chatbot en geen autonome beslisser—wel contextuele begeleiding in dezelfde retailoperatie.</p>
        <div className="pw-page-actions"><a className="pw-button pw-button-dark" href="#pace-live">Bekijk Pace in de praktijk <ArrowRight size={16} /></a><a className="pw-text-link" href="/demo?interest=pace">Plan een persoonlijke demo <ArrowRight size={15} /></a></div>
      </motion.div>
      <motion.div className="pw-pace-hero-mark" initial={{ opacity: 0, scale: .82, rotate: -5 }} animate={{ opacity: 1, scale: 1, rotate: 0 }} transition={{ duration: .9, delay: .12, ease: [0.22, 1, 0.36, 1] }}><PaceMark size={230} active emotion="attentive" tone="flow" motionMode="full" /></motion.div>
    </section>
    <PaceCapabilities />
    <div id="pace-live"><PaceRealWork /></div>
    <div className="pw-shell pw-pace-customer-page"><PaceCustomerStory /></div>
    <section className="pw-pace-principles pw-shell">{[
      [EyeOff, "Kent het verschil tussen helpen en storen", "Bij betalen, PIN, kritieke modals en drukke kassamomenten trekt Pace zich automatisch terug."],
      [ShieldCheck, "Handelt nooit stiekem", "Pace opent bestaande schermen en verklaart status. Jij bevestigt gevoelige, financiële en definitieve acties."],
      [CloudOff, "Blijft nuttig zonder externe AI", "Setup, lokale signalen en navigatie blijven beschikbaar. Externe AI en actuele winkelcontext worden bewust ingesteld."],
    ].map(([Icon, title, body]) => <article key={String(title)}><Icon size={24} /><h2>{String(title)}</h2><p>{String(body)}</p></article>)}</section>
    <section className="pw-pace-boundary"><div className="pw-shell"><span className="pw-eyebrow">PWAYMENT, powered by Pace</span><h2>De software begrijpt.<br />Jij blijft beslissen.</h2><p>De kracht van Pace zit niet in een los AI-model, maar in de combinatie van winkelcontext, betrouwbare operationele data, rechten, bewijs en veilige bestaande workflows.</p><a href="/demo?interest=pace" className="pw-button pw-button-light">Zie Pace in jouw winkelcontext <ArrowRight size={16} /></a></div></section>
  </>
);
