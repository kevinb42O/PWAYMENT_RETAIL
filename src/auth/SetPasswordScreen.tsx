import { useEffect, useState } from "react";
import { KeyRound } from "lucide-react";
import { supabase } from "../lib/supabase";

export default function SetPasswordScreen() {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return;
      if (sessionError || !data.session) {
        setError(
          "Deze uitnodigingslink is ongeldig of verlopen. Vraag een nieuwe uitnodiging aan.",
        );
      }
      setReady(true);
    });
    return () => {
      active = false;
    };
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (password.length < 12) {
      setError("Kies een wachtwoord van minstens 12 tekens.");
      return;
    }
    if (password !== confirmation) {
      setError("De wachtwoorden komen niet overeen.");
      return;
    }
    setSaving(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (updateError) {
      setError("Het wachtwoord kon niet worden opgeslagen. Vraag een nieuwe link aan.");
      return;
    }
    window.history.replaceState(window.history.state, "", "/app");
    window.location.reload();
  };

  return (
    <main className="grid min-h-dvh place-items-center bg-[#f6f5f1] px-6 text-zinc-950">
      <section className="w-full max-w-md rounded-3xl border border-zinc-200 bg-white p-8 shadow-xl shadow-zinc-950/5">
        <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-950 text-white">
          <KeyRound size={22} />
        </div>
        <h1 className="text-2xl font-black tracking-tight">Stel je wachtwoord in</h1>
        <p className="mt-2 text-sm leading-6 text-zinc-500">
          Rond je Pwayment-uitnodiging af met een persoonlijk wachtwoord.
        </p>

        {error && (
          <div className="mt-5 rounded-2xl border border-rose-100 bg-rose-50 p-3.5 text-sm text-rose-700">
            {error}
          </div>
        )}

        <form onSubmit={submit} className="mt-6 space-y-4">
          <label className="block text-sm font-semibold">
            Nieuw wachtwoord
            <input
              type="password"
              autoComplete="new-password"
              minLength={12}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={!ready || saving}
              className="mt-2 w-full rounded-xl border border-zinc-200 px-4 py-3 outline-none focus:border-zinc-950"
            />
          </label>
          <label className="block text-sm font-semibold">
            Herhaal wachtwoord
            <input
              type="password"
              autoComplete="new-password"
              minLength={12}
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              disabled={!ready || saving}
              className="mt-2 w-full rounded-xl border border-zinc-200 px-4 py-3 outline-none focus:border-zinc-950"
            />
          </label>
          <button
            type="submit"
            disabled={!ready || saving || Boolean(error && !password)}
            className="w-full rounded-xl bg-zinc-950 px-4 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Wachtwoord opslaan…" : "Uitnodiging afronden"}
          </button>
        </form>
      </section>
    </main>
  );
}
