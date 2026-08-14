import React, { useState } from 'react';
import {
  Globe,
  Truck,
  CheckCircle2,
  Copy,
  Check,
  Eye,
  FilePenLine,
  Plus,
  Search,
  Building2,
  Lock,
  RefreshCw,
  Star,
  ChevronRight,
  CirclePlay,
  CirclePause,
  Zap,
  X,
  Edit3,
  FileText,
  Image as ImageIcon,
  Tag,
  Trash2,
} from 'lucide-react';
import { useWebshopStore, WebshopTheme, DiscountCoupon } from '../store/useWebshopStore';
import { useProducts } from '../store/useProducts';
import { WebshopPreviewModal } from './WebshopPreviewModal';
import { Product } from '../types';
import { WebshopOrders } from './WebshopOrders';
import { FEATURE_KEYS, useEntitlements } from '../billing/entitlements';

interface WebshopSettingsProps {
  activeTab: string;
  onTabChange: (tab: any) => void;
}

export const WebshopSettings: React.FC<WebshopSettingsProps> = ({
  activeTab,
  onTabChange,
}) => {
  const webshop = useWebshopStore();
  const { list: products } = useProducts();
  const canPublishWebshop = useEntitlements(
    (state) => state.snapshot?.features[FEATURE_KEYS.webshopPublish] === true,
  );

  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [saveToast, setSaveToast] = useState<string | null>(null);

  // Product Description & Image Modal states
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editingDescriptionText, setEditingDescriptionText] = useState('');
  const [imagePickerProduct, setImagePickerProduct] = useState<Product | null>(null);
  const [customImageUrl, setCustomImageUrl] = useState('');

  // Coupon modal state
  const [showCouponModal, setShowCouponModal] = useState(false);
  const [newCouponCode, setNewCouponCode] = useState('');
  const [newCouponType, setNewCouponType] = useState<'percent' | 'fixed'>('percent');
  const [newCouponValue, setNewCouponValue] = useState('10');
  const [newCouponMinOrder, setNewCouponMinOrder] = useState('0');

  // License restriction check: Webshop publish is ONLY in 'pro' or 'enterprise'
  const isPlanWebshopEnabled = canPublishWebshop;

  // Catalog tab state
  const [productSearch, setProductSearch] = useState('');
  const [catalogFilter, setCatalogFilter] = useState<'all' | 'published' | 'unpublished' | 'featured'>('all');

  const triggerToast = (msg: string) => {
    setSaveToast(msg);
    setTimeout(() => setSaveToast(null), 3000);
  };

  const handleCopyLink = () => {
    const url = `${window.location.origin}/shop`;
    void navigator.clipboard.writeText(url).then(() => {
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2500);
    }).catch(() => triggerToast('Kopiëren werd door de browser geblokkeerd.'));
  };

  // Filtered products for catalog management
  const filteredProducts = products.filter((p) => {
    if (!p.isActive) return false;
    const isUnpublished = webshop.unpublishedProductIds.includes(p.id);
    const isFeatured = webshop.featuredProductIds.includes(p.id);

    if (catalogFilter === 'published' && isUnpublished) return false;
    if (catalogFilter === 'unpublished' && !isUnpublished) return false;
    if (catalogFilter === 'featured' && !isFeatured) return false;

    if (productSearch) {
      const q = productSearch.toLowerCase();
      return (
        p.name.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        p.brand?.toLowerCase().includes(q) ||
        p.sku?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const publishedCount = products.filter((p) => p.isActive && !webshop.unpublishedProductIds.includes(p.id)).length;
  const featuredCount = webshop.featuredProductIds.length;
  const sectionNavigation = [
    ['webshop-general', 'Overzicht'],
    ['webshop-orders', 'Bestellingen'],
    ['webshop-design', 'Vormgeving'],
    ['webshop-products', 'Assortiment'],
    ['webshop-coupons', 'Kortingen'],
    ['webshop-shipping', 'Levering'],
    ['webshop-payments', 'Betalingen'],
    ['webshop-domain', 'Domein'],
  ] as const;

  return (
    <div className="webshop-admin space-y-5 animate-in fade-in duration-200">
      {/* GLOBAL TOAST BANNER */}
      {saveToast && (
        <div className="fixed top-4 right-4 z-50 bg-slate-950 text-white px-4 py-3 rounded-xl shadow-lg flex items-center gap-3 border border-slate-800 animate-in slide-in-from-top duration-200" role="status">
          <CheckCircle2 size={18} />
          <span className="text-xs font-bold">{saveToast}</span>
        </div>
      )}

      {/* PLAN RESTRICTION NOTICE BANNER (WHEN ON BASIS PLAN) */}
      {!isPlanWebshopEnabled && (
        <div className="border border-slate-200 border-l-4 border-l-slate-900 bg-white p-4 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-slate-900">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-slate-100 text-slate-600 font-bold flex items-center justify-center shrink-0 border border-slate-200">
              <Lock size={20} />
            </div>
            <div className="space-y-0.5">
              <div className="font-extrabold text-sm flex items-center gap-2">
                <span>Publicatie niet inbegrepen in Pwayment Basis</span>
              </div>
              <p className="text-xs text-slate-500 font-medium">
                U kunt alle instellingen voorbereiden. Online publiceren is beschikbaar vanaf Retail Professional.
              </p>
            </div>
          </div>

          <button
            onClick={() => onTabChange('billing-plan')}
            className="px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-800 font-bold rounded-lg text-xs border border-slate-300 transition-colors shrink-0 flex items-center gap-1.5"
          >
            <Zap size={14} />
            <span>Abonnement bekijken</span>
          </button>
        </div>
      )}

      <nav className="flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1 md:hidden" aria-label="Webshopinstellingen">
        {sectionNavigation.map(([id, label]) => {
          const selected = activeTab === id || (activeTab === 'webshop' && id === 'webshop-general');
          return (
            <button
              key={id}
              type="button"
              onClick={() => onTabChange(id)}
              aria-current={selected ? 'page' : undefined}
              className={`shrink-0 rounded-lg px-3 py-2 text-[11px] font-bold ${selected ? 'bg-slate-950 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              {label}
            </button>
          );
        })}
      </nav>

      {/* WEBSHOP ACTION HEADER CARD - LIGHT MODE / CLEAN RETAIL DESIGN */}
      <div className="p-5 md:p-6 bg-white text-slate-900 rounded-xl border border-slate-200 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-5">
        <div className="space-y-2 max-w-2xl">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="text-[11px] font-bold text-slate-500 flex items-center gap-1.5">
              <Globe size={13} className="text-slate-500" />
              Webshop
            </span>

            <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold flex items-center gap-1.5 border ${
              isPlanWebshopEnabled && webshop.isEnabled
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : 'bg-slate-50 text-slate-600 border-slate-200'
            }`}>
              <span className="w-1.5 h-1.5 rounded-full bg-current" />
              {!isPlanWebshopEnabled
                ? 'Niet gepubliceerd'
                : webshop.isEnabled
                ? 'Online'
                : 'Offline'}
            </span>
          </div>

          <h2 className="text-xl md:text-2xl font-black tracking-tight text-slate-900">
            {webshop.shopName}
          </h2>

          <p className="text-xs md:text-sm text-slate-500 font-medium leading-relaxed">
            Beheer wat klanten zien, welke producten beschikbaar zijn en hoe bestellingen worden afgehandeld.
          </p>
        </div>

        {/* TOP CTA BUTTONS */}
        <div className="flex flex-wrap items-center gap-2 shrink-0 w-full lg:w-auto">
          {/* PLAN-RESTRICTED PUBLISH / PAUSE BUTTON */}
          {!isPlanWebshopEnabled ? (
            <button
              onClick={() => setShowUpgradeModal(true)}
              className="flex-1 md:flex-initial px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-800 font-bold rounded-lg text-xs border border-slate-300 transition-colors flex items-center justify-center gap-2"
            >
              <Lock size={15} />
              <span>Publiceren</span>
            </button>
          ) : webshop.isEnabled ? (
            <button
              onClick={() => {
                webshop.updateSettings({ isEnabled: false });
                triggerToast('Webshop is nu gepauzeerd (Onderhoudsmodus).');
              }}
              className="flex-1 md:flex-initial px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 font-bold rounded-lg text-xs border border-slate-300 transition-colors flex items-center justify-center gap-2"
            >
              <CirclePause size={16} />
              <span>Offline zetten</span>
            </button>
          ) : (
            <button
              onClick={() => {
                webshop.updateSettings({ isEnabled: true });
                triggerToast('De webshop staat online.');
              }}
              className="flex-1 md:flex-initial px-4 py-2.5 bg-slate-950 hover:bg-black text-white font-bold rounded-lg text-xs transition-colors flex items-center justify-center gap-2"
            >
              <CirclePlay size={16} />
              <span>Online zetten</span>
            </button>
          )}

          <button
            onClick={handleCopyLink}
            className="flex-1 md:flex-initial px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-bold border border-slate-300 transition-colors flex items-center justify-center gap-2"
          >
            {copiedUrl ? <Check size={15} className="text-emerald-600" /> : <Copy size={15} className="text-slate-500" />}
            <span>{copiedUrl ? 'Link gekopieerd' : 'Link kopiëren'}</span>
          </button>

          <button
            onClick={() => setIsPreviewOpen(true)}
            className="order-first flex-1 md:flex-initial px-4 py-2.5 bg-slate-950 hover:bg-black text-white font-bold rounded-lg text-xs transition-colors flex items-center justify-center gap-2"
          >
            <Eye size={16} />
            <span>Webshop bekijken</span>
          </button>
        </div>
      </div>

      {/* SUB-TAB 1: ALGEMEEN & STATUS */}
      {(activeTab === 'webshop-general' || activeTab === 'webshop') && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          <div className="xl:col-span-2 space-y-5 bg-white p-5 md:p-6 rounded-xl border border-slate-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <div>
                <h3 className="text-base font-black text-slate-900">Winkelgegevens</h3>
                <p className="text-xs text-slate-500 font-medium">Deze informatie wordt gebruikt in de webshop en bij klantcontact.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1.5">Winkelnaam</label>
                <input
                  type="text"
                  value={webshop.shopName}
                  onChange={(e) => webshop.updateSettings({ shopName: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 font-bold text-slate-900"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1.5">Slogan</label>
                <input
                  type="text"
                  value={webshop.shopTagline}
                  onChange={(e) => webshop.updateSettings({ shopTagline: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 font-bold text-slate-900"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1.5">Bestellingen ontvangen op</label>
                <input
                  type="email"
                  value={webshop.contactEmail}
                  onChange={(e) => webshop.updateSettings({ contactEmail: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 font-bold text-slate-900"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1.5">Telefoonnummer</label>
                <input
                  type="text"
                  value={webshop.contactPhone}
                  onChange={(e) => webshop.updateSettings({ contactPhone: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 font-bold text-slate-900"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block font-bold text-slate-700 mb-1.5">Omschrijving voor zoekmachines</label>
                <textarea
                  rows={3}
                  value={webshop.seoDescription}
                  onChange={(e) => webshop.updateSettings({ seoDescription: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 font-medium text-slate-900 text-xs"
                />
              </div>
            </div>

            <div className="pt-4 border-t border-slate-200 flex items-center gap-2 text-[11px] font-medium text-slate-500">
              <CheckCircle2 size={14} className="text-slate-400" />
              Wijzigingen worden automatisch opgeslagen.
            </div>
          </div>

          <div className="space-y-4">
            <div className="bg-white p-5 rounded-xl border border-slate-200 space-y-4 text-xs text-slate-700">
              <div className="flex items-center gap-2 font-black text-sm text-slate-900">
                <RefreshCw size={15} className="text-slate-500" />
                <span>Catalogusstatus</span>
              </div>
              <p className="leading-relaxed font-medium text-slate-500">
                De webshop gebruikt producten, prijzen en voorraad uit de centrale catalogus.
              </p>
              <div className="space-y-3 pt-3 border-t border-slate-200 font-bold">
                <div className="flex justify-between">
                  <span className="text-slate-500">Actieve producten</span>
                  <span>{products.filter(p => p.isActive).length} artikelen</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Online assortiment</span>
                  <span>{publishedCount} artikelen</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Uitgelicht</span>
                  <span>{featuredCount} artikelen</span>
                </div>
              </div>
              <button type="button" onClick={() => onTabChange('webshop-products')} className="flex w-full items-center justify-between rounded-lg border border-slate-300 px-3 py-2.5 text-left font-bold text-slate-700 hover:bg-slate-50">
                Assortiment beheren <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'webshop-orders' && <WebshopOrders />}

      {/* SUB-TAB 2: DESIGN & BRANDING */}
      {activeTab === 'webshop-design' && (
        <div className="space-y-6">
          {/* THEME SELECTION CARDS */}
          <div className="bg-white p-5 md:p-6 rounded-xl border border-slate-200 space-y-4">
            <div>
              <h3 className="text-base font-black text-slate-900">Webshopstijl</h3>
              <p className="text-xs text-slate-500 font-medium">Kies een basisstijl. Teksten en afbeeldingen kunt u hieronder aanpassen.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              {[
                {
                  id: 'clean-modern',
                  name: 'Helder',
                  desc: 'Rustige, lichte winkelstijl met veel witruimte.',
                  colorBg: 'bg-slate-100',
                  colorAccent: 'bg-sky-500',
                  accent: '#0284c7',
                },
                {
                  id: 'lux-dark',
                  name: 'Donker',
                  desc: 'Donkere uitstraling met ingetogen contrasten.',
                  colorBg: 'bg-zinc-900 text-white',
                  colorAccent: 'bg-amber-500',
                  accent: '#b9955a',
                },
                {
                  id: 'vibrant-retail',
                  name: 'Retail',
                  desc: 'Directe winkelstijl met een duidelijk accent.',
                  colorBg: 'bg-emerald-50',
                  colorAccent: 'bg-emerald-600',
                  accent: '#047857',
                },
                {
                  id: 'editorial',
                  name: 'Redactioneel',
                  desc: 'Warme, tijdloze stijl met nadruk op fotografie.',
                  colorBg: 'bg-stone-100',
                  colorAccent: 'bg-stone-900',
                  accent: '#29251f',
                },
              ].map((theme) => (
                <button
                  type="button"
                  key={theme.id}
                  onClick={() => {
                    webshop.updateSettings({ themeStyle: theme.id as WebshopTheme, primaryColor: theme.accent });
                    triggerToast(`Thema gewijzigd naar ${theme.name}`);
                  }}
                  aria-pressed={webshop.themeStyle === theme.id}
                  className={`p-4 rounded-xl border cursor-pointer text-left transition-all space-y-3 relative ${
                    webshop.themeStyle === theme.id
                      ? 'border-slate-950 bg-slate-50 ring-1 ring-slate-950'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                >
                  <div className={`w-full h-24 rounded-xl ${theme.colorBg} p-2 flex flex-col justify-between overflow-hidden shadow-inner`}>
                    <div className="flex justify-between items-center">
                      <div className="w-12 h-2 rounded bg-slate-300/40" />
                      <div className={`w-4 h-4 rounded-full ${theme.colorAccent}`} />
                    </div>
                    <div className="space-y-1">
                      <div className="w-3/4 h-2.5 rounded bg-slate-400/40" />
                      <div className="w-1/2 h-2 rounded bg-slate-300/30" />
                    </div>
                  </div>

                  <div>
                    <div className="font-extrabold text-xs text-slate-900 flex items-center justify-between">
                      <span>{theme.name}</span>
                      {webshop.themeStyle === theme.id && (
                        <CheckCircle2 size={16} className="text-slate-900" />
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">{theme.desc}</p>
                  </div>
                </button>
              ))}
            </div>

            <div className="grid gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
              <div>
                <div className="text-xs font-black text-slate-900">Accentkleur</div>
                <p className="mt-1 text-[11px] font-medium text-slate-500">Wordt uitsluitend gebruikt voor primaire acties, actieve filters en focus.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {['#0284c7', '#047857', '#b45309', '#be123c', '#6d28d9', '#29251f'].map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => webshop.updateSettings({ primaryColor: color })}
                      aria-label={`Accentkleur ${color}`}
                      aria-pressed={webshop.primaryColor.toLowerCase() === color}
                      className={`h-9 w-9 rounded-full border-2 shadow-sm transition ${webshop.primaryColor.toLowerCase() === color ? 'border-slate-950 ring-2 ring-slate-300' : 'border-white'}`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
              <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-700">
                Eigen kleur
                <input
                  type="color"
                  value={webshop.primaryColor}
                  onChange={(event) => webshop.updateSettings({ primaryColor: event.target.value })}
                  className="h-9 w-12 cursor-pointer rounded-lg border-0 bg-transparent p-0"
                />
              </label>
            </div>
          </div>

          {/* HERO BANNER & ANNOUNCEMENT BAR */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white p-5 md:p-6 rounded-xl border border-slate-200 space-y-4 text-xs">
              <h3 className="text-base font-black text-slate-900">Hoofdbanner</h3>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Banner Hoofdtitel</label>
                <input
                  type="text"
                  value={webshop.heroTitle}
                  onChange={(e) => webshop.updateSettings({ heroTitle: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 font-bold text-slate-900"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Banner Subtitel</label>
                <input
                  type="text"
                  value={webshop.heroSubtitle}
                  onChange={(e) => webshop.updateSettings({ heroSubtitle: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 font-medium text-slate-900"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Achtergrond Afbeelding URL</label>
                <input
                  type="text"
                  value={webshop.heroImageUrl}
                  onChange={(e) => webshop.updateSettings({ heroImageUrl: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 font-mono text-[11px] text-slate-900"
                />
              </div>
            </div>

            <div className="bg-white p-5 md:p-6 rounded-xl border border-slate-200 space-y-4 text-xs">
              <h3 className="text-base font-black text-slate-900">Aankondiging en productraster</h3>

              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl border border-slate-200">
                <span className="font-bold">Aankondigingsbalk tonen bovenin</span>
                <input
                  type="checkbox"
                  checked={webshop.announcementActive}
                  onChange={(e) => webshop.updateSettings({ announcementActive: e.target.checked })}
                  className="w-4 h-4 rounded text-sky-500"
                />
              </div>

              {webshop.announcementActive && (
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Aankondigingstekst</label>
                  <input
                    type="text"
                    value={webshop.announcementText}
                    onChange={(e) => webshop.updateSettings({ announcementText: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 font-bold text-slate-900"
                  />
                </div>
              )}

              <div className="pt-2 border-t border-slate-200 space-y-2">
                <label className="block font-bold text-slate-700">Producten per rij</label>
                <div className="flex gap-3">
                  <button
                    onClick={() => webshop.updateSettings({ gridColumns: 3 })}
                    className={`flex-1 py-2 rounded-xl font-bold border ${
                      webshop.gridColumns === 3 ? 'bg-slate-900 text-white border-slate-900' : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    3 Kolommen
                  </button>
                  <button
                    onClick={() => webshop.updateSettings({ gridColumns: 4 })}
                    className={`flex-1 py-2 rounded-xl font-bold border ${
                      webshop.gridColumns === 4 ? 'bg-slate-900 text-white border-slate-900' : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    4 Kolommen
                  </button>
                </div>
              </div>

              <div className="grid gap-2 border-t border-slate-200 pt-3 sm:grid-cols-2">
                <label className="flex min-h-12 cursor-pointer items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3">
                  <span><span className="block font-bold text-slate-800">Uitverkochte producten</span><span className="text-[10px] font-medium text-slate-500">Toon ze met een duidelijke status.</span></span>
                  <input type="checkbox" checked={webshop.showOutOfStock} onChange={(event) => webshop.updateSettings({ showOutOfStock: event.target.checked })} className="h-4 w-4 accent-slate-900" />
                </label>
                <label className="flex min-h-12 cursor-pointer items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3">
                  <span><span className="block font-bold text-slate-800">Exacte voorraad</span><span className="text-[10px] font-medium text-slate-500">Toon het aantal op productdetail.</span></span>
                  <input type="checkbox" checked={webshop.showStockCount} onChange={(event) => webshop.updateSettings({ showStockCount: event.target.checked })} className="h-4 w-4 accent-slate-900" />
                </label>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 3: PRODUCTEN & SYNCHRONISATIE */}
      {activeTab === 'webshop-products' && (
        <div className="space-y-6">
          <div className="bg-white p-5 md:p-6 rounded-xl border border-slate-200 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
              <div>
                <h3 className="text-base font-black text-slate-900">Online assortiment</h3>
                <p className="text-xs text-slate-500 font-medium">Bepaal welke actieve producten klanten in de webshop kunnen bestellen.</p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const allIds = products.map(p => p.id);
                    webshop.setAllProductsPublished(allIds, true);
                    triggerToast('Alle artikelen zijn nu gepubliceerd op de webshop!');
                  }}
                  className="px-3 py-2 bg-slate-950 text-white hover:bg-black font-bold rounded-lg text-xs border border-slate-950"
                >
                  Alles online
                </button>
                <button
                  onClick={() => {
                    const allIds = products.map(p => p.id);
                    webshop.setAllProductsPublished(allIds, false);
                    triggerToast('Alle artikelen verborgen van de webshop.');
                  }}
                  className="px-3 py-2 bg-white text-slate-700 hover:bg-slate-50 font-bold rounded-lg text-xs border border-slate-300"
                >
                  Alles verbergen
                </button>
              </div>
            </div>

            {/* Filter Bar */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
              <div className="relative w-full sm:w-72">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Zoek artikel, merk of SKU..."
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 rounded-xl bg-slate-50 border border-slate-200 font-medium"
                />
              </div>

              <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl w-full sm:w-auto">
                {[
                  { id: 'all', label: 'Alle' },
                  { id: 'published', label: 'Gepubliceerd' },
                  { id: 'unpublished', label: 'Verborgen' },
                  { id: 'featured', label: 'Uitgelicht' },
                ].map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setCatalogFilter(f.id as any)}
                    className={`px-3 py-1 rounded-lg font-bold transition-all ${
                      catalogFilter === f.id ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Products Table */}
            <div className="overflow-x-auto border border-slate-200 rounded-2xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-700 uppercase font-black tracking-wider text-[10px]">
                  <tr>
                    <th className="p-3 text-center">Foto</th>
                    <th className="p-3">Product</th>
                    <th className="p-3">Categorie</th>
                    <th className="p-3">Prijs</th>
                    <th className="p-3">Voorraad</th>
                    <th className="p-3">Beschrijving</th>
                    <th className="p-3 text-center">Zichtbaarheid</th>
                    <th className="p-3 text-center">Uitgelicht</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-medium">
                  {filteredProducts.map((p) => {
                    const isUnpublished = webshop.unpublishedProductIds.includes(p.id);
                    const isFeatured = webshop.featuredProductIds.includes(p.id);
                    const hasCustomDesc = !!webshop.productDescriptions[p.id];
                    const currentDesc = webshop.productDescriptions[p.id] || `Premium ${p.name} uit onze ${p.category} collectie.`;
                    const customImage = webshop.productImages[p.id];

                    return (
                      <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                        <td className="p-3 text-center">
                          <button
                            type="button"
                            aria-label={`Foto van ${p.name} bewerken`}
                            onClick={() => {
                              setImagePickerProduct(p);
                              setCustomImageUrl(webshop.productImages[p.id] || '');
                            }}
                            className="relative w-10 h-10 rounded-xl overflow-hidden bg-slate-100 border border-slate-200 hover:border-sky-500 transition-colors mx-auto group flex items-center justify-center shrink-0"
                          >
                            {customImage ? (
                              <img src={customImage} alt={p.name} className="w-full h-full object-cover" />
                            ) : (
                              <ImageIcon size={16} className="text-slate-400 group-hover:text-sky-600" />
                            )}
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white text-[9px] font-black uppercase">
                              Foto
                            </div>
                          </button>
                        </td>

                        <td className="p-3 font-bold text-slate-900">
                          <div>{p.name}</div>
                          {p.sku && <div className="text-[10px] text-slate-400 font-mono">SKU: {p.sku}</div>}
                        </td>
                        <td className="p-3 text-slate-600">{p.category}</td>
                        <td className="p-3 font-extrabold text-slate-900">
                          €{(p.priceCents / 100).toFixed(2)}
                        </td>
                        <td className="p-3">
                          <span className={`font-bold ${p.stockQty && p.stockQty > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {p.stockQty != null ? `${p.stockQty} stuks` : 'Onbeperkt'}
                          </span>
                        </td>
                        <td className="p-3 max-w-xs">
                          <div className="flex items-center gap-2">
                            <div className="truncate text-slate-600 text-[11px] max-w-[180px]" title={currentDesc}>
                              {currentDesc}
                            </div>
                            <button
                              onClick={() => {
                                setEditingProduct(p);
                                setEditingDescriptionText(webshop.productDescriptions[p.id] || currentDesc);
                              }}
                              className={`px-2.5 py-1 rounded-xl text-[11px] font-bold border shrink-0 transition-colors flex items-center gap-1 ${
                                hasCustomDesc
                                  ? 'bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-100'
                                  : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                              }`}
                            >
                              <Edit3 size={12} />
                              <span>{hasCustomDesc ? 'Bewerken' : '+ Voeg toe'}</span>
                            </button>
                          </div>
                        </td>
                        <td className="p-3 text-center">
                          <button
                            type="button"
                            aria-pressed={!isUnpublished}
                            onClick={() => webshop.toggleProductPublished(p.id)}
                            className={`px-3 py-1 rounded-full text-[11px] font-black uppercase tracking-wider ${
                              !isUnpublished
                                ? 'bg-white text-slate-900 border border-slate-400'
                                : 'bg-slate-100 text-slate-500 border border-slate-200'
                            }`}
                          >
                            {!isUnpublished ? 'Online' : 'Verborgen'}
                          </button>
                        </td>
                        <td className="p-3 text-center">
                          <button
                            type="button"
                            aria-label={`${p.name} ${isFeatured ? 'niet meer uitlichten' : 'uitlichten'}`}
                            aria-pressed={isFeatured}
                            onClick={() => webshop.toggleProductFeatured(p.id)}
                            className={`p-1.5 rounded-lg border transition-colors ${
                              isFeatured
                                ? 'bg-slate-950 text-white border-slate-950'
                                : 'bg-slate-50 text-slate-400 border-slate-200 hover:text-slate-700'
                            }`}
                          >
                            <Star size={16} className={isFeatured ? 'fill-white' : ''} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB: KORTINGSCODES & ACTIES */}
      {activeTab === 'webshop-coupons' && (
        <div className="space-y-6">
          {/* KORTINGSCODES & ACTIES CARD */}
          <div className="bg-white p-5 md:p-6 rounded-xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-sky-50 text-sky-600 border border-sky-200 font-bold flex items-center justify-center">
                  <Tag size={20} />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">Kortingscodes</h3>
                  <p className="text-xs text-slate-500 font-medium">Beheer kortingscodes die klanten tijdens het afrekenen kunnen gebruiken.</p>
                </div>
              </div>

              <button
                onClick={() => setShowCouponModal(true)}
                className="px-4 py-2.5 bg-slate-950 hover:bg-black text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors"
              >
                <Plus size={15} />
                <span>Kortingscode toevoegen</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {webshop.coupons.map((coupon) => (
                <div
                  key={coupon.code}
                  className={`p-4 rounded-2xl border transition-all flex items-center justify-between ${
                    coupon.active ? 'bg-white border-slate-200 shadow-xs' : 'bg-slate-50 border-slate-200 opacity-60'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-black text-sm text-slate-900 bg-slate-100 px-2.5 py-0.5 rounded-md border border-slate-200">
                        {coupon.code}
                      </span>
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase ${
                        coupon.active ? 'bg-white text-slate-800 border border-slate-300' : 'bg-slate-200 text-slate-600'
                      }`}>
                        {coupon.active ? 'Actief' : 'Gepauzeerd'}
                      </span>
                    </div>

                    <div className="text-xs font-extrabold text-slate-900 pt-1">
                      {coupon.discountType === 'percent' ? `${coupon.value}% Korting` : `€${(coupon.value / 100).toFixed(2)} Korting`}
                      {coupon.minOrderCents ? ` (Vanaf €${(coupon.minOrderCents / 100).toFixed(2)})` : ''}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      aria-label={`Kortingscode ${coupon.code} ${coupon.active ? 'pauzeren' : 'activeren'}`}
                      aria-pressed={coupon.active}
                      onClick={() => {
                        webshop.toggleCouponActive(coupon.code);
                        triggerToast(`Kortingscode ${coupon.code} status gewijzigd.`);
                      }}
                      className={`relative w-10 h-5 rounded-full transition-colors ${
                        coupon.active ? 'bg-emerald-500' : 'bg-slate-300'
                      }`}
                    >
                      <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                        coupon.active ? 'translate-x-5' : 'translate-x-0'
                      }`} />
                    </button>

                    <button
                      type="button"
                      aria-label={`Kortingscode ${coupon.code} verwijderen`}
                      onClick={() => {
                        webshop.deleteCoupon(coupon.code);
                        triggerToast(`Kortingscode ${coupon.code} verwijderd.`);
                      }}
                      className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {webshop.coupons.length === 0 && (
              <div className="text-center py-10 text-slate-400">
                <Tag size={32} className="mx-auto mb-3 opacity-40" />
                <p className="text-xs font-bold">Nog geen kortingscodes aangemaakt.</p>
                <p className="text-[11px] font-medium mt-1">Klik op "Nieuwe Kortingscode" om te beginnen.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUB-TAB 4: VERZENDING & AFHALEN */}
      {activeTab === 'webshop-shipping' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white p-5 md:p-6 rounded-xl border border-slate-200 space-y-4 text-xs">
            <div className="flex items-center gap-2 font-black text-sm text-slate-900 pb-2 border-b border-slate-200">
              <Truck size={18} className="text-slate-500" />
              <span>Verzendtarieven</span>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Drempelbedrag Gratis Verzending (€)</label>
              <input
                type="number"
                value={webshop.freeShippingThresholdCents / 100}
                onChange={(e) => webshop.updateSettings({ freeShippingThresholdCents: Math.max(0, Math.round(parseFloat(e.target.value || '0') * 100)) })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 font-bold text-slate-900"
              />
              <p className="text-[11px] text-slate-500 mt-1">Bestellingen boven dit bedrag worden gratis geleverd.</p>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Standaard Verzendkosten (€)</label>
              <input
                type="number"
                step="0.01"
                value={(webshop.shippingFeeCents / 100).toFixed(2)}
                onChange={(e) => webshop.updateSettings({ shippingFeeCents: Math.max(0, Math.round(parseFloat(e.target.value || '0') * 100)) })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 font-bold text-slate-900"
              />
            </div>
          </div>

          <div className="bg-white p-5 md:p-6 rounded-xl border border-slate-200 space-y-4 text-xs">
            <div className="flex items-center gap-2 font-black text-sm text-slate-900 pb-2 border-b border-slate-200">
              <Building2 size={18} className="text-slate-500" />
              <span>Afhalen in de winkel</span>
            </div>

            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl border border-slate-200">
              <span className="font-bold">Afhalen in de winkel toestaan</span>
              <input
                type="checkbox"
                checked={webshop.pickupEnabled}
                onChange={(e) => webshop.updateSettings({ pickupEnabled: e.target.checked })}
                className="w-4 h-4 rounded text-sky-500"
              />
            </div>

            {webshop.pickupEnabled && (
              <>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Afhaaladres</label>
                  <input
                    type="text"
                    value={webshop.pickupAddress}
                    onChange={(e) => webshop.updateSettings({ pickupAddress: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 font-bold text-slate-900"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Afhaalinstructies voor Klanten</label>
                  <textarea
                    rows={2}
                    value={webshop.pickupInstructions}
                    onChange={(e) => webshop.updateSettings({ pickupInstructions: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 font-medium text-slate-900 text-xs"
                  />
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* SUB-TAB 5: BETAALMETHODEN */}
      {activeTab === 'webshop-payments' && (
        <div className="bg-white p-5 md:p-6 rounded-xl border border-slate-200 space-y-6">
          <div>
            <h3 className="text-base font-black text-slate-900">Betaalmethoden</h3>
            <p className="text-xs text-slate-500 font-medium">Kies welke betaalopties klanten tijdens het afrekenen zien.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-xs">
            {[
              { id: 'bancontact', label: 'Bancontact', badge: 'België' },
              { id: 'ideal', label: 'iDEAL', badge: 'Nederland' },
              { id: 'creditcard', label: 'Visa / Mastercard', badge: 'Internationaal' },
              { id: 'applepay', label: 'Apple Pay / Google Pay', badge: 'Mobiel' },
              { id: 'klarna', label: 'Klarna', badge: 'Achteraf betalen' },
              { id: 'payOnPickup', label: 'Betalen bij afhalen', badge: 'In de winkel' },
            ].map((pm) => {
              const active = webshop.paymentMethods[pm.id as keyof typeof webshop.paymentMethods];
              return (
                <button
                  type="button"
                  key={pm.id}
                  onClick={() => {
                    const next = { ...webshop.paymentMethods, [pm.id]: !active };
                    webshop.updateSettings({ paymentMethods: next });
                    triggerToast(`Betaalmethode gewijzigd.`);
                  }}
                  aria-pressed={active}
                  className={`p-4 rounded-xl border cursor-pointer text-left transition-all flex items-center justify-between ${
                    active
                      ? 'border-slate-950 bg-white ring-1 ring-slate-950'
                      : 'border-slate-200 bg-slate-50 text-slate-500'
                  }`}
                >
                  <div className="space-y-1">
                    <span className="font-black text-sm text-slate-900">{pm.label}</span>
                    <div className="text-[10px] text-slate-500 font-bold">{pm.badge}</div>
                  </div>

                  <div className={`w-6 h-6 rounded-full flex items-center justify-center border ${
                    active ? 'bg-slate-950 border-slate-950 text-white' : 'border-slate-300'
                  }`}>
                    {active && <Check size={14} />}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* SUB-TAB 6: DOMEIN & LIVE URL */}
      {activeTab === 'webshop-domain' && (
        <div className="bg-white p-5 md:p-6 rounded-xl border border-slate-200 space-y-6 text-xs">
          <div>
            <h3 className="text-base font-black text-slate-900">Domein en webadres</h3>
            <p className="text-slate-500 font-medium">Kies een Pwayment-adres of koppel uw eigen domeinnaam.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
              <div className="font-extrabold text-sm text-slate-900">Pwayment-adres</div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={webshop.subdomain}
                  onChange={(e) => webshop.updateSettings({ subdomain: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
                  className="px-3 py-2 rounded-xl bg-white border border-slate-200 font-mono font-bold text-sky-600 flex-1"
                />
                <span className="font-mono text-slate-500 font-bold">.pwayment.shop</span>
              </div>
              <p className="text-[11px] text-slate-500">Huidig webadres: <a href="/shop" target="_blank" rel="noreferrer" className="text-slate-900 underline font-bold">{window.location.origin}/shop</a></p>
            </div>

            <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
              <div className="flex items-center justify-between">
                <div className="font-extrabold text-sm text-slate-900">Eigen domein</div>
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${webshop.domainStatus === 'connected' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                  {webshop.domainStatus === 'connected' ? 'Gekoppeld' : webshop.domainStatus === 'pending' ? 'Wordt gecontroleerd' : 'Niet gekoppeld'}
                </span>
              </div>

              <input
                type="text"
                value={webshop.customDomain}
                onChange={(e) => webshop.updateSettings({ customDomain: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 font-mono font-bold text-slate-900"
              />

              <div className="p-3 bg-white rounded-xl border border-slate-200 text-[11px] space-y-1 font-mono">
                <div className="font-bold text-slate-700">DNS CNAME Record Instellen:</div>
                <div className="text-slate-500">Host: www | Type: CNAME | Target: cname.pwayment.shop</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* WEBSHOP PREVIEW MODAL */}
      <WebshopPreviewModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
      />

      {/* UPGRADE REQUIRED MODAL */}
      {showUpgradeModal && (
        <div className="fixed inset-0 z-60 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Abonnement vereist">
          <div className="w-full max-w-md bg-white text-slate-900 rounded-xl p-6 shadow-2xl border border-slate-200 space-y-5 relative animate-in zoom-in-95 duration-150">
            <button
              onClick={() => setShowUpgradeModal(false)}
              aria-label="Venster sluiten"
              className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-700 rounded-full bg-slate-100"
            >
              <X size={18} />
            </button>

            <div className="w-12 h-12 rounded-lg bg-slate-100 text-slate-600 font-bold flex items-center justify-center border border-slate-200">
              <Lock size={28} />
            </div>

            <div className="space-y-1.5">
              <h3 className="text-xl font-black text-slate-900">Ander abonnement vereist</h3>
              <p className="text-xs text-slate-600 font-medium leading-relaxed">
                Het live publiceren van uw webshop op internet en het verwerken van online bestellingen is een functie van <strong>Retail Professional</strong> en <strong>Enterprise & Ketens</strong>.
              </p>
            </div>

            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 text-xs space-y-2">
              <div className="font-extrabold text-slate-900">Inbegrepen in Retail Professional:</div>
              <ul className="space-y-1 text-slate-600 font-medium list-disc pl-4">
                <li>Live Webshop publiceren op eigen domein</li>
                <li>Realtime POS & Webshop voorraadsynchronisatie</li>
                <li>Online betalingen (Bancontact, iDEAL, Creditcard)</li>
              </ul>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => {
                  setShowUpgradeModal(false);
                  onTabChange('billing-plan');
                }}
                className="flex-1 py-3.5 px-4 bg-slate-900 hover:bg-black text-white rounded-2xl text-xs font-extrabold shadow-md flex items-center justify-center gap-2 transition-all active:scale-95"
              >
                <Zap size={15} />
                <span>Abonnementen bekijken</span>
              </button>

              <button
                onClick={() => setShowUpgradeModal(false)}
                className="py-3.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl text-xs font-bold transition-all"
              >
                Sluiten
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT PRODUCT DESCRIPTION MODAL */}
      {editingProduct && (
        <div className="fixed inset-0 z-60 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Productbeschrijving bewerken">
          <div className="w-full max-w-lg bg-white text-slate-900 rounded-xl p-6 shadow-2xl border border-slate-200 space-y-5 relative animate-in zoom-in-95 duration-150">
            <button
              onClick={() => setEditingProduct(null)}
              aria-label="Venster sluiten"
              className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-700 rounded-full bg-slate-100"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-lg bg-slate-100 text-slate-600 font-bold flex items-center justify-center border border-slate-200 shrink-0">
                <FileText size={22} />
              </div>
              <div className="space-y-0.5">
                <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider">{editingProduct.category}</span>
                <h3 className="text-lg font-black text-slate-900">{editingProduct.name}</h3>
              </div>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between font-bold text-slate-700">
                <label>Webshop Productbeschrijving</label>
                <button
                  type="button"
                  onClick={() => {
                    setEditingDescriptionText(
                      `Hoogwaardige en stijlvolle ${editingProduct.name} uit de categorie ${editingProduct.category}. Zorgvuldig geselecteerd voor onze online webshop met focus op kwaliteit en pasvorm.`
                    );
                    triggerToast('Sjabloon tekst ingevuld!');
                  }}
                  className="text-[11px] text-slate-600 hover:text-slate-950 hover:underline flex items-center gap-1"
                >
                  <FilePenLine size={12} />
                  <span>Tekstsuggestie gebruiken</span>
                </button>
              </div>

              <textarea
                rows={5}
                value={editingDescriptionText}
                onChange={(e) => setEditingDescriptionText(e.target.value)}
                placeholder="Typ hier de uitgebreide productbeschrijving voor uw webshop bezoekers..."
                className="w-full p-4 rounded-2xl bg-slate-50 border border-slate-200 font-medium text-slate-900 text-xs focus:ring-2 focus:ring-sky-500/50 leading-relaxed"
              />
              <p className="text-[11px] text-slate-500">
                Deze beschrijving wordt direct getoond in de webshop wanneer een klant het artikel bekijkt.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setEditingProduct(null)}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-2xl text-xs"
              >
                Annuleren
              </button>
              <button
                onClick={() => {
                  webshop.setProductDescription(editingProduct.id, editingDescriptionText);
                  setEditingProduct(null);
                  triggerToast('Productbeschrijving succesvol opgeslagen!');
                }}
                className="px-5 py-2.5 bg-slate-900 hover:bg-black text-white font-extrabold rounded-2xl text-xs shadow-md flex items-center gap-1.5"
              >
                <CheckCircle2 size={15} />
                <span>Beschrijving Opslaan</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* IMAGE PICKER MODAL */}
      {imagePickerProduct && (
        <div className="fixed inset-0 z-60 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Productfoto bewerken">
          <div className="w-full max-w-md bg-white text-slate-900 rounded-xl p-6 shadow-2xl border border-slate-200 space-y-5 relative animate-in zoom-in-95 duration-150">
            <button
              onClick={() => setImagePickerProduct(null)}
              aria-label="Venster sluiten"
              className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-700 rounded-full bg-slate-100"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-lg bg-slate-100 text-slate-600 font-bold flex items-center justify-center border border-slate-200 shrink-0">
                <ImageIcon size={22} />
              </div>
              <div className="space-y-0.5">
                <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Productfoto</span>
                <h3 className="text-lg font-black text-slate-900">{imagePickerProduct.name}</h3>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Afbeelding URL</label>
                <input
                  type="text"
                  value={customImageUrl}
                  onChange={(e) => setCustomImageUrl(e.target.value)}
                  placeholder="https://images.unsplash.com/..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 font-mono text-[11px] text-slate-900"
                />
              </div>

              <div className="space-y-1.5 pt-1">
                <label className="block font-extrabold text-slate-900">Of kies een voorbeeldafbeelding</label>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { label: 'Deck', url: 'https://images.unsplash.com/photo-1547447134-cd3f5c716030?auto=format&fit=crop&w=800&q=80' },
                    { label: 'Hoodie', url: 'https://images.unsplash.com/photo-1556905055-8f358a7a47b2?auto=format&fit=crop&w=800&q=80' },
                    { label: 'Sneakers', url: 'https://images.unsplash.com/photo-1552346154-21d32810aba3?auto=format&fit=crop&w=800&q=80' },
                    { label: 'Wheels', url: 'https://images.unsplash.com/photo-1564859228273-274232fdb516?auto=format&fit=crop&w=800&q=80' },
                  ].map((preset) => (
                    <button
                      key={preset.label}
                      onClick={() => setCustomImageUrl(preset.url)}
                      className={`h-16 rounded-xl overflow-hidden border-2 relative transition-all ${
                        customImageUrl === preset.url ? 'border-slate-950 ring-1 ring-slate-950' : 'border-slate-200 opacity-80 hover:opacity-100'
                      }`}
                    >
                      <img src={preset.url} alt={preset.label} className="w-full h-full object-cover" />
                      <span className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[9px] font-black text-center py-0.5">
                        {preset.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setImagePickerProduct(null)}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-2xl text-xs"
              >
                Annuleren
              </button>
              <button
                onClick={() => {
                  webshop.setProductImage(imagePickerProduct.id, customImageUrl);
                  setImagePickerProduct(null);
                  triggerToast('Productfoto succesvol opgeslagen!');
                }}
                className="px-5 py-2.5 bg-slate-900 hover:bg-black text-white font-extrabold rounded-2xl text-xs shadow-md flex items-center gap-1.5"
              >
                <CheckCircle2 size={15} />
                <span>Foto Opslaan</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CREATE NEW COUPON MODAL */}
      {showCouponModal && (
        <div className="fixed inset-0 z-60 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Kortingscode toevoegen">
          <div className="w-full max-w-md bg-white text-slate-900 rounded-xl p-6 shadow-2xl border border-slate-200 space-y-5 relative animate-in zoom-in-95 duration-150">
            <button
              onClick={() => setShowCouponModal(false)}
              aria-label="Venster sluiten"
              className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-700 rounded-full bg-slate-100"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-lg bg-slate-100 text-slate-600 font-bold flex items-center justify-center border border-slate-200 shrink-0">
                <Tag size={22} />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-900">Kortingscode toevoegen</h3>
                <p className="text-xs text-slate-500 font-medium">Maak een code die klanten tijdens het afrekenen kunnen gebruiken.</p>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Kortingscode (in hoofdletters)</label>
                <input
                  type="text"
                  value={newCouponCode}
                  onChange={(e) => setNewCouponCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                  placeholder="bijv. ZOMER10"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 font-mono font-bold text-slate-900 uppercase"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Korting Type</label>
                  <select
                    value={newCouponType}
                    onChange={(e) => setNewCouponType(e.target.value as any)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 font-bold"
                  >
                    <option value="percent">Percentage (%)</option>
                    <option value="fixed">Vast bedrag (€)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Waarde ({newCouponType === 'percent' ? '%' : '€'})
                  </label>
                  <input
                    type="number"
                    min="0.01"
                    max={newCouponType === 'percent' ? '100' : undefined}
                    step={newCouponType === 'percent' ? '1' : '0.01'}
                    value={newCouponValue}
                    onChange={(e) => setNewCouponValue(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Minimaal Bestelbedrag (€)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                  value={newCouponMinOrder}
                  onChange={(e) => setNewCouponMinOrder(e.target.value)}
                  placeholder="0 voor geen minimum"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 font-medium"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setShowCouponModal(false)}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-2xl text-xs"
              >
                Annuleren
              </button>
              <button
                disabled={!newCouponCode}
                onClick={() => {
                  const valNum = parseFloat(newCouponValue) || 0;
                  const minNum = Math.max(0, parseFloat(newCouponMinOrder) || 0);
                  if (valNum <= 0 || (newCouponType === 'percent' && valNum > 100)) {
                    triggerToast(newCouponType === 'percent' ? 'Kies een percentage tussen 1 en 100.' : 'Kies een positief kortingsbedrag.');
                    return;
                  }
                  if (webshop.coupons.some((coupon) => coupon.code === newCouponCode)) {
                    triggerToast(`Kortingscode ${newCouponCode} bestaat al.`);
                    return;
                  }
                  const newCoupon: DiscountCoupon = {
                    code: newCouponCode,
                    discountType: newCouponType,
                    value: newCouponType === 'percent' ? valNum : Math.round(valNum * 100),
                    minOrderCents: Math.round(minNum * 100),
                    active: true,
                  };
                  webshop.addCoupon(newCoupon);
                  setShowCouponModal(false);
                  setNewCouponCode('');
                  triggerToast(`Kortingscode ${newCoupon.code} aangemaakt!`);
                }}
                className="px-5 py-2.5 bg-slate-900 hover:bg-black text-white font-extrabold rounded-2xl text-xs shadow-md disabled:opacity-50 flex items-center gap-1.5"
              >
                <CheckCircle2 size={15} />
                <span>Kortingscode Opslaan</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
