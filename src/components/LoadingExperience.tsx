import { Check, RotateCw } from "lucide-react";
import {
  loadingJourney,
  loadingJourneyStep,
  type LoadingProgress,
} from "../services/loadingProgress";

type LoadingExperienceProps = {
  progress: LoadingProgress;
  mode?: "screen" | "overlay";
  storefront?: boolean;
  onRetry?: () => void;
  onCancel?: () => void;
};

const BrandLockup = () => (
  <div className="inline-flex items-center gap-3" aria-label="PWAYMENT">
    <span className="pace-boot-mark h-11 w-11" aria-hidden="true" />
    <span className="text-xl font-black tracking-[-0.045em] text-slate-950">PWAYMENT</span>
  </div>
);

export const LoadingExperience = ({
  progress,
  mode = "screen",
  storefront = false,
  onRetry,
  onCancel,
}: LoadingExperienceProps) => {
  const failed = progress.id === "error";
  const activeStep = storefront ? 1 : loadingJourneyStep(progress.id);
  const displayProgress = storefront ? 38 : progress.progress;
  const title = storefront ? "Webshop voorbereiden" : progress.title;
  const detail = storefront
    ? "Producten, beschikbaarheid en winkelinstellingen worden geladen."
    : progress.detail;
  const retry = onRetry ?? (() => window.location.reload());

  return (
    <div
      className={`pwayment-loading-shell ${mode === "overlay" ? "is-overlay" : "is-screen"}`}
      role={failed ? "alert" : "status"}
      aria-live={failed ? "assertive" : "polite"}
      aria-busy={!failed}
    >
      <div className="pwayment-loading-ambient" aria-hidden="true" />
      <section className="relative z-10 w-full max-w-xl px-6 text-center sm:px-8">
        <BrandLockup />

        <div className="mt-10">
          <p className={`text-[11px] font-extrabold uppercase tracking-[0.2em] ${failed ? "text-rose-600" : "text-cyan-700"}`}>
            {failed ? "Actie vereist" : "Beveiligde winkelomgeving"}
          </p>
          <h1 className="mt-3 text-2xl font-black tracking-[-0.035em] text-slate-950 sm:text-[2rem]">
            {title}
          </h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-600 sm:text-[15px]">
            {detail}
          </p>
        </div>

        {!failed ? (
          <>
            <div
              className="pwayment-flow-rail mt-9"
              role="progressbar"
              aria-label={`${title}. Stap ${activeStep + 1} van ${loadingJourney.length}`}
              aria-valuemin={1}
              aria-valuemax={loadingJourney.length}
              aria-valuenow={activeStep + 1}
            >
              <span className="pwayment-flow-fill" style={{ width: `${displayProgress}%` }}>
                <span className="pwayment-flow-pulse" />
              </span>
            </div>

            <ol className="mt-5 grid grid-cols-4 gap-2" aria-label="Voortgang">
              {loadingJourney.map((step, index) => {
                const completed = index < activeStep || progress.id === "ready";
                const active = index === activeStep && progress.id !== "ready";
                return (
                  <li
                    key={step.id}
                    className={`flex flex-col items-center gap-2 text-[10px] font-bold sm:text-[11px] ${
                      completed ? "text-cyan-800" : active ? "text-slate-950" : "text-slate-400"
                    }`}
                    aria-current={active ? "step" : undefined}
                  >
                    <span
                      className={`flex h-5 w-5 items-center justify-center rounded-full border ${
                        completed
                          ? "border-cyan-600 bg-cyan-600 text-white"
                          : active
                            ? "border-cyan-500 bg-white shadow-[0_0_0_4px_rgba(6,182,212,0.12)]"
                            : "border-slate-200 bg-white"
                      }`}
                      aria-hidden="true"
                    >
                      {completed ? <Check size={12} strokeWidth={3} /> : <span className={`h-1.5 w-1.5 rounded-full ${active ? "bg-cyan-600" : "bg-slate-200"}`} />}
                    </span>
                    {step.label}
                  </li>
                );
              })}
            </ol>
          </>
        ) : (
          <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
            <button type="button" onClick={retry} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 text-sm font-extrabold text-white transition hover:bg-cyan-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2">
              <RotateCw size={15} /> Opnieuw proberen
            </button>
            {onCancel && (
              <button type="button" onClick={onCancel} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-5 text-sm font-bold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2">
                Terug naar aanmelden
              </button>
            )}
          </div>
        )}
      </section>
    </div>
  );
};
