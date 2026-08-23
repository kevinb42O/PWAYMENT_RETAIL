import { motion, useReducedMotion } from "motion/react";
import { useId, type CSSProperties } from "react";
import type { PaceSignalTone } from "./paceSignals";
import { paceTonePalette } from "./pacePalette";
import type { PaceMotion } from "./usePace";
import "./pace.css";

export type PaceEmotion = "idle" | "attentive" | "thinking" | "guiding" | "celebrating" | "sleeping";
export type PacePerformance = "stretch" | "slither" | "liquid" | "portal";

export const resolvePaceMotion = ({ reducedMotion, motionMode, forceMotion = false }: { reducedMotion: boolean; motionMode: PaceMotion; forceMotion?: boolean }) => ({
  canMove: forceMotion || (!reducedMotion && motionMode !== "off"),
  fullMotion: forceMotion || (!reducedMotion && motionMode === "full"),
});

const DEPTH_LAYERS = [-7, -6, -5, -4, -3, -2, -1] as const;

const movementFor = (state: PaceEmotion, fullMotion: boolean) => {
  if (!fullMotion) return { rotateY: 0, rotateX: 0, rotateZ: 0, z: 0 };
  switch (state) {
    case "thinking": return { rotateY: [0, 360], rotateX: [0, -7, 5, 0], rotateZ: [0, 2, -2, 0], z: [0, 5, 0] };
    case "guiding": return { rotateY: [0, -34, -8, 20, 0, 360], rotateX: [0, 7, -3, 0], rotateZ: [0, -4, 2, 0], z: [0, 7, 2, 0] };
    case "celebrating": return { rotateY: [0, 190, 360], rotateX: [0, -16, 0], rotateZ: [0, -8, 5, 0], z: [0, 13, 0] };
    case "attentive": return { rotateY: [0, -22, 14, 0, 0, 360], rotateX: [0, 5, -2, 0], rotateZ: [0, -2, 1, 0], z: [0, 4, 0] };
    case "sleeping": return { rotateY: 18, rotateX: 9, rotateZ: 3, z: -2 };
    default: return { rotateY: [0, -12, 0, 10, 0, 0, 360], rotateX: [0, 3, 0, -2, 0], rotateZ: [0, -1, 0, 1, 0], z: [0, 2, 0] };
  }
};

const durationFor = (state: PaceEmotion) => {
  if (state === "thinking") return 4.8;
  if (state === "celebrating") return 1.35;
  if (state === "guiding") return 5.6;
  if (state === "attentive") return 6.4;
  if (state === "sleeping") return 4.8;
  return 7.2;
};

const performanceMovement = (performance?: PacePerformance | null) => {
  switch (performance) {
    case "stretch": return { x: [0, 19, -9, 10, 0], scaleX: [1, 2.38, 0.56, 1.72, 1], scaleY: [1, 0.34, 1.34, 0.61, 1], skewX: [0, -13, 11, -6, 0], rotateZ: [0, -4, 5, -2, 0] };
    case "slither": return { x: [0, -68, -31, 18, 72, 0], y: [0, 5, -6, 5, -4, 0], scaleX: [1, 1.55, 1.28, 1.62, 1.35, 1], scaleY: [1, 0.55, 0.82, 0.5, 0.74, 1], rotateZ: [0, 8, -10, 9, -6, 0], skewX: [0, 18, -15, 19, -12, 0] };
    case "liquid": return { scaleX: [1, 1.4, 0.5, 1.66, 0.72, 1], scaleY: [1, 0.61, 1.58, 0.46, 1.34, 1], rotateZ: [0, 10, -17, 13, -6, 0], y: [0, 7, -8, 9, -4, 0] };
    case "portal": return { scaleX: [1, 1.35, 1.75, 0.12, 0.12, 1.4, 1], scaleY: [1, 0.65, 0.08, 0.08, 1.55, 0.72, 1], rotateZ: [0, 12, 90, 270, 360, 374, 360], opacity: [1, 1, 0.85, 0.22, 0.9, 1, 1] };
    default: return undefined;
  }
};

