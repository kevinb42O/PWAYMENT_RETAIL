import { motion, useReducedMotion } from "motion/react";
import { useId, type CSSProperties } from "react";
import type { PaceSignalTone } from "./paceSignals";
import { paceTonePalette } from "./pacePalette";
import type { PaceMotion } from "./usePace";
import { PACE_MORPH_BODY, PACE_MORPH_DOT, type PaceGlyph } from "./paceMorphPaths";
import "./pace.css";

export type PaceEmotion = "idle" | "attentive" | "thinking" | "guiding" | "celebrating" | "sleeping";
export type PacePerformance = "question" | "exclamation" | "liquid";
export type PacePose = "rest" | "focus" | "split" | "gather" | "shield" | "path" | "settle" | "notch" | "tether";
export type PaceEnergy = "still" | "low" | "medium";

export const resolvePaceMotion = ({ reducedMotion, motionMode, forceMotion = false }: { reducedMotion: boolean; motionMode: PaceMotion; forceMotion?: boolean }) => ({
  canMove: forceMotion || (!reducedMotion && motionMode !== "off"),
  fullMotion: forceMotion || (!reducedMotion && motionMode === "full"),
});

const DEPTH_LAYERS = [-5, -4, -3, -2, -1] as const;

const movementFor = (state: PaceEmotion, pose: PacePose, fullMotion: boolean) => {
  if (!fullMotion) return { rotateY: 0, rotateX: 0, rotateZ: 0, z: 0 };
  if (pose === "settle") return { rotateY: 0, rotateX: 0, rotateZ: 0, z: 0 };
  if (pose === "shield") return { rotateY: [0, -2, 2, 0], rotateX: [0, 1, 0], rotateZ: 0, z: [0, 1, 0] };
  if (pose === "gather") return { rotateY: [0, -8, 6, 0], rotateX: [0, 2, -1, 0], rotateZ: [0, -0.8, 0], z: [0, 2, 0] };
  if (pose === "split") return { rotateY: [0, -5, 5, 0], rotateX: [0, 1.5, -1.5, 0], rotateZ: 0, z: [0, 1, 0] };
  switch (state) {
    case "thinking": return { rotateY: [0, -11, 8, 0], rotateX: [0, 3, -2, 0], rotateZ: [0, -1.2, 0.8, 0], z: [0, 2, 1, 0] };
    case "guiding": return { rotateY: [0, -34, -8, 20, 0, 360], rotateX: [0, 7, -3, 0], rotateZ: [0, -4, 2, 0], z: [0, 7, 2, 0] };
    case "celebrating": return { rotateY: [0, 190, 360], rotateX: [0, -16, 0], rotateZ: [0, -8, 5, 0], z: [0, 13, 0] };
    case "attentive": return { rotateY: [0, -22, 14, 0, 0, 360], rotateX: [0, 5, -2, 0], rotateZ: [0, -2, 1, 0], z: [0, 4, 0] };
    case "sleeping": return { rotateY: 18, rotateX: 9, rotateZ: 3, z: -2 };
    default: return { rotateY: [0, -12, 0, 10, 0, 0, 360], rotateX: [0, 3, 0, -2, 0], rotateZ: [0, -1, 0, 1, 0], z: [0, 2, 0] };
  }
};

const durationFor = (state: PaceEmotion) => {
  if (state === "thinking") return 3.4;
  if (state === "celebrating") return 1.35;
  if (state === "guiding") return 5.6;
  if (state === "attentive") return 6.4;
  if (state === "sleeping") return 4.8;
  return 7.2;
};

const performanceSequence = (glyph: PaceGlyph) => [PACE_MORPH_BODY.pace, PACE_MORPH_BODY[glyph], PACE_MORPH_BODY[glyph], PACE_MORPH_BODY.pace];
const dotSequence = (glyph: PaceGlyph) => [PACE_MORPH_DOT.pace, PACE_MORPH_DOT[glyph], PACE_MORPH_DOT[glyph], PACE_MORPH_DOT.pace];
export const PACE_THINKING_GLYPH_SEQUENCE = ["pace", "question", "question", "liquid", "liquid", "question", "pace"] as const satisfies readonly PaceGlyph[];

