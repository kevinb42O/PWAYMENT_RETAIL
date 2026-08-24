import { motion, useReducedMotion } from "motion/react";
import { ArrowRight, CalendarClock, CloudOff, EyeOff, Heart, ShieldCheck, UserRoundCheck } from "lucide-react";
import { PaceMark } from "../pace/PaceMark";

export const PaceHomeTeaser = () => (
  <section className="pw-pace-home-teaser" aria-label="Maak kennis met Pace">
    <div><span className="pw-eyebrow">Pace · jouw winkelassistent</span><h2>Van winkeldata<br />naar betere service.</h2><p>Pace brengt precies op het juiste moment relevante context naar je team. Ontdek het volledige klantvoorbeeld op de Pace-pagina.</p><a className="pw-text-link" href="/pace">Maak kennis met Pace <ArrowRight size={15} /></a></div>
    <PaceMark size={174} active emotion="attentive" tone="flow" motionMode="subtle" />
  </section>
);

export const PaceCustomerStory = () => {
  const reducedMotion = useReducedMotion();

  return (
    <section className="pw-pace-customer-story" aria-label="Pace voorbeeld voor een terugkerende klant">
      <motion.div
        className="pw-pace-customer-copy"
        initial={reducedMotion ? false : { opacity: 0, y: 18 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.35 }}
        transition={{ duration: .55, ease: [0.22, 1, 0.36, 1] }}
      >
        <span className="pw-eyebrow">Pace · op het juiste moment</span>
        <h2>Persoonlijke service,<br />zonder giswerk.</h2>
        <p>Wanneer een klant zich met toestemming herkent, brengt Pace relevante aankoopcontext naar de kassa. De medewerker krijgt één bruikbare gesprekstip—geen dossier om uit te pluizen.</p>
        <a className="pw-text-link" href="/customers">Bekijk klanten & loyaliteit <ArrowRight size={15} /></a>
      </motion.div>

      <motion.div
        className="pw-pace-customer-demo"
        initial={reducedMotion ? false : { opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.25 }}
        transition={{ duration: .65, delay: .08, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="pw-pace-demo-bar">
          <div><span /><span /><span /></div>
          <strong>Voorbeeld · terugkerende klant</strong>
          <span className="pw-pace-consent"><ShieldCheck size={12} /> Toestemming actief</span>
        </div>
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
            <article><Heart size={18} /><div><span>Smaakprofiel</span><strong>Voorkeur voor Samsøe Samsøe</strong><p>De nieuwe collectie van dit merk is net binnen.</p></div></article>
            <div className="pw-pace-conversation-tip"><UserRoundCheck size={16} /><p><span>Gesprekstip</span>“Hoe bevalt de blazer? Zit maat M goed?”</p></div>
          </div>
        </div>
        <div className="pw-pace-demo-foot"><ShieldCheck size={13} /><span>Pace suggereert. De medewerker beslist. Alleen gegevens uit deze winkel.</span></div>
      </motion.div>
    </section>
  );
};

export const PacePublicPage = () => (
  <>
    <section className="pw-pace-hero pw-shell"><motion.div initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .7, ease: [0.22, 1, 0.36, 1] }}><span className="pw-eyebrow">Maak kennis met Pace</span><h1>Software die aanvoelt<br />wanneer je hulp nodig hebt.</h1><p>Pace is de contextuele begeleider in PWAYMENT. Geen los chatvenster, geen autonome beslisser en geen irritante paperclip—wel een levende, rustige interface tussen jou en je winkel.</p><div className="pw-page-actions"><a className="pw-button pw-button-dark" href="/register">Start gratis <ArrowRight size={16} /></a><a className="pw-text-link" href="#pace-live">Zie hoe Pace reageert <ArrowRight size={15} /></a></div></motion.div><motion.div className="pw-pace-hero-mark" initial={{ opacity: 0, scale: .82, rotate: -5 }} animate={{ opacity: 1, scale: 1, rotate: 0 }} transition={{ duration: .9, delay: .12, ease: [0.22, 1, 0.36, 1] }}><PaceMark size={210} active emotion="attentive" tone="flow" motionMode="full" /></motion.div></section>
    <div id="pace-live" className="pw-shell pw-pace-customer-page"><PaceCustomerStory /></div>
    <section className="pw-pace-principles pw-shell">{[[EyeOff, "Kent het verschil tussen helpen en storen", "Bij betalen, PIN, kritieke modals en drukke kassamomenten trekt Pace zich automatisch terug."], [ShieldCheck, "Handelt nooit stiekem", "Pace opent bestaande schermen en verklaart status. Jij bevestigt gevoelige, financiële en definitieve acties."], [CloudOff, "Blijft nuttig zonder AI of internet", "Setup, context, signalen en navigatie werken lokaal. Externe AI is optioneel, standaard uit en niet nodig voor de kern."]].map(([Icon, title, body]) => <article key={String(title)}><Icon size={24} /><h2>{String(title)}</h2><p>{String(body)}</p></article>)}</section>
    <section className="pw-pace-boundary"><div className="pw-shell"><span className="pw-eyebrow">Het anti-Clippy contract</span><h2>Pace verdient aandacht.<br />Hij eist ze nooit op.</h2><p>Instelbare proactiviteit, beweging en antwoordstijl. Eén klik om signalen te dempen. Volledige ondersteuning voor reduced motion. Geen verkoopdata naar een AI-provider zolang je dat niet bewust activeert.</p><a href="/product" className="pw-button pw-button-light">Bekijk het platform <ArrowRight size={16} /></a></div></section>
  </>
);
