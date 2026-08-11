import React, { useState } from 'react';
import {
  CreditCard,
  CheckCircle2,
  Download,
  ShieldCheck,
  Zap,
  Building2,
  Plus,
  FileText,
  Layers,
  Sparkles,
  ChevronRight,
  ExternalLink,
  Receipt,
  Check,
  X,
  HelpCircle,
  Clock,
  Printer,
  Barcode,
  Award,
  Gift,
  Webhook,
  Shield,
  Users,
  Store,
  ArrowRight,
  ChevronDown,
  Eye,
  ShoppingBag,
  Globe,
} from 'lucide-react';
import {
  InvoiceData,
  downloadInvoicePdf,
  DEFAULT_PWAYMENT_SELLER,
} from '../utils/invoicePdfGenerator';
import { useMerchantProfile } from '../store/useMerchantProfile';
import { InvoicePreviewModal } from './InvoicePreviewModal';
import {
  type PlanCode,
  planLabel,
  trialDaysRemaining,
  useEntitlements,
} from '../billing/entitlements';
import { formatPlanMonthlyPrice } from '../billing/planCatalog';

export type BillingSubTab = 'plan' | 'invoices' | 'payment' | 'addons';

export interface BillingSettingsProps {
  subTab?: BillingSubTab;
  onSubTabChange?: (tab: BillingSubTab) => void;
}

