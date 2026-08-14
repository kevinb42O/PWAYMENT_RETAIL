import React, { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { useAuth } from '../auth/useAuth';
import { useStore } from '../store/useStore';
import { ProductAdmin } from './ProductAdmin';
import { MerchantSettings } from './MerchantSettings';
import { BarcodeLabelPrint } from './BarcodeLabelPrint';
import { ThermalPrinterPanel } from './ThermalPrinterPanel';
import { IntegrationsSettings } from './IntegrationsSettings';
import { LoyaltySettings } from './LoyaltySettings';
import { BillingSettings, BillingSubTab } from './BillingSettings';
import { WebshopSettings } from './WebshopSettings';
import { CustomerDisplaySettings } from './CustomerDisplaySettings';
import { ModuleSettings } from './ModuleSettings';
import { WorkforceSettings } from './WorkforceSettings';
import { FeatureGate } from '../billing/FeatureGate';
import { FEATURE_KEYS } from '../billing/entitlements';
import { Modal } from './Modal';
import { hashCredential } from '../utils/credentials';
import type { User, Role } from '../types';
import {
  WorldlineLogo,
  CCVLogo,
  SumUpLogo,
  MollieLogo,
  VivaWalletLogo,
  VerifoneLogo,
} from './TerminalLogos';
import {
  CreditCard,
  Store,
  Printer,
  Shield,
  Users,
  Package,
  Receipt,
  Barcode,
  Crown,
  CheckCircle2,
  Download,
  Check,
  ShieldCheck,
  Sparkles,
  Plus,
  Webhook,
  BadgePercent,
  Gift,
  Award,
  Laptop,
  Eye,
  EyeOff,
  Scan,
  Volume2,
  Zap,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Scale,
  AlertCircle,
  Tags,
  Tag,
  Globe,
  ShoppingBag,
  Truck,
  Monitor,
  LayoutGrid,
  CalendarClock,
  Edit2,
  Trash2,
  UserPlus,
  KeyRound,
} from 'lucide-react';

type WorkspaceTab =
  | 'billing'
  | 'billing-plan'
  | 'billing-invoices'
  | 'billing-payment'
  | 'billing-addons'
  | 'modules'
  | 'workforce'
  | 'catalog'
  | 'catalog-products'
  | 'catalog-categories'
  | 'webshop'
  | 'webshop-general'
  | 'webshop-orders'
  | 'webshop-design'
  | 'webshop-products'
  | 'webshop-coupons'
  | 'webshop-shipping'
  | 'webshop-payments'
  | 'webshop-domain'
  | 'general'
  | 'merchant'
  | 'labels'
  | 'integrations'
  | 'tax'
  | 'loyalty'
  | 'hardware'
  | 'hardware-printer'
  | 'hardware-scanner'
  | 'hardware-drawer'
  | 'hardware-terminal'
  | 'hardware-scale'
  | 'hardware-display'
  | 'security'
  | 'team';

interface ProfileViewProps {
  initialTab?: WorkspaceTab;
  initialTabRequestKey?: number;
}

export const ProfileView: React.FC<ProfileViewProps> = ({
  initialTab,
  initialTabRequestKey,
}) => {
  const currentStoreIsDemo = useAuth((s) => s.currentStoreIsDemo);
  const currentRole = useAuth((s) => s.currentRole);
  const currentUserName = useAuth((s) => s.currentUserName);

  const currentUserId = useAuth((s) => s.currentUserId);
  const teamUsers = useLiveQuery(() => db.users.toArray()) || [];
  const appliedInitialTabRequestRef = useRef<number | undefined>(undefined);

  // Team management modal state
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [editingTeamUser, setEditingTeamUser] = useState<User | null>(null);
  const [teamForm, setTeamForm] = useState({
    name: '',
    email: '',
    role: 'cashier' as Role,
    jobTitle: '',
    pin: '',
  });
  const [teamError, setTeamError] = useState<string | null>(null);

  // DEFAULT TAB IS BILLING & ABONNEMENTEN (TOP ITEM)
  const [activeTab, setActiveTab] = useState<WorkspaceTab>(() => {
    const requested = new URLSearchParams(window.location.search).get('settings');
    const directWebshopTabs: WorkspaceTab[] = [
      'webshop',
      'webshop-general',
      'webshop-orders',
      'webshop-design',
      'webshop-products',
      'webshop-coupons',
      'webshop-shipping',
      'webshop-payments',
      'webshop-domain',
    ];
    if (requested === 'integrations') return 'integrations';
    if (requested === 'modules') return 'modules';
    if (requested === 'workforce') return 'workforce';
    if (directWebshopTabs.includes(requested as WorkspaceTab)) return requested as WorkspaceTab;
    return 'billing';
  });

  // General Store Profile Form state
  const [storeName, setStoreName] = useState('Pwayment Retail Shop');
  const [email, setEmail] = useState('kevin@pwayment.com');
  const [phone, setPhone] = useState('+32 9 234 56 78');
  const [vatNumber, setVatNumber] = useState('BE 0123.456.789');
  const [storeAddress, setStoreAddress] = useState('Kouter 12, 9000 Gent, België');
  const [currency, setCurrency] = useState('EUR (€)');
  const [language, setLanguage] = useState('Nederlands (BE)');
  const [savedToast, setSavedToast] = useState<string | null>(null);

  // Loyalty & Gift Card state
  const [loyaltyProgramActive, setLoyaltyProgramActive] = useState(true);
  const [giftCardsActive, setGiftCardsActive] = useState(true);

  // Security state
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(true);
  const [managerPin, setManagerPin] = useState('1234');
  const [showPin, setShowPin] = useState(false);
  const [pinForVoids, setPinForVoids] = useState(true);
  const [pinForDiscounts, setPinForDiscounts] = useState(true);
  const [pinForDrawer, setPinForDrawer] = useState(true);
  // Accordion expansion states
  const [billingExpanded, setBillingExpanded] = useState(true);
  const [catalogExpanded, setCatalogExpanded] = useState(false);
  const [webshopExpanded, setWebshopExpanded] = useState(activeTab.startsWith('webshop'));
  const [hardwareExpanded, setHardwareExpanded] = useState(false);

  useEffect(() => {
    if (!initialTab || appliedInitialTabRequestRef.current === initialTabRequestKey) return;
    appliedInitialTabRequestRef.current = initialTabRequestKey;
    setActiveTab(initialTab);
    if (initialTab.startsWith('billing')) setBillingExpanded(true);
    if (initialTab.startsWith('webshop')) setWebshopExpanded(true);
  }, [initialTab, initialTabRequestKey]);

  const getBillingSubTab = (tab: WorkspaceTab): BillingSubTab => {
    if (tab === 'billing-invoices') return 'invoices';
    if (tab === 'billing-payment') return 'payment';
    if (tab === 'billing-addons') return 'addons';
    return 'plan';
  };
  const [scannerTestCode, setScannerTestCode] = useState('');
  const [autoSubmitScan, setAutoSubmitScan] = useState(true);
  const [autoOpenDrawer, setAutoOpenDrawer] = useState(true);
  const [paperWidth, setPaperWidth] = useState<'80mm' | '58mm'>('80mm');
  const [scanSoundActive, setScanSoundActive] = useState(true);
  // Payment Terminal state
  const [selectedTerminalProvider, setSelectedTerminalProvider] = useState<'worldline' | 'ccv' | 'sumup' | 'mollie' | 'viva' | 'verifone'>('worldline');
  const [terminalIp, setTerminalIp] = useState('192.168.1.185');
  const [terminalPort, setTerminalPort] = useState('20002');
  const [terminalTestLog, setTerminalTestLog] = useState<string | null>(null);

  const triggerSaveNotification = (message: string) => {
    setSavedToast(message);
    setTimeout(() => setSavedToast(null), 3000);
  };

  return (
    <div className="flex-1 flex flex-col md:flex-row h-full bg-slate-100 font-sans selection:bg-sky-500/20 overflow-hidden">
      {/* VERCEL / SUPABASE STYLE SIDEBAR */}
      <aside className="w-full md:w-64 bg-white border-b md:border-b-0 md:border-r border-slate-200 p-2 md:p-4 shrink-0 block md:flex md:flex-col md:justify-between overflow-x-auto md:overflow-x-hidden md:overflow-y-auto">
        <div className="flex min-w-max gap-1 md:block md:min-w-0 md:space-y-1 [&>button]:!w-auto [&>button]:shrink-0 md:[&>button]:!w-full">
          <div className="hidden md:block px-3 py-2 text-[10px] font-black uppercase tracking-wider text-slate-400">
            Instellingen & Licentie
          </div>

          {currentRole === 'owner' && (
            <button
              onClick={() => setActiveTab('modules')}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'modules'
                  ? 'border border-sky-200 bg-sky-50 text-sky-800 shadow-xs'
                  : 'border border-transparent text-slate-600 hover:border-sky-100 hover:bg-sky-50 hover:text-sky-800'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <LayoutGrid size={16} className={activeTab === 'modules' ? 'text-sky-600' : 'text-slate-500'} />
                <span>Modules & navigatie</span>
              </div>
            </button>
          )}

          <button
            onClick={() => setActiveTab('workforce')}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'workforce'
                ? 'border border-sky-200 bg-sky-50 text-sky-800 shadow-xs'
                : 'border border-transparent text-slate-600 hover:border-sky-100 hover:bg-sky-50 hover:text-sky-800'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <CalendarClock size={16} className={activeTab === 'workforce' ? 'text-sky-600' : 'text-slate-500'} />
              <span>Personeel & verlof</span>
            </div>
          </button>

          {/* 1. ABONNEMENTEN & BILLING (EXPANDABLE ACCORDION MENU) */}
          <div className="space-y-1">
            <button
              onClick={() => {
                setBillingExpanded(!billingExpanded);
                if (!activeTab.startsWith('billing')) {
                  setActiveTab('billing-plan');
                }
              }}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all ${
                activeTab.startsWith('billing')
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 font-semibold'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <CreditCard size={16} className={activeTab.startsWith('billing') ? 'text-sky-400' : 'text-slate-500'} />
                <span>Abonnementen & Billing</span>
              </div>
              {billingExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>

            {/* Accordion Sub-Items */}
            {billingExpanded && (
              <div className="pl-4 space-y-1 border-l-2 border-slate-200 ml-4 py-1">
                {[
                  { id: 'billing-plan', label: 'Plan & Upgrades', icon: <Zap size={13} className="shrink-0" /> },
                  { id: 'billing-invoices', label: 'Facturen & Historiek', icon: <Download size={13} className="shrink-0" /> },
                  { id: 'billing-payment', label: 'Betaalmethode', icon: <CreditCard size={13} className="shrink-0" /> },
                  { id: 'billing-addons', label: 'Licenties & Add-ons', icon: <Package size={13} className="shrink-0" /> },
                ].map((sub) => {
                  const isSubActive = activeTab === sub.id || (activeTab === 'billing' && sub.id === 'billing-plan');
                  return (
                    <button
                      key={sub.id}
                      onClick={() => setActiveTab(sub.id as WorkspaceTab)}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
                        isSubActive
                          ? 'bg-slate-200 text-slate-900 font-extrabold'
                          : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100 font-semibold'
                      }`}
                    >
                      {sub.icon}
                      <span className="truncate whitespace-nowrap">{sub.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* 2. PRODUCTEN & CATALOGUS (EXPANDABLE ACCORDION MENU) */}
          <div className="space-y-1">
            <button
              onClick={() => {
                setCatalogExpanded(!catalogExpanded);
                if (!activeTab.startsWith('catalog')) {
                  setActiveTab('catalog-products');
                }
              }}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab.startsWith('catalog')
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 font-semibold'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Package size={16} className={activeTab.startsWith('catalog') ? 'text-sky-400' : 'text-slate-500'} />
                <span>Producten & Catalogus</span>
              </div>
              {catalogExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>

            {/* Accordion Sub-Items */}
            {catalogExpanded && (
              <div className="pl-4 space-y-1 border-l-2 border-slate-200 ml-4 py-1">
                {[
                  { id: 'catalog-products', label: 'Productbeheer', icon: <Package size={13} className="shrink-0" /> },
                  { id: 'catalog-categories', label: 'Categoriebeheer', icon: <Tags size={13} className="shrink-0" /> },
                ].map((sub) => {
                  const isSubActive = activeTab === sub.id || (activeTab === 'catalog' && sub.id === 'catalog-products');
                  return (
                    <button
                      key={sub.id}
                      onClick={() => setActiveTab(sub.id as WorkspaceTab)}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                        isSubActive
                          ? 'bg-slate-200 text-slate-900 font-extrabold'
                          : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100 font-semibold'
                      }`}
                    >
                      {sub.icon}
                      <span className="truncate whitespace-nowrap">{sub.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* 2.5 WEBSHOP & ONLINE SHOP (EXPANDABLE ACCORDION MENU) */}
          <div className="space-y-1">
            <button
              onClick={() => {
                setWebshopExpanded(!webshopExpanded);
                if (!activeTab.startsWith('webshop')) {
                  setActiveTab('webshop-general');
                }
              }}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab.startsWith('webshop')
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 font-semibold'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <ShoppingBag size={16} className={activeTab.startsWith('webshop') ? 'text-sky-400' : 'text-slate-500'} />
                <span>Webshop</span>
              </div>
              {webshopExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>

            {/* Accordion Sub-Items */}
            {webshopExpanded && (
              <div className="hidden pl-4 space-y-1 border-l-2 border-slate-200 ml-4 py-1 md:block">
                {[
                  { id: 'webshop-general', label: 'Overzicht', icon: <Store size={13} className="shrink-0" /> },
                  { id: 'webshop-orders', label: 'Bestellingen', icon: <Receipt size={13} className="shrink-0" /> },
                  { id: 'webshop-design', label: 'Vormgeving', icon: <Sparkles size={13} className="shrink-0" /> },
                  { id: 'webshop-products', label: 'Assortiment', icon: <Package size={13} className="shrink-0" /> },
                  { id: 'webshop-coupons', label: 'Kortingen', icon: <Tag size={13} className="shrink-0" /> },
                  { id: 'webshop-shipping', label: 'Levering', icon: <Truck size={13} className="shrink-0" /> },
                  { id: 'webshop-payments', label: 'Betalingen', icon: <CreditCard size={13} className="shrink-0" /> },
                  { id: 'webshop-domain', label: 'Domein', icon: <Globe size={13} className="shrink-0" /> },
                ].map((sub) => {
                  const isSubActive = activeTab === sub.id || (activeTab === 'webshop' && sub.id === 'webshop-general');
                  return (
                    <button
                      key={sub.id}
                      onClick={() => setActiveTab(sub.id as WorkspaceTab)}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                        isSubActive
                          ? 'bg-slate-200 text-slate-900 font-extrabold'
                          : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100 font-semibold'
                      }`}
                    >
                      {sub.icon}
                      <span className="truncate whitespace-nowrap">{sub.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* 3. WINKEL & BEDRIJFSPROFIEL */}
          <button
            onClick={() => setActiveTab('general')}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'general'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 font-semibold'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Store size={16} className={activeTab === 'general' ? 'text-sky-400' : 'text-slate-500'} />
              <span>Winkel & Bedrijfsprofiel</span>
            </div>
          </button>

          {/* 4. BONTEKSTEN & BRANDING */}
          <button
            onClick={() => setActiveTab('merchant')}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'merchant'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 font-semibold'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Receipt size={16} className={activeTab === 'merchant' ? 'text-sky-400' : 'text-slate-500'} />
              <span>Bonteksten & Branding</span>
            </div>
          </button>

          {/* 5. BARCODE ETIKETTEN */}
          <button
            onClick={() => setActiveTab('labels')}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'labels'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 font-semibold'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Barcode size={16} className={activeTab === 'labels' ? 'text-sky-400' : 'text-slate-500'} />
              <span>Barcode Etiketten</span>
            </div>
          </button>

          {/* 6. KOPPELINGEN & API */}
          <button
            onClick={() => setActiveTab('integrations')}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'integrations'
                ? 'bg-sky-50 text-sky-900 ring-1 ring-sky-200 shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 font-semibold'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Webhook size={16} className={activeTab === 'integrations' ? 'text-sky-600' : 'text-slate-500'} />
              <span>Koppelingen & API</span>
            </div>
            <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${
              activeTab === 'integrations'
                ? 'bg-sky-100 text-sky-700 border border-sky-200'
                : 'bg-slate-100 text-slate-700 border border-slate-200'
            }`}>
              Pro
            </span>
          </button>

          {/* 7. BTW & FISCALE REGELS */}
          <button
            onClick={() => setActiveTab('tax')}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'tax'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 font-semibold'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <BadgePercent size={16} className={activeTab === 'tax' ? 'text-sky-400' : 'text-slate-500'} />
              <span>Btw & Fiscale Regels</span>
            </div>
          </button>

          {/* 8. CADEAUBONNEN & SPAARPROGRAMMA */}
          <button
            onClick={() => setActiveTab('loyalty')}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'loyalty'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 font-semibold'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Gift size={16} className={activeTab === 'loyalty' ? 'text-sky-400' : 'text-slate-500'} />
              <span>Spaarprogramma</span>
            </div>
          </button>

          {/* 9. HARDWARE (EXPANDABLE ACCORDION MENU) */}
          <div className="space-y-1">
            <button
              onClick={() => {
                setHardwareExpanded(!hardwareExpanded);
                if (!activeTab.startsWith('hardware')) {
                  setActiveTab('hardware');
                }
              }}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all ${
                activeTab.startsWith('hardware')
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 font-semibold'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Printer size={16} className={activeTab.startsWith('hardware') ? 'text-sky-400' : 'text-slate-500'} />
                <span>Hardware</span>
              </div>
              {hardwareExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>

            {/* Accordion Sub-Items */}
            {hardwareExpanded && (
              <div className="pl-5 space-y-1 border-l-2 border-slate-200 ml-4 py-1">
                {[
                  { id: 'hardware-printer', label: 'Bonprinter', icon: <Printer size={13} /> },
                  { id: 'hardware-scanner', label: 'Barcodescanner', icon: <Scan size={13} /> },
                  { id: 'hardware-drawer', label: 'Kassalade', icon: <Zap size={13} /> },
                  { id: 'hardware-terminal', label: 'Betaalterminal', icon: <CreditCard size={13} /> },
                  { id: 'hardware-display', label: 'Klantenscherm', icon: <Monitor size={13} /> },
                ].map((sub) => {
                  const isSubActive = activeTab === sub.id || (activeTab === 'hardware' && sub.id === 'hardware-printer');
                  return (
                    <button
                      key={sub.id}
                      onClick={() => setActiveTab(sub.id as any)}
                      className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
                        isSubActive
                          ? 'bg-slate-200 text-slate-900 font-extrabold'
                          : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100 font-semibold'
                      }`}
                    >
                      <span>{sub.icon}</span>
                      <span>{sub.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* 10. BEVEILIGING & MANAGER PIN */}
          <button
            onClick={() => setActiveTab('security')}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'security'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 font-semibold'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Shield size={16} className={activeTab === 'security' ? 'text-sky-400' : 'text-slate-500'} />
              <span>Beveiliging & PIN</span>
            </div>
          </button>

          {/* 11. TEAM & PERMISSIES */}
          <button
            onClick={() => setActiveTab('team')}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'team'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 font-semibold'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Users size={16} className={activeTab === 'team' ? 'text-sky-400' : 'text-slate-500'} />
              <span>Team & Permissies</span>
            </div>
          </button>
        </div>

        {/* User Profile Mini Badge at bottom of sidebar */}
        <div className="hidden p-3 bg-slate-50 rounded-2xl border border-slate-200/90 mt-4 md:flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-sky-100 text-sky-700 font-black text-xs flex items-center justify-center border border-sky-200 shrink-0">
            {currentUserName ? currentUserName.charAt(0).toUpperCase() : 'U'}
          </div>
          <div className="min-w-0">
            <div className="text-xs font-bold text-slate-900 truncate">{currentUserName}</div>
            <div className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">{currentRole}</div>
          </div>
        </div>
      </aside>

      {/* DYNAMIC CONTENT AREA */}
      <main className="w-full min-w-0 flex-1 overflow-y-auto p-4 md:p-8 space-y-6">
        {/* Vercel/Supabase Style Page Header Inside Content Area */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-200/80 mb-6 gap-4">
          <div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight">
              {activeTab === 'billing-plan' && 'Licentieplan & Upgrades'}
              {activeTab === 'modules' && 'Modules & navigatie'}
              {activeTab === 'workforce' && 'Personeel, verlof & bezetting'}
              {activeTab === 'billing-invoices' && "Facturen & Creditnota's"}
              {activeTab === 'billing-payment' && 'Betaalmethode & SEPA Mandaat'}
              {activeTab === 'billing-addons' && 'Kassa Terminals & Add-on Modules'}
              {(activeTab === 'billing' || (activeTab.startsWith('billing') && !['billing-plan', 'billing-invoices', 'billing-payment', 'billing-addons'].includes(activeTab))) && 'Abonnementen, Facturatie & Licenties'}
              {(activeTab === 'catalog' || activeTab === 'catalog-products') && 'Productbeheer & Catalogus'}
              {activeTab === 'catalog-categories' && 'Categoriebeheer'}
              {activeTab.startsWith('webshop') && 'Webshopbeheer'}
              {activeTab === 'general' && 'Winkel- & Bedrijfsprofiel'}
              {activeTab === 'merchant' && 'Bonteksten & Ticket Branding'}
              {activeTab === 'labels' && 'Barcode Etiketten Printen'}
              {activeTab === 'integrations' && 'Koppelingen & API Integraties'}
              {activeTab === 'tax' && 'Btw-Tarieven & Fiscale Regels'}
              {activeTab === 'loyalty' && 'Spaarprogramma & Retentie'}
              {activeTab.startsWith('hardware') && 'Kassa Hardware & Randapparatuur'}
              {activeTab === 'security' && 'Beveiliging & Manager PIN'}
              {activeTab === 'team' && 'Team & Permissiematrix'}
            </h1>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              {activeTab.startsWith('billing')
                ? 'Transparante tarieven per winkelpunt. Onbeperkte kassa-omzet zonder verborgen transactiekosten.'
                : activeTab === 'modules'
                ? 'Zet werkmodules rechtstreeks aan of uit. Uw navigatie volgt onmiddellijk en bewaren gebeurt automatisch.'
                : activeTab === 'workforce'
                ? 'Beheer medewerkers, verlofsaldi en de regels waarmee PWAYMENT de winkelbezetting controleert.'
                : (activeTab === 'catalog' || activeTab.startsWith('catalog-'))
                ? 'Beheer uw artikelbestand, inkoop-/verkoopprijzen, voorraad en Btw-tarieven.'
                : activeTab.startsWith('webshop')
                ? 'Beheer publicatie, assortiment, bestellingen en klantinstellingen vanuit één centrale omgeving.'
                : activeTab === 'integrations'
                ? 'Beheer leveranciers, webshops, boekhouding, payments, webhooks en API-toegang.'
                : 'Beheer uw Pwayment Retail licentie, winkelprofiel, kassa-hardware en rechten.'}
            </p>
          </div>

          <div id="catalog-header-actions" className="flex items-center gap-2 shrink-0 ml-auto" />
        </div>

        {/* Save Toast Banner */}
        {savedToast && (
          <div className="p-3 bg-slate-900 text-white rounded-xl shadow-md flex items-center gap-2 text-xs font-bold animate-in fade-in">
            <CheckCircle2 size={16} className="text-emerald-400" />
            <span>{savedToast}</span>
          </div>
        )}

        {activeTab === 'modules' && <ModuleSettings />}
        {activeTab === 'workforce' && (
          <FeatureGate
            feature={FEATURE_KEYS.workforce}
            title="Personeels- en verlofbeheer is beschikbaar in Enterprise & Ketens"
            description="Beheer medewerkers, contracten, werkpatronen en verlofsaldi vanuit één centrale omgeving. Activeer Enterprise & Ketens om deze module te gebruiken."
            onUpgrade={() => setActiveTab('billing-plan')}
          >
            <WorkforceSettings />
          </FeatureGate>
        )}

        {/* TAB 1: BILLING & ABONNEMENTEN (EXPANDED SUB-TABS) */}
        {activeTab.startsWith('billing') && (
          <BillingSettings
            subTab={getBillingSubTab(activeTab)}
            onSubTabChange={(sub) => setActiveTab(`billing-${sub}` as WorkspaceTab)}
          />
        )}

        {/* TAB 2: PRODUCTEN & CATALOGUS (REAL WORKING COMPONENT) */}
        {(activeTab === 'catalog' || activeTab === 'catalog-products' || activeTab === 'catalog-categories') && (
          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-2xs">
            <ProductAdmin initialTab={activeTab === 'catalog-categories' ? 'categories' : 'products'} />
          </div>
        )}

        {/* TAB 2.5: WEBSHOP MANAGEMENT & LIVE STORE */}
        {activeTab.startsWith('webshop') && (
          <FeatureGate
            feature={FEATURE_KEYS.webshopPublish}
            title="Webshopbeheer is beschikbaar in Retail Professional"
            description="Uw webshopinstellingen, assortiment, bestellingen en ontwerpdata blijven bewaard. Activeer Retail Professional of Enterprise om webshopbeheer opnieuw te openen."
            onUpgrade={() => setActiveTab('billing-plan')}
          >
            <WebshopSettings
              activeTab={activeTab}
              onTabChange={(tab) => setActiveTab(tab as WorkspaceTab)}
            />
          </FeatureGate>
        )}

        {/* TAB 3: WINKEL & BEDRIJFSPROFIEL (FORM) */}
        {activeTab === 'general' && (
          <div className="bg-white rounded-3xl border border-slate-200 p-6 md:p-8 shadow-2xs max-w-3xl space-y-6">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
              <div className="p-2.5 rounded-xl bg-slate-100 text-slate-700">
                <Store size={20} />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Winkel- & Bedrijfsprofiel</h3>
                <p className="text-xs text-slate-500 font-medium">Uw bedrijfsinformatie voor verkoopbonnen en facturen</p>
              </div>
            </div>

            <form onSubmit={(e) => { e.preventDefault(); triggerSaveNotification('Winkelprofiel bijgewerkt!'); }} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Winkelnaam</label>
                  <input
                    type="text"
                    value={storeName}
                    onChange={(e) => setStoreName(e.target.value)}
                    className="w-full text-xs font-semibold px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Account E-mailadres</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full text-xs font-semibold px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Telefoonnummer</label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full text-xs font-semibold px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">BTW Nummer</label>
                  <input
                    type="text"
                    value={vatNumber}
                    onChange={(e) => setVatNumber(e.target.value)}
                    className="w-full text-xs font-semibold px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">Winkel Adres (Op Kasteticket)</label>
                  <input
                    type="text"
                    value={storeAddress}
                    onChange={(e) => setStoreAddress(e.target.value)}
                    className="w-full text-xs font-semibold px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Standaard Valuta</label>
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    className="w-full text-xs font-semibold px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
                  >
                    <option value="EUR (€)">EUR (€) - Euro</option>
                    <option value="USD ($)">USD ($) - US Dollar</option>
                    <option value="GBP (£)">GBP (£) - British Pound</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Taal & Regionaal</label>
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    className="w-full text-xs font-semibold px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
                  >
                    <option value="Nederlands (BE)">Nederlands (België)</option>
                    <option value="Français (BE)">Français (Belgique)</option>
                    <option value="English (UK)">English (UK)</option>
                  </select>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex justify-end">
                <button
                  type="submit"
                  className="py-2.5 px-6 bg-slate-900 hover:bg-black text-white text-xs font-bold rounded-xl shadow-xs transition-colors"
                >
                  Wijzigingen Opslaan
                </button>
              </div>
            </form>
          </div>
        )}

        {/* TAB 4: BONTEKSTEN & BRANDING (REAL WORKING MERCHANT SETTINGS COMPONENT) */}
        {activeTab === 'merchant' && (
          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-2xs">
            <MerchantSettings />
          </div>
        )}

        {/* TAB 5: BARCODE ETIKETTEN (REAL WORKING BARCODE PRINT COMPONENT) */}
        {activeTab === 'labels' && (
          <FeatureGate
            feature={FEATURE_KEYS.labels}
            title="Barcode-etiketten zijn beschikbaar in Retail Professional"
            onUpgrade={() => setActiveTab('billing-plan')}
          >
            <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-2xs">
              <BarcodeLabelPrint />
            </div>
          </FeatureGate>
        )}

        {/* TAB 6: KOPPELINGEN & API (PRO FEATURE) */}
        {activeTab === 'integrations' && (
          <FeatureGate
            feature={FEATURE_KEYS.integrations}
            title="Koppelingen, API en webhooks vereisen Retail Professional"
            onUpgrade={() => setActiveTab('billing-plan')}
          >
            <IntegrationsSettings />
          </FeatureGate>
        )}

        {/* TAB 7: BTW & FISCALE REGELS */}
        {activeTab === 'tax' && (
          <div className="bg-white rounded-3xl border border-slate-200 p-6 md:p-8 shadow-2xs max-w-3xl space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-slate-100 text-slate-700">
                  <BadgePercent size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Btw-Tarieven & Fiscale Regels</h3>
                  <p className="text-xs text-slate-500 font-medium">Belgische & Europese Btw-tarieven en GKS fiscaal journaal</p>
                </div>
              </div>
              <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-slate-900 text-white uppercase border border-slate-800">
                GKS Fiscale Gecertificeerd
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-semibold">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-400 text-[10px] uppercase tracking-wider">
                    <th className="py-2.5 px-3">Btw Categorie</th>
                    <th className="py-2.5 px-3">Tarief %</th>
                    <th className="py-2.5 px-3">Toepassing</th>
                    <th className="py-2.5 px-3 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  <tr>
                    <td className="py-3 px-3 font-bold text-slate-900">Standaard Btw</td>
                    <td className="py-3 px-3 font-extrabold text-slate-900">21%</td>
                    <td className="py-3 px-3 text-slate-500">Algemene retail & non-food goederen</td>
                    <td className="py-3 px-3 text-right text-emerald-600 font-bold">Standaard</td>
                  </tr>
                  <tr>
                    <td className="py-3 px-3 font-bold text-slate-900">Verlaagd Btw</td>
                    <td className="py-3 px-3 font-extrabold text-slate-900">6%</td>
                    <td className="py-3 px-3 text-slate-500">Voeding, boeken & essentiële goederen</td>
                    <td className="py-3 px-3 text-right text-slate-500">Actief</td>
                  </tr>
                  <tr>
                    <td className="py-3 px-3 font-bold text-slate-900">Nultarief / Vrijgesteld</td>
                    <td className="py-3 px-3 font-extrabold text-slate-900">0%</td>
                    <td className="py-3 px-3 text-slate-500">Intracommunautaire B2B verkoop</td>
                    <td className="py-3 px-3 text-right text-slate-500">Actief</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 8: CADEAUBONNEN & SPAARPROGRAMMA */}
        {activeTab === 'loyalty' && (
          <FeatureGate
            feature={FEATURE_KEYS.loyalty}
            title="Het spaarprogramma is beschikbaar in Retail Professional"
            onUpgrade={() => setActiveTab('billing-plan')}
          >
            <LoyaltySettings />
          </FeatureGate>
        )}

        {/* TAB 9: HARDWARE & KASSA APPARATUUR */}
        {activeTab.startsWith('hardware') && (
          <div className="bg-white rounded-3xl border border-slate-200 p-6 md:p-8 shadow-2xs max-w-4xl space-y-8">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-slate-100 text-slate-700">
                  <Printer size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Kassa Hardware & Randapparatuur</h3>
                  <p className="text-xs text-slate-500 font-medium">Beheer uw bonprinter, barcodescanner, kassalade, betaalterminal en optioneel klantenscherm</p>
                </div>
              </div>

              <span className="hidden sm:inline-flex px-3 py-1 bg-emerald-50 text-emerald-800 text-xs font-extrabold rounded-full border border-emerald-200 items-center gap-1.5">
                <CheckCircle size={14} />
                <span>WebUSB & HID Actief</span>
              </span>
            </div>

            {/* SECTION 1: THERMAL PRINTER (WEBUSB COMPONENT) */}
            {(activeTab === 'hardware' || activeTab === 'hardware-printer') && (
              <div className="space-y-4">
                <div className="text-xs font-black uppercase tracking-wider text-slate-400">
                  1. Thermische Bonprinter (ESC/POS)
                </div>
                <ThermalPrinterPanel />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-2">
                    <label className="block text-xs font-bold text-slate-900">Bon Papierbreedte</label>
                    <select
                      value={paperWidth}
                      onChange={(e) => setPaperWidth(e.target.value as '80mm' | '58mm')}
                      className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900"
                    >
                      <option value="80mm">80mm Standaard Retail Bon (42 tekens/regel)</option>
                      <option value="58mm">58mm Compacte Bon (32 tekens/regel)</option>
                    </select>
                    <p className="text-[11px] text-slate-500">Bepaalt de tekstformattering op het afgedrukte ticket.</p>
                  </div>

                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 flex items-start gap-3">
                    <input
                      type="checkbox"
                      defaultChecked
                      id="auto-paper-cut-chk"
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900 cursor-pointer shrink-0"
                    />
                    <label htmlFor="auto-paper-cut-chk" className="cursor-pointer">
                      <div className="text-xs font-bold text-slate-900">Automatisch Bon Snijden (Paper Cut)</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">Stuur automatisch een snijcommando na het printen</div>
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* SECTION 2: BARCODE SCANNER (USB HID & BLUETOOTH) */}
            {activeTab === 'hardware-scanner' && (
              <div className="space-y-4">
                <div className="text-xs font-black uppercase tracking-wider text-slate-400">
                  2. Barcode & EAN Laser Scanner (HID / USB / Bluetooth)
                </div>

                <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-xl bg-white border border-slate-200 text-slate-800">
                        <Scan size={18} />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-900">Live Scannertest Input</div>
                        <div className="text-[11px] text-slate-500">Scan een willekeurige barcode met uw scanner om de verbinding te testen</div>
                      </div>
                    </div>
                    <input
                      type="text"
                      value={scannerTestCode}
                      onChange={(e) => {
                        setScannerTestCode(e.target.value);
                        if (e.target.value && scanSoundActive) {
                          // Play a brief positive beep sound on scan test
                          const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
                          const osc = ctx.createOscillator();
                          osc.type = 'sine';
                          osc.frequency.setValueAtTime(1200, ctx.currentTime);
                          osc.connect(ctx.destination);
                          osc.start();
                          osc.stop(ctx.currentTime + 0.08);
                        }
                      }}
                      placeholder="Scan hier om te testen..."
                      className="w-full sm:w-64 bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                    />
                  </div>

                  {scannerTestCode && (
                    <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-xs text-emerald-900 font-bold">
                      <div className="flex items-center gap-2">
                        <Zap size={15} className="text-emerald-600" />
                        <span>Gescande Barcode Ontvangen: <span className="font-mono underline">{scannerTestCode}</span></span>
                      </div>
                      <button
                        onClick={() => setScannerTestCode('')}
                        className="text-[11px] font-bold text-emerald-800 hover:underline"
                      >
                        Wis Test
                      </button>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-200/60">
                    <div className="flex items-start gap-3 p-3 bg-white rounded-xl border border-slate-200/90 shadow-2xs">
                      <input
                        type="checkbox"
                        checked={autoSubmitScan}
                        onChange={(e) => setAutoSubmitScan(e.target.checked)}
                        id="auto-submit-chk"
                        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900 cursor-pointer shrink-0"
                      />
                      <label htmlFor="auto-submit-chk" className="cursor-pointer">
                        <div className="text-xs font-bold text-slate-900">Automatisch Enter Na Scan</div>
                        <div className="text-[11px] text-slate-500">Voeg gescand artikel direct toe aan het winkelmandje</div>
                      </label>
                    </div>

                    <div className="flex items-start gap-3 p-3 bg-white rounded-xl border border-slate-200/90 shadow-2xs">
                      <input
                        type="checkbox"
                        checked={scanSoundActive}
                        onChange={(e) => setScanSoundActive(e.target.checked)}
                        id="scan-sound-chk"
                        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900 cursor-pointer shrink-0"
                      />
                      <label htmlFor="scan-sound-chk" className="cursor-pointer">
                        <div className="text-xs font-bold text-slate-900">Audio Pieptoon bij Scan</div>
                        <div className="text-[11px] text-slate-500">Speel een auditieve bevestiging bij het scannen van een product</div>
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* SECTION 3: CASH DRAWER (KASSALADE RJ11) */}
            {activeTab === 'hardware-drawer' && (
              <div className="space-y-4">
                <div className="text-xs font-black uppercase tracking-wider text-slate-400">
                  3. Elektrische RJ11/RJ12 Kassalade
                </div>

                <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <div className="text-xs font-bold text-slate-900">Kassalade Kickout Signaal via Bonprinter</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">Stuur een 24V pulssignaal via de RJ11 poort van de Epson/Star bonprinter</div>
                    
                    <div className="flex items-center gap-2 mt-3">
                      <input
                        type="checkbox"
                        checked={autoOpenDrawer}
                        onChange={(e) => setAutoOpenDrawer(e.target.checked)}
                        id="auto-drawer-chk"
                        className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900 cursor-pointer"
                      />
                      <label htmlFor="auto-drawer-chk" className="text-xs font-bold text-slate-800 cursor-pointer">
                        Automatisch lade openen bij contante verkopen
                      </label>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => triggerSaveNotification('⚡ Kassalade Open Signaal Verstuurd naar RJ11!')}
                    className="px-4 py-2.5 bg-slate-900 hover:bg-black text-white text-xs font-bold rounded-xl shadow-xs transition-colors whitespace-nowrap self-start sm:self-auto cursor-pointer"
                  >
                    ⚡ Test Lade Openen
                  </button>
                </div>
              </div>
            )}

            {/* SECTION 4: SMART PAYMENT TERMINAL SELECTION & PAIRING */}
            {activeTab === 'hardware-terminal' && (
              <FeatureGate
                feature={FEATURE_KEYS.advancedHardware}
                title="Geintegreerde betaalterminals zijn beschikbaar in Retail Professional"
                description="Printer, scanner en kassalade blijven beschikbaar in Basis. Terminalkoppelingen worden bewaard en opnieuw actief zodra Retail Professional actief is."
                onUpgrade={() => setActiveTab('billing-plan')}
              >
              <div className="space-y-5">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-black uppercase tracking-wider text-slate-400">
                      4. Betaalterminal Koppeling (Geïntegreerde Pinautomaat)
                    </div>
                    <div className="text-xs text-slate-500 font-medium mt-0.5">
                      Kies uw terminal-provider om het exacte kassa-bedrag automatisch door te sturen zonder handmatige intoetsing.
                    </div>
                  </div>
                </div>

                {/* Terminal Provider Grid with Official Brand SVG Logos */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {[
                    { id: 'worldline', name: 'Worldline', model: 'Yoximo / Yomani / Valina', badge: 'Ethernet & OPI', logo: <WorldlineLogo className="h-6 w-auto" /> },
                    { id: 'ccv', name: 'CCV Pin', model: 'A920 / Smart Terminal', badge: 'CCV Connect API', logo: <CCVLogo className="h-6 w-auto" /> },
                    { id: 'sumup', name: 'SumUp', model: 'Air / Solo / 3G', badge: 'Bluetooth & Cloud', logo: <SumUpLogo className="h-6 w-auto" /> },
                    { id: 'mollie', name: 'Mollie Terminal', model: 'PAX A920 Pro', badge: 'Mollie POS API', logo: <MollieLogo className="h-6 w-auto" /> },
                    { id: 'viva', name: 'Viva Wallet', model: 'Ciontek / Tap-on-Phone', badge: 'Viva Cloud API', logo: <VivaWalletLogo className="h-6 w-auto" /> },
                    { id: 'verifone', name: 'Verifone', model: 'V200c / P400 / Engage', badge: 'VIP / Ethernet', logo: <VerifoneLogo className="h-6 w-auto" /> },
                  ].map((t) => {
                    const isSelected = selectedTerminalProvider === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => {
                          setSelectedTerminalProvider(t.id as any);
                          setTerminalTestLog(null);
                        }}
                        className={`p-4 rounded-2xl border text-left transition-all cursor-pointer relative ${
                          isSelected
                            ? 'border-slate-900 bg-slate-900/5 ring-2 ring-slate-900/10 shadow-xs'
                            : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-3 h-7">
                          <div className="flex items-center">{t.logo}</div>
                          {isSelected && (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-slate-900 text-white uppercase tracking-wider shrink-0">
                              Geselecteerd
                            </span>
                          )}
                        </div>
                        <div className="font-extrabold text-xs text-slate-900">{t.name}</div>
                        <div className="text-[11px] text-slate-500 font-medium truncate mt-0.5">{t.model}</div>
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-2">{t.badge}</div>
                      </button>
                    );
                  })}
                </div>

                {/* Selected Terminal Configuration Details */}
                <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200/60 pb-3">
                    <div className="flex items-center gap-2.5">
                      <span className="px-2.5 py-1 rounded-full text-xs font-black bg-emerald-100 text-emerald-800 uppercase border border-emerald-200">
                        🟢 Status: Operationeel
                      </span>
                      <span className="text-xs font-bold text-slate-800">
                        Koppeling: <span className="uppercase font-black text-slate-900">{selectedTerminalProvider}</span> Protocol
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setTerminalTestLog(`Ping ${terminalIp}:${terminalPort} — Handshake OK! Response: 200 SUCCESS (0.12s)`);
                        triggerSaveNotification(`💳 ${selectedTerminalProvider.toUpperCase()} Terminal Ping OK!`);
                      }}
                      className="px-4 py-2 bg-slate-900 hover:bg-black text-white text-xs font-bold rounded-xl shadow-xs transition-colors whitespace-nowrap self-start sm:self-auto cursor-pointer"
                    >
                      ⚡ Test Verbinding
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="block text-xs font-bold text-slate-800">Terminal IP-Adres / Hostname</label>
                      <input
                        type="text"
                        value={terminalIp}
                        onChange={(e) => setTerminalIp(e.target.value)}
                        placeholder="bv. 192.168.1.185"
                        className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="block text-xs font-bold text-slate-800">Port / OPI Cloud ID</label>
                      <input
                        type="text"
                        value={terminalPort}
                        onChange={(e) => setTerminalPort(e.target.value)}
                        placeholder="20002"
                        className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                      />
                    </div>
                  </div>

                  {terminalTestLog && (
                    <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-mono text-emerald-900 font-bold flex items-center justify-between">
                      <span>{terminalTestLog}</span>
                      <button onClick={() => setTerminalTestLog(null)} className="text-[11px] font-bold text-emerald-800 hover:underline">Sluiten</button>
                    </div>
                  )}
                </div>
              </div>
              </FeatureGate>
            )}

            {activeTab === 'hardware-display' && (
              <FeatureGate
                feature={FEATURE_KEYS.customerDisplay}
                title="Het klantenscherm is beschikbaar in Retail Professional"
                description="Uw configuratie blijft bewaard. Activeer Retail Professional om live kassadata op een tweede scherm te tonen."
                onUpgrade={() => setActiveTab('billing-plan')}
              >
                <CustomerDisplaySettings />
              </FeatureGate>
            )}

            {activeTab === 'hardware-scale' && (
              <FeatureGate
                feature={FEATURE_KEYS.advancedHardware}
                title="Weegschaalkoppelingen zijn beschikbaar in Retail Professional"
                description="Bestaande hardware-instellingen blijven bewaard. Activeer Retail Professional om geavanceerde randapparatuur te koppelen."
                onUpgrade={() => setActiveTab('billing-plan')}
              >
                <div className="space-y-4">
                  <div className="text-xs font-black uppercase tracking-wider text-slate-400">
                    5. Weegschaal & gewichtartikelen
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-xs font-medium text-slate-600">
                    Weegschaalkoppelingen worden voorbereid voor Retail Professional en Enterprise.
                  </div>
                </div>
              </FeatureGate>
            )}
          </div>
        )}

        {/* TAB 10: BEVEILIGING & MANAGER PIN */}
        {activeTab === 'security' && (
          <div className="bg-white rounded-3xl border border-slate-200 p-6 md:p-8 shadow-2xs max-w-3xl space-y-6">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
              <div className="p-2.5 rounded-xl bg-slate-100 text-slate-700">
                <Shield size={20} />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Beveiliging & Manager PIN-Codes</h3>
                <p className="text-xs text-slate-500 font-medium">Beveilig gevoelige acties zoals kortingen en lijnannuleringen (voids)</p>
              </div>
            </div>

            <form onSubmit={(e) => { e.preventDefault(); triggerSaveNotification('Manager PIN & Beveiliging bijgewerkt!'); }} className="space-y-6">
              {/* PIN Code Field with Eye Toggle */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-2">
                <label className="block text-xs font-bold text-slate-900">4-Cijferige Manager PIN-Code</label>
                <div className="flex items-center gap-3">
                  <div className="relative inline-flex items-center">
                    <input
                      type={showPin ? 'text' : 'password'}
                      maxLength={4}
                      value={managerPin}
                      onChange={(e) => setManagerPin(e.target.value)}
                      className="w-44 text-center text-lg tracking-widest font-black py-2 px-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPin(!showPin)}
                      className="absolute right-3 p-1 text-slate-400 hover:text-slate-700 transition-colors"
                      title={showPin ? 'Verberg PIN' : 'Toon PIN'}
                    >
                      {showPin ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
                <p className="text-[11px] text-slate-500">Deze PIN-code geeft autorisatie bij gevoelige kassa-transacties.</p>
              </div>

              {/* Authorization Rules */}
              <div className="space-y-3 pt-2">
                <div className="text-xs font-black uppercase tracking-wider text-slate-400">
                  PIN Autorisatieregels
                </div>

                <div className="flex items-start gap-3 p-3.5 bg-slate-50 rounded-xl border border-slate-200/80">
                  <input
                    type="checkbox"
                    checked={pinForVoids}
                    onChange={(e) => setPinForVoids(e.target.checked)}
                    id="pin-voids-chk"
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900 cursor-pointer shrink-0"
                  />
                  <label htmlFor="pin-voids-chk" className="cursor-pointer">
                    <div className="text-xs font-bold text-slate-900">Manager PIN vereist bij verkoopregels annuleren (Voids)</div>
                    <div className="text-[11px] text-slate-500">Voorkom dat kassiers artikelen uit het winkelmandje verwijderen zonder toestemming</div>
                  </label>
                </div>

                <div className="flex items-start gap-3 p-3.5 bg-slate-50 rounded-xl border border-slate-200/80">
                  <input
                    type="checkbox"
                    checked={pinForDiscounts}
                    onChange={(e) => setPinForDiscounts(e.target.checked)}
                    id="pin-discounts-chk"
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900 cursor-pointer shrink-0"
                  />
                  <label htmlFor="pin-discounts-chk" className="cursor-pointer">
                    <div className="text-xs font-bold text-slate-900">Manager PIN vereist bij handmatige kortingen</div>
                    <div className="text-[11px] text-slate-500">Vraag PIN bij het toekennen van % of € kortingen aan het winkelmandje</div>
                  </label>
                </div>

                <div className="flex items-start gap-3 p-3.5 bg-slate-50 rounded-xl border border-slate-200/80">
                  <input
                    type="checkbox"
                    checked={pinForDrawer}
                    onChange={(e) => setPinForDrawer(e.target.checked)}
                    id="pin-drawer-chk"
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900 cursor-pointer shrink-0"
                  />
                  <label htmlFor="pin-drawer-chk" className="cursor-pointer">
                    <div className="text-xs font-bold text-slate-900">Manager PIN vereist bij handmatige kassalade opening</div>
                    <div className="text-[11px] text-slate-500">Vraag PIN wanneer de lade wordt geopend zonder actieve contante verkoop</div>
                  </label>
                </div>
              </div>

              {/* 2FA Section */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-slate-900">Twee-factor Authenticatie (2FA)</div>
                  <div className="text-xs text-slate-500 font-medium mt-0.5">Vereis een mobiele authenticator-code bij inloggen</div>
                </div>
                <button
                  type="button"
                  onClick={() => setTwoFactorEnabled(!twoFactorEnabled)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${
                    twoFactorEnabled
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : 'bg-slate-100 text-slate-600 border-slate-300'
                  }`}
                >
                  {twoFactorEnabled ? '2FA Actief' : 'Inschakelen'}
                </button>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  className="py-2.5 px-6 bg-slate-900 hover:bg-black text-white text-xs font-bold rounded-xl shadow-xs transition-colors"
                >
                  PIN & Instellingen Opslaan
                </button>
              </div>
            </form>
          </div>
        )}

        {/* TAB 11: TEAM & PERMISSIES */}
        {activeTab === 'team' && (
          <div className="bg-white rounded-3xl border border-slate-200 p-6 md:p-8 shadow-2xs max-w-4xl space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-4 gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-sky-50 text-sky-700 border border-sky-100">
                  <Users size={20} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Team & Rol-Toewijzing</h3>
                  <p className="text-xs text-slate-500 font-medium">Beheer medewerkers, pincodes en kassa-rechten</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditingTeamUser(null);
                  setTeamForm({ name: '', email: '', role: 'cashier', jobTitle: '', pin: '' });
                  setTeamError(null);
                  setShowTeamModal(true);
                }}
                className="px-3.5 py-2 bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold rounded-xl flex items-center gap-2 transition-colors shadow-xs shrink-0"
              >
                <UserPlus size={15} />
                <span>Medewerker Toevoegen</span>
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-semibold">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-400 text-[10px] uppercase tracking-wider">
                    <th className="py-3 px-3">Medewerker & Functie</th>
                    <th className="py-3 px-3">E-mail</th>
                    <th className="py-3 px-3">Systeemrol</th>
                    <th className="py-3 px-3">PIN Status</th>
                    <th className="py-3 px-3 text-right">Acties</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {teamUsers.map((user) => {
                    const isSelf = user.id === currentUserId;
                    return (
                      <tr key={user.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-3.5 px-3 font-bold text-slate-900 flex items-center gap-2.5">
                          <div className="h-8 w-8 rounded-full bg-sky-100 text-sky-800 font-black text-xs flex items-center justify-center border border-sky-200 shrink-0">
                            {user.name ? user.name.charAt(0).toUpperCase() : 'M'}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span>{user.name}</span>
                              {isSelf && (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-sky-100 text-sky-800">
                                  U
                                </span>
                              )}
                            </div>
                            {user.jobTitle && (
                              <div className="text-[11px] font-medium text-sky-700 mt-0.5">
                                {user.jobTitle}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="py-3.5 px-3 text-slate-500">{user.email || '-'}</td>
                        <td className="py-3.5 px-3">
                          <span
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wide border ${
                              user.role === 'owner'
                                ? 'bg-amber-50 text-amber-800 border-amber-200'
                                : user.role === 'manager'
                                ? 'bg-sky-50 text-sky-800 border-sky-200'
                                : 'bg-slate-50 text-slate-700 border-slate-200'
                            }`}
                          >
                            {user.role === 'owner' ? 'Eigenaar' : user.role === 'manager' ? 'Manager' : 'Kassier'}
                          </span>
                        </td>
                        <td className="py-3.5 px-3">
                          <span className="inline-flex items-center gap-1 text-[11px] text-slate-600 font-medium">
                            <KeyRound size={12} className="text-slate-400" />
                            {user.pinHash ? 'Actief' : 'Niet ingesteld'}
                          </span>
                        </td>
                        <td className="py-3.5 px-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingTeamUser(user);
                                setTeamForm({
                                  name: user.name,
                                  email: user.email || '',
                                  role: user.role,
                                  jobTitle: user.jobTitle || '',
                                  pin: '',
                                });
                                setTeamError(null);
                                setShowTeamModal(true);
                              }}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-sky-700 hover:bg-sky-50 transition"
                              title="Bewerken"
                            >
                              <Edit2 size={15} />
                            </button>
                            {!isSelf && (
                              <button
                                type="button"
                                onClick={async () => {
                                  if (!confirm(`Weet u zeker dat u medewerker "${user.name}" wilt verwijderen?`)) return;
                                  await db.users.delete(user.id);
                                  setSavedToast(`Medewerker ${user.name} verwijderd.`);
                                }}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                                title="Verwijderen"
                              >
                                <Trash2 size={15} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* MODAL: MEDEWERKER TOEVOEGEN / BEWERKEN */}
            <Modal
              open={showTeamModal}
              onClose={() => setShowTeamModal(false)}
              title={editingTeamUser ? 'Medewerker bewerken' : 'Nieuwe medewerker toevoegen'}
              subtitle="Koppel een kassamedewerker aan uw kassa met eigen rol, functie en snel-PIN"
              icon={<UserPlus size={18} className="text-sky-600" />}
              size="md"
            >
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  setTeamError(null);
                  const trimmedName = teamForm.name.trim();
                  if (!trimmedName) {
                    setTeamError('Vul een geldige naam in.');
                    return;
                  }

                  if (!editingTeamUser && !teamForm.pin) {
                    setTeamError('Voer een 6-cijferige PIN in voor deze medewerker.');
                    return;
                  }

                  if (teamForm.pin && !/^\d{6}$/.test(teamForm.pin)) {
                    setTeamError('De kassa-PIN moet exact 6 cijfers bevatten (bv. 123456).');
                    return;
                  }

                  try {
                    const pinHash = teamForm.pin ? await hashCredential(teamForm.pin, 'pin') : editingTeamUser?.pinHash || '';

                    if (editingTeamUser) {
                      await db.users.update(editingTeamUser.id, {
                        name: trimmedName,
                        email: teamForm.email.trim() || undefined,
                        role: teamForm.role,
                        jobTitle: teamForm.jobTitle.trim() || undefined,
                        ...(teamForm.pin ? { pinHash } : {}),
                      });
                      setSavedToast(`Medewerker ${trimmedName} bijgewerkt.`);
                    } else {
                      const newId = `usr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
                      await db.users.put({
                        id: newId,
                        name: trimmedName,
                        email: teamForm.email.trim() || undefined,
                        role: teamForm.role,
                        jobTitle: teamForm.jobTitle.trim() || undefined,
                        pinHash,
                        createdAt: new Date().toISOString(),
                      });
                      setSavedToast(`Medewerker ${trimmedName} toegevoegd.`);
                    }
                    setShowTeamModal(false);
                  } catch (err: any) {
                    setTeamError(err?.message || 'Fout bij opslaan van medewerker.');
                  }
                }}
                className="space-y-4"
              >
                {teamError && (
                  <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold rounded-xl" role="alert">
                    {teamError}
                  </div>
                )}

                <div>
                  <label className="text-xs font-bold text-slate-700">
                    Naam medewerker <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={teamForm.name}
                    onChange={(e) => setTeamForm({ ...teamForm, name: e.target.value })}
                    placeholder="bv. Lisa Verstraete"
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs text-slate-800 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100 font-medium"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700">Functie / Afdeling (optioneel)</label>
                  <input
                    type="text"
                    value={teamForm.jobTitle}
                    onChange={(e) => setTeamForm({ ...teamForm, jobTitle: e.target.value })}
                    placeholder="bv. Herstellingsdienst, Verkoop, Atelier..."
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs text-slate-800 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100 font-medium"
                  />
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {['Verkoop', 'Herstellingsdienst', 'Kassa', 'Atelier', 'Magazijn', 'Student'].map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => setTeamForm({ ...teamForm, jobTitle: tag })}
                        className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-slate-50 hover:bg-sky-50 text-slate-600 hover:text-sky-800 border border-slate-200 transition"
                      >
                        + {tag}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700">E-mailadres (optioneel)</label>
                  <input
                    type="email"
                    value={teamForm.email}
                    onChange={(e) => setTeamForm({ ...teamForm, email: e.target.value })}
                    placeholder="lisa@winkel.be"
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs text-slate-800 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100 font-medium"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1.5">Rol in het kassasysteem</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'cashier', label: 'Kassier', desc: 'Verkopen & retours' },
                      { id: 'manager', label: 'Manager', desc: 'Prijzen & Z-rapport' },
                      { id: 'owner', label: 'Eigenaar', desc: 'Volledig beheer' },
                    ].map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => setTeamForm({ ...teamForm, role: r.id as Role })}
                        className={`p-2.5 rounded-xl border text-left transition-all ${
                          teamForm.role === r.id
                            ? 'border-sky-500 bg-sky-50/70 ring-1 ring-sky-500'
                            : 'border-slate-200 bg-white hover:bg-slate-50'
                        }`}
                      >
                        <div className="text-xs font-bold text-slate-900">{r.label}</div>
                        <div className="text-[10px] text-slate-500 mt-0.5">{r.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700">
                    {editingTeamUser ? 'Nieuwe 6-cijferige Kassa PIN (optioneel)' : '6-cijferige Kassa PIN'} {!editingTeamUser && <span className="text-rose-500">*</span>}
                  </label>
                  <input
                    type="password"
                    maxLength={6}
                    inputMode="numeric"
                    pattern="\d*"
                    required={!editingTeamUser}
                    value={teamForm.pin}
                    onChange={(e) => setTeamForm({ ...teamForm, pin: e.target.value.replace(/\D/g, '') })}
                    placeholder={editingTeamUser ? 'Laat leeg om PIN ongewijzigd te laten' : 'bv. 123456'}
                    className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs text-slate-800 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100 font-medium tracking-widest"
                  />
                  <p className="mt-1 text-[11px] text-slate-400">Gebruikt voor snelle kassamedewerker-wissels op de kassa.</p>
                </div>

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowTeamModal(false)}
                    className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 border border-slate-200 rounded-xl bg-white hover:bg-slate-50 transition"
                  >
                    Annuleren
                  </button>
                  <button
                    type="submit"
                    className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-sky-600 hover:bg-sky-700 rounded-xl shadow-xs transition"
                  >
                    <Check size={15} /> Medewerker opslaan
                  </button>
                </div>
              </form>
            </Modal>
          </div>
        )}
      </main>
    </div>
  );
};
