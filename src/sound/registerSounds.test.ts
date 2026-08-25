import { describe, expect, it } from "vitest";
import {
  DEFAULT_REGISTER_SOUND_SETTINGS,
  canPlayRegisterSound,
} from "./registerSounds";

describe("register sound policy", () => {
  it("limits application sound to software-owned operational events", () => {
    expect(canPlayRegisterSound("attention", DEFAULT_REGISTER_SOUND_SETTINGS)).toBe(true);
    expect(canPlayRegisterSound("webshop-order", DEFAULT_REGISTER_SOUND_SETTINGS)).toBe(true);
    expect(canPlayRegisterSound("cash-key", DEFAULT_REGISTER_SOUND_SETTINGS)).toBe(true);
  });

  it("honours the master switch and category switches", () => {
    expect(canPlayRegisterSound("attention", {
      ...DEFAULT_REGISTER_SOUND_SETTINGS,
      enabled: false,
    })).toBe(false);
  });

  it("honours the webshop category switch", () => {
    expect(canPlayRegisterSound("webshop-order", {
      ...DEFAULT_REGISTER_SOUND_SETTINGS,
      webshopOrders: false,
    })).toBe(false);
  });

  it("allows merchants to silence only the cash keypad", () => {
    expect(canPlayRegisterSound("cash-key", {
      ...DEFAULT_REGISTER_SOUND_SETTINGS,
      cashKeypad: false,
    })).toBe(false);
  });

  it("allows a category preview while preserving master mute", () => {
    expect(canPlayRegisterSound("webshop-order", DEFAULT_REGISTER_SOUND_SETTINGS, {
      preview: true,
    })).toBe(true);
    expect(canPlayRegisterSound("webshop-order", {
      ...DEFAULT_REGISTER_SOUND_SETTINGS,
      enabled: false,
    }, { preview: true })).toBe(false);
  });
});
