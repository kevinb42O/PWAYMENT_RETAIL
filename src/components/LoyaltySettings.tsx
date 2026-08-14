import React, { useState } from 'react';
import {
  Award,
  Gift,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  Users,
  CreditCard,
  Percent,
  Calendar,
  ChevronRight,
  Trash2,
  Pencil,
  Check,
  Eye,
  RotateCcw,
} from 'lucide-react';

export interface LoyaltyTier {
  id: string;
  name: string;
  minSpend: number;
  multiplier: number;
  perks: string;
  active: boolean;
}

export const INITIAL_TIERS: LoyaltyTier[] = [
  { id: 'tier-bronze', name: 'Bronze Member', minSpend: 0, multiplier: 1.0, perks: '1 punt per € 1.00 besteed', active: true },
  { id: 'tier-silver', name: 'Silver VIP', minSpend: 500, multiplier: 1.25, perks: '1.25x punten + verjaardagsbonus 50 pt', active: true },
  { id: 'tier-gold', name: 'Gold Premium', minSpend: 1500, multiplier: 1.5, perks: '1.5x punten + VIP uitnodigingen & dubbele punten', active: true },
  { id: 'tier-platinum', name: 'Platinum Elite', minSpend: 4000, multiplier: 2.0, perks: '2.0x punten + gratis levering & exclusieve kortingen', active: true },
];

