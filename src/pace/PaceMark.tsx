import { motion, useReducedMotion } from "motion/react";
import type { CSSProperties } from "react";
import type { PaceSignalTone } from "./paceSignals";
import type { PaceMotion } from "./usePace";
import "./pace.css";

export type PaceEmotion = "idle" | "attentive" | "thinking" | "guiding" | "celebrating" | "sleeping";

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

export const PaceMark = ({
  size = 42,
  active = false,
  thinking = false,
  emotion,
  tone = "flow",
  motionMode = "full",
}: {
  size?: number;
  active?: boolean;
  thinking?: boolean;
  emotion?: PaceEmotion;
  tone?: PaceSignalTone;
  motionMode?: PaceMotion;
}) => {
  const reducedMotion = useReducedMotion();
  const canMove = !reducedMotion && motionMode !== "off";
  const fullMotion = canMove && motionMode === "full";
  const state: PaceEmotion = emotion ?? (thinking ? "thinking" : active ? "attentive" : "idle");
  const accent = tone === "attention" ? "#f59e0b" : tone === "success" ? "#10b981" : "#00d9ff";
  const pause = state === "celebrating" ? 1.8 : state === "thinking" ? 0 : 0.35;

  return (
    <motion.span
      className={`pace-mark-stage is-${state}`}
      style={{ width: size, height: size, perspective: Math.max(180, size * 5), "--pace-accent": accent } as CSSProperties}
      role="img"
      aria-label={`Pace · ${state}`}
      initial={false}
      animate={canMove ? { y: state === "sleeping" ? [0, 1, 0] : [0, -1.5, 0], scale: state === "celebrating" ? [1, 1.08, 1] : 1 } : undefined}
      transition={canMove ? { duration: state === "celebrating" ? 1.35 : 3.8, repeat: Infinity, repeatDelay: pause, ease: "easeInOut" } : undefined}
    >
      <motion.span
        className="pace-mark-orbit"
        aria-hidden="true"
        animate={fullMotion ? { rotate: state === "thinking" ? 360 : [0, 14, -8, 0], opacity: active || state !== "idle" ? [0.28, 0.72, 0.28] : [0.16, 0.35, 0.16] } : { opacity: 0.26 }}
        transition={{ duration: state === "thinking" ? 3.2 : 4.4, repeat: Infinity, ease: state === "thinking" ? "linear" : "easeInOut" }}
      />
      <motion.span
        className="pace-mark-rig"
        aria-hidden="true"
        initial={false}
        animate={movementFor(state, fullMotion)}
        transition={{ duration: durationFor(state), repeat: canMove ? Infinity : 0, repeatDelay: pause, ease: state === "thinking" ? "linear" : [0.22, 1, 0.36, 1] }}
      >
        {DEPTH_LAYERS.map((depth) => <span key={depth} className="pace-mark-plane pace-mark-depth" style={{ transform: `translateZ(${depth}px)` }} />)}
        <span className="pace-mark-plane pace-mark-back" />
        <span className="pace-mark-plane pace-mark-front"><i className="pace-mark-sheen" /></span>
      </motion.span>
      {state === "celebrating" && <motion.span className="pace-mark-burst" aria-hidden="true" animate={fullMotion ? { scale: [0.7, 1.25, 1], opacity: [0, 0.8, 0] } : { opacity: 0.35 }} transition={{ duration: 1.25, repeat: Infinity, repeatDelay: 1.9 }} />}
    </motion.span>
  );
};
