import React, { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { AlertCircle, CheckCircle2, RefreshCw, Trash2 } from "lucide-react";
import { getOutboxEntriesNeedingResolution } from "../db/outbox";
import { humanizeOutboxIssue } from "../pace/outboxIssue";
import { discardFailedSimulatorSale, isFailedSimulatorSale, retryOutboxEntryNow } from "../services/outboxWorker";

interface OutboxRecoveryQueueProps {
  focusRequestKey?: number;
}

const formatDate = (timestamp: number) => new Intl.DateTimeFormat("nl-BE", {
  dateStyle: "short",
  timeStyle: "short",
}).format(new Date(timestamp));

/** Core operational recovery; intentionally never hidden behind a plan gate. */
export const OutboxRecoveryQueue: React.FC<OutboxRecoveryQueueProps> = ({ focusRequestKey }) => {
  const sectionRef = useRef<HTMLElement | null>(null);
  const [retryingId, setRetryingId] = useState<number | null>(null);
  const [message, setMessage] = useState<{ text: string; success: boolean } | null>(null);
  const entries = useLiveQuery(() => getOutboxEntriesNeedingResolution(), []) ?? [];

  useEffect(() => {
    if (focusRequestKey == null || entries.length === 0) return;
    sectionRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    sectionRef.current?.focus({ preventScroll: true });
  }, [entries.length, focusRequestKey]);

  if (entries.length === 0) return null;

  const retry = async (id: number) => {
    setRetryingId(id);
    try {
      const result = await retryOutboxEntryNow(id);
      if (!result.delivered && !result.entry) {
        setMessage({ text: "Deze herstelactie bestaat niet meer.", success: false });
        return;
      }
      if (!result.delivered && result.entry) {
        const issue = humanizeOutboxIssue(result.entry);
        setMessage({ text: `${issue.summary} ${issue.resolution}`, success: false });
        return;
      }
      setMessage({ text: "De verkoop is door de server bevestigd en uit de wachtrij verwijderd.", success: true });
    } catch (error) {
      setMessage({
        text: error instanceof Error ? error.message : "Opnieuw proberen is mislukt.",
        success: false,
      });
    } finally {
      setRetryingId(null);
    }
  };

  const discardSimulator = async (id: number) => {
    setRetryingId(id);
    try {
      await discardFailedSimulatorSale(id);
      setMessage({ text: "De niet-afgeleverde terminalsimulatie is veilig teruggedraaid en verwijderd.", success: true });
    } catch (error) {
      setMessage({
        text: error instanceof Error ? error.message : "De terminalsimulatie kon niet veilig worden verwijderd.",
        success: false,
      });
    } finally {
      setRetryingId(null);
    }
  };

  return (
    <section
      ref={sectionRef}
      id="outbox-recovery-queue"
      data-testid="outbox-recovery-queue"
      tabIndex={-1}
      className="scroll-mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 shadow-2xs outline-none focus:ring-2 focus:ring-rose-400"
      aria-live="polite"
    >
      <div className="flex min-w-0 gap-2.5">
        <AlertCircle size={19} className="mt-0.5 shrink-0 text-rose-700" />
        <div>
          <h2 className="text-sm font-black text-rose-950">
            Herstelwachtrij: {entries.length} synchronisatie{entries.length === 1 ? "" : "s"} vraagt aandacht
          </h2>
          <p className="mt-1 max-w-3xl text-xs font-medium leading-relaxed text-rose-800">
            Geen gegevens zijn verwijderd. Controleer de oorzaak en probeer alleen de betrokken wijziging opnieuw.
          </p>
        </div>
      </div>

      {message && (
        <div className={`mt-3 flex items-center gap-2 rounded-xl border bg-white px-3 py-2 text-xs font-bold ${message.success ? "border-emerald-200 text-emerald-700" : "border-rose-200 text-rose-700"}`} role="status">
          {message.success ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
          {message.text}
        </div>
      )}

      <div className="mt-3 space-y-2">
        {entries.map((entry) => {
          const issue = humanizeOutboxIssue(entry);
          const simulatorSale = isFailedSimulatorSale(entry);
          return (
            <div key={entry.id} className="flex flex-col gap-2 rounded-xl border border-rose-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-black text-slate-900">
                  <span>{entry.kind === "transaction" ? ((entry.payload as { kind?: string }).kind === "refund" ? "Retour" : "Verkoop") : entry.kind === "gift_card_mutation" ? "Cadeaubonmutatie" : entry.kind === "webshop_email" ? "Webshopmail" : "Synchronisatie"}</span>
                  <span className="text-[10px] font-medium text-slate-400">{formatDate(entry.timestamp)} · poging {entry.attempts}</span>
                </div>
                <p className="mt-1 text-[11px] font-bold leading-relaxed text-rose-800">{issue.summary}</p>
                <p className="mt-0.5 text-[11px] font-medium leading-relaxed text-slate-600">{issue.resolution}</p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                {simulatorSale && (
                  <button
                    type="button"
                    onClick={() => entry.id != null && void discardSimulator(entry.id)}
                    disabled={entry.id == null || retryingId === entry.id}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-rose-400 bg-rose-700 px-3 py-2 text-[11px] font-bold text-white hover:bg-rose-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Trash2 size={14} />
                    Simulatietest verwijderen
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => entry.id != null && void retry(entry.id)}
                  disabled={entry.id == null || retryingId === entry.id}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-rose-300 bg-white px-3 py-2 text-[11px] font-bold text-rose-800 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <RefreshCw size={14} className={retryingId === entry.id ? "animate-spin" : ""} />
                  {retryingId === entry.id ? "Controleren…" : "Opnieuw proberen"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
