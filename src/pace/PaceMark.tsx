import { motion, useReducedMotion } from "motion/react";
import { useId } from "react";
import type { PaceSignalTone } from "./paceSignals";
import type { PaceMotion } from "./usePace";

export type PaceEmotion = "idle" | "attentive" | "thinking" | "guiding" | "celebrating" | "sleeping";

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
  const id = useId().replaceAll(":", "");
  const canMove = !reducedMotion && motionMode !== "off";
  const fullMotion = canMove && motionMode === "full";
  const state: PaceEmotion = emotion ?? (thinking ? "thinking" : active ? "attentive" : "idle");
  const accent = tone === "attention" ? "#f59e0b" : tone === "success" ? "#10b981" : "#22d3ee";
  const bodyAnimation = !canMove
    ? undefined
    : state === "celebrating"
      ? { y: [0, -3, 0], rotate: [0, -4, 3, 0], scale: [1, 1.06, 1] }
      : state === "guiding"
        ? { x: [0, 1.5, 0], rotate: [0, -2, 0] }
        : state === "thinking"
          ? { y: [0, -1.2, 0], rotate: [-1.5, 1.5, -1.5] }
          : state === "attentive"
            ? { y: [0, -1.5, 0], rotate: [0, -2, 0] }
            : state === "sleeping"
              ? { y: [0, 0.8, 0], rotate: 2, scale: 0.98 }
              : { y: [0, -0.7, 0], rotate: 0, scale: 1 };

  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label="Pace"
      initial={false}
      animate={bodyAnimation}
      transition={canMove ? { duration: state === "celebrating" ? 0.9 : state === "sleeping" ? 4 : 2.8, repeat: Infinity, repeatDelay: state === "celebrating" ? 2.4 : 0, ease: "easeInOut" } : undefined}
      className="pace-mark"
    >
      <defs>
        <linearGradient id={`pace-body-${id}`} x1="9" y1="5" x2="55" y2="60" gradientUnits="userSpaceOnUse">
          <stop stopColor="#22d3ee" />
          <stop offset="0.48" stopColor="#0891b2" />
          <stop offset="1" stopColor="#155e75" />
        </linearGradient>
        <radialGradient id={`pace-core-${id}`} cx="0" cy="0" r="1" gradientTransform="translate(37 27) rotate(125) scale(25)">
          <stop stopColor="#ffffff" stopOpacity="0.98" />
          <stop offset="1" stopColor="#cffafe" stopOpacity="0.9" />
        </radialGradient>
        <filter id={`pace-shadow-${id}`} x="-30%" y="-30%" width="160%" height="180%">
          <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor="#083344" floodOpacity="0.22" />
        </filter>
      </defs>

      <motion.circle
        cx="32"
        cy="32"
        r="28"
        fill="none"
        stroke={accent}
        strokeWidth="1.5"
        strokeDasharray="4 8"
        opacity="0.45"
        animate={fullMotion && state === "thinking" ? { rotate: 360 } : fullMotion && state === "guiding" ? { rotate: [0, 18, 0] } : undefined}
        transition={{ duration: state === "thinking" ? 3.2 : 2.2, ease: state === "thinking" ? "linear" : "easeInOut", repeat: Infinity }}
        style={{ transformOrigin: "32px 32px" }}
      />
      <motion.circle
        cx="53"
        cy="14"
        r="3.25"
        fill={accent}
        animate={fullMotion && state !== "sleeping" ? { scale: [1, state === "celebrating" ? 1.65 : 1.35, 1], opacity: [0.75, 1, 0.75] } : { opacity: 0.35 }}
        transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
        style={{ transformOrigin: "53px 14px" }}
      />

      {state === "celebrating" && (
        <motion.g
          initial={false}
          animate={fullMotion ? { opacity: [0, 1, 0], scale: [0.7, 1.1, 0.9] } : { opacity: 0.8 }}
          transition={{ duration: 1.2, repeat: Infinity, repeatDelay: 2.1 }}
          style={{ transformOrigin: "32px 32px" }}
        >
          <path d="M8 17l1.2 2.5 2.7.4-2 1.9.5 2.7L8 23.2l-2.4 1.3.5-2.7-2-1.9 2.7-.4L8 17Z" fill="#fbbf24" />
          <path d="M54 37l1 2 2.2.3-1.6 1.5.4 2.2-2-1-2 1 .4-2.2-1.6-1.5 2.2-.3 1-2Z" fill="#34d399" />
        </motion.g>
      )}

      <g filter={`url(#pace-shadow-${id})`}>
        <path
          d="M17 12.5C17 8.91 19.91 6 23.5 6h14.8C49.18 6 56 12.65 56 22.55c0 10.04-7.2 16.95-18.25 16.95H29v12.2c0 3.48-2.82 6.3-6.3 6.3S16.4 55.18 16.4 51.7V14.9c0-.83.2-1.65.6-2.4Z"
          fill={`url(#pace-body-${id})`}
        />
        <path
          d="M29 17.25h8.15c3.82 0 6.35 2.03 6.35 5.45 0 3.54-2.62 5.55-6.55 5.55H29v-11Z"
          fill={`url(#pace-core-${id})`}
        />
        <path
          d="M29 39.5c6.92-.04 12.86-1.4 17.55-5.08-2.85 7.3-8.7 12.2-17.55 14.7V39.5Z"
          fill="#67e8f9"
          opacity="0.62"
        />
      </g>

      <motion.g
        animate={fullMotion && state === "thinking" ? { x: [-0.8, 1.2, -0.8] } : fullMotion && state === "guiding" ? { x: [0, 1.1, 0] } : undefined}
        transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
      >
        <motion.ellipse cx="34.2" cy="22.5" rx="1.55" ry="2.2" fill="#083344" animate={fullMotion && state !== "sleeping" ? { scaleY: [1, 1, 0.12, 1, 1] } : state === "sleeping" ? { scaleY: 0.15 } : undefined} transition={{ duration: 4.5, repeat: Infinity, times: [0, 0.45, 0.48, 0.51, 1] }} style={{ transformOrigin: "34.2px 22.5px" }} />
        <motion.ellipse cx="39.8" cy="22.5" rx="1.55" ry="2.2" fill="#083344" animate={fullMotion && state !== "sleeping" ? { scaleY: [1, 1, 0.12, 1, 1] } : state === "sleeping" ? { scaleY: 0.15 } : undefined} transition={{ duration: 4.5, repeat: Infinity, times: [0, 0.45, 0.48, 0.51, 1] }} style={{ transformOrigin: "39.8px 22.5px" }} />
        <circle cx="34.65" cy="21.85" r="0.48" fill="white" />
        <circle cx="40.25" cy="21.85" r="0.48" fill="white" />
      </motion.g>
    </motion.svg>
  );
};