const performanceTimes = (performance?: PacePerformance | null) => {
  if (performance === "stretch") return [0, 0.2, 0.47, 0.73, 1];
  if (performance === "slither" || performance === "liquid") return [0, 0.16, 0.36, 0.58, 0.8, 1];
  if (performance === "portal") return [0, 0.13, 0.3, 0.45, 0.62, 0.82, 1];
  return undefined;
};

const displacementFor = (performance?: PacePerformance | null) => {
  if (performance === "slither") return [0, 27, -23, 25, -16, 0];
  if (performance === "liquid") return [0, 38, -31, 44, -20, 0];
  if (performance === "stretch") return [0, 9, -7, 5, 0];
  return 0;
};

const PerformanceForm = ({ performance }: { performance: PacePerformance }) => (
  <motion.span
    className={`pace-performance-form is-${performance}`}
    aria-hidden="true"
    initial={{ opacity: 1, scale: 0.72, rotate: 0 }}
    animate={{ opacity: [1, 1, 1, 1, 1, 0], scale: [0.72, 0.82, 1.08, 0.94, 1, 0.78], rotate: performance === "portal" ? [0, 0, 45, 220, 405, 450] : [0, 0, -4, 3, 0, 0] }}
    transition={{ duration: 2.8, times: [0, 0.13, 0.24, 0.56, 0.84, 1], ease: [0.22, 1, 0.36, 1] }}
  >
    {performance === "stretch" && <span className="pace-form-ribbon"><i /></span>}
    {performance === "slither" && (
      <svg className="pace-form-slither" viewBox="0 0 180 100" preserveAspectRatio="none">
        <motion.path d="M-8 68 C24 8 48 94 79 43 S137 12 188 66" pathLength="1" initial={{ pathLength: 0 }} animate={{ pathLength: [0, 1, 1, 0.88] }} transition={{ duration: 2.2, delay: 0.34, ease: [0.22, 1, 0.36, 1] }} />
        <motion.path className="pace-form-slither-highlight" d="M-8 68 C24 8 48 94 79 43 S137 12 188 66" pathLength="1" initial={{ pathLength: 0 }} animate={{ pathLength: [0, 1, 1, 0.9] }} transition={{ duration: 2.05, delay: 0.43, ease: [0.22, 1, 0.36, 1] }} />
      </svg>
    )}
    {performance === "liquid" && <span className="pace-form-liquid"><i /><b /></span>}
    {performance === "portal" && <span className="pace-form-portal"><i /><b /></span>}
  </motion.span>
);

