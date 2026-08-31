import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PinKeypad } from "./PinKeypad";

describe("PinKeypad", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("supports touch buttons and submits automatically at six digits", async () => {
    const complete = vi.fn();
    let value = "";
    const render = () => root.render(
      <PinKeypad value={value} onChange={(next) => { value = next; render(); }} onComplete={complete} />,
    );
    await act(async () => render());
    for (const digit of ["4", "8", "6", "2", "0", "5"]) {
      const button = container.querySelector<HTMLButtonElement>(`button[aria-label="Cijfer ${digit}"]`);
      await act(async () => button?.click());
    }
    expect(complete).toHaveBeenCalledWith("486205");
    expect(container.querySelector('[aria-label="6 van 6 cijfers ingevoerd"]')).not.toBeNull();
  });

  it("shows the required PIN length visibly", async () => {
    await act(async () => root.render(
      <PinKeypad value="" onChange={() => undefined} onComplete={() => undefined} />,
    ));
    expect(container.textContent).toContain("Voer je persoonlijke PIN van exact 6 cijfers in");
  });

  it("supports the physical numeric keyboard and backspace", async () => {
    const complete = vi.fn();
    let value = "";
    const render = () => root.render(
      <PinKeypad value={value} onChange={(next) => { value = next; render(); }} onComplete={complete} />,
    );
    await act(async () => render());
    for (const key of ["7", "3", "9", "1", "6", "Backspace", "8", "4"]) {
      await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true })));
    }
    expect(value).toBe("739184");
    expect(complete).toHaveBeenCalledWith("739184");
  });
});
