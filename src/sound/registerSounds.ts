import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type RegisterSoundKind =
  | "payment-complete"
  | "attention"
  | "scan-success"
  | "scan-rejected"
  | "webshop-order";

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
  volume: 0.42,
  paymentComplete: true,
  // The card terminal already confirms the payment itself. Keep the register
  // quiet unless a merchant explicitly wants confirmation from both devices.
  terminalPaymentComplete: false,
  attention: true,
  scanner: false,
  webshopOrders: true,
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
      name: "pwayment:register-sound:v1",
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
  if (kind === "attention") return settings.attention;
  if (kind === "scan-success" || kind === "scan-rejected") return settings.scanner;
  return settings.webshopOrders;
};

let audioContext: AudioContext | null = null;
let lastPlayedAt: Partial<Record<RegisterSoundKind, number>> = {};

const getAudioContext = () => {
  if (typeof window === "undefined") return null;
  const AudioContextConstructor = window.AudioContext ??
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextConstructor) return null;
  audioContext ??= new AudioContextConstructor();
  return audioContext;
};

/**
 * Browsers only allow audio to be activated from a user gesture. Prime the
 * shared context on the first pointer/key interaction so later async payment
 * commits and realtime orders can still provide feedback.
 */
export const unlockRegisterSounds = async () => {
  const context = getAudioContext();
  if (!context) return false;
  try {
    if (context.state === "suspended") await context.resume();
    return context.state === "running";
  } catch {
    return false;
  }
};

const shapedGain = (
  context: AudioContext,
  destination: AudioNode,
  start: number,
  duration: number,
  peak: number,
) => {
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), start + 0.018);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  gain.connect(destination);
  return gain;
};

const tone = (
  context: AudioContext,
  destination: AudioNode,
  frequency: number,
  start: number,
  duration: number,
  gain: number,
  type: OscillatorType = "sine",
  endFrequency?: number,
) => {
  const oscillator = context.createOscillator();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  if (endFrequency) {
    oscillator.frequency.exponentialRampToValueAtTime(endFrequency, start + duration);
  }
  oscillator.connect(shapedGain(context, destination, start, duration, gain));
  oscillator.start(start);
  oscillator.stop(start + duration + 0.025);
};

const paymentComplete = (context: AudioContext, destination: AudioNode, now: number) => {
  // A compact major-sixth bloom: warm fundamentals with a very soft glassy
  // octave. It reads as completion without imitating a payment terminal.
  [
    [523.25, 0, 0.38, 0.22],
    [659.25, 0.055, 0.4, 0.19],
    [880, 0.125, 0.46, 0.16],
  ].forEach(([frequency, delay, duration, gain]) => {
    tone(context, destination, frequency, now + delay, duration, gain, "sine");
    tone(context, destination, frequency * 2, now + delay + 0.008, duration * 0.68, gain * 0.055, "triangle");
  });
};

const attention = (context: AudioContext, destination: AudioNode, now: number) => {
  // A calm descending pair. Deliberately informative rather than alarm-like.
  tone(context, destination, 440, now, 0.19, 0.18, "sine", 415.3);
  tone(context, destination, 329.63, now + 0.17, 0.3, 0.22, "sine", 311.13);
  tone(context, destination, 659.25, now + 0.17, 0.22, 0.035, "triangle");
};

const scan = (
  context: AudioContext,
  destination: AudioNode,
  now: number,
  accepted: boolean,
) => {
  if (accepted) {
    tone(context, destination, 1174.66, now, 0.075, 0.12, "sine", 1567.98);
    tone(context, destination, 2349.32, now + 0.012, 0.052, 0.028, "triangle");
    return;
  }
  tone(context, destination, 392, now, 0.095, 0.12, "sine", 349.23);
  tone(context, destination, 293.66, now + 0.105, 0.13, 0.14, "sine");
};

const webshopOrder = (context: AudioContext, destination: AudioNode, now: number) => {
  [659.25, 880, 987.77].forEach((frequency, index) => {
    const delay = index * 0.105;
    tone(context, destination, frequency, now + delay, 0.38, 0.13 - index * 0.015, "sine");
    tone(context, destination, frequency * 2, now + delay + 0.012, 0.22, 0.018, "triangle");
  });
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

  const context = getAudioContext();
  if (!context) return false;
  try {
    if (context.state === "suspended") await context.resume();
    const master = context.createGain();
    // Perceptual tapering gives the lower half of the slider useful precision.
    master.gain.value = settings.volume ** 1.55 * 0.62;
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.knee.value = 16;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.18;
    master.connect(compressor);
    compressor.connect(context.destination);
    const start = context.currentTime + 0.012;

    if (kind === "payment-complete") paymentComplete(context, master, start);
    else if (kind === "attention") attention(context, master, start);
    else if (kind === "scan-success") scan(context, master, start, true);
    else if (kind === "scan-rejected") scan(context, master, start, false);
    else webshopOrder(context, master, start);

    lastPlayedAt[kind] = nowMs;
    window.setTimeout(() => {
      try {
        master.disconnect();
        compressor.disconnect();
      } catch {
        // The context can disappear when a browser tab is closed mid-envelope.
      }
    }, 1_200);
    return true;
  } catch {
    // Sound is enhancement only; checkout and scanning must never depend on it.
    return false;
  }
};
