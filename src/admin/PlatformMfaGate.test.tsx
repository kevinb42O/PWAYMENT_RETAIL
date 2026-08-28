import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Factor } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { findVerifiedTotpFactor, normalizeMfaCode, PlatformMfaGate } from "./PlatformMfaGate";

const factor = (overrides: Partial<Factor>): Factor => ({
  id: "factor-id",
  factor_type: "totp",
  status: "verified",
  created_at: "2026-08-28T10:00:00Z",
  updated_at: "2026-08-28T10:00:00Z",
  ...overrides,
});

describe("PlatformMfaGate helpers", () => {
  it("normaliseert geplakte authenticatorcodes tot exact zes cijfers", () => {
    expect(normalizeMfaCode("12 34-5678")).toBe("123456");
    expect(normalizeMfaCode("abc")).toBe("");
  });

  it("gebruikt uitsluitend een geverifieerde TOTP-factor", () => {
    const factors = [
      factor({ id: "unverified", status: "unverified" }),
      factor({ id: "phone", factor_type: "phone" }),
      factor({ id: "verified" }),
    ];
    expect(findVerifiedTotpFactor(factors)?.id).toBe("verified");
    expect(findVerifiedTotpFactor([factor({ status: "unverified" })])).toBeNull();
  });
});

describe("PlatformMfaGate", () => {
  let container: HTMLDivElement;
  let root: Root;

  const flush = async () => {
    await act(async () => new Promise((resolve) => window.setTimeout(resolve, 0)));
  };

  const enterCode = async (value: string) => {
    const input = container.querySelector<HTMLInputElement>('input[autocomplete="one-time-code"]');
    expect(input).not.toBeNull();
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(input, value);
      input?.dispatchEvent(new Event("input", { bubbles: true }));
    });
  };

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  it("laat een reeds verhoogde AAL2-sessie onmiddellijk door", async () => {
    vi.spyOn(supabase.auth.mfa, "getAuthenticatorAssuranceLevel").mockResolvedValue({
      data: { currentLevel: "aal2", nextLevel: "aal2", currentAuthenticationMethods: [] },
      error: null,
    } as never);
    const onVerified = vi.fn(async () => undefined);

    await act(async () => root.render(<PlatformMfaGate onVerified={onVerified}><p>Beveiligde inhoud</p></PlatformMfaGate>));
    await flush();

    expect(container.textContent).toContain("Beveiligde inhoud");
    expect(onVerified).toHaveBeenCalledOnce();
  });

  it("schrijft een nieuwe TOTP-factor in en laat pas na AAL2 door", async () => {
    const assurance = vi.spyOn(supabase.auth.mfa, "getAuthenticatorAssuranceLevel");
    assurance
      .mockResolvedValueOnce({ data: { currentLevel: "aal1", nextLevel: "aal1", currentAuthenticationMethods: [] }, error: null } as never)
      .mockResolvedValueOnce({ data: { currentLevel: "aal2", nextLevel: "aal2", currentAuthenticationMethods: [] }, error: null } as never);
    vi.spyOn(supabase.auth.mfa, "listFactors").mockResolvedValue({ data: { all: [], totp: [], phone: [], webauthn: [] }, error: null } as never);
    vi.spyOn(supabase.auth.mfa, "enroll").mockResolvedValue({ data: { id: "new-factor", type: "totp", totp: { qr_code: "data:image/svg+xml,test", secret: "SECRET", uri: "otpauth://test" } }, error: null } as never);
    const verify = vi.spyOn(supabase.auth.mfa, "challengeAndVerify").mockResolvedValue({ data: {}, error: null } as never);
    const onVerified = vi.fn(async () => undefined);

    await act(async () => root.render(<PlatformMfaGate onVerified={onVerified}><p>Releaseformulier</p></PlatformMfaGate>));
    await flush();
    const enrollButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("MFA veilig instellen"));
    await act(async () => enrollButton?.click());
    await flush();

    expect(container.querySelector('img[alt="QR-code voor PWAYMENT MFA"]')).not.toBeNull();
    await enterCode("123 456");
    const form = container.querySelector("form");
    await act(async () => form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    await flush();

    expect(verify).toHaveBeenCalledWith({ factorId: "new-factor", code: "123456" });
    expect(onVerified).toHaveBeenCalledOnce();
    expect(container.textContent).toContain("Releaseformulier");
  });

  it("toont een bruikbare fout bij een ongeldige code voor een bestaande factor", async () => {
    vi.spyOn(supabase.auth.mfa, "getAuthenticatorAssuranceLevel").mockResolvedValue({
      data: { currentLevel: "aal1", nextLevel: "aal2", currentAuthenticationMethods: [] },
      error: null,
    } as never);
    vi.spyOn(supabase.auth.mfa, "listFactors").mockResolvedValue({
      data: { all: [factor({ id: "verified-factor" })], totp: [factor({ id: "verified-factor" })], phone: [], webauthn: [] },
      error: null,
    } as never);
    vi.spyOn(supabase.auth.mfa, "challengeAndVerify").mockResolvedValue({ data: null, error: new Error("invalid totp code") } as never);

    await act(async () => root.render(<PlatformMfaGate onVerified={async () => undefined}><p>Verborgen</p></PlatformMfaGate>));
    await flush();
    await enterCode("654321");
    const form = container.querySelector("form");
    await act(async () => form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    await flush();

    expect(container.textContent).toContain("De code is ongeldig of verlopen");
    expect(container.textContent).not.toContain("Verborgen");
    expect(container.querySelector<HTMLInputElement>('input[autocomplete="one-time-code"]')?.value).toBe("");
  });
});