export const LoyaltySettings: React.FC = () => {
  // Main settings toggles
  const [loyaltyActive, setLoyaltyActive] = useState(true);
  const [giftCardsActive, setGiftCardsActive] = useState(true);

  // Earning & Redemption rules
  const [spendRatio, setSpendRatio] = useState('1.00'); // € per point
  const [pointValue, setPointValue] = useState('0.05'); // € value per point (e.g. 100 pt = €5)
  const [minRedeemPoints, setMinRedeemPoints] = useState('50'); // min points needed
  const [maxDiscountPercent, setMaxDiscountPercent] = useState('50'); // max % of ticket
  const [expiryMonths, setExpiryMonths] = useState('12'); // point validity period
  const [welcomeBonus, setWelcomeBonus] = useState('25'); // bonus points on signup
  const [birthdayBonus, setBirthdayBonus] = useState('5.00'); // € coupon on birthday

  // Gift card rules
  const [giftCardPrefix, setGiftCardPrefix] = useState('GC-2026-');
  const [giftCardValidityYears, setGiftCardValidityYears] = useState('2');
  const [allowCashPayout, setAllowCashPayout] = useState(false);

  // Tiers
  const [tiers, setTiers] = useState<LoyaltyTier[]>(INITIAL_TIERS);
  const [editingTier, setEditingTier] = useState<LoyaltyTier | null>(null);

  // Gift Card Lookup tool
  const [searchCardCode, setSearchCardCode] = useState('');
  const [cardLookupResult, setCardLookupResult] = useState<{
    code: string;
    balance: number;
    initialAmount: number;
    issueDate: string;
    expiryDate: string;
    status: 'actief' | 'gebruikt' | 'vervallen';
  } | null>(null);
  const [topupAmount, setTopupAmount] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleCardLookup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchCardCode.trim()) return;

    // Simulated balance lookup
    setCardLookupResult({
      code: searchCardCode.trim().toUpperCase(),
      balance: 45.0,
      initialAmount: 50.0,
      issueDate: '15/01/2026',
      expiryDate: '15/01/2028',
      status: 'actief',
    });
    triggerToast('Cadeaubon saldo succesvol opgehaald.');
  };

  const handleTopup = () => {
    const val = parseFloat(topupAmount);
    if (isNaN(val) || val <= 0 || !cardLookupResult) return;

    setCardLookupResult((prev) =>
      prev ? { ...prev, balance: prev.balance + val } : null
    );
    setTopupAmount('');
    triggerToast(`€ ${val.toFixed(2)} opgewaardeerd op cadeaubon ${cardLookupResult.code}`);
  };

  return (
    <div className="w-full max-w-full space-y-4 text-slate-900">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-[70] flex items-center gap-2 px-4 py-3 bg-slate-900 text-white text-xs font-bold rounded-2xl shadow-lg border border-slate-800">
          <CheckCircle2 size={16} className="text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Active Toggles Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-medium bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
        <div className="flex items-center gap-2 font-bold text-slate-900">
          <Award size={16} className="text-emerald-600" />
          <span>Loyaliteit & Retentie Instellingen</span>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5">
            <input
              type="checkbox"
              id="main-loyalty-toggle"
              checked={loyaltyActive}
              onChange={(e) => {
                setLoyaltyActive(e.target.checked);
                triggerToast(e.target.checked ? 'Spaarprogramma geactiveerd.' : 'Spaarprogramma gepauzeerd.');
              }}
              className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900 cursor-pointer"
            />
            <label htmlFor="main-loyalty-toggle" className="text-xs font-bold text-slate-800 cursor-pointer">
              Spaarprogramma Actief
            </label>
          </div>

          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5">
            <input
              type="checkbox"
              id="main-giftcard-toggle"
              checked={giftCardsActive}
              onChange={(e) => {
                setGiftCardsActive(e.target.checked);
                triggerToast(e.target.checked ? 'Cadeaubonnen geactiveerd.' : 'Cadeaubonnen uitgeschakeld.');
              }}
              className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900 cursor-pointer"
            />
            <label htmlFor="main-giftcard-toggle" className="text-xs font-bold text-slate-800 cursor-pointer">
              Cadeaubonnen Actief
            </label>
          </div>
        </div>
      </div>

        {/* Key Metrics Overview */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-1">
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/90">
            <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center justify-between">
              <span>Actieve Spaarders</span>
              <Users size={15} className="text-slate-500" />
            </div>
            <div className="text-xl font-black text-slate-900 mt-1">1.482</div>
            <div className="text-[10px] font-bold text-emerald-600 mt-0.5">+14% deze maand</div>
          </div>

          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/90">
            <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center justify-between">
              <span>Uitgegeven Punten</span>
              <Award size={15} className="text-slate-500" />
            </div>
            <div className="text-xl font-black text-slate-900 mt-1">184.920 pt</div>
            <div className="text-[10px] font-medium text-slate-500 mt-0.5">Saldo in omloop</div>
          </div>

          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/90">
            <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center justify-between">
              <span>Verzilverde Waarde</span>
              <TrendingUp size={15} className="text-slate-500" />
            </div>
            <div className="text-xl font-black text-slate-900 mt-1">€ 4.240,00</div>
            <div className="text-[10px] font-bold text-emerald-600 mt-0.5">Gem. kassa ticket +28%</div>
          </div>

          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/90">
            <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center justify-between">
              <span>Openstaande Cadeaubonnen</span>
              <CreditCard size={15} className="text-slate-500" />
            </div>
            <div className="text-xl font-black text-slate-900 mt-1">€ 2.850,00</div>
            <div className="text-[10px] font-medium text-slate-500 mt-0.5">142 actieve kaarten</div>
          </div>
        </div>

      {/* SECTION 1: SPAARREGELS & PUNTEN WAARDE */}
      <section className="bg-white border border-slate-200 rounded-3xl p-6 shadow-2xs space-y-5">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-sm font-black uppercase tracking-wider text-slate-900">
              1. Punten Sparen & Inwisselregels
            </h3>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Bepaal hoeveel punten een klant krijgt per bestede euro en de verzilveringswaarde aan de kassa.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/90 space-y-1.5">
            <label className="block text-xs font-bold text-slate-900 truncate">Spaarratio (Euro per punt)</label>
            <div className="relative flex items-center">
              <span className="absolute left-3 text-xs font-bold text-slate-400">€</span>
              <input
                type="number"
                step="0.10"
                value={spendRatio}
                onChange={(e) => setSpendRatio(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg pl-7 pr-14 py-1.5 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
              <span className="absolute right-3 text-[11px] font-bold text-slate-500 pointer-events-none">= 1 pt</span>
            </div>
            <p className="text-[11px] text-slate-500 leading-tight">1 punt per uitgegeven bedrag.</p>
          </div>

          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/90 space-y-1.5">
            <label className="block text-xs font-bold text-slate-900 truncate">Inwisselwaarde per punt</label>
            <div className="relative flex items-center">
              <span className="absolute left-3 text-[11px] font-bold text-slate-500 pointer-events-none">1 pt = €</span>
              <input
                type="number"
                step="0.01"
                value={pointValue}
                onChange={(e) => setPointValue(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg pl-16 pr-3 py-1.5 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>
            <p className="text-[11px] text-slate-500 leading-tight">100 pt = € {(parseFloat(pointValue || '0') * 100).toFixed(2)} korting.</p>
          </div>

          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/90 space-y-1.5">
            <label className="block text-xs font-bold text-slate-900 truncate">Minimum Inwisseldrempel</label>
            <div className="relative flex items-center">
              <input
                type="number"
                value={minRedeemPoints}
                onChange={(e) => setMinRedeemPoints(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 pr-16 py-1.5 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
              <span className="absolute right-3 text-[11px] font-bold text-slate-500 pointer-events-none">punten</span>
            </div>
            <p className="text-[11px] text-slate-500 leading-tight">Minimaal nodig voor inwisseling.</p>
          </div>

          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/90 space-y-1.5">
            <label className="block text-xs font-bold text-slate-900 truncate">Max. Korting per Transactie</label>
            <div className="relative flex items-center">
              <input
                type="number"
                value={maxDiscountPercent}
                onChange={(e) => setMaxDiscountPercent(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 pr-16 py-1.5 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
              <span className="absolute right-3 text-[11px] font-bold text-slate-500 pointer-events-none">% ticket</span>
            </div>
            <p className="text-[11px] text-slate-500 leading-tight">Max % voldaan met punten.</p>
          </div>

          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/90 space-y-1.5">
            <label className="block text-xs font-bold text-slate-900 truncate">Geldigheidstermijn Punten</label>
            <select
              value={expiryMonths}
              onChange={(e) => setExpiryMonths(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
            >
              <option value="6">6 maanden</option>
              <option value="12">12 maanden (1 jaar)</option>
              <option value="24">24 maanden (2 jaar)</option>
              <option value="0">Geen vervaldatum</option>
            </select>
            <p className="text-[11px] text-slate-500 leading-tight">Opschoning ongebruikte punten.</p>
          </div>

          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/90 space-y-1.5">
            <label className="block text-xs font-bold text-slate-900 truncate">Welkomstbonus Registratie</label>
            <div className="relative flex items-center">
              <input
                type="number"
                value={welcomeBonus}
                onChange={(e) => setWelcomeBonus(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 pr-16 py-1.5 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
              <span className="absolute right-3 text-[11px] font-bold text-slate-500 pointer-events-none">punten</span>
            </div>
            <p className="text-[11px] text-slate-500 leading-tight">Bij nieuw profiel aan kassa.</p>
          </div>
        </div>
      </section>

      {/* SECTION 2: VIP KLANTENNIVEAUS (TIERS) */}
      <section className="bg-white border border-slate-200 rounded-3xl p-6 shadow-2xs space-y-5">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-sm font-black uppercase tracking-wider text-slate-900">
              2. VIP Klantenniveaus & Multipliers (Tiers)
            </h3>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Beloon uw meest loyale klanten automatisch met hogere spaar-multipliers en VIP extra's.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {tiers.map((t) => (
            <div
              key={t.id}
              className="p-4 rounded-2xl border border-slate-200 bg-slate-50/70 flex flex-col justify-between space-y-3"
            >
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-extrabold text-xs text-slate-900">{t.name}</span>
                  <span className="px-2 py-0.5 bg-slate-900 text-white font-black text-[10px] rounded-md">
                    {t.multiplier}x Multiplier
                  </span>
                </div>
                <div className="text-[11px] font-bold text-slate-500">
                  Vanaf € {t.minSpend.toLocaleString('nl-BE')} omzet / jaar
                </div>
                <p className="text-[11px] text-slate-600 mt-2 leading-relaxed">{t.perks}</p>
              </div>

              <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">Actief</span>
                <button
                  type="button"
                  onClick={() => {
                    setEditingTier(t);
                    triggerToast(`Niveau "${t.name}" geopend voor bewerking.`);
                  }}
                  className="text-slate-600 hover:text-slate-900 p-1 rounded-lg hover:bg-slate-200/60 transition-colors cursor-pointer"
                >
                  <Pencil size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* SECTION 3: CADEAUBONNEN CONFIGURATIE & LIVE SALDO LOOKUP */}
      <section className="bg-white border border-slate-200 rounded-3xl p-6 shadow-2xs space-y-5">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-sm font-black uppercase tracking-wider text-slate-900">
              3. Cadeaubonnen Beheer & Live Saldo-Check Tool
            </h3>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Controleer en waardeer fysieke of digitale cadeaubon-codes direct op aan de kassa.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Settings Column */}
          <div className="space-y-4">
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-2">
              <label className="block text-xs font-bold text-slate-900">Cadeaubon Nummering Prefix</label>
              <input
                type="text"
                value={giftCardPrefix}
                onChange={(e) => setGiftCardPrefix(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
              <p className="text-[11px] text-slate-500">Automatische barcode prefix voor nieuw gegenereerde bonnen.</p>
            </div>

            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-2">
              <label className="block text-xs font-bold text-slate-900">Wettelijke Geldigheidsduur Cadeaubon</label>
              <select
                value={giftCardValidityYears}
                onChange={(e) => setGiftCardValidityYears(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
              >
                <option value="1">1 jaar vanaf uitgiftedatum</option>
                <option value="2">2 jaar vanaf uitgiftedatum (Belgische Standaard)</option>
                <option value="5">5 jaar wettelijk</option>
                <option value="0">Onbeperkt geldig</option>
              </select>
            </div>
          </div>

          {/* Live Card Lookup & Topup Tool */}
          <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200/90 space-y-4">
            <div className="text-xs font-bold text-slate-900">Live Cadeaubon Opvragen & Opwaarderen</div>

            <form onSubmit={handleCardLookup} className="flex gap-2">
              <input
                type="text"
                value={searchCardCode}
                onChange={(e) => setSearchCardCode(e.target.value)}
                placeholder="Bijv. GC-2026-8891"
                className="flex-1 bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-slate-900 hover:bg-black text-white text-xs font-bold rounded-xl shadow-2xs transition-colors cursor-pointer"
              >
                Opvragen
              </button>
            </form>

            {cardLookupResult ? (
              <div className="p-4 bg-white rounded-xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <div>
                    <div className="text-xs font-mono font-black text-slate-900">{cardLookupResult.code}</div>
                    <div className="text-[10px] text-slate-500 font-medium">Uitgegeven: {cardLookupResult.issueDate} | Geldig tot: {cardLookupResult.expiryDate}</div>
                  </div>
                  <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 font-bold text-[10px] rounded-full border border-emerald-200">
                    {cardLookupResult.status}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700">Huidig Beschikbaar Saldo:</span>
                  <span className="text-base font-black text-slate-900">€ {cardLookupResult.balance.toFixed(2)}</span>
                </div>

                {/* Top-up Form */}
                <div className="flex gap-2 pt-2 border-t border-slate-100">
                  <input
                    type="number"
                    step="5"
                    value={topupAmount}
                    onChange={(e) => setTopupAmount(e.target.value)}
                    placeholder="Bedrag bijladen (€)"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                  <button
                    type="button"
                    onClick={handleTopup}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-2xs transition-colors whitespace-nowrap cursor-pointer"
                  >
                    + Saldo Bijladen
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-4 bg-white/60 border border-dashed border-slate-200 rounded-xl text-center text-xs font-medium text-slate-400">
                Voer een cadeauboncode in om het live saldo en de geldigheidsdatum te controleren.
              </div>
            )}
          </div>
        </div>
      </section>

      {/* SAVE ACTIONS FOOTER */}
      <div className="flex justify-end pt-2">
        <button
          type="button"
          onClick={() => triggerToast('Spaarprogramma & Cadeaubon instellingen succesvol opgeslagen.')}
          className="px-6 py-3 bg-slate-900 hover:bg-black text-white text-xs font-bold rounded-xl shadow-2xs transition-colors cursor-pointer"
        >
          Instellingen Opslaan
        </button>
      </div>
    </div>
  );
};
