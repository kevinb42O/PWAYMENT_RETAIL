import React from "react";
import {
  BellRing,
  Check,
  CreditCard,
  RotateCcw,
  ScanLine,
  ShoppingBag,
  TriangleAlert,
  Volume2,
  VolumeX,
} from "lucide-react";
import {
  playRegisterSound,
  useRegisterSoundSettings,
  type RegisterSoundKind,
  type RegisterSoundSettings,
} from "../sound/registerSounds";

type BooleanSetting = Exclude<keyof RegisterSoundSettings, "volume">;

const SoundSwitch = ({
  setting,
  title,
  detail,
  icon,
  preview,
  disabled = false,
  nested = false,
}: {
  setting: BooleanSetting;
  title: string;
  detail: string;
  icon: React.ReactNode;
  preview?: RegisterSoundKind;
  disabled?: boolean;
  nested?: boolean;
}) => {
  const checked = useRegisterSoundSettings((state) => state[setting]);
  const update = useRegisterSoundSettings((state) => state.update);

  return (
    <div className={`flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center ${nested ? "ml-5 border-dashed bg-slate-50/70" : ""} ${disabled ? "opacity-50" : ""}`}>
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-slate-200 bg-slate-50 text-slate-600">
          {icon}
        </span>
        <div>
          <div className="text-xs font-black text-slate-900">{title}</div>
          <p className="mt-1 max-w-2xl text-[11px] font-medium leading-5 text-slate-500">{detail}</p>
        </div>
      </div>
      <div className="flex items-center justify-end gap-2 pl-12 sm:pl-0">
        {preview && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => void playRegisterSound(preview, { preview: true })}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-black text-slate-600 hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed"
          >
            Beluister
          </button>
        )}
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          aria-label={title}
          disabled={disabled}
          onClick={() => update({ [setting]: !checked })}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed ${checked ? "bg-slate-950" : "bg-slate-300"}`}
        >
          <span className={`absolute top-0.5 grid h-5 w-5 place-items-center rounded-full bg-white shadow-sm transition-transform ${checked ? "translate-x-[22px]" : "translate-x-0.5"}`}>
            {checked && <Check size={11} strokeWidth={3} className="text-slate-950" />}
          </span>
        </button>
      </div>
    </div>
  );
};

export const SoundSettings = () => {
  const settings = useRegisterSoundSettings();
  const volumePercent = Math.round(settings.volume * 100);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 rounded-2xl bg-slate-950 p-5 text-white sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-white/10 bg-white/10 text-sky-200">
            {settings.enabled ? <Volume2 size={21} /> : <VolumeX size={21} />}
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="text-sm font-black">Kassageluid</h4>
              <span className="rounded-full border border-white/10 bg-white/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-slate-300">Dit apparaat</span>
            </div>
            <p className="mt-1 max-w-xl text-[11px] font-medium leading-5 text-slate-400">
              Subtiele feedback voor deze kassa. De voorkeuren blijven lokaal en veranderen geen geluid op andere toestellen.
            </p>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={settings.enabled}
          onClick={() => settings.update({ enabled: !settings.enabled })}
          className={`flex min-w-28 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-black transition ${settings.enabled ? "bg-white text-slate-950" : "border border-white/15 bg-white/5 text-slate-300"}`}
        >
          {settings.enabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
          {settings.enabled ? "Geluid aan" : "Geluid uit"}
        </button>
      </div>

      <div className={`rounded-2xl border border-slate-200 bg-slate-50 p-5 ${settings.enabled ? "" : "opacity-50"}`}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <label htmlFor="register-sound-volume" className="text-xs font-black text-slate-900">Volume</label>
            <p className="mt-1 text-[11px] font-medium text-slate-500">Afgestemd voor korte feedback, niet voor systeemmeldingen op luidsprekerniveau.</p>
          </div>
          <span className="min-w-12 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-center text-xs font-black tabular-nums text-slate-800">{volumePercent}%</span>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <VolumeX size={15} className="text-slate-400" />
          <input
            id="register-sound-volume"
            type="range"
            min="0"
            max="100"
            step="1"
            disabled={!settings.enabled}
            value={volumePercent}
            onChange={(event) => settings.update({ volume: Number(event.target.value) / 100 })}
            onPointerUp={() => void playRegisterSound("payment-complete", { preview: true })}
            className="h-2 flex-1 cursor-pointer accent-slate-950 disabled:cursor-not-allowed"
          />
          <Volume2 size={17} className="text-slate-700" />
        </div>
      </div>

      <div className="space-y-3">
        <SoundSwitch
          setting="paymentComplete"
          title="Verkoop afgerond"
          detail="Een warme, korte bevestiging nadat de verkoop veilig is geboekt. Cash, cadeaubon en andere betalingen in de app gebruiken dit geluid."
          icon={<CreditCard size={17} />}
          preview="payment-complete"
          disabled={!settings.enabled}
        />
        <SoundSwitch
          setting="terminalPaymentComplete"
          title="Ook bij echte terminalbetalingen"
          detail="Standaard uit: de betaalterminal geeft zelf al een bevestiging. Schakel dit alleen in als de kassa verder van de terminal staat."
          icon={<BellRing size={16} />}
          preview="payment-complete"
          disabled={!settings.enabled || !settings.paymentComplete}
          nested
        />
        <SoundSwitch
          setting="attention"
          title="Aandacht vereist"
          detail="Een rustige dubbele toon bij een mislukte boeking of onderbroken statuscontrole. Het geluid herhaalt niet en vervangt nooit de melding op het scherm."
          icon={<TriangleAlert size={17} />}
          preview="attention"
          disabled={!settings.enabled}
        />
        <SoundSwitch
          setting="scanner"
          title="Barcodescanner"
          detail="Een ultrakorte tik bij een geldige scan en een lage dubbele tik wanneer een code niet kan worden toegevoegd. Laat dit uit als uw scanner zelf piept."
          icon={<ScanLine size={17} />}
          preview="scan-success"
          disabled={!settings.enabled}
        />
        <SoundSwitch
          setting="webshopOrders"
          title="Nieuwe webshopbestelling"
          detail="Een heldere maar compacte melding bij een nieuw binnenkomende bestelling. Statuswijzigingen en synchronisaties blijven stil."
          icon={<ShoppingBag size={17} />}
          preview="webshop-order"
          disabled={!settings.enabled}
        />
      </div>

      <div className="flex items-center justify-between gap-4 border-t border-slate-100 pt-4">
        <p className="text-[10px] font-medium leading-4 text-slate-400">Geluid is aanvullende feedback. Alle acties blijven ook visueel herkenbaar.</p>
        <button
          type="button"
          onClick={() => settings.reset()}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-2 text-[10px] font-black text-slate-500 hover:bg-slate-100 hover:text-slate-900"
        >
          <RotateCcw size={13} /> Herstel standaard
        </button>
      </div>
    </div>
  );
};
