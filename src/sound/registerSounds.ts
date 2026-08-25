import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type RegisterSoundKind =
  | "payment-complete"
  | "attention"
  | "scan-success"
  | "scan-rejected"
  | "webshop-order"
  | "terminal-payment-complete";

export interface RegisterSoundSettings {
  enabled: boolean;
  volume: number;
  paymentComplete: boolean;
  terminalPaymentComplete: boolean;
  attention: boolean;
  scanner: boolean;
  webshopOrders: boolean;
}

interface RegisterSoundSettingsStore extends RegisterSoundSettings {
  update: (patch: Partial<RegisterSoundSettings>) => void;
  reset: () => void;
}

export const DEFAULT_REGISTER_SOUND_SETTINGS: RegisterSoundSettings = {
  enabled: true,
  volume: 0.3,
  paymentComplete: false,
  // The card terminal already confirms the payment itself. Keep the register
  // quiet unless a merchant explicitly wants confirmation from both devices.
  terminalPaymentComplete: false,
  attention: true,
  scanner: false,
  webshopOrders: false,
};

const clampVolume = (value: number) => Math.min(1, Math.max(0, value));

export const useRegisterSoundSettings = create<RegisterSoundSettingsStore>()(
  persist(
    (set) => ({
      ...DEFAULT_REGISTER_SOUND_SETTINGS,
      update: (patch) => set((state) => ({
        ...patch,
        ...(patch.volume == null ? {} : { volume: clampVolume(patch.volume) }),
        // Never allow persisted action functions to be overwritten by a patch.
        update: state.update,
        reset: state.reset,
      })),
      reset: () => set(DEFAULT_REGISTER_SOUND_SETTINGS),
    }),
    {
      name: "pwayment:register-sound:v2",
      storage: createJSONStorage(() => localStorage),
      partialize: ({
        enabled,
        volume,
        paymentComplete,
        terminalPaymentComplete,
        attention,
        scanner,
        webshopOrders,
      }) => ({
        enabled,
        volume,
        paymentComplete,
        terminalPaymentComplete,
        attention,
        scanner,
        webshopOrders,
      }),
    },
  ),
);

type PlayOptions = {
  /** A real payment terminal has its own confirmation sound. */
  externalTerminal?: boolean;
  /** Settings previews should play even when that individual category is off. */
  preview?: boolean;
};

export const canPlayRegisterSound = (
  kind: RegisterSoundKind,
  settings: RegisterSoundSettings,
  options: PlayOptions = {},
) => {
  if (!settings.enabled || settings.volume <= 0) return false;
  if (options.preview) return true;
  if (kind === "payment-complete") {
    return settings.paymentComplete &&
      (!options.externalTerminal || settings.terminalPaymentComplete);
  }
  if (kind === "terminal-payment-complete") {
    return settings.paymentComplete && settings.terminalPaymentComplete;
  }
  if (kind === "attention") return settings.attention;
  if (kind === "scan-success" || kind === "scan-rejected") return settings.scanner;
  return settings.webshopOrders;
};

let lastPlayedAt: Partial<Record<RegisterSoundKind, number>> = {};
const audioPrototypes = new Map<string, HTMLAudioElement>();
const activeAudio = new Set<HTMLAudioElement>();

const AUDIO_ASSETS: Record<RegisterSoundKind, string> = {
  "payment-complete": "/sounds/retail-recordings/cash-drawer-receipt.mp3",
  "terminal-payment-complete": "/sounds/retail-recordings/payment-terminal-approved.mp3",
  attention: "/sounds/retail-recordings/scanner-beep.mp3",
  "scan-success": "/sounds/retail-recordings/scanner-beep.mp3",
  "scan-rejected": "/sounds/retail-recordings/scanner-beep.mp3",
  "webshop-order": "/sounds/retail-recordings/scanner-beep.mp3",
};

const CUE_VOLUME: Record<RegisterSoundKind, number> = {
  "payment-complete": 0.35,
  "terminal-payment-complete": 0.3,
  attention: 0.22,
  "scan-success": 0.2,
  "scan-rejected": 0.16,
  "webshop-order": 0.16,
};

const getAudioPrototype = (src: string) => {
  if (typeof Audio === "undefined") return null;
  const cached = audioPrototypes.get(src);
  if (cached) return cached;
  const audio = new Audio(src);
  audio.preload = "auto";
  audio.load();
  audioPrototypes.set(src, audio);
  return audio;
};

export const preloadRegisterSounds = () => {
  for (const src of new Set(Object.values(AUDIO_ASSETS))) getAudioPrototype(src);
};

/**
 * Browsers only allow media playback after a user gesture. Prime one of the
 * downloaded cues silently on the first interaction so later async payment
 * commits and realtime orders can still provide feedback.
 */
export const unlockRegisterSounds = async () => {
  preloadRegisterSounds();
  const prototype = getAudioPrototype(AUDIO_ASSETS["payment-complete"]);
  if (!prototype) return false;
  const audio = prototype.cloneNode(true) as HTMLAudioElement;
  try {
    audio.muted = true;
    await audio.play();
    audio.pause();
    audio.currentTime = 0;
    return true;
  } catch {
    return false;
  }
};

export const playRegisterSound = async (
  kind: RegisterSoundKind,
  options: PlayOptions = {},
) => {
  const settings = useRegisterSoundSettings.getState();
  if (!canPlayRegisterSound(kind, settings, options)) return false;

  const nowMs = Date.now();
  const cooldown = kind.startsWith("scan-") ? 55 : 450;
  if (!options.preview && nowMs - (lastPlayedAt[kind] ?? 0) < cooldown) return false;

  const prototype = getAudioPrototype(AUDIO_ASSETS[kind]);
  if (!prototype) return false;
  const audio = prototype.cloneNode(true) as HTMLAudioElement;
  try {
    // Perceptual tapering makes the low half of the device volume slider useful.
    audio.volume = Math.min(1, settings.volume ** 1.45 * CUE_VOLUME[kind]);
    activeAudio.add(audio);
    const release = () => activeAudio.delete(audio);
    audio.addEventListener("ended", release, { once: true });
    audio.addEventListener("error", release, { once: true });
    await audio.play();
    lastPlayedAt[kind] = nowMs;
    return true;
  } catch {
    activeAudio.delete(audio);
    // Audio is enhancement only; checkout and scanning must never depend on it.
    return false;
  }
};