export const resolvePaceGlyph = ({ state, tone, active, performance, expressive = true }: { state: PaceEmotion; tone: PaceSignalTone; active: boolean; performance?: PacePerformance | null; expressive?: boolean }): PaceGlyph =>
  expressive ? performance ?? (state === "thinking" ? "question" : tone === "attention" && active ? "exclamation" : "pace") : "pace";

export const PaceMark = ({
  size = 42,
  active = false,
  thinking = false,
  emotion,
  tone = "flow",
  motionMode = "full",
  performance = null,
  forceMotion = false,
  expressive = true,
  stateLabel,
  pose = "rest",
  energy = "low",
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
  /** Allows the operational ? / ! / liquid silhouettes. */
  expressive?: boolean;
  /** Public, truthful state label supplied by the experience controller. */
  stateLabel?: string;
  /** Semantic pose selected by the expression mapper. */
  pose?: PacePose;
  /** Motion intensity selected after user and OS motion preferences. */
  energy?: PaceEnergy;
}) => {
  const gradientId = `pace-gradient-${useId().replaceAll(":", "")}`;
  const sheenId = `${gradientId}-sheen`;
  const bodyId = `${gradientId}-body`;
  const dotId = `${gradientId}-dot`;
  const reducedMotion = useReducedMotion();
  const { canMove, fullMotion } = resolvePaceMotion({ reducedMotion: Boolean(reducedMotion), motionMode, forceMotion });
  const state: PaceEmotion = emotion ?? (thinking ? "thinking" : active ? "attentive" : "idle");
  const palette = paceTonePalette(tone);
  const pause = state === "celebrating" ? 1.8 : state === "thinking" ? 0 : 0.35;
  const performanceActive = Boolean(expressive && performance && fullMotion);
  // Semantic work poses own Pace's body language. The legacy punctuation/blob
  // cycle is reserved for explicit expression previews and must never mask a
  // truthful operational state.
  const thinkingMorphActive = Boolean(expressive && !performance && state === "thinking" && pose === "rest" && fullMotion);
  const morphActive = performanceActive || thinkingMorphActive;
  const poseOwnsGlyph = pose === "focus" || pose === "gather" || pose === "split" || pose === "shield" || pose === "settle";
  const glyph = poseOwnsGlyph ? "pace" : resolvePaceGlyph({ state, tone, active, performance, expressive });
  const bodySequence = thinkingMorphActive
    ? PACE_THINKING_GLYPH_SEQUENCE.map((step) => PACE_MORPH_BODY[step])
    : performanceActive ? performanceSequence(glyph) : [PACE_MORPH_BODY.pace, PACE_MORPH_BODY[glyph]];
  const dotSequenceValues = thinkingMorphActive
    ? PACE_THINKING_GLYPH_SEQUENCE.map((step) => PACE_MORPH_DOT[step])
    : performanceActive ? dotSequence(glyph) : [PACE_MORPH_DOT.pace, PACE_MORPH_DOT[glyph]];
  const animateGlyph = morphActive || (canMove && glyph !== "pace");
  const morphDuration = thinkingMorphActive ? 5.6 : performanceActive ? 2.8 : 0.72;
  const morphTimes = thinkingMorphActive ? "0;0.14;0.3;0.48;0.67;0.84;1" : performanceActive ? "0;0.24;0.72;1" : "0;1";

  return (
    <motion.span
      className={`pace-mark-stage is-${state} tone-${tone} pose-${pose} energy-${energy}${performanceActive ? " is-performing" : ""}${thinkingMorphActive ? " is-pondering" : ""}`}
      data-pace-pose={pose}
      data-pace-energy={energy}
      style={{ width: size, height: size, perspective: Math.max(180, size * 5), "--pace-accent": palette.accent, "--pace-color-start": palette.start, "--pace-color-end": palette.end, "--pace-color-depth": palette.depth } as CSSProperties}
      role="img"
      aria-label={`Pace · ${stateLabel ?? state}`}
      initial={false}
      animate={canMove ? { y: state === "sleeping" ? [0, 1, 0] : [0, -1.5, 0], scale: state === "celebrating" ? [1, 1.08, 1] : 1 } : undefined}
      transition={canMove ? { duration: state === "celebrating" ? 1.35 : 3.8, repeat: Infinity, repeatDelay: pause, ease: "easeInOut" } : undefined}
    >
      <span className="pace-mark-choreography" aria-hidden="true">
        <i className="pace-choreo-ring pace-choreo-ring-a" />
        <i className="pace-choreo-ring pace-choreo-ring-b" />
        <i className="pace-source-node pace-source-node-a" />
        <i className="pace-source-node pace-source-node-b" />
        <i className="pace-source-node pace-source-node-c" />
        <i className="pace-compare-plane pace-compare-plane-a" />
        <i className="pace-compare-plane pace-compare-plane-b" />
        <svg className="pace-shield-trace" viewBox="0 0 100 100"><path d="M50 10 80 22v24c0 20-12 34-30 44C32 80 20 66 20 46V22Z" /></svg>
        <svg className="pace-settle-trace" viewBox="0 0 100 100"><circle cx="50" cy="50" r="39" /><path d="m32 51 12 12 25-28" /></svg>
      </span>
      <motion.span
        className={`pace-mark-morph${performanceActive ? ` is-${performance}` : ""}${thinkingMorphActive ? " is-pondering" : ""}`}
        aria-hidden="true"
      >
        <motion.span
          className="pace-mark-rig"
          initial={false}
          animate={movementFor(state, pose, fullMotion && !morphActive)}
          transition={{ duration: durationFor(state), repeat: canMove && !morphActive ? Infinity : 0, repeatDelay: pause, ease: state === "thinking" ? "linear" : [0.22, 1, 0.36, 1] }}
        >
          <svg className="pace-mark-vector" viewBox="-7 -5 114 112" overflow="visible" shapeRendering="geometricPrecision">
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="var(--pace-color-start)" />
                <stop offset="0.76" stopColor="var(--pace-color-end)" />
              </linearGradient>
              <linearGradient id={sheenId} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0.12" stopColor="white" stopOpacity="0" />
                <stop offset="0.48" stopColor="white" stopOpacity="0.62" />
                <stop offset="0.7" stopColor="white" stopOpacity="0" />
              </linearGradient>
              <path id={bodyId} d={animateGlyph ? bodySequence[0] : PACE_MORPH_BODY[glyph]}>
                {animateGlyph && <animate attributeName="d" values={bodySequence.join(";")} keyTimes={morphTimes} dur={`${morphDuration}s`} repeatCount={thinkingMorphActive ? "indefinite" : "1"} fill="freeze" />}
              </path>
              <path id={dotId} d={animateGlyph ? dotSequenceValues[0] : PACE_MORPH_DOT[glyph]}>
                {animateGlyph && <animate attributeName="d" values={dotSequenceValues.join(";")} keyTimes={morphTimes} dur={`${morphDuration}s`} repeatCount={thinkingMorphActive ? "indefinite" : "1"} fill="freeze" />}
              </path>
            </defs>
            {DEPTH_LAYERS.map((depth) => (
              <use key={depth} className="pace-mark-vector-depth" href={`#${bodyId}`} transform={`translate(${depth * 0.42} ${depth * -0.28})`} />
            ))}
            <use className="pace-mark-vector-front" href={`#${bodyId}`} fill={`url(#${gradientId})`} />
            <motion.use className="pace-mark-vector-sheen" href={`#${bodyId}`} fill={`url(#${sheenId})`} animate={{ opacity: morphActive ? [0.26, 0.7, 0.4, 0.62, 0.26] : 0.38 }} transition={{ duration: thinkingMorphActive ? 5.6 : performanceActive ? 2.8 : 0.4, times: morphActive ? [0, 0.2, 0.4, 0.76, 1] : undefined, repeat: thinkingMorphActive ? Infinity : 0, ease: "easeInOut" }} />
            <use className="pace-mark-vector-rim" href={`#${bodyId}`} />
            <use className="pace-mark-vector-dot-depth" href={`#${dotId}`} transform="translate(-2 2)" />
            <use className="pace-mark-vector-dot" href={`#${dotId}`} fill={`url(#${gradientId})`} />
            <use className="pace-mark-vector-dot-rim" href={`#${dotId}`} />
          </svg>
        </motion.span>
      </motion.span>
    </motion.span>
  );
};
