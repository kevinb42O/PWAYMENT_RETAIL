import { FormEvent, useCallback, useEffect, useState, type ReactNode } from "react";
import { KeyRound, LoaderCircle, ShieldCheck } from "lucide-react";
import type { Factor } from "@supabase/supabase-js";
import { Button } from "../components/ui/Button";
import { FeedbackBanner } from "../components/ui/FeedbackBanner";
import { supabase } from "../lib/supabase";

type Enrollment = {
  factorId: string;
  qrCode: string;
  secret: string;
};

export const normalizeMfaCode = (value: string) => value.replace(/\D/g, "").slice(0, 6);

export const findVerifiedTotpFactor = (factors: Factor[]) =>
  factors.find((factor) => factor.factor_type === "totp" && factor.status === "verified") ?? null;

const mfaErrorMessage = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (/invalid.*(code|totp)|challenge.*expired|mfa.*verify/i.test(message)) {
    return "De code is ongeldig of verlopen. Gebruik de nieuwste code uit je authenticator-app.";
  }
  return message || "MFA kon niet worden gecontroleerd. Probeer opnieuw.";
};

export const PlatformMfaGate = ({ children, onVerified }: { children: ReactNode; onVerified: () => Promise<void> }) => {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [verifiedFactor, setVerifiedFactor] = useState<Factor | null>(null);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);

  const inspect = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data: assurance, error: assuranceError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (assuranceError) throw assuranceError;
    if (assurance.currentLevel === "aal2") {
      setVerified(true);
      await onVerified();
      return;
    }
    const { data, error: factorsError } = await supabase.auth.mfa.listFactors();
    if (factorsError) throw factorsError;
    setVerifiedFactor(findVerifiedTotpFactor(data.all));
  }, [onVerified]);

  useEffect(() => {
    void inspect().catch((reason) => setError(mfaErrorMessage(reason))).finally(() => setLoading(false));
  }, [inspect]);

  const startEnrollment = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors();
      if (factorsError) throw factorsError;
      for (const factor of factors.all) {
        if (factor.factor_type === "totp" && factor.status === "unverified") {
          const { error: removeError } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
          if (removeError) throw removeError;
        }
      }
      const { data, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "PWAYMENT Platform Console",
        issuer: "PWAYMENT",
      });
      if (enrollError) throw enrollError;
      setEnrollment({ factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret });
      setCode("");
    } catch (reason) {
      setError(mfaErrorMessage(reason));
    } finally {
      setSubmitting(false);
    }
  };

  const verify = async (event: FormEvent) => {
    event.preventDefault();
    const factorId = enrollment?.factorId ?? verifiedFactor?.id;
    if (!factorId || code.length !== 6) return;
    setSubmitting(true);
    setError(null);
    try {
      const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
      if (verifyError) throw verifyError;
      const { data: assurance, error: assuranceError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (assuranceError) throw assuranceError;
      if (assurance.currentLevel !== "aal2") throw new Error("De sessie bereikte beveiligingsniveau AAL2 niet.");
      setVerified(true);
      await onVerified();
    } catch (reason) {
      setError(mfaErrorMessage(reason));
      setCode("");
    } finally {
      setSubmitting(false);
    }
  };

  if (verified) return <>{children}</>;

  return (
    <section className="mx-auto max-w-xl rounded-2xl border border-cyan-200 bg-white p-6 shadow-sm">
      <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-800">
        <ShieldCheck size={23} />
      </span>
      <p className="mt-5 text-[11px] font-extrabold uppercase tracking-[0.12em] text-cyan-700">Extra beveiligingscontrole</p>
      <h1 className="mt-1 text-xl font-extrabold tracking-tight text-slate-950">Bevestig MFA voor gevoelige acties</h1>
      <p className="mt-2 text-sm leading-6 text-slate-600">Releases en toegangsbeheer vereisen een actuele code uit je authenticator-app. De controle geldt alleen voor deze beveiligde platformsessie.</p>
      {error && <FeedbackBanner tone="error" className="mt-5">{error}</FeedbackBanner>}

      {loading ? (
        <div className="mt-6 flex items-center gap-2 text-sm font-semibold text-slate-500"><LoaderCircle className="animate-spin" size={17} /> MFA-status controleren…</div>
      ) : verifiedFactor || enrollment ? (
        <form onSubmit={verify} className="mt-6">
          {enrollment && (
            <div className="mb-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-extrabold text-slate-800">1. Scan deze QR-code met je authenticator-app</p>
              <img src={enrollment.qrCode} alt="QR-code voor PWAYMENT MFA" className="mx-auto mt-4 h-48 w-48 rounded-xl bg-white p-2" />
              <details className="mt-3">
                <summary className="cursor-pointer text-xs font-bold text-slate-600">Kan je niet scannen?</summary>
                <p className="mt-2 text-[11px] leading-5 text-slate-500">Voer deze geheime sleutel handmatig in. Deel hem met niemand.</p>
                <input aria-label="Geheime MFA-sleutel" readOnly type="password" value={enrollment.secret} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-700" />
              </details>
              <p className="mt-4 text-xs font-extrabold text-slate-800">2. Vul daarna de zescijferige code hieronder in</p>
            </div>
          )}
          <label className="block text-xs font-bold text-slate-700">Authenticatorcode
            <input
              autoFocus
              required
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              minLength={6}
              maxLength={6}
              value={code}
              onChange={(event) => setCode(normalizeMfaCode(event.target.value))}
              className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-3 text-center font-mono text-xl font-extrabold tracking-[0.35em] outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
              aria-describedby="mfa-code-help"
            />
          </label>
          <p id="mfa-code-help" className="mt-2 text-[11px] leading-5 text-slate-500">Codes verlopen snel. Gebruik altijd de code die nu zichtbaar is.</p>
          <Button type="submit" variant="primary" className="mt-4 w-full" disabled={submitting || code.length !== 6}>
            <KeyRound size={16} /> {submitting ? "Controleren…" : enrollment ? "MFA activeren en doorgaan" : "MFA bevestigen en doorgaan"}
          </Button>
        </form>
      ) : (
        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-extrabold text-amber-950">Nog geen authenticator gekoppeld</p>
          <p className="mt-1 text-xs leading-5 text-amber-800">Je koppelt éénmalig een TOTP-app, zoals 1Password, Google Authenticator of Microsoft Authenticator.</p>
          <Button type="button" variant="primary" className="mt-4" onClick={() => void startEnrollment()} disabled={submitting}>
            {submitting ? "Voorbereiden…" : "MFA veilig instellen"}
          </Button>
        </div>
      )}
    </section>
  );
};