export const PaceMark = ({
  size = 42,
  active = false,
  thinking = false,
  emotion,
  tone = "flow",
  motionMode = "full",
  performance = null,
  forceMotion = false,
}: {
  size?: number;
  active?: boolean;
  thinking?: boolean;
  emotion?: PaceEmotion;
  tone?: PaceSignalTone;
  motionMode?: PaceMotion;
  performance?: PacePerformance | null;
  /** Only for an explicit, user-triggered one-shot preview such as Motion Lab. */
  forceMotion?: boolean;
}) => {
  const filterId = `pace-displace-${useId().replaceAll(":", "")}`;
  const reducedMotion = useReducedMotion();
  const { canMove, fullMotion } = resolvePaceMotion({ reducedMotion: Boolean(reducedMotion), motionMode, forceMotion });
  const state: PaceEmotion = emotion ?? (thinking ? "thinking" : active ? "attentive" : "idle");
  const palette = paceTonePalette(tone);
  const pause = state === "celebrating" ? 1.8 : state === "thinking" ? 0 : 0.35;
  const performanceActive = Boolean(performance && fullMotion);

  return (
    <motion.span
      className={`pace-mark-stage is-${state} tone-${tone}${performanceActive ? " is-performing" : ""}`}
      style={{ width: size, height: size, perspective: Math.max(180, size * 5), "--pace-accent": palette.accent, "--pace-color-start": palette.start, "--pace-color-end": palette.end, "--pace-color-depth": palette.depth } as CSSProperties}
      role="img"
      aria-label={`Pace · ${state}`}
      initial={false}
      animate={canMove ? { y: state === "sleeping" ? [0, 1, 0] : [0, -1.5, 0], scale: state === "celebrating" ? [1, 1.08, 1] : 1 } : undefined}
      transition={canMove ? { duration: state === "celebrating" ? 1.35 : 3.8, repeat: Infinity, repeatDelay: pause, ease: "easeInOut" } : undefined}
    >
      <svg className="pace-morph-defs" aria-hidden="true" width="0" height="0">
        <filter id={filterId} x="-45%" y="-45%" width="190%" height="190%" colorInterpolationFilters="sRGB">
          <motion.feTurbulence
            type="fractalNoise"
            baseFrequency="0.012 0.055"
            numOctaves="2"
            seed="7"
            animate={performanceActive ? { baseFrequency: performance === "slither" ? ["0.008 0.04", "0.025 0.095", "0.012 0.06"] : ["0.01 0.035", "0.035 0.085", "0.009 0.045"] } : undefined}
            transition={{ duration: 2.8, ease: "easeInOut" }}
            result="noise"
          />
          <motion.feDisplacementMap
            in="SourceGraphic"
            in2="noise"
            xChannelSelector="R"
            yChannelSelector="B"
            animate={performanceActive ? { scale: displacementFor(performance) } : { scale: 0 }}
            transition={{ duration: 2.8, ease: [0.22, 1, 0.36, 1] }}
          />
        </filter>
      </svg>
      <motion.span
        className="pace-mark-orbit"
        aria-hidden="true"
        animate={fullMotion ? { rotate: state === "thinking" ? 360 : [0, 14, -8, 0], opacity: active || state !== "idle" ? [0.28, 0.72, 0.28] : [0.16, 0.35, 0.16] } : { opacity: 0.26 }}
        transition={{ duration: state === "thinking" ? 3.2 : 4.4, repeat: Infinity, ease: state === "thinking" ? "linear" : "easeInOut" }}
      />
      <motion.span
        className={`pace-mark-morph${performanceActive ? ` is-${performance}` : ""}`}
        aria-hidden="true"
        style={{ filter: performanceActive && performance !== "portal" ? `url(#${filterId})` : undefined }}
        initial={false}
        animate={performanceActive ? { ...performanceMovement(performance), opacity: [1, 0, 0, 1] } : undefined}
        transition={{ duration: 2.8, times: performanceTimes(performance), ease: [0.22, 1, 0.36, 1], opacity: { duration: 2.8, times: [0, 0.12, 0.82, 1], ease: [0.22, 1, 0.36, 1] } }}
      >
        <motion.span
          className="pace-mark-rig"
          initial={false}
          animate={movementFor(state, fullMotion && !performanceActive)}
          transition={{ duration: durationFor(state), repeat: canMove && !performanceActive ? Infinity : 0, repeatDelay: pause, ease: state === "thinking" ? "linear" : [0.22, 1, 0.36, 1] }}
        >
          {DEPTH_LAYERS.map((depth) => <span key={depth} className="pace-mark-plane pace-mark-depth" style={{ transform: `translateZ(${depth}px)` }} />)}
          <span className="pace-mark-plane pace-mark-back" />
          <span className="pace-mark-plane pace-mark-front"><i className="pace-mark-sheen" /></span>
        </motion.span>
      </motion.span>
      {performanceActive && performance && <PerformanceForm performance={performance} />}
      {state === "celebrating" && <motion.span className="pace-mark-burst" aria-hidden="true" animate={fullMotion ? { scale: [0.7, 1.25, 1], opacity: [0, 0.8, 0] } : { opacity: 0.35 }} transition={{ duration: 1.25, repeat: Infinity, repeatDelay: 1.9 }} />}
    </motion.span>
  );
};
