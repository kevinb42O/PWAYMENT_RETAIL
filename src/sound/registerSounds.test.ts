import { describe, expect, it } from "vitest";
import {
  DEFAULT_REGISTER_SOUND_SETTINGS,
  canPlayRegisterSound,
} from "./registerSounds";

describe("register sound policy", () => {
  it("keeps real terminal confirmations quiet by default", () => {
    expect(canPlayRegisterSound("payment-complete", DEFAULT_REGISTER_SOUND_SETTINGS)).toBe(false);
    expect(canPlayRegisterSound("terminal-payment-complete", DEFAULT_REGISTER_SOUND_SETTINGS)).toBe(false);
  });

  it("honours the master switch and category switches", () => {
    expect(canPlayRegisterSound("scan-success", DEFAULT_REGISTER_SOUND_SETTINGS)).toBe(false);
    expect(canPlayRegisterSound("attention", {
      ...DEFAULT_REGISTER_SOUND_SETTINGS,
      enabled: false,
    })).toBe(false);
  });

  it("requires explicit consent before sale-completion sound plays", () => {
    expect(canPlayRegisterSound("payment-complete", {
      ...DEFAULT_REGISTER_SOUND_SETTINGS,
      paymentComplete: true,
    })).toBe(true);
  });

  it("allows a category preview while preserving master mute", () => {
    expect(canPlayRegisterSound("scan-success", DEFAULT_REGISTER_SOUND_SETTINGS, {
      preview: true,
    })).toBe(true);
    expect(canPlayRegisterSound("scan-success", {
      ...DEFAULT_REGISTER_SOUND_SETTINGS,
      enabled: false,
    }, { preview: true })).toBe(false);
  });
});
