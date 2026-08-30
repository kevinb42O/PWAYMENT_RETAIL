import { motion } from 'motion/react';
import { legalIdentityComplete, legalPlaceholders } from '../config/legal';
import { legalIntro, legalMeta, legalSections, legalTitles } from './legalContent';

const ease = [0.22, 1, 0.36, 1] as const;
const fadeUp = { hidden: { opacity: 0, y: 28 }, visible: { opacity: 1, y: 0, transition: { duration: 0.72, ease } } };
const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.06, delayChildren: 0.02 } } };

const LegalPage = ({ type }: { type: string }) => {
  const title = legalTitles[type] || 'Juridische informatie';
  const sections = legalSections[type] || [];
  return <motion.section className="pw-legal pw-shell" initial="hidden" animate="visible" variants={stagger}>
    <motion.span className="pw-eyebrow" variants={fadeUp}>Juridisch</motion.span>
    <motion.h1 variants={fadeUp}>{title}</motion.h1>
    <motion.p className="pw-legal-lead" variants={fadeUp}>{legalIntro[type]}</motion.p>
    <motion.p className="pw-legal-updated" variants={fadeUp}>Versie {legalMeta.version} · van kracht vanaf {legalMeta.effectiveDate}</motion.p>
    {!legalIdentityComplete && <motion.div className="pw-legal-warning" role="status" variants={fadeUp}><strong>Publicatievoorbehoud</strong><span>De juridische tekst is inhoudelijk voorbereid. Voor definitieve contractering moeten de gemarkeerde bedrijfsvelden nog worden ingevuld: {legalPlaceholders.join(', ')}.</span></motion.div>}
    <motion.article variants={fadeUp}>{sections.map((section) => <section key={section.title}><h2>{section.title}</h2>{section.body}</section>)}</motion.article>
    <motion.p className="pw-legal-language" variants={fadeUp}>{legalMeta.governingLanguage}</motion.p>
  </motion.section>;
};

export default LegalPage;
