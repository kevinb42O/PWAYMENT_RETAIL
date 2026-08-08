import React, { useEffect, useRef, useState } from 'react';
import { Menu } from './Menu';
import { Cart } from './Cart';
import { ZReportView } from './ZReport';
import { AuditLog } from './AuditLog';
import { ProductAdmin } from './ProductAdmin';
import { ThemeToggle } from './ThemeToggle';
import { useStore } from '../store/useStore';
import { useAuth } from '../auth/useAuth';
import { useProducts } from '../store/useProducts';
import { matchesCatalogQuery } from '../utils/productLookup';
import {
  AlertCircle,
  CheckCircle2,
  ScanLine,
  ShoppingCart,
  FileText,
  History,
  Monitor,
  LogOut,
  Search,
  Settings,
  Users,
  Lightbulb,
  Maximize,
  Minimize
} from 'lucide-react';
import { Customers } from './Customers';
import { Insights } from './Insights';

const SCAN_RESET_MS = 90;
const SCAN_SUBMIT_GAP_MS = 200;
const SCAN_MIN_LENGTH = 4;

const isEditableTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName;
  return target.isContentEditable || tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT';
};

interface ScanFeedback {
  tone: 'success' | 'warning' | 'info';
  title: string;
  detail: string;
}

export const Layout: React.FC = () => {
  const { mobileView, setMobileView, cart, mainView, setMainView, scanCodeToCart } = useStore();
  const { currentUserName, currentRole, logout } = useAuth();
  const products = useProducts((s) => s.list);
  const hydrateProducts = useProducts((s) => s.hydrate);

  const [productQuery, setProductQuery] = useState('');
  const [scanFeedback, setScanFeedback] = useState<ScanFeedback | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const scanInputRef = useRef<HTMLInputElement | null>(null);
  const scanBufferRef = useRef('');
  const lastScanKeyAtRef = useRef(0);

  const cartCount = cart.orders.reduce((acc, o) => acc + o.quantity, 0);

  const focusScanInput = () => {
    if (typeof window === 'undefined') return;
    if (!window.matchMedia('(min-width: 768px)').matches) return;
    window.requestAnimationFrame(() => scanInputRef.current?.focus());
  };

  const submitProductQuery = (rawValue?: string) => {
    const value = (rawValue ?? productQuery).trim();
    if (!value) {
      focusScanInput();
      return;
    }

    const result = scanCodeToCart(value);

    if (result.status === 'matched' && result.product) {
      setProductQuery('');
      setScanFeedback({
        tone: 'success',
        title: `${result.product.name} toegevoegd`,
        detail: `Direct toegevoegd via ${result.matchedOn === 'sku' ? 'SKU' : 'barcode'} scan.`,
      });
      focusScanInput();
      return;
    }

    if (result.status === 'out-of-stock' && result.product) {
      setProductQuery(value);
      setScanFeedback({
        tone: 'warning',
        title: `${result.product.name} is uitverkocht`,
        detail: 'Deze barcode is herkend, maar stock staat op nul.',
      });
      focusScanInput();
      return;
    }

    const hasBrowseMatches = products.some((product) => matchesCatalogQuery(product, value));
    setProductQuery(value);
    setScanFeedback(
      hasBrowseMatches
        ? {
            tone: 'info',
            title: 'Zoekresultaten bijgewerkt',
            detail: 'Geen exacte barcode of SKU gevonden. Kies het juiste product hieronder.',
          }
        : {
            tone: 'warning',
            title: 'Barcode of SKU niet gevonden',
            detail: 'Controleer het label of voeg het product handmatig toe via de catalogus.',
          },
    );
    focusScanInput();
  };

  useEffect(() => {
    void hydrateProducts();
  }, [hydrateProducts]);

  // Presentation links can open a specific live screen directly, without
  // changing the normal in-app navigation for everyday use.
  useEffect(() => {
    const requestedView = new URLSearchParams(window.location.search).get('view');
    const allowedViews = ['pos', 'insights', 'z-report', 'audit-log', 'admin', 'customers'];
    if (requestedView && allowedViews.includes(requestedView)) {
      setMainView(requestedView as typeof mainView);
    }
  }, [setMainView]);

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  useEffect(() => {
    if (mainView !== 'pos') return;
    focusScanInput();
  }, [mainView]);

  useEffect(() => {
    if (!scanFeedback) return;
    const timer = window.setTimeout(() => setScanFeedback(null), 2600);
    return () => window.clearTimeout(timer);
  }, [scanFeedback]);

  useEffect(() => {
    if (mainView !== 'pos') return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target) || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      if (event.key === 'Escape' || event.key === 'Tab') {
        scanBufferRef.current = '';
        lastScanKeyAtRef.current = 0;
        return;
      }

      if (event.key === 'Enter') {
        const bufferedCode = scanBufferRef.current.trim();
        const gap = event.timeStamp - lastScanKeyAtRef.current;
        scanBufferRef.current = '';
        lastScanKeyAtRef.current = 0;

        if (bufferedCode.length >= SCAN_MIN_LENGTH && gap <= SCAN_SUBMIT_GAP_MS) {
          event.preventDefault();
          submitProductQuery(bufferedCode);
        }
        return;
      }

      if (event.key.length !== 1 || /\s/.test(event.key)) {
        return;
      }

      const gap = event.timeStamp - lastScanKeyAtRef.current;
      if (gap > SCAN_RESET_MS) {
        scanBufferRef.current = '';
      }

      scanBufferRef.current += event.key;
      lastScanKeyAtRef.current = event.timeStamp;
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [mainView, submitProductQuery]);

  return (
    <div className="flex flex-col h-screen w-full bg-zinc-950 overflow-hidden font-sans text-white">
      <div className="flex items-center justify-between px-4 sm:px-6 py-3 bg-zinc-950 border-b border-zinc-800 print:hidden">
        <div className="flex items-center select-none" aria-label="Pwayment retail">
          <img
            src="/branding/pwayment-logo-v2.svg"
            alt="Pwayment"
            className="pos-brand-logo h-8 w-auto sm:h-9"
          />
        </div>

        <div className="flex bg-zinc-900 rounded-lg p-1 border border-zinc-800">
          <button
            onClick={() => setMainView('pos')}
            className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-md text-sm font-medium ${
              mainView === 'pos' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Monitor size={16} />
            <span className="hidden sm:inline">Kassa</span>
          </button>
          <button
            onClick={() => setMainView('z-report')}
            className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-md text-sm font-medium ${
              mainView === 'z-report' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white'
            }`}
          >
            <FileText size={16} />
            <span className="hidden sm:inline">Dagafsluiting</span>
          </button>
          <button
            onClick={() => setMainView('audit-log')}
            className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-md text-sm font-medium ${
              mainView === 'audit-log' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white'
            }`}
          >
            <History size={16} />
            <span className="hidden sm:inline">Historiek</span>
          </button>
          <button
            onClick={() => setMainView('customers')}
            className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-md text-sm font-medium ${
              mainView === 'customers' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Users size={16} />
            <span className="hidden sm:inline">Klanten</span>
          </button>
          <button
            onClick={() => setMainView('insights')}
            className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-md text-sm font-medium ${
              mainView === 'insights' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Lightbulb size={16} />
            <span className="hidden sm:inline">Inzichten</span>
          </button>
          {(currentRole === 'owner' || currentRole === 'manager') && (
            <button
              onClick={() => setMainView('admin')}
              className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-md text-sm font-medium ${
                mainView === 'admin' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Settings size={16} />
              <span className="hidden sm:inline">Beheer</span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen().catch(err => console.warn(err));
              } else {
                document.exitFullscreen().catch(err => console.warn(err));
              }
            }}
            className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hidden sm:block"
            title="Volledig scherm"
          >
            {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
          </button>
          <ThemeToggle compact />
          <div className="hidden sm:flex flex-col items-end leading-tight">
            <span className="text-sm font-medium">{currentUserName}</span>
            <span className="text-[10px] text-zinc-500 uppercase tracking-widest">{currentRole}</span>
          </div>
          <button
            onClick={() => void logout()}
            className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
            title="Afmelden"
          >
            <LogOut size={18} />
          </button>
        </div>
      </div>

      {mainView === 'z-report' && <ZReportView />}
      {mainView === 'audit-log' && <AuditLog />}
      {mainView === 'customers' && <Customers />}
      {mainView === 'insights' && <Insights />}
      {mainView === 'admin' &&
        (currentRole === 'owner' || currentRole === 'manager' ? (
          <ProductAdmin />
        ) : (
          <div className="flex-1 flex items-center justify-center text-zinc-500">
            Onvoldoende rechten.
          </div>
        ))}

      {mainView === 'pos' && (
        <div className="pos-workspace flex flex-col flex-1 overflow-hidden">
          <div className="px-4 sm:px-6 py-3 border-b border-zinc-800 bg-zinc-950/95 print:hidden">
            <div className="flex items-center gap-3">
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  submitProductQuery();
                }}
                className="flex-1 flex items-center gap-2"
              >
                <div className="relative flex-1">
                  <ScanLine size={19} className="pos-accent-text absolute left-4 top-1/2 -translate-y-1/2" />
                  <input
                    ref={scanInputRef}
                    type="search"
                    value={productQuery}
                    onChange={(event) => setProductQuery(event.target.value)}
                    placeholder="Scan barcode of zoek product..."
                    aria-label="Scan barcode of zoek product"
                    className="pos-search-input w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-11 pr-4 py-3 text-white placeholder-zinc-500 focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  className="pos-primary-action px-4 sm:px-5 py-3 rounded-xl font-semibold whitespace-nowrap shadow-sm transition-colors"
                >
                  <span className="hidden sm:inline">Voeg toe</span>
                  <Search size={18} className="sm:hidden" />
                </button>
              </form>
            </div>

            {scanFeedback && (
              <div
                className={`mt-3 flex items-start gap-2 rounded-xl border px-3 py-2 text-sm ${
                  scanFeedback.tone === 'success'
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100'
                    : scanFeedback.tone === 'info'
                      ? 'border-sky-500/40 bg-sky-500/10 text-sky-100'
                      : 'border-amber-500/40 bg-amber-500/10 text-amber-100'
                }`}
              >
                {scanFeedback.tone === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
                <div>
                  <div className="font-medium">{scanFeedback.title}</div>
                  <div className="text-xs opacity-85 mt-0.5">{scanFeedback.detail}</div>
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
            <div className="flex-1 overflow-hidden md:hidden">
              {mobileView === 'menu' && <Menu query={productQuery} onQueryChange={setProductQuery} />}
              {mobileView === 'cart' && <Cart />}
            </div>

            <div className="md:hidden flex bg-zinc-900 border-t border-zinc-800 pb-safe print:hidden">
              <button
                onClick={() => setMobileView('menu')}
                className={`flex-1 py-4 flex flex-col items-center gap-1 ${
                  mobileView === 'menu' ? 'pos-accent-text' : 'text-zinc-500'
                }`}
              >
                <ScanLine size={24} />
                <span className="text-xs font-bold uppercase tracking-wider">Catalogus</span>
              </button>
              <button
                onClick={() => setMobileView('cart')}
                className={`flex-1 py-4 flex flex-col items-center gap-1 relative ${
                  mobileView === 'cart' ? 'pos-accent-text' : 'text-zinc-500'
                }`}
              >
                <ShoppingCart size={24} />
                <span className="text-xs font-bold uppercase tracking-wider">Kassa</span>
                {cartCount > 0 && (
                  <span className="absolute top-2 right-1/4 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                    {cartCount}
                  </span>
                )}
              </button>
            </div>

            <div className="hidden min-w-0 md:flex w-full h-full">
              <div className="min-w-0 flex-1 h-full border-r border-zinc-800">
                <Menu query={productQuery} onQueryChange={setProductQuery} />
              </div>
              <div className="w-[30%] lg:w-[25%] shrink-0 h-full">
                <Cart />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
