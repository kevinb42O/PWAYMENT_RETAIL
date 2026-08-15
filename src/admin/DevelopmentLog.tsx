import { useCallback, useEffect, useState } from "react";
import { ExternalLink, GitCommitHorizontal, RefreshCw } from "lucide-react";
import { Button } from "../components/ui/Button";
import { FeedbackBanner } from "../components/ui/FeedbackBanner";
import { listPlatformDevelopmentUpdates, type PlatformDevelopmentUpdate } from "./platformApi";

const when = (value: string) => new Intl.DateTimeFormat("nl-BE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
const shortSha = (value: string) => value.slice(0, 8);

export const DevelopmentLog = () => {
  const [updates, setUpdates] = useState<PlatformDevelopmentUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setUpdates((await listPlatformDevelopmentUpdates()).items); }
    catch (err) { setError(err instanceof Error ? err.message : "Ontwikkellog kon niet geladen worden."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  return <section className="space-y-5"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-[11px] font-bold uppercase tracking-[0.12em] text-cyan-700">GitHub delivery history</p><h1 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-950">Ontwikkelupdates</h1><p className="mt-1 max-w-3xl text-sm text-slate-500">Elke GitHub-push wordt automatisch als onveranderlijk platformrecord bewaard, met commits en concrete wijzigingsnotities.</p></div><Button onClick={() => void load()} disabled={loading}><RefreshCw size={15} /> Vernieuwen</Button></div>{error && <FeedbackBanner tone="error">{error}</FeedbackBanner>}<article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">{loading ? <p className="px-5 py-14 text-center text-sm font-semibold text-slate-500">Ontwikkelupdates laden…</p> : updates.length ? <ol>{updates.map((update) => <li key={update.id} className="border-b border-slate-100 px-5 py-5 last:border-0"><div className="flex flex-col gap-3 sm:flex-row sm:items-start"><span className="mt-0.5 rounded-xl bg-cyan-50 p-2 text-cyan-700"><GitCommitHorizontal size={18} /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-extrabold text-slate-900">{update.headline}</p><span className={`rounded-lg px-2 py-1 text-[10px] font-extrabold ${update.branch_name === "main" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{update.branch_name === "main" ? "PRODUCTIEBRON · main" : update.branch_name}</span></div><p className="mt-1 text-xs text-slate-500">{update.pusher_name ?? "GitHub"} · {when(update.pushed_at)} · {update.commits.length} commit{update.commits.length === 1 ? "" : "s"}</p><ul className="mt-3 space-y-1.5">{update.commits.map((commit, index) => <li key={`${commit.sha ?? "commit"}-${index}`} className="flex gap-2 text-xs leading-5 text-slate-600"><code className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-700">{commit.sha ? shortSha(commit.sha) : "commit"}</code><span>{commit.message ?? "Geen commitbericht"}</span></li>)}</ul></div>{update.compare_url && <a href={update.compare_url} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-50">GitHub <ExternalLink size={13} /></a>}</div></li>)}</ol> : <div className="px-5 py-14 text-center"><GitCommitHorizontal className="mx-auto text-cyan-700" size={28} /><p className="mt-3 text-sm font-bold text-slate-800">Nog geen GitHub-pushes geregistreerd</p><p className="mt-1 text-xs leading-5 text-slate-500">De eerste push nadat de GitHub-secret is geconfigureerd verschijnt hier automatisch.</p></div>}</article></section>;
};
