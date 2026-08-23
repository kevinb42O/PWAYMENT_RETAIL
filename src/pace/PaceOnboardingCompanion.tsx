import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { CheckCircle2, ShieldCheck, Sparkles } from "lucide-react";
import { PaceMark } from "./PaceMark";

export type PaceOnboardingStep = "account" | "store" | "retail-needs" | "modules" | "data" | "review";

const STEP_COPY: Record<PaceOnboardingStep, { eyebrow: string; title: string; body: string }> = {
  account: {
    eyebrow: "Veilige start",
    title: "Alleen wat je account nodig heeft.",
    body: "Pace leest of bewaart je wachtwoord en PIN nooit. Die velden blijven volledig buiten zijn context.",
  },
  store: {
    eyebrow: "Winkelcontext",
    title: "Je sector stuurt de juiste vragen.",
    body: "Dit verandert geen verkoopdata. Het helpt PWAYMENT relevante assortiment- en workflowkeuzes voor te stellen.",
  },
  "retail-needs": {
    eyebrow: "Assortimentsmodel",
    title: "Vereisten zijn nog geen functieschakelaars.",
    body: "Je antwoorden beschrijven wat je assortiment nodig heeft. Activering blijft een aparte, controleerbare stap.",
  },
  modules: {
    eyebrow: "Werkruimte",
    title: "Kies wat je team werkelijk gebruikt.",
    body: "Kassa, historiek en dagafsluiting blijven aanwezig. Extra werkstromen bepalen welke navigatie en setup later relevant zijn.",
  },
  data: {
    eyebrow: "Eerste route",
    title: "Je bestaande productwereld bepaalt het vertrekpunt.",
    body: "Pace gebruikt dit alleen om na registratie de juiste bestaande import- of productflow te openen.",
  },
  review: {
    eyebrow: "Klaarzetten",
    title: "Je keuzes worden nu een werkbare start.",
    body: "Na registratie begeleidt Pace je naar ticketgegevens, categorieën en je eerste verkoopbare product.",
  },
};

export const PaceOnboardingCompanion = ({
  step,
  progress,
  compact = false,
  hasError = false,
}: {
  step: PaceOnboardingStep;
  progress: number;
  compact?: boolean;
  hasError?: boolean;
}) => {
  const reducedMotion = useReducedMotion();
  const copy = STEP_COPY[step];
  return (
    <aside className={`pace-onboarding-companion${compact ? " is-compact" : ""}`} aria-live="polite">
      <PaceMark
        size={compact ? 42 : 58}
        active
        emotion={hasError ? "attentive" : step === "review" ? "celebrating" : "guiding"}
        performance={step === "review" && !hasError ? "portal" : null}
        tone={hasError ? "attention" : step === "review" ? "success" : "flow"}
        motionMode={reducedMotion ? "off" : step === "review" ? "full" : "subtle"}
      />
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={step}
          initial={reducedMotion ? false : { opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reducedMotion ? undefined : { opacity: 0, y: -4 }}
          transition={{ duration: 0.2 }}
        >
          <span>{hasError ? <ShieldCheck size={12} /> : step === "review" ? <CheckCircle2 size={12} /> : <Sparkles size={12} />} {copy.eyebrow}</span>
          <strong>{copy.title}</strong>
          {!compact && <p>{copy.body}</p>}
        </motion.div>
      </AnimatePresence>
      <div className="pace-onboarding-progress" aria-label={`${progress}% onboarding voltooid`}><i style={{ width: `${progress}%` }} /></div>
    </aside>
  );
};
