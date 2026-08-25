import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type RegisterSoundKind =
  | "attention"
  | "webshop-order";

export interface RegisterSoundSettings {
  enabled: boolean;
  volume: number;
  attention: boolean;
  webshopOrders: boolean;
}

interface RegisterSoundSettingsStore extends RegisterSoundSettings {
  update: (patch: Partial<RegisterSoundSettings>) => void;
  reset: () => void;
}

export const DEFAULT_REGISTER_SOUND_SETTINGS: RegisterSoundSettings = {
  enabled: true,
  volume: 0.32,
  attention: true,
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
      name: "pwayment:register-sound:v3",
      storage: createJSONStorage(() => localStorage),
      partialize: ({
        enabled,
        volume,
        attention,
        webshopOrders,
      }) => ({
        enabled,
        volume,
        attention,
        webshopOrders,
      }),
    },
  ),
);

type PlayOptions = {
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
  if (kind === "attention") return settings.attention;
  return settings.webshopOrders;
};

let lastPlayedAt: Partial<Record<RegisterSoundKind, number>> = {};
const audioPrototypes = new Map<string, HTMLAudioElement>();
const activeAudio = new Set<HTMLAudioElement>();

const AUDIO_ASSETS: Record<RegisterSoundKind, string> = {
  attention: "/sounds/pos-ui/taptap.ogg",
  "webshop-order": "/sounds/pos-ui/polite.ogg",
};

const CUE_VOLUME: Record<RegisterSoundKind, number> = {
  attention: 0.36,
  "webshop-order": 0.42,
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
  const prototype = getAudioPrototype(AUDIO_ASSETS.attention);
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
  const cooldown = kind === "attention" ? 800 : 1_200;
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