export const BillingSettings: React.FC<BillingSettingsProps> = ({
  subTab = 'plan',
  onSubTabChange,
}) => {
  const merchantProfile = useMerchantProfile((state) => state.profile);
  const [previewInvoice, setPreviewInvoice] = useState<InvoiceData | null>(null);
  const snapshot = useEntitlements((state) => state.snapshot);
  const changeTestPlan = useEntitlements((state) => state.changeTestPlan);
  const simulateTrial = useEntitlements((state) => state.simulateTrial);
  const activePlan = snapshot?.effectivePlan ?? 'basic';
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('yearly');
  const [isUpgrading, setIsUpgrading] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showMatrixTable, setShowMatrixTable] = useState(true);

  // Addons state
  const [terminalCount, setTerminalCount] = useState(1);
  const [webshopSyncActive, setWebshopSyncActive] = useState(false);
  const [accountingSyncActive, setAccountingSyncActive] = useState(true);
  const [biExportActive, setBiExportActive] = useState(false);

  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const handlePlanChange = async (plan: PlanCode) => {
    if (activePlan === plan && snapshot?.status !== 'trialing') return;
    if (!snapshot?.canSimulateBilling) {
      triggerToast('Online betaling wordt in een volgende stap gekoppeld. Uw huidige abonnement is niet gewijzigd.');
      return;
    }
    setIsUpgrading(true);
    try {
      await changeTestPlan(plan);
      triggerToast(
        plan === 'basic'
          ? 'Pwayment Basis is actief. Al uw bestaande gegevens en instellingen blijven bewaard.'
          : `Testabonnement succesvol overgezet naar ${planLabel(plan)}. Er werd geen betaling uitgevoerd.`,
      );
    } catch (error) {
      console.error('Testabonnement wijzigen mislukt:', error);
      triggerToast('Het abonnement kon niet worden gewijzigd. Probeer opnieuw.');
    } finally {
      setIsUpgrading(false);
    }
  };

  const handleTrialSimulation = async (days: number) => {
    setIsUpgrading(true);
    try {
      await simulateTrial(days);
      triggerToast(
        days === 0
          ? 'Testtrial is verlopen; Pwayment Basis is nu effectief actief.'
          : `Testtrial ingesteld op ${days} resterende ${days === 1 ? 'dag' : 'dagen'}.`,
      );
    } catch (error) {
      console.error('Trialsimulatie mislukt:', error);
      triggerToast('De trial kon niet worden gesimuleerd.');
    } finally {
      setIsUpgrading(false);
    }
  };

  return (
    <div className="w-full max-w-full space-y-5 text-slate-900 font-sans">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-[70] flex items-center gap-2 px-4 py-3 bg-slate-900 text-white text-xs font-bold rounded-2xl shadow-lg border border-slate-800 animate-in fade-in">
          <CheckCircle2 size={16} className="text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Active Subscription Status Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-medium text-slate-600 bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2 font-bold text-slate-900">
            <CheckCircle2 size={15} className="text-emerald-600" />
            <span>{planLabel(activePlan)}</span>
          </div>
          <div className="hidden md:block text-slate-300">•</div>
          <div>Btw-nr: <strong className="text-slate-900">BE 0123.456.789</strong></div>
          <div className="hidden md:block text-slate-300">•</div>
          <div>
            {snapshot?.status === 'trialing' ? 'Pro-trial eindigt' : 'Abonnementsstatus'}:{' '}
            <strong className="text-slate-900">
              {snapshot?.status === 'trialing' && snapshot.trialEndsAt
                ? new Date(snapshot.trialEndsAt).toLocaleString('nl-BE', { dateStyle: 'long', timeStyle: 'short' })
                : snapshot?.status === 'expired'
                  ? 'Trial afgelopen'
                  : 'Actief'}
            </strong>
          </div>
        </div>
        <div className="font-bold text-slate-900">
          {snapshot?.status === 'trialing' ? (
            <span className="text-sky-700 font-black">30 dagen gratis · nog {trialDaysRemaining(snapshot)} dagen</span>
          ) : (
            <>Facturatiestatus: <span className="text-emerald-600 font-black">{snapshot?.status === 'expired' ? 'Basis actief' : 'In orde'}</span></>
          )}
        </div>
      </div>



      {/* SUB-TAB 1: PLAN & UPGRADES */}
      {subTab === 'plan' && (
        <div className="space-y-6">
          {/* Cycle Switcher & Savings Callout */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-slate-200 rounded-3xl p-5 shadow-2xs">
            <div>
              <h3 className="text-sm font-black text-slate-900">Facturatieperiode & Kortingsregeling</h3>
              <p className="text-xs text-slate-500 font-medium mt-0.5">Kies voor jaarlijkse facturatie en ontvang direct 20% korting op uw Pwayment softwarelicentie.</p>
            </div>

            <div className="flex items-center gap-1.5 bg-slate-100 p-1.5 rounded-2xl border border-slate-200 text-xs font-bold shrink-0">
              <button
                type="button"
                onClick={() => setBillingCycle('monthly')}
                className={`px-4 py-2 rounded-xl transition-all cursor-pointer ${
                  billingCycle === 'monthly' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Maandelijks
              </button>
              <button
                type="button"
                onClick={() => setBillingCycle('yearly')}
                className={`px-4 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
                  billingCycle === 'yearly' ? 'bg-slate-900 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>Jaarlijks</span>
                <span className="px-2 py-0.5 bg-emerald-500 text-white text-[9px] font-black rounded-md uppercase">20% Korting</span>
              </button>
            </div>
          </div>

          {/* 3 DEEP EXPANSIVE PLAN CARDS */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* TIER 1: PWAYMENT BASIS */}
            <div className={`rounded-3xl border p-6 bg-white shadow-2xs flex flex-col justify-between space-y-6 transition-all ${
              activePlan === 'basic' ? 'border-slate-900 ring-2 ring-slate-900' : 'border-slate-200 hover:border-slate-300'
            }`}>
              <div className="space-y-5">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <span className="text-xs font-black uppercase tracking-wider text-slate-400">Instappakket</span>
                    <h4 className="text-lg font-black text-slate-900">Pwayment Basis</h4>
                  </div>
                  {activePlan === 'basic' && (
                    <span className="px-2.5 py-1 bg-slate-900 text-white text-[10px] font-bold rounded-full">
                      Huidig abonnement
                    </span>
                  )}
                </div>

                <div>
                  <div className="text-3xl font-black text-slate-900">
                    {formatPlanMonthlyPrice('basic', billingCycle)}
                    <span className="text-xs font-medium text-slate-500"> / maand</span>
                  </div>
                  <p className="text-xs text-slate-500 font-medium mt-1 leading-relaxed">
                    Voor startende pop-up stores, marktkramen en beginnende winkeliers.
                  </p>
                </div>

                {/* Structured Detailed Specs */}
                <div className="space-y-4 text-xs border-t border-slate-100 pt-4">
                  <div>
                    <div className="font-bold text-slate-900 mb-1.5 flex items-center gap-1.5">
                      <Printer size={15} className="text-slate-500" /> Kassa & Hardware
                    </div>
                    <ul className="space-y-1.5 text-slate-600 font-medium pl-5 list-disc">
                      <li>1 Kassa-terminal scherm</li>
                      <li>USB & Bluetooth thermische bonprinters</li>
                      <li>WebUSB Barcodescanners</li>
                      <li>Handmatige kassalade-uitworp</li>
                    </ul>
                  </div>

                  <div>
                    <div className="font-bold text-slate-900 mb-1.5 flex items-center gap-1.5">
                      <Barcode size={15} className="text-slate-500" /> Producten & Stock
                    </div>
                    <ul className="space-y-1.5 text-slate-600 font-medium pl-5 list-disc">
                      <li>Max. 250 actieve artikelen</li>
                      <li>5 Hoofdcategorieën</li>
                      <li>Basis stockoverzicht</li>
                    </ul>
                  </div>

                  <div>
                    <div className="font-bold text-slate-900 mb-1.5 flex items-center gap-1.5">
                      <Receipt size={15} className="text-slate-500" /> Rapportage & Historiek
                    </div>
                    <ul className="space-y-1.5 text-slate-600 font-medium pl-5 list-disc">
                      <li>Z-rapport dagafsluiting</li>
                      <li>30 dagen transactiehistoriek</li>
                    </ul>
                  </div>

                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/80 text-[11px] font-semibold text-slate-500 space-y-1">
                    <div className="text-slate-700 font-bold">Niet inbegrepen in Basis:</div>
                    <div>Geen Webshop integratie (enkel in Enterprise & Ketens en Retail Professional), geen API / Webhooks, maximaal 1 kassa-gebruiker.</div>
                  </div>
                </div>
              </div>

              <button
                type="button"
                disabled={activePlan === 'basic' || isUpgrading}
                onClick={() => void handlePlanChange('basic')}
                className="w-full py-3 bg-slate-100 text-slate-700 text-xs font-bold rounded-xl disabled:opacity-60 cursor-default"
              >
                {activePlan === 'basic' ? 'Uw huidige pakket' : 'Overstappen naar Basis'}
              </button>
            </div>

            {/* TIER 2: RETAIL PROFESSIONAL (POPULAIR) */}
            <div className={`rounded-3xl border-2 p-6 bg-white shadow-md flex flex-col justify-between space-y-6 relative transition-all ${
              activePlan === 'pro' ? 'border-slate-900 ring-2 ring-slate-900' : 'border-slate-900'
            }`}>
              <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[10px] font-black uppercase tracking-wider px-4 py-1 rounded-full shadow-2xs flex items-center gap-1">
                <Sparkles size={12} className="text-amber-300" /> Populairste keuze
              </div>

              <div className="space-y-5 pt-1">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <span className="text-xs font-black uppercase tracking-wider text-slate-900">Professioneel</span>
                    <h4 className="text-lg font-black text-slate-900">Retail Professional</h4>
                  </div>
                  {activePlan === 'pro' && (
                    <span className="px-2.5 py-1 bg-slate-900 text-white text-[10px] font-bold rounded-full">
                      Huidig abonnement
                    </span>
                  )}
                </div>

                <div>
                  <div className="text-3xl font-black text-slate-900">
                    {formatPlanMonthlyPrice('pro', billingCycle)}
                    <span className="text-xs font-medium text-slate-500"> / maand</span>
                  </div>
                  <p className="text-xs text-slate-500 font-medium mt-1 leading-relaxed">
                    Voor actieve boetieks, speciaalzaken en winkels met 1 tot 3 kassa-terminals.
                  </p>
                </div>

                {/* Structured Detailed Specs */}
                <div className="space-y-4 text-xs border-t border-slate-100 pt-4">
                  <div>
                    <div className="font-bold text-slate-900 mb-1.5 flex items-center gap-1.5">
                      <Printer size={15} className="text-slate-900" /> Kassa & Betaalterminals
                    </div>
                    <ul className="space-y-1.5 text-slate-800 font-semibold pl-5 list-disc">
                      <li>Tot 3 Kassa-terminals inbegrepen</li>
                      <li>Geïntegreerde pinautomaten (Worldline, CCV, SumUp, Viva, Verifone)</li>
                      <li>Weegschaal & Automatisch bon snijden</li>
                    </ul>
                  </div>

                  <div>
                    <div className="font-bold text-slate-900 mb-1.5 flex items-center gap-1.5">
                      <Barcode size={15} className="text-slate-900" /> Producten & Barcodes
                    </div>
                    <ul className="space-y-1.5 text-slate-800 font-semibold pl-5 list-disc">
                      <li>Onbeperkt aantal artikelen & varianten (maten/kleuren)</li>
                      <li>Barcode-etiketten afdrukken op Dymo & Zebra</li>
                      <li>Voorraadbeheer met min/max voorraadmeldingen</li>
                    </ul>
                  </div>

                  <div>
                    <div className="font-bold text-slate-900 mb-1.5 flex items-center gap-1.5">
                      <Award size={15} className="text-slate-900" /> Retentie & Klanten
                    </div>
                    <ul className="space-y-1.5 text-slate-800 font-semibold pl-5 list-disc">
                      <li>Spaarprogramma & VIP-klantenniveaus</li>
                      <li>Cadeaubon-uitgifte & live saldocontrole</li>
                    </ul>
                  </div>

                  <div>
                    <div className="font-bold text-slate-900 mb-1.5 flex items-center gap-1.5">
                      <ShoppingBag size={15} className="text-slate-900" /> Webshop & E-Commerce
                    </div>
                    <ul className="space-y-1.5 text-slate-800 font-semibold pl-5 list-disc">
                      <li>Pwayment Webshop & Live Storefront integratie inbegrepen</li>
                      <li>Realtime catalogus & voorraadsynchronisatie</li>
                    </ul>
                  </div>

                  <div>
                    <div className="font-bold text-slate-900 mb-1.5 flex items-center gap-1.5">
                      <Webhook size={15} className="text-slate-900" /> API & Boekhouding
                    </div>
                    <ul className="space-y-1.5 text-slate-800 font-semibold pl-5 list-disc">
                      <li>Realtime uitgaande Webhooks</li>
                      <li>REST API-toegang (5.000 verzoeken/dag)</li>
                      <li>Peppol e-facturatie & Exact Online koppeling</li>
                    </ul>
                  </div>
                </div>
              </div>

              <button
                type="button"
                disabled={activePlan === 'pro' || isUpgrading}
                onClick={() => void handlePlanChange('pro')}
                className="w-full py-3 bg-slate-900 hover:bg-black text-white text-xs font-bold rounded-xl transition-colors cursor-pointer shadow-2xs disabled:opacity-50"
              >
                {isUpgrading ? 'Activeren...' : activePlan === 'pro' ? 'Uw huidige pakket' : 'Kies Retail Professional'}
              </button>
            </div>

            {/* TIER 3: ENTERPRISE & KETENS */}
            <div className={`rounded-3xl border p-6 bg-white shadow-2xs flex flex-col justify-between space-y-6 transition-all ${
              activePlan === 'enterprise' ? 'border-slate-900 ring-2 ring-slate-900' : 'border-slate-200 hover:border-slate-300'
            }`}>
              <div className="space-y-5">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <span className="text-xs font-black uppercase tracking-wider text-slate-400">Enterprise</span>
                    <h4 className="text-lg font-black text-slate-900">Enterprise & Ketens</h4>
                  </div>
                  {activePlan === 'enterprise' && (
                    <span className="px-2.5 py-1 bg-slate-900 text-white text-[10px] font-bold rounded-full">
                      Huidig abonnement
                    </span>
                  )}
                </div>

                <div>
                  <div className="text-3xl font-black text-slate-900">
                    {formatPlanMonthlyPrice('enterprise', billingCycle)}
                    <span className="text-xs font-medium text-slate-500"> / maand</span>
                  </div>
                  <p className="text-xs text-slate-500 font-medium mt-1 leading-relaxed">
                    Voor winkelketens, franchise-organisaties en multichannel retailbedrijven.
                  </p>
                </div>

                {/* Structured Detailed Specs */}
                <div className="space-y-4 text-xs border-t border-slate-100 pt-4">
                  <div>
                    <div className="font-bold text-slate-900 mb-1.5 flex items-center gap-1.5">
                      <Store size={15} className="text-slate-500" /> Multi-Store Management
                    </div>
                    <ul className="space-y-1.5 text-slate-600 font-medium pl-5 list-disc">
                      <li>Onbeperkt aantal filialen & kassa-terminals</li>
                      <li>Interne voorraadoverdrachten tussen filialen</li>
                      <li>Filiaal-specifieke prijslijsten & acties</li>
                    </ul>
                  </div>

                  <div>
                    <div className="font-bold text-slate-900 mb-1.5 flex items-center gap-1.5">
                      <Shield size={15} className="text-slate-500" /> Rechten & Audit Trail
                    </div>
                    <ul className="space-y-1.5 text-slate-600 font-medium pl-5 list-disc">
                      <li>Fijnmazige teamrol-rechten</li>
                      <li>Manager-PIN verplicht bij retouren & kortingen</li>
                      <li>Onbeperkt audit-logboek van alle kassa-handelingen</li>
                    </ul>
                  </div>

                  <div>
                    <div className="font-bold text-slate-900 mb-1.5 flex items-center gap-1.5">
                      <ShoppingBag size={15} className="text-slate-500" /> Webshop Multi-Storefront
                    </div>
                    <ul className="space-y-1.5 text-slate-600 font-medium pl-5 list-disc">
                      <li>Volledige Webshop & E-Commerce Suite inbegrepen</li>
                      <li>Multi-storefronts & custom headless API-koppelingen</li>
                    </ul>
                  </div>

                  <div>
                    <div className="font-bold text-slate-900 mb-1.5 flex items-center gap-1.5">
                      <Webhook size={15} className="text-slate-500" /> Maatwerk ERP Pipelines
                    </div>
                    <ul className="space-y-1.5 text-slate-600 font-medium pl-5 list-disc">
                      <li>Onbeperkte REST API-capaciteit</li>
                      <li>Maatwerk koppelingen naar SAP, Salesforce & Odoo</li>
                    </ul>
                  </div>

                  <div>
                    <div className="font-bold text-slate-900 mb-1.5 flex items-center gap-1.5">
                      <Users size={15} className="text-slate-500" /> Dedicated SLA & Support
                    </div>
                    <ul className="space-y-1.5 text-slate-600 font-medium pl-5 list-disc">
                      <li>99.9% Uptime SLA-garantie</li>
                      <li>24/7 Noodnummer bij kassa-storingen</li>
                      <li>Dedicated accountmanager & begeleiding op locatie</li>
                    </ul>
                  </div>
                </div>
              </div>

              <button
                type="button"
                disabled={activePlan === 'enterprise' || isUpgrading}
                onClick={() => void handlePlanChange('enterprise')}
                className="w-full py-3 bg-slate-900 hover:bg-black text-white text-xs font-bold rounded-xl transition-colors cursor-pointer shadow-2xs disabled:opacity-50"
              >
                {isUpgrading ? 'Activeren...' : activePlan === 'enterprise' ? 'Uw huidige pakket' : 'Kies Enterprise'}
              </button>
            </div>
          </div>

          {/* DETAILED COMPARISON FEATURE MATRIX TABLE */}
          <section className="bg-white border border-slate-200 rounded-3xl p-6 shadow-2xs space-y-4 pt-4">
            <div
              onClick={() => setShowMatrixTable((v) => !v)}
              className="flex items-center justify-between border-b border-slate-100 pb-4 cursor-pointer select-none"
            >
              <div>
                <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                  Volledige Functionaliteiten Vergelijkingsmatrix
                </h3>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  Bekijk de volledige functievergelijking per categorie voor alle pakketten.
                </p>
              </div>

              <button type="button" className="p-2 text-slate-500 hover:text-slate-900 rounded-xl hover:bg-slate-100">
                {showMatrixTable ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
              </button>
            </div>

            {showMatrixTable && (
              <div className="overflow-x-auto pt-2">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-400 text-[10px] uppercase tracking-wider font-black">
                      <th className="py-3 px-4 w-2/5">Functie / Categorie</th>
                      <th className="py-3 px-4 w-1/5 text-center">Pwayment Basis</th>
                      <th className="py-3 px-4 w-1/5 text-center bg-slate-50 rounded-t-xl text-slate-900">Retail Professional</th>
                      <th className="py-3 px-4 w-1/5 text-center">Enterprise & Ketens</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700 font-semibold">
                    {/* SECTION: KASSA & HARDWARE */}
                    <tr className="bg-slate-50/70 font-black text-slate-900 text-[11px]">
                      <td colSpan={4} className="py-2.5 px-4 uppercase tracking-wider">Kassa & Hardware Integratie</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-4">Kassa-terminals</td>
                      <td className="py-2.5 px-4 text-center">1 scherm</td>
                      <td className="py-2.5 px-4 text-center bg-slate-50 font-bold text-slate-900">3 schermen inbegrepen</td>
                      <td className="py-2.5 px-4 text-center text-emerald-600 font-bold">Onbeperkt</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-4">Betaalterminals (Worldline, CCV, SumUp, Verifone)</td>
                      <td className="py-2.5 px-4 text-center text-slate-400">—</td>
                      <td className="py-2.5 px-4 text-center bg-slate-50 text-emerald-600 font-bold">Inbegrepen</td>
                      <td className="py-2.5 px-4 text-center text-emerald-600 font-bold">Inbegrepen</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-4">Weegschaal & Barcodescanner</td>
                      <td className="py-2.5 px-4 text-center font-bold">Basisscanner</td>
                      <td className="py-2.5 px-4 text-center bg-slate-50 text-emerald-600 font-bold">Geavanceerd + Weegschaal</td>
                      <td className="py-2.5 px-4 text-center text-emerald-600 font-bold">Inbegrepen</td>
                    </tr>

                    {/* SECTION: CATALOGUS & STOCK */}
                    <tr className="bg-slate-50/70 font-black text-slate-900 text-[11px]">
                      <td colSpan={4} className="py-2.5 px-4 uppercase tracking-wider">Catalogus & Voorraadbeheer</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-4">Maximaal aantal artikelen</td>
                      <td className="py-2.5 px-4 text-center">250 producten</td>
                      <td className="py-2.5 px-4 text-center bg-slate-50 text-emerald-600 font-bold">Onbeperkt</td>
                      <td className="py-2.5 px-4 text-center text-emerald-600 font-bold">Onbeperkt</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-4">Interne voorraadoverdrachten tussen filialen</td>
                      <td className="py-2.5 px-4 text-center text-slate-400">—</td>
                      <td className="py-2.5 px-4 text-center bg-slate-50 text-slate-400">—</td>
                      <td className="py-2.5 px-4 text-center text-emerald-600 font-bold">Inbegrepen</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-4">Barcode-etiketten afdrukken (Dymo/Zebra)</td>
                      <td className="py-2.5 px-4 text-center text-slate-400">—</td>
                      <td className="py-2.5 px-4 text-center bg-slate-50 text-emerald-600 font-bold">Inbegrepen</td>
                      <td className="py-2.5 px-4 text-center text-emerald-600 font-bold">Inbegrepen</td>
                    </tr>

                    {/* SECTION: LOYALITEIT & RETENTIE */}
                    <tr className="bg-slate-50/70 font-black text-slate-900 text-[11px]">
                      <td colSpan={4} className="py-2.5 px-4 uppercase tracking-wider">Klanten & Spaarprogramma</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-4">Klanten Spaarprogramma & VIP Tiers</td>
                      <td className="py-2.5 px-4 text-center text-slate-400">—</td>
                      <td className="py-2.5 px-4 text-center bg-slate-50 text-emerald-600 font-bold">Inbegrepen</td>
                      <td className="py-2.5 px-4 text-center text-emerald-600 font-bold">Inbegrepen</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-4">Cadeaubonnen Uitgifte & Saldo Check</td>
                      <td className="py-2.5 px-4 text-center text-slate-400">—</td>
                      <td className="py-2.5 px-4 text-center bg-slate-50 text-emerald-600 font-bold">Inbegrepen</td>
                      <td className="py-2.5 px-4 text-center text-emerald-600 font-bold">Inbegrepen</td>
                    </tr>

                    {/* SECTION: API & INTEGRATIES */}
                    <tr className="bg-slate-50/70 font-black text-slate-900 text-[11px]">
                      <td colSpan={4} className="py-2.5 px-4 uppercase tracking-wider">Webshop, API & Integraties</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-4 font-bold text-slate-900">Webshop Integratie & Live Storefront</td>
                      <td className="py-2.5 px-4 text-center text-slate-400">—</td>
                      <td className="py-2.5 px-4 text-center bg-slate-50 text-emerald-600 font-bold">Inbegrepen in Retail Pro</td>
                      <td className="py-2.5 px-4 text-center text-emerald-600 font-bold">Inbegrepen (Multi-store)</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-4">REST API & Webhooks</td>
                      <td className="py-2.5 px-4 text-center text-slate-400">—</td>
                      <td className="py-2.5 px-4 text-center bg-slate-50 text-slate-900 font-bold">5.000 verzoeken/dag</td>
                      <td className="py-2.5 px-4 text-center text-emerald-600 font-bold">Onbeperkt</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-4">Peppol e-facturatie & Exact Online</td>
                      <td className="py-2.5 px-4 text-center text-slate-400">—</td>
                      <td className="py-2.5 px-4 text-center bg-slate-50 text-emerald-600 font-bold">Inbegrepen</td>
                      <td className="py-2.5 px-4 text-center text-emerald-600 font-bold">Inbegrepen</td>
                    </tr>

                    {/* SECTION: SUPPORT & SLA */}
                    <tr className="bg-slate-50/70 font-black text-slate-900 text-[11px]">
                      <td colSpan={4} className="py-2.5 px-4 uppercase tracking-wider">Ondersteuning & Garantieregeling</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-4">Klantenondersteuning</td>
                      <td className="py-2.5 px-4 text-center">E-mail ondersteuning</td>
                      <td className="py-2.5 px-4 text-center bg-slate-50 font-bold text-slate-900">Prioriteit E-mail & Chat</td>
                      <td className="py-2.5 px-4 text-center text-emerald-600 font-bold">24/7 Telefoon + Dedicated Manager</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-4">Uptime SLA-garantie</td>
                      <td className="py-2.5 px-4 text-center text-slate-400">—</td>
                      <td className="py-2.5 px-4 text-center bg-slate-50 font-bold text-slate-900">99.5% Uptime</td>
                      <td className="py-2.5 px-4 text-center text-emerald-600 font-bold">99.9% Uptime SLA</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      {/* SUB-TAB 2: FACTUREN & HISTORIEK */}
      {subTab === 'invoices' && (() => {
        const softwareInvoices: InvoiceData[] = [
          {
            invoiceNumber: 'PW-INV-2026-081',
            invoiceDate: '2026-08-01',
            dueDate: '2026-08-15',
            deliveryDate: '2026-08-01',
            status: 'Voldaan',
            type: 'subscription',
            structuredCommunication: '+++081/2026/00081+++',
            paymentMethod: 'SEPA Direct Debit (Automatische Incasso)',
            seller: DEFAULT_PWAYMENT_SELLER,
            buyer: {
              name: merchantProfile.name || 'PWAYMENT Retail Store',
              legalName: merchantProfile.legalName || merchantProfile.name,
              addressLine1: merchantProfile.addressLine1 || 'Kouter 12, 9000 Gent',
              addressLine2: merchantProfile.addressLine2 || 'België',
              vatNumber: merchantProfile.vatNumber || 'BE 0123.456.789',
              email: merchantProfile.email || 'facturatie@winkel.be',
              phone: merchantProfile.phone || '+32 9 234 56 78',
            },
            items: [
              {
                description: 'Pwayment Retail Professional (Maandabonnement Augustus 2026)',
                quantity: 1,
                unitPriceExclCents: 6900,
                vatRate: 21,
                totalExclCents: 6900,
                totalVatCents: 1449,
                totalInclCents: 8349,
              },
              {
                description: 'Geïntegreerde Peppol E-facturatie & Exact Online Sync',
                quantity: 1,
                unitPriceExclCents: 0,
                vatRate: 21,
                totalExclCents: 0,
                totalVatCents: 0,
                totalInclCents: 0,
              },
            ],
          },
          {
            invoiceNumber: 'PW-INV-2026-071',
            invoiceDate: '2026-07-01',
            dueDate: '2026-07-15',
            deliveryDate: '2026-07-01',
            status: 'Voldaan',
            type: 'subscription',
            structuredCommunication: '+++071/2026/00071+++',
            paymentMethod: 'SEPA Direct Debit (Automatische Incasso)',
            seller: DEFAULT_PWAYMENT_SELLER,
            buyer: {
              name: merchantProfile.name || 'PWAYMENT Retail Store',
              legalName: merchantProfile.legalName || merchantProfile.name,
              addressLine1: merchantProfile.addressLine1 || 'Kouter 12, 9000 Gent',
              addressLine2: merchantProfile.addressLine2 || 'België',
              vatNumber: merchantProfile.vatNumber || 'BE 0123.456.789',
              email: merchantProfile.email || 'facturatie@winkel.be',
              phone: merchantProfile.phone || '+32 9 234 56 78',
            },
            items: [
              {
                description: 'Pwayment Retail Professional (Maandabonnement Juli 2026)',
                quantity: 1,
                unitPriceExclCents: 6900,
                vatRate: 21,
                totalExclCents: 6900,
                totalVatCents: 1449,
                totalInclCents: 8349,
              },
            ],
          },
          {
            invoiceNumber: 'PW-INV-2026-061',
            invoiceDate: '2026-06-01',
            dueDate: '2026-06-15',
            deliveryDate: '2026-06-01',
            status: 'Voldaan',
            type: 'subscription',
            structuredCommunication: '+++061/2026/00061+++',
            paymentMethod: 'Bancontact / Online',
            seller: DEFAULT_PWAYMENT_SELLER,
            buyer: {
              name: merchantProfile.name || 'PWAYMENT Retail Store',
              legalName: merchantProfile.legalName || merchantProfile.name,
              addressLine1: merchantProfile.addressLine1 || 'Kouter 12, 9000 Gent',
              addressLine2: merchantProfile.addressLine2 || 'België',
              vatNumber: merchantProfile.vatNumber || 'BE 0123.456.789',
              email: merchantProfile.email || 'facturatie@winkel.be',
              phone: merchantProfile.phone || '+32 9 234 56 78',
            },
            items: [
              {
                description: 'Pwayment Retail Professional (Maandabonnement Juni 2026)',
                quantity: 1,
                unitPriceExclCents: 6900,
                vatRate: 21,
                totalExclCents: 6900,
                totalVatCents: 1449,
                totalInclCents: 8349,
              },
            ],
          },
          {
            invoiceNumber: 'PW-INV-2026-051',
            invoiceDate: '2026-05-01',
            dueDate: '2026-05-15',
            deliveryDate: '2026-05-01',
            status: 'Voldaan',
            type: 'subscription',
            structuredCommunication: '+++051/2026/00051+++',
            paymentMethod: 'Bancontact / Online',
            seller: DEFAULT_PWAYMENT_SELLER,
            buyer: {
              name: merchantProfile.name || 'PWAYMENT Retail Store',
              legalName: merchantProfile.legalName || merchantProfile.name,
              addressLine1: merchantProfile.addressLine1 || 'Kouter 12, 9000 Gent',
              addressLine2: merchantProfile.addressLine2 || 'België',
              vatNumber: merchantProfile.vatNumber || 'BE 0123.456.789',
              email: merchantProfile.email || 'facturatie@winkel.be',
              phone: merchantProfile.phone || '+32 9 234 56 78',
            },
            items: [
              {
                description: 'Pwayment Retail Professional (Maandabonnement Mei 2026)',
                quantity: 1,
                unitPriceExclCents: 6900,
                vatRate: 21,
                totalExclCents: 6900,
                totalVatCents: 1449,
                totalInclCents: 8349,
              },
            ],
          },
        ];

        return (
          <section className="bg-white border border-slate-200 rounded-3xl p-6 shadow-2xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-sm font-black uppercase tracking-wider text-slate-900">
                  Factuuroverzicht & Maandelijkse Afschriften
                </h3>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  Download uw Pwayment Retail softwarefacturen conform de Belgische BTW-wetgeving & Peppol BIS v3.
                </p>
              </div>
              <button
                type="button"
                onClick={() => triggerToast('Digitale Peppol e-facturatie is actief op uw btw-nummer.')}
                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200/70 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 transition-colors cursor-pointer"
              >
                Peppol E-facturatie actief
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-semibold">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-400 text-[10px] uppercase tracking-wider">
                    <th className="py-2.5 px-3">Factuurnummer</th>
                    <th className="py-2.5 px-3">Factuurdatum</th>
                    <th className="py-2.5 px-3">Omschrijving</th>
                    <th className="py-2.5 px-3">Bedrag (excl. btw)</th>
                    <th className="py-2.5 px-3">Btw (21%)</th>
                    <th className="py-2.5 px-3">Totaal (incl. btw)</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3 text-right">PDF Factuur</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {softwareInvoices.map((inv) => {
                    const excl = inv.items.reduce((s, i) => s + i.totalExclCents, 0);
                    const vat = inv.items.reduce((s, i) => s + i.totalVatCents, 0);
                    const incl = inv.items.reduce((s, i) => s + i.totalInclCents, 0);
                    return (
                      <tr key={inv.invoiceNumber} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-3 font-mono font-bold text-slate-900">{inv.invoiceNumber}</td>
                        <td className="py-3 px-3 text-slate-500">{String(inv.invoiceDate)}</td>
                        <td className="py-3 px-3">{inv.items[0]?.description}</td>
                        <td className="py-3 px-3 font-bold text-slate-900">€ {(excl / 100).toFixed(2).replace('.', ',')}</td>
                        <td className="py-3 px-3 text-slate-500">€ {(vat / 100).toFixed(2).replace('.', ',')}</td>
                        <td className="py-3 px-3 font-bold text-slate-900">€ {(incl / 100).toFixed(2).replace('.', ',')}</td>
                        <td className="py-3 px-3">
                          <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded-md border border-emerald-200">
                            {inv.status}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              title="Bekijk PDF Factuur"
                              onClick={() => setPreviewInvoice(inv)}
                              className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
                            >
                              <Eye size={15} />
                            </button>
                            <button
                              type="button"
                              title="Download PDF Factuur"
                              onClick={() => {
                                triggerToast(`Factuur ${inv.invoiceNumber} wordt gedownload...`);
                                downloadInvoicePdf(inv, `${inv.invoiceNumber}.pdf`);
                              }}
                              className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
                            >
                              <Download size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        );
      })()}

      {/* SUB-TAB 3: BETAALMETHODE */}
      {subTab === 'payment' && (
        <section className="bg-white border border-slate-200 rounded-3xl p-6 shadow-2xs space-y-5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-sm font-black uppercase tracking-wider text-slate-900">
                Gekoppelde Betaalmethode & Facturatiegegevens
              </h3>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                Stel uw automatische SEPA-incasso of kredietkaart in voor de maandelijkse afschrijving.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900">Actieve Betaalmethode</span>
                <span className="px-2 py-0.5 bg-slate-900 text-white font-bold text-[10px] rounded-md">SEPA Incasso</span>
              </div>
              <div className="text-sm font-mono font-bold text-slate-800">BE76 3631 9920 1823</div>
              <p className="text-[11px] text-slate-500">Automatische maandelijkse incasso op de 1e van de maand.</p>
              <button
                type="button"
                onClick={() => alert('Stripe Billing portaal wordt geopend...')}
                className="w-full py-2 bg-white border border-slate-300 hover:bg-slate-100 text-xs font-bold text-slate-900 rounded-xl transition-colors cursor-pointer"
              >
                Betaalmethode Wijzigen
              </button>
            </div>

            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900">Facturatie E-mailadres</span>
                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 font-bold text-[10px] rounded-md">Geverifieerd</span>
              </div>
              <div className="text-xs font-bold text-slate-800">facturatie@uwbedrijf.be</div>
              <p className="text-[11px] text-slate-500">Alle PDF-facturen worden automatisch naar dit adres verstuurd.</p>
            </div>
          </div>
        </section>
      )}

      {/* SUB-TAB 4: LICENTIES & ADD-ONS */}
      {subTab === 'addons' && (
        <section className="bg-white border border-slate-200 rounded-3xl p-6 shadow-2xs space-y-5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-sm font-black uppercase tracking-wider text-slate-900">
                Kassa-terminal Licenties & Maatwerk Add-ons
              </h3>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                Voeg extra schermen of integratiemodules toe aan uw bestaande licentie.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Terminal Seat Counter */}
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-slate-900">Extra kassa-terminals</div>
                  <div className="text-[11px] text-slate-500">€ 29 / maand per extra kassa-scherm</div>
                </div>
                <div className="flex items-center gap-2 bg-white border border-slate-300 rounded-xl p-1">
                  <button
                    type="button"
                    onClick={() => setTerminalCount((c) => Math.max(1, c - 1))}
                    className="w-7 h-7 flex items-center justify-center bg-slate-100 hover:bg-slate-200 text-slate-900 rounded-lg font-bold text-xs cursor-pointer"
                  >
                    -
                  </button>
                  <span className="w-8 text-center text-xs font-black text-slate-900">{terminalCount}</span>
                  <button
                    type="button"
                    onClick={() => setTerminalCount((c) => c + 1)}
                    className="w-7 h-7 flex items-center justify-center bg-slate-900 hover:bg-black text-white rounded-lg font-bold text-xs cursor-pointer"
                  >
                    +
                  </button>
                </div>
              </div>
              <p className="text-[11px] text-slate-500">Actieve schermen in uw winkel: {terminalCount} terminal(s).</p>
            </div>

            {/* Webshop Realtime Sync */}
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-slate-900">Webshop Synchronisatie Module</div>
                <div className="text-[11px] text-slate-500">WooCommerce / Shopify live voorraadkoppeling (€ 19 / mnd)</div>
              </div>
              <input
                type="checkbox"
                checked={webshopSyncActive}
                onChange={(e) => {
                  setWebshopSyncActive(e.target.checked);
                  triggerToast(e.target.checked ? 'Webshop Sync module toegevoegd aan licentie.' : 'Webshop Sync module verwijderd.');
                }}
                className="h-5 w-5 rounded border-slate-300 text-slate-900 focus:ring-slate-900 cursor-pointer"
              />
            </div>

            {/* Accounting Direct Connect */}
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-slate-900">Automatische Boekhoudkoppeling</div>
                <div className="text-[11px] text-slate-500">Exact Online / Octopus automatische Z-journaalpost (€ 15 / mnd)</div>
              </div>
              <input
                type="checkbox"
                checked={accountingSyncActive}
                onChange={(e) => {
                  setAccountingSyncActive(e.target.checked);
                  triggerToast(e.target.checked ? 'Boekhouding connector geactiveerd.' : 'Boekhouding connector gedeactiveerd.');
                }}
                className="h-5 w-5 rounded border-slate-300 text-slate-900 focus:ring-slate-900 cursor-pointer"
              />
            </div>

            {/* Advanced BI Export */}
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-slate-900">Geavanceerde Verkoopanalyse & Export</div>
                <div className="text-[11px] text-slate-500">Ruwe data-exports voor PowerBI & Excel analytics (€ 25 / mnd)</div>
              </div>
              <input
                type="checkbox"
                checked={biExportActive}
                onChange={(e) => {
                  setBiExportActive(e.target.checked);
                  triggerToast(e.target.checked ? 'Verkoopanalyse & Export module geactiveerd.' : 'Verkoopanalyse & Export module gedeactiveerd.');
                }}
                className="h-5 w-5 rounded border-slate-300 text-slate-900 focus:ring-slate-900 cursor-pointer"
              />
            </div>
          </div>
        </section>
      )}

      {/* INVOICE PREVIEW MODAL */}
      <InvoicePreviewModal invoice={previewInvoice} onClose={() => setPreviewInvoice(null)} />
    </div>
  );
};
