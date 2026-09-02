import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyThemeMode, readInitialThemeMode } from "./theme";

describe("application theme", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.className = "";
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.style.colorScheme = "";
    document.head.innerHTML = '<meta name="theme-color" content="#f8fafc">';
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it("uses light mode when no valid preference exists", () => {
    expect(readInitialThemeMode()).toBe("light");
    window.localStorage.setItem("pwayment-theme", JSON.stringify({ state: { mode: "system" } }));
    expect(readInitialThemeMode()).toBe("light");
  });

  it("reads a persisted dark device preference", () => {
    window.localStorage.setItem("pwayment-theme", JSON.stringify({ state: { mode: "dark" } }));
    expect(readInitialThemeMode()).toBe("dark");
  });

  it("updates document state and browser chrome immediately", () => {
    applyThemeMode("dark");

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.classList.contains("theme-dark")).toBe(true);
    expect(document.documentElement.classList.contains("theme-light")).toBe(false);
    expect(document.documentElement.style.colorScheme).toBe("dark");
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute("content")).toBe("#07111f");

    applyThemeMode("light");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.documentElement.classList.contains("theme-light")).toBe(true);
    expect(document.documentElement.classList.contains("theme-dark")).toBe(false);
  });
});
