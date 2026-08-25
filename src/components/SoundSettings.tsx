import React from "react";
import { Play, RotateCcw, ShoppingBag, TriangleAlert, Volume2, VolumeX } from "lucide-react";
import { playRegisterSound, useRegisterSoundSettings, type RegisterSoundKind, type RegisterSoundSettings } from "../sound/registerSounds";

type BooleanSetting = Exclude<keyof RegisterSoundSettings, "volume">;

const SoundOption = ({ setting, title, detail, icon, preview, disabled = false, nested = false }: {
  setting: BooleanSetting;
  title: string;
  detail: string;
  icon: React.ReactNode;
  preview: RegisterSoundKind;
  disabled?: boolean;
  nested?: boolean;
}) => {
  const checked = useRegisterSoundSettings((state) => state[setting]);
  const update = useRegisterSoundSettings((state) => state.update);
  const id = `register-sound-${setting}`;

  return (
    <div className={nested ? "ml-7 border-l-2 border-slate-200 pl-3" : ""}>
      <div className={`flex items-start gap-3 rounded-xl border border-slate-200/90 bg-white p-3 shadow-2xs ${disabled ? "opacity-50" : ""}`}>
        <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600">{icon}</span>
        <label htmlFor={id} className={`min-w-0 flex-1 ${disabled ? "cursor-default" : "cursor-pointer"}`}>
          <span className="block text-xs font-bold text-slate-900">{title}</span>
          <span className="mt-0.5 block text-[11px] font-medium leading-4 text-slate-500">{detail}</span>
        </label>
        <button type="button" disabled={disabled} onClick={() => void playRegisterSound(preview, { preview: true })} className="mt-0.5 inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-[10px] font-bold text-slate-600 hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed">
          <Play size={11} fill="currentColor" /> Test
        </button>
        <input id={id} type="checkbox" checked={checked} disabled={disabled} onChange={(event) => update({ [setting]: event.target.checked })} className="mt-2 h-4 w-4 shrink-0 cursor-pointer rounded border-slate-300 text-slate-900 focus:ring-slate-900 disabled:cursor-not-allowed" />
      </div>
    </div>
  );
};

export const SoundSettings = () => {
  const settings = useRegisterSoundSettings();
  const volumePercent = Math.round(settings.volume * 100);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-black uppercase tracking-wider text-slate-400">6. Kassageluid & meldingen</div>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-bold text-slate-500">Alleen dit apparaat</span>
      </div>

      <div className="space-y-4 rounded-2xl border border-slate-200/80 bg-slate-50 p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-slate-800 shadow-2xs">{settings.enabled ? <Volume2 size={18} /> : <VolumeX size={18} />}</span>
            <div>
              <label htmlFor="register-sound-enabled" className="cursor-pointer text-xs font-bold text-slate-900">Appgeluiden op deze kassa</label>
              <p className="mt-0.5 max-w-xl text-[11px] font-medium leading-4 text-slate-500">Korte audiofeedback voor belangrijke kassamomenten. Deze instelling wordt niet gedeeld met andere toestellen.</p>
            </div>
          </div>
          <label htmlFor="register-sound-enabled" className="flex cursor-pointer items-center gap-2 self-end text-xs font-bold text-slate-700 sm:self-auto">
            <span>{settings.enabled ? "Ingeschakeld" : "Uitgeschakeld"}</span>
            <input id="register-sound-enabled" type="checkbox" checked={settings.enabled} onChange={(event) => settings.update({ enabled: event.target.checked })} className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900" />
          </label>
        </div>

        <div className={`border-t border-slate-200/70 pt-4 ${settings.enabled ? "" : "opacity-50"}`}>
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="register-sound-volume" className="text-xs font-bold text-slate-900">Volume</label>
            <span className="text-xs font-black tabular-nums text-slate-700">{volumePercent}%</span>
          </div>
          <div className="mt-2 flex items-center gap-3">
            <VolumeX size={14} className="text-slate-400" />
            <input id="register-sound-volume" type="range" min="0" max="100" step="1" disabled={!settings.enabled} value={volumePercent} onChange={(event) => settings.update({ volume: Number(event.target.value) / 100 })} onPointerUp={() => void playRegisterSound("attention", { preview: true })} className="h-1.5 flex-1 cursor-pointer accent-slate-900 disabled:cursor-not-allowed" />
            <Volume2 size={15} className="text-slate-600" />
          </div>
        </div>

        <div className="space-y-2 border-t border-slate-200/70 pt-4">
          <SoundOption setting="attention" title="Aandacht vereist" detail="Alleen wanneer een verkoop niet kon worden geboekt of een betaalstatus handmatig moet worden gecontroleerd." icon={<TriangleAlert size={15} />} preview="attention" disabled={!settings.enabled} />
          <SoundOption setting="webshopOrders" title="Nieuwe webshopbestelling" detail="Alleen voor een werkelijk nieuwe bestelling; synchronisatie en statuswijzigingen blijven stil." icon={<ShoppingBag size={15} />} preview="webshop-order" disabled={!settings.enabled} />
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-slate-200/70 pt-3">
          <p className="text-[10px] font-medium text-slate-400">Geluid ondersteunt de visuele status en vervangt die nooit.</p>
          <button type="button" onClick={() => settings.reset()} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[10px] font-bold text-slate-500 hover:bg-white hover:text-slate-900"><RotateCcw size={12} /> Herstel standaard</button>
        </div>
      </div>
    </div>
  );
};
