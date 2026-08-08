import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  BatteryCharging,
  CreditCard,
  Eye,
  Pencil,
  Plus,
  Power,
  PowerOff,
  Receipt,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { useCustomers, generateId, generateGiftCardCode } from '../store/useCustomers';
import { Customer, GiftCard, Transaction } from '../types';
import { formatEUR, parseDecimalToCents } from '../utils/money';
import {
  DEFAULT_CUSTOMER_FILTERS,
  DEFAULT_GIFT_CARD_FILTERS,
  filterAndSortCustomers,
  filterAndSortGiftCards,
  type CustomerListFilters,
  type CustomerSortKey,
  type GiftCardListFilters,
  type GiftCardSortKey,
  type SortDirection,
} from '../utils/customerFilters';
import { Modal } from './Modal';
import { db } from '../db/db';
const parseCents = (txt: string): number => {
  const norm = txt.replace(/\./g, '').replace(',', '.').trim();
  const n = parseFloat(norm);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
};

const optionalCents = (txt: string): number | undefined => {
  if (!txt.trim()) return undefined;
  const parsed = parseDecimalToCents(txt);
  return parsed.ok ? parsed.cents : undefined;
};

const dateInputDaysAgo = (days: number): string => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const customerDirectionLabel = (key: CustomerSortKey, direction: SortDirection): string => {
  if (key === 'name') return direction === 'asc' ? 'A–Z' : 'Z–A';
  if (key === 'lastVisit' || key === 'createdAt') return direction === 'asc' ? 'Oud–nieuw' : 'Nieuw–oud';
  return direction === 'asc' ? 'Laag–hoog' : 'Hoog–laag';
};

const giftCardDirectionLabel = (key: GiftCardSortKey, direction: SortDirection): string => {
  if (key === 'code' || key === 'customer') return direction === 'asc' ? 'A–Z' : 'Z–A';
  if (key === 'issuedAt' || key === 'expiresAt') return direction === 'asc' ? 'Oud–nieuw' : 'Nieuw–oud';
  return direction === 'asc' ? 'Laag–hoog' : 'Hoog–laag';
};

export const Customers: React.FC = () => {
  const {
    customers,
    giftCards,
    hydrate,
    upsertCustomer,
    removeCustomer,
    restoreCustomer,
    addGiftCard,
    rechargeGiftCard,
    deactivateGiftCard,
    activateGiftCard,
  } = useCustomers();

  const [activeTab, setActiveTab] = useState<'customers' | 'gift_cards'>('customers');
  const [customerFilters, setCustomerFilters] = useState<CustomerListFilters>(DEFAULT_CUSTOMER_FILTERS);
  const [giftCardFilters, setGiftCardFilters] = useState<GiftCardListFilters>(DEFAULT_GIFT_CARD_FILTERS);
  const [showCustomerFilters, setShowCustomerFilters] = useState(false);
  const [showGiftCardFilters, setShowGiftCardFilters] = useState(false);
  const [customerMinSpentText, setCustomerMinSpentText] = useState('');
  const [customerMaxSpentText, setCustomerMaxSpentText] = useState('');
  const [giftCardMinBalanceText, setGiftCardMinBalanceText] = useState('');
  const [giftCardMaxBalanceText, setGiftCardMaxBalanceText] = useState('');

  const [editingCustomer, setEditingCustomer] = useState<Partial<Customer> | null>(null);
  const [editingGiftCard, setEditingGiftCard] = useState<Partial<GiftCard> & { initialText?: string } | null>(null);
  const [rechargeGC, setRechargeGC] = useState<GiftCard | null>(null);
  const [rechargeAmountText, setRechargeAmountText] = useState('0,00');

  const [viewingCustomer, setViewingCustomer] = useState<Customer | null>(null);
  const [customerTransactions, setCustomerTransactions] = useState<Transaction[]>([]);
  const [loadingTransactions, setLoadingTransactions] = useState(false);

  useEffect(() => {
    if (viewingCustomer) {
      setLoadingTransactions(true);
      db.transactions
        .filter(t => t.customerId === viewingCustomer.id && t.isFinalized === 1)
        .reverse()
        .toArray()
        .then(setCustomerTransactions)
        .finally(() => setLoadingTransactions(false));
    } else {
      setCustomerTransactions([]);
    }
  }, [viewingCustomer]);

  const customerGiftCards = useMemo(() => {
    if (!viewingCustomer) return [];
    return giftCards.filter(gc => gc.customerId === viewingCustomer.id);
  }, [giftCards, viewingCustomer]);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const effectiveCustomerFilters = useMemo<CustomerListFilters>(() => ({
    ...customerFilters,
    minSpentCents: optionalCents(customerMinSpentText),
    maxSpentCents: optionalCents(customerMaxSpentText),
  }), [customerFilters, customerMinSpentText, customerMaxSpentText]);

  const filteredCustomers = useMemo(
    () => filterAndSortCustomers(customers, giftCards, effectiveCustomerFilters),
    [customers, giftCards, effectiveCustomerFilters],
  );

  const customerStats = useMemo(() => {
    const totalSpent = filteredCustomers.reduce((acc, row) => acc + row.customer.totalSpentCents, 0);
    const avgSpent = filteredCustomers.length > 0 ? totalSpent / filteredCustomers.length : 0;
    return { count: filteredCustomers.length, totalSpent, avgSpent };
  }, [filteredCustomers]);

  const effectiveGiftCardFilters = useMemo<GiftCardListFilters>(() => ({
    ...giftCardFilters,
    minBalanceCents: optionalCents(giftCardMinBalanceText),
    maxBalanceCents: optionalCents(giftCardMaxBalanceText),
  }), [giftCardFilters, giftCardMinBalanceText, giftCardMaxBalanceText]);

  const filteredGiftCards = useMemo(
    () => filterAndSortGiftCards(giftCards, customers, effectiveGiftCardFilters),
    [giftCards, customers, effectiveGiftCardFilters],
  );

  const gcStats = useMemo(() => {
    const active = filteredGiftCards.filter(row => row.giftCard.isActive && !row.isExpired && row.giftCard.balanceCents > 0);
    const totalBalance = filteredGiftCards.reduce((acc, row) => acc + row.giftCard.balanceCents, 0);
    return { count: filteredGiftCards.length, activeCount: active.length, totalBalance };
  }, [filteredGiftCards]);

  const changeCustomerSort = (key: CustomerSortKey) => {
    setCustomerFilters((current) => ({
      ...current,
      sortKey: key,
      sortDirection:
        current.sortKey === key
          ? current.sortDirection === 'asc' ? 'desc' : 'asc'
          : key === 'name' ? 'asc' : 'desc',
    }));
  };

  const changeGiftCardSort = (key: GiftCardSortKey) => {
    setGiftCardFilters((current) => ({
      ...current,
      sortKey: key,
      sortDirection:
        current.sortKey === key
          ? current.sortDirection === 'asc' ? 'desc' : 'asc'
          : key === 'code' || key === 'customer' ? 'asc' : 'desc',
    }));
  };

  const resetCustomerFilters = () => {
    setCustomerFilters(DEFAULT_CUSTOMER_FILTERS);
    setCustomerMinSpentText('');
    setCustomerMaxSpentText('');
  };

  const resetGiftCardFilters = () => {
    setGiftCardFilters(DEFAULT_GIFT_CARD_FILTERS);
    setGiftCardMinBalanceText('');
    setGiftCardMaxBalanceText('');
  };

  const customerActiveChips: Array<{ key: string; label: string; clear: () => void }> = [];
  if (customerFilters.status !== 'active') {
    customerActiveChips.push({
      key: 'status',
      label: customerFilters.status === 'all' ? 'Alle statussen' : 'Gearchiveerd',
      clear: () => setCustomerFilters((current) => ({ ...current, status: 'active' })),
    });
  }
  if (customerFilters.activity !== 'all') {
    const labels = {
      'recent-30': 'Bezoek < 30 dagen',
      'cooling-30-59': 'Bezoek 30–59 dagen',
      'dormant-60': '60+ dagen inactief',
      never: 'Nooit bezocht',
    } as const;
    customerActiveChips.push({
      key: 'activity',
      label: labels[customerFilters.activity],
      clear: () => setCustomerFilters((current) => ({ ...current, activity: 'all' })),
    });
  }
  if (customerFilters.purchases !== 'all') {
    const labels = {
      none: 'Geen aankopen',
      'one-time': 'Eenmalige klant',
      returning: 'Terugkerend (2+)',
      loyal: 'Loyaal (3+)',
    } as const;
    customerActiveChips.push({
      key: 'purchases',
      label: labels[customerFilters.purchases],
      clear: () => setCustomerFilters((current) => ({ ...current, purchases: 'all' })),
    });
  }
  if (customerFilters.contact !== 'all') {
    const labels = {
      complete: 'Contact volledig',
      incomplete: 'Contact onvolledig',
      'missing-email': 'E-mail ontbreekt',
      'missing-phone': 'Telefoon ontbreekt',
    } as const;
    customerActiveChips.push({
      key: 'contact',
      label: labels[customerFilters.contact],
      clear: () => setCustomerFilters((current) => ({ ...current, contact: 'all' })),
    });
  }
  if (customerFilters.giftCards !== 'all') {
    const labels = {
      'has-card': 'Met cadeaubon',
      'open-balance': 'Met openstaand saldo',
      'no-card': 'Zonder cadeaubon',
      blocked: 'Met geblokkeerde bon',
    } as const;
    customerActiveChips.push({
      key: 'giftCards',
      label: labels[customerFilters.giftCards],
      clear: () => setCustomerFilters((current) => ({ ...current, giftCards: 'all' })),
    });
  }
  if (customerMinSpentText) {
    customerActiveChips.push({
      key: 'minSpent',
      label: `Min. besteed ${customerMinSpentText}`,
      clear: () => setCustomerMinSpentText(''),
    });
  }
  if (customerMaxSpentText) {
    customerActiveChips.push({
      key: 'maxSpent',
      label: `Max. besteed ${customerMaxSpentText}`,
      clear: () => setCustomerMaxSpentText(''),
    });
  }
  if (customerFilters.createdFrom) {
    customerActiveChips.push({
      key: 'createdFrom',
      label: `Klant vanaf ${customerFilters.createdFrom}`,
      clear: () => setCustomerFilters((current) => ({ ...current, createdFrom: undefined })),
    });
  }
  if (customerFilters.createdTo) {
    customerActiveChips.push({
      key: 'createdTo',
      label: `Klant t/m ${customerFilters.createdTo}`,
      clear: () => setCustomerFilters((current) => ({ ...current, createdTo: undefined })),
    });
  }

  const giftCardActiveChips: Array<{ key: string; label: string; clear: () => void }> = [];
  if (giftCardFilters.status !== 'all') {
    const labels = { active: 'Actief', empty: 'Leeg', blocked: 'Geblokkeerd', expired: 'Verlopen' } as const;
    giftCardActiveChips.push({
      key: 'status',
      label: labels[giftCardFilters.status],
      clear: () => setGiftCardFilters((current) => ({ ...current, status: 'all' })),
    });
  }
  if (giftCardFilters.owner !== 'all') {
    giftCardActiveChips.push({
      key: 'owner',
      label: giftCardFilters.owner === 'linked' ? 'Gekoppeld aan klant' : 'Anonieme bon',
      clear: () => setGiftCardFilters((current) => ({ ...current, owner: 'all' })),
    });
  }
  if (giftCardFilters.expiry !== 'all') {
    const labels = { 'next-30': 'Vervalt binnen 30 dagen', expired: 'Verlopen', 'no-expiry': 'Geen vervaldatum' } as const;
    giftCardActiveChips.push({
      key: 'expiry',
      label: labels[giftCardFilters.expiry],
      clear: () => setGiftCardFilters((current) => ({ ...current, expiry: 'all' })),
    });
  }
  if (giftCardMinBalanceText) {
    giftCardActiveChips.push({ key: 'minBalance', label: `Min. saldo ${giftCardMinBalanceText}`, clear: () => setGiftCardMinBalanceText('') });
  }
  if (giftCardMaxBalanceText) {
    giftCardActiveChips.push({ key: 'maxBalance', label: `Max. saldo ${giftCardMaxBalanceText}`, clear: () => setGiftCardMaxBalanceText('') });
  }

  const handleSaveCustomer = async () => {
    if (!editingCustomer?.name?.trim()) {
      alert('Naam is verplicht.');
      return;
    }
    const customerToSave: Customer = {
      id: editingCustomer.id || generateId(),
      name: editingCustomer.name,
      email: editingCustomer.email,
      phone: editingCustomer.phone,
      address: editingCustomer.address,
      notes: editingCustomer.notes,
      totalSpentCents: editingCustomer.totalSpentCents || 0,
      visitCount: editingCustomer.visitCount || 0,
      lastVisitAt: editingCustomer.lastVisitAt,
      createdAt: editingCustomer.createdAt || new Date().toISOString(),
      isActive: editingCustomer.isActive ?? true,
    };
    await upsertCustomer(customerToSave);
    setEditingCustomer(null);
  };

  const handleSaveGiftCard = async () => {
    if (!editingGiftCard) return;
    const initialCents = parseCents(editingGiftCard.initialText || '0,00');
    if (initialCents <= 0) {
      alert('Bedrag moet groter zijn dan 0.');
      return;
    }
    const card: GiftCard = {
      id: generateId(),
      code: editingGiftCard.code || generateGiftCardCode(),
      customerId: editingGiftCard.customerId || undefined,
      initialCents,
      balanceCents: initialCents,
      issuedAt: new Date().toISOString(),
      expiresAt: editingGiftCard.expiresAt || undefined,
      isActive: true,
    };
    await addGiftCard(card);
    setEditingGiftCard(null);
  };

  const handleRechargeGiftCard = async () => {
    if (!rechargeGC) return;
    const cents = parseCents(rechargeAmountText);
    if (cents <= 0) {
      alert('Bedrag moet groter zijn dan 0.');
      return;
    }
    await rechargeGiftCard(rechargeGC.id, cents);
    setRechargeGC(null);
  };

  return (
    <div className="flex-1 overflow-y-auto bg-zinc-950 text-white p-4 sm:p-6">
      <div className="max-w-7xl mx-auto space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Klantenbeheer</h1>
            <p className="text-sm text-zinc-400">Beheer klanten, winkelgeschiedenis en cadeaubonnen.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {activeTab === 'customers' ? (
              <button onClick={() => setEditingCustomer({ isActive: true })} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 font-semibold">
                <Plus size={18} /> Nieuwe klant
              </button>
            ) : (
              <button onClick={() => setEditingGiftCard({ code: generateGiftCardCode(), initialText: '0,00' })} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 font-semibold">
                <Plus size={18} /> Nieuwe cadeaubon
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 rounded-xl border border-zinc-800 bg-zinc-900 p-1">
          <AdminTab icon={<Users size={16} />} label="Klanten" active={activeTab === 'customers'} onClick={() => setActiveTab('customers')} />
          <AdminTab icon={<CreditCard size={16} />} label="Cadeaubonnen" active={activeTab === 'gift_cards'} onClick={() => setActiveTab('gift_cards')} />
        </div>

        {activeTab === 'customers' && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Kpi label="Klanten in selectie" value={`${customerStats.count} / ${customers.length}`} />
              <Kpi label="Besteed door selectie" value={formatEUR(customerStats.totalSpent)} />
              <Kpi label="Gemiddelde klantwaarde" value={formatEUR(customerStats.avgSpent)} />
            </div>

            <div className="space-y-3 bg-zinc-900 border border-zinc-800 rounded-xl p-3">
              <div className="flex flex-wrap gap-2">
                <div className="relative flex-1 min-w-[240px]">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                  <input
                    type="search"
                    value={customerFilters.query}
                    onChange={(e) => setCustomerFilters((current) => ({ ...current, query: e.target.value }))}
                    placeholder="Zoek naam, e-mail, telefoon, adres of notitie..."
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-9 pr-3 py-2 text-sm"
                  />
                </div>
                <select
                  aria-label="Klantstatus"
                  value={customerFilters.status}
                  onChange={(e) => setCustomerFilters((current) => ({ ...current, status: e.target.value as CustomerListFilters['status'] }))}
                  className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="active">Actieve klanten</option>
                  <option value="archived">Gearchiveerde klanten</option>
                  <option value="all">Alle statussen</option>
                </select>
                <select
                  aria-label="Klanten sorteren"
                  value={customerFilters.sortKey}
                  onChange={(e) => setCustomerFilters((current) => ({ ...current, sortKey: e.target.value as CustomerSortKey }))}
                  className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="totalSpent">Totaal besteed</option>
                  <option value="averageSpend">Gem. besteding</option>
                  <option value="visitCount">Aantal bezoeken</option>
                  <option value="lastVisit">Laatste bezoek</option>
                  <option value="createdAt">Klant sinds</option>
                  <option value="giftCardBalance">Cadeaubonsaldo</option>
                  <option value="name">Naam</option>
                </select>
                <DirectionButton
                  direction={customerFilters.sortDirection}
                  label={customerDirectionLabel(customerFilters.sortKey, customerFilters.sortDirection)}
                  onClick={() => setCustomerFilters((current) => ({
                    ...current,
                    sortDirection: current.sortDirection === 'asc' ? 'desc' : 'asc',
                  }))}
                />
                <button
                  onClick={() => setShowCustomerFilters((open) => !open)}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold ${
                    showCustomerFilters || customerActiveChips.length > 0
                      ? 'border-blue-500/50 bg-blue-500/10 text-blue-200'
                      : 'border-zinc-800 bg-zinc-950 text-zinc-300 hover:bg-zinc-800'
                  }`}
                >
                  <SlidersHorizontal size={16} /> Filters
                  {customerActiveChips.length > 0 && (
                    <span className="rounded-full bg-blue-500 px-1.5 py-0.5 text-[10px] text-white">{customerActiveChips.length}</span>
                  )}
                </button>
                <button
                  onClick={resetCustomerFilters}
                  disabled={customerActiveChips.length === 0 && !customerFilters.query}
                  className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-400 hover:bg-zinc-800 disabled:opacity-30"
                >
                  Wissen
                </button>
              </div>

              <div className="flex flex-wrap gap-2">
                <QuickFilterButton
                  label="Topklanten"
                  active={customerFilters.sortKey === 'totalSpent' && customerFilters.sortDirection === 'desc'}
                  onClick={() => setCustomerFilters((current) => ({ ...current, status: 'active', sortKey: 'totalSpent', sortDirection: 'desc' }))}
                />
                <QuickFilterButton
                  label="Recent actief"
                  active={customerFilters.activity === 'recent-30'}
                  onClick={() => setCustomerFilters((current) => ({ ...current, activity: current.activity === 'recent-30' ? 'all' : 'recent-30' }))}
                />
                <QuickFilterButton
                  label="60+ dagen niet geweest"
                  active={customerFilters.activity === 'dormant-60'}
                  onClick={() => setCustomerFilters((current) => ({ ...current, activity: current.activity === 'dormant-60' ? 'all' : 'dormant-60' }))}
                />
                <QuickFilterButton
                  label="Nieuwe klanten"
                  active={customerFilters.createdFrom === dateInputDaysAgo(30)}
                  onClick={() => setCustomerFilters((current) => ({
                    ...current,
                    createdFrom: current.createdFrom === dateInputDaysAgo(30) ? undefined : dateInputDaysAgo(30),
                    createdTo: undefined,
                  }))}
                />
                <QuickFilterButton
                  label="Nooit gekocht"
                  active={customerFilters.purchases === 'none'}
                  onClick={() => setCustomerFilters((current) => ({ ...current, purchases: current.purchases === 'none' ? 'all' : 'none' }))}
                />
                <QuickFilterButton
                  label="Contact aanvullen"
                  active={customerFilters.contact === 'incomplete'}
                  onClick={() => setCustomerFilters((current) => ({ ...current, contact: current.contact === 'incomplete' ? 'all' : 'incomplete' }))}
                />
              </div>

              {showCustomerFilters && (
                <div className="grid grid-cols-1 gap-3 rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 sm:grid-cols-2 lg:grid-cols-4">
                  <FilterField label="Laatste activiteit">
                    <select
                      value={customerFilters.activity}
                      onChange={(e) => setCustomerFilters((current) => ({ ...current, activity: e.target.value as CustomerListFilters['activity'] }))}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm"
                    >
                      <option value="all">Alle activiteit</option>
                      <option value="recent-30">Laatste 30 dagen</option>
                      <option value="cooling-30-59">30–59 dagen geleden</option>
                      <option value="dormant-60">60+ dagen geleden</option>
                      <option value="never">Nooit bezocht</option>
                    </select>
                  </FilterField>
                  <FilterField label="Aankoopfrequentie">
                    <select
                      value={customerFilters.purchases}
                      onChange={(e) => setCustomerFilters((current) => ({ ...current, purchases: e.target.value as CustomerListFilters['purchases'] }))}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm"
                    >
                      <option value="all">Alle klanten</option>
                      <option value="none">Geen aankopen</option>
                      <option value="one-time">Eén aankoop</option>
                      <option value="returning">Terugkerend (2+)</option>
                      <option value="loyal">Loyaal (3+)</option>
                    </select>
                  </FilterField>
                  <FilterField label="Contactgegevens">
                    <select
                      value={customerFilters.contact}
                      onChange={(e) => setCustomerFilters((current) => ({ ...current, contact: e.target.value as CustomerListFilters['contact'] }))}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm"
                    >
                      <option value="all">Alle contactstatussen</option>
                      <option value="complete">E-mail + telefoon aanwezig</option>
                      <option value="incomplete">Contact onvolledig</option>
                      <option value="missing-email">E-mail ontbreekt</option>
                      <option value="missing-phone">Telefoon ontbreekt</option>
                    </select>
                  </FilterField>
                  <FilterField label="Cadeaubonnen">
                    <select
                      value={customerFilters.giftCards}
                      onChange={(e) => setCustomerFilters((current) => ({ ...current, giftCards: e.target.value as CustomerListFilters['giftCards'] }))}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm"
                    >
                      <option value="all">Alle klanten</option>
                      <option value="has-card">Met cadeaubon</option>
                      <option value="open-balance">Met openstaand saldo</option>
                      <option value="no-card">Zonder cadeaubon</option>
                      <option value="blocked">Met geblokkeerde bon</option>
                    </select>
                  </FilterField>
                  <FilterField label="Min. totaal besteed (€)">
                    <input inputMode="decimal" value={customerMinSpentText} onChange={(e) => setCustomerMinSpentText(e.target.value)} placeholder="0,00" className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm" />
                  </FilterField>
                  <FilterField label="Max. totaal besteed (€)">
                    <input inputMode="decimal" value={customerMaxSpentText} onChange={(e) => setCustomerMaxSpentText(e.target.value)} placeholder="Geen maximum" className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm" />
                  </FilterField>
                  <FilterField label="Klant vanaf">
                    <input type="date" value={customerFilters.createdFrom ?? ''} onChange={(e) => setCustomerFilters((current) => ({ ...current, createdFrom: e.target.value || undefined }))} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm" />
                  </FilterField>
                  <FilterField label="Klant tot en met">
                    <input type="date" value={customerFilters.createdTo ?? ''} onChange={(e) => setCustomerFilters((current) => ({ ...current, createdTo: e.target.value || undefined }))} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm" />
                  </FilterField>
                </div>
              )}

              {customerActiveChips.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  {customerActiveChips.map((chip) => <FilterChip key={chip.key} label={chip.label} onClear={chip.clear} />)}
                  <span className="ml-auto text-xs text-zinc-500">{filteredCustomers.length} van {customers.length} klanten</span>
                </div>
              )}
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-auto">
              <table className="w-full min-w-[1250px] text-sm">
                <thead className="bg-zinc-950 text-zinc-400">
                  <tr>
                    <SortableHeader label="Naam" sortKey="name" activeKey={customerFilters.sortKey} direction={customerFilters.sortDirection} onSort={changeCustomerSort} />
                    <th className="text-left px-3 py-2 font-medium">Email</th>
                    <th className="text-left px-3 py-2 font-medium">Telefoon</th>
                    <SortableHeader label="Bezoeken" sortKey="visitCount" activeKey={customerFilters.sortKey} direction={customerFilters.sortDirection} onSort={changeCustomerSort} align="center" />
                    <SortableHeader label="Totaal besteed" sortKey="totalSpent" activeKey={customerFilters.sortKey} direction={customerFilters.sortDirection} onSort={changeCustomerSort} align="right" />
                    <SortableHeader label="Gem. besteding" sortKey="averageSpend" activeKey={customerFilters.sortKey} direction={customerFilters.sortDirection} onSort={changeCustomerSort} align="right" />
                    <SortableHeader label="Laatste bezoek" sortKey="lastVisit" activeKey={customerFilters.sortKey} direction={customerFilters.sortDirection} onSort={changeCustomerSort} />
                    <SortableHeader label="Cadeaubonsaldo" sortKey="giftCardBalance" activeKey={customerFilters.sortKey} direction={customerFilters.sortDirection} onSort={changeCustomerSort} align="right" />
                    <th className="text-center px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {filteredCustomers.length === 0 && (
                    <tr>
                      <td colSpan={10} className="text-center py-10 text-zinc-500">Geen klanten gevonden voor deze filters.</td>
                    </tr>
                  )}
                  {filteredCustomers.map(({ customer: c, averageSpendCents, openGiftCardBalanceCents }) => (
                    <tr key={c.id} className="border-t border-zinc-800 hover:bg-zinc-800/40">
                      <td className="px-3 py-2 font-medium">{c.name}</td>
                      <td className="px-3 py-2 text-zinc-400">{c.email || '-'}</td>
                      <td className="px-3 py-2 text-zinc-400">{c.phone || '-'}</td>
                      <td className="px-3 py-2 text-center">{c.visitCount}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatEUR(c.totalSpentCents)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-zinc-300">{formatEUR(averageSpendCents)}</td>
                      <td className="px-3 py-2 text-zinc-400">{c.lastVisitAt ? new Date(c.lastVisitAt).toLocaleDateString('nl-BE') : 'Nooit'}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-emerald-300">{openGiftCardBalanceCents > 0 ? formatEUR(openGiftCardBalanceCents) : '-'}</td>
                      <td className="px-3 py-2 text-center">
                        {!c.isActive ? (
                          <span className="px-2 py-0.5 rounded-full text-[11px] bg-zinc-800 text-zinc-400">Gearchiveerd</span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[11px] bg-emerald-900/40 text-emerald-300">Actief</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-1">
                          <button onClick={() => setViewingCustomer(c)} className="p-2 rounded-lg hover:bg-zinc-800 text-blue-400" title="Details Bekijken">
                            <Eye size={16} />
                          </button>
                          <button onClick={() => setEditingCustomer(c)} className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-300" title="Bewerken">
                            <Pencil size={16} />
                          </button>
                          {!c.isActive ? (
                            <button onClick={() => void restoreCustomer(c.id)} className="p-2 rounded-lg hover:bg-zinc-800 text-emerald-400" title="Herstellen">
                              <RotateCcw size={16} />
                            </button>
                          ) : (
                            <button onClick={() => void removeCustomer(c.id)} className="p-2 rounded-lg hover:bg-zinc-800 text-red-400" title="Archiveren">
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {activeTab === 'gift_cards' && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Kpi label="Bonnen in selectie" value={`${gcStats.count} / ${giftCards.length}`} />
              <Kpi label="Actief in selectie" value={String(gcStats.activeCount)} />
              <Kpi label="Saldo in selectie" value={formatEUR(gcStats.totalBalance)} />
            </div>

            <div className="space-y-3 bg-zinc-900 border border-zinc-800 rounded-xl p-3">
              <div className="flex flex-wrap gap-2">
                <div className="relative flex-1 min-w-[240px]">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                  <input
                    type="search"
                    value={giftCardFilters.query}
                    onChange={(e) => setGiftCardFilters((current) => ({ ...current, query: e.target.value }))}
                    placeholder="Zoek op code of klantnaam..."
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-9 pr-3 py-2 text-sm"
                  />
                </div>
                <select aria-label="Cadeaubonstatus" value={giftCardFilters.status} onChange={(e) => setGiftCardFilters((current) => ({ ...current, status: e.target.value as GiftCardListFilters['status'] }))} className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm">
                  <option value="all">Alle statussen</option>
                  <option value="active">Actief met saldo</option>
                  <option value="empty">Leeg</option>
                  <option value="blocked">Geblokkeerd</option>
                  <option value="expired">Verlopen</option>
                </select>
                <select aria-label="Cadeaubonnen sorteren" value={giftCardFilters.sortKey} onChange={(e) => setGiftCardFilters((current) => ({ ...current, sortKey: e.target.value as GiftCardSortKey }))} className="bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm">
                  <option value="issuedAt">Uitgiftedatum</option>
                  <option value="balance">Huidig saldo</option>
                  <option value="initial">Startbedrag</option>
                  <option value="expiresAt">Vervaldatum</option>
                  <option value="customer">Klant</option>
                  <option value="code">Code</option>
                </select>
                <DirectionButton direction={giftCardFilters.sortDirection} label={giftCardDirectionLabel(giftCardFilters.sortKey, giftCardFilters.sortDirection)} onClick={() => setGiftCardFilters((current) => ({ ...current, sortDirection: current.sortDirection === 'asc' ? 'desc' : 'asc' }))} />
                <button
                  onClick={() => setShowGiftCardFilters((open) => !open)}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold ${showGiftCardFilters || giftCardActiveChips.length > 0 ? 'border-blue-500/50 bg-blue-500/10 text-blue-200' : 'border-zinc-800 bg-zinc-950 text-zinc-300 hover:bg-zinc-800'}`}
                >
                  <SlidersHorizontal size={16} /> Filters
                  {giftCardActiveChips.length > 0 && <span className="rounded-full bg-blue-500 px-1.5 py-0.5 text-[10px] text-white">{giftCardActiveChips.length}</span>}
                </button>
                <button onClick={resetGiftCardFilters} disabled={giftCardActiveChips.length === 0 && !giftCardFilters.query} className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-400 hover:bg-zinc-800 disabled:opacity-30">
                  Wissen
                </button>
              </div>

              <div className="flex flex-wrap gap-2">
                <QuickFilterButton label="Actief" active={giftCardFilters.status === 'active'} onClick={() => setGiftCardFilters((current) => ({ ...current, status: current.status === 'active' ? 'all' : 'active' }))} />
                <QuickFilterButton label="Vervalt binnen 30 dagen" active={giftCardFilters.expiry === 'next-30'} onClick={() => setGiftCardFilters((current) => ({ ...current, expiry: current.expiry === 'next-30' ? 'all' : 'next-30' }))} />
                <QuickFilterButton label="Leeg" active={giftCardFilters.status === 'empty'} onClick={() => setGiftCardFilters((current) => ({ ...current, status: current.status === 'empty' ? 'all' : 'empty' }))} />
                <QuickFilterButton label="Geblokkeerd" active={giftCardFilters.status === 'blocked'} onClick={() => setGiftCardFilters((current) => ({ ...current, status: current.status === 'blocked' ? 'all' : 'blocked' }))} />
                <QuickFilterButton label="Anoniem" active={giftCardFilters.owner === 'anonymous'} onClick={() => setGiftCardFilters((current) => ({ ...current, owner: current.owner === 'anonymous' ? 'all' : 'anonymous' }))} />
              </div>

              {showGiftCardFilters && (
                <div className="grid grid-cols-1 gap-3 rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 sm:grid-cols-2 lg:grid-cols-4">
                  <FilterField label="Koppeling">
                    <select value={giftCardFilters.owner} onChange={(e) => setGiftCardFilters((current) => ({ ...current, owner: e.target.value as GiftCardListFilters['owner'] }))} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm">
                      <option value="all">Alle bonnen</option>
                      <option value="linked">Gekoppeld aan klant</option>
                      <option value="anonymous">Anoniem</option>
                    </select>
                  </FilterField>
                  <FilterField label="Vervaldatum">
                    <select value={giftCardFilters.expiry} onChange={(e) => setGiftCardFilters((current) => ({ ...current, expiry: e.target.value as GiftCardListFilters['expiry'] }))} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm">
                      <option value="all">Alle vervaldata</option>
                      <option value="next-30">Binnen 30 dagen</option>
                      <option value="expired">Verlopen</option>
                      <option value="no-expiry">Geen vervaldatum</option>
                    </select>
                  </FilterField>
                  <FilterField label="Min. saldo (€)">
                    <input inputMode="decimal" value={giftCardMinBalanceText} onChange={(e) => setGiftCardMinBalanceText(e.target.value)} placeholder="0,00" className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm" />
                  </FilterField>
                  <FilterField label="Max. saldo (€)">
                    <input inputMode="decimal" value={giftCardMaxBalanceText} onChange={(e) => setGiftCardMaxBalanceText(e.target.value)} placeholder="Geen maximum" className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm" />
                  </FilterField>
                </div>
              )}

              {giftCardActiveChips.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  {giftCardActiveChips.map((chip) => <FilterChip key={chip.key} label={chip.label} onClear={chip.clear} />)}
                  <span className="ml-auto text-xs text-zinc-500">{filteredGiftCards.length} van {giftCards.length} cadeaubonnen</span>
                </div>
              )}
              </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-auto">
              <table className="w-full min-w-[1050px] text-sm">
                <thead className="bg-zinc-950 text-zinc-400">
                  <tr>
                    <GiftCardSortableHeader label="Code" sortKey="code" activeKey={giftCardFilters.sortKey} direction={giftCardFilters.sortDirection} onSort={changeGiftCardSort} />
                    <GiftCardSortableHeader label="Klant" sortKey="customer" activeKey={giftCardFilters.sortKey} direction={giftCardFilters.sortDirection} onSort={changeGiftCardSort} />
                    <GiftCardSortableHeader label="Startbedrag" sortKey="initial" activeKey={giftCardFilters.sortKey} direction={giftCardFilters.sortDirection} onSort={changeGiftCardSort} align="right" />
                    <GiftCardSortableHeader label="Saldo" sortKey="balance" activeKey={giftCardFilters.sortKey} direction={giftCardFilters.sortDirection} onSort={changeGiftCardSort} align="right" />
                    <GiftCardSortableHeader label="Uitgiftedatum" sortKey="issuedAt" activeKey={giftCardFilters.sortKey} direction={giftCardFilters.sortDirection} onSort={changeGiftCardSort} />
                    <GiftCardSortableHeader label="Vervaldatum" sortKey="expiresAt" activeKey={giftCardFilters.sortKey} direction={giftCardFilters.sortDirection} onSort={changeGiftCardSort} />
                    <th className="text-center px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {filteredGiftCards.length === 0 && (
                    <tr>
                      <td colSpan={8} className="text-center py-10 text-zinc-500">Geen cadeaubonnen gevonden voor deze filters.</td>
                    </tr>
                  )}
                  {filteredGiftCards.map(({ giftCard: gc, customerName, isExpired }) => (
                    <tr key={gc.id} className="border-t border-zinc-800 hover:bg-zinc-800/40">
                      <td className="px-3 py-2 font-mono text-emerald-400">{gc.code}</td>
                      <td className="px-3 py-2 text-zinc-300">{gc.customerId ? customerName || 'Onbekend' : 'Anoniem'}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-zinc-400">{formatEUR(gc.initialCents)}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-bold">{formatEUR(gc.balanceCents)}</td>
                      <td className="px-3 py-2 text-zinc-400">{new Date(gc.issuedAt).toLocaleDateString('nl-BE')}</td>
                      <td className={`px-3 py-2 ${isExpired ? 'text-red-300' : 'text-zinc-400'}`}>{gc.expiresAt ? new Date(gc.expiresAt).toLocaleDateString('nl-BE') : '-'}</td>
                      <td className="px-3 py-2 text-center">
                        {!gc.isActive ? (
                          <span className="px-2 py-0.5 rounded-full text-[11px] bg-red-900/40 text-red-300">Geblokkeerd</span>
                        ) : isExpired ? (
                          <span className="px-2 py-0.5 rounded-full text-[11px] bg-amber-900/40 text-amber-300">Verlopen</span>
                        ) : gc.balanceCents === 0 ? (
                           <span className="px-2 py-0.5 rounded-full text-[11px] bg-zinc-800 text-zinc-400">Leeg</span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[11px] bg-emerald-900/40 text-emerald-300">Actief</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-1">
                          <button onClick={() => { setRechargeGC(gc); setRechargeAmountText('0,00'); }} className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-300" title="Opwaarderen">
                            <BatteryCharging size={16} />
                          </button>
                          {!gc.isActive ? (
                            <button onClick={() => void activateGiftCard(gc.id)} className="p-2 rounded-lg hover:bg-zinc-800 text-emerald-400" title="Activeren">
                              <Power size={16} />
                            </button>
                          ) : (
                            <button onClick={() => void deactivateGiftCard(gc.id)} className="p-2 rounded-lg hover:bg-zinc-800 text-red-400" title="Blokkeren">
                              <PowerOff size={16} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {editingCustomer && (
        <Modal
          open
          onClose={() => setEditingCustomer(null)}
          title={editingCustomer.id ? `Klant bewerken - ${editingCustomer.name}` : 'Nieuwe klant'}
          footer={
            <div className="flex gap-2 justify-end">
              <button onClick={() => setEditingCustomer(null)} className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white">Annuleren</button>
              <button onClick={() => void handleSaveCustomer()} className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold">Opslaan</button>
            </div>
          }
        >
          <div className="space-y-4 text-white">
            <Field label="Naam">
              <input value={editingCustomer.name || ''} onChange={(e) => setEditingCustomer({ ...editingCustomer, name: e.target.value })} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2" />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Email">
                <input type="email" value={editingCustomer.email || ''} onChange={(e) => setEditingCustomer({ ...editingCustomer, email: e.target.value })} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2" />
              </Field>
              <Field label="Telefoon">
                <input type="tel" value={editingCustomer.phone || ''} onChange={(e) => setEditingCustomer({ ...editingCustomer, phone: e.target.value })} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2" />
              </Field>
            </div>
            <Field label="Adres">
              <textarea value={editingCustomer.address || ''} onChange={(e) => setEditingCustomer({ ...editingCustomer, address: e.target.value })} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 h-20" />
            </Field>
            <Field label="Notities">
              <textarea value={editingCustomer.notes || ''} onChange={(e) => setEditingCustomer({ ...editingCustomer, notes: e.target.value })} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 h-20" />
            </Field>
          </div>
        </Modal>
      )}

      {editingGiftCard && (
        <Modal
          open
          onClose={() => setEditingGiftCard(null)}
          title="Nieuwe cadeaubon"
          footer={
            <div className="flex gap-2 justify-end">
              <button onClick={() => setEditingGiftCard(null)} className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white">Annuleren</button>
              <button onClick={() => void handleSaveGiftCard()} className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold">Uitgeven</button>
            </div>
          }
        >
          <div className="space-y-4 text-white">
            <Field label="Code">
              <div className="flex gap-2">
                <input value={editingGiftCard.code || ''} onChange={(e) => setEditingGiftCard({ ...editingGiftCard, code: e.target.value })} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 font-mono uppercase" />
                <button onClick={() => setEditingGiftCard({ ...editingGiftCard, code: generateGiftCardCode() })} className="px-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm font-semibold whitespace-nowrap">Genereer</button>
              </div>
            </Field>
            <Field label="Bedrag (€)">
              <input inputMode="decimal" value={editingGiftCard.initialText || ''} onChange={(e) => setEditingGiftCard({ ...editingGiftCard, initialText: e.target.value })} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 tabular-nums" />
            </Field>
            <Field label="Klant (Optioneel)">
              <select
                value={editingGiftCard.customerId || ''}
                onChange={(e) => setEditingGiftCard({ ...editingGiftCard, customerId: e.target.value || undefined })}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2"
              >
                <option value="">Geen (Anoniem)</option>
                {customers.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </Field>
          </div>
        </Modal>
      )}

      {rechargeGC && (
        <Modal
          open
          onClose={() => setRechargeGC(null)}
          title={`Opwaarderen - ${rechargeGC.code}`}
          footer={
            <div className="flex gap-2 justify-end">
              <button onClick={() => setRechargeGC(null)} className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white">Annuleren</button>
              <button onClick={() => void handleRechargeGiftCard()} className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold">Opwaarderen</button>
            </div>
          }
        >
          <div className="space-y-4 text-white">
            <p className="text-sm text-zinc-400">Huidig saldo: <strong className="text-white">{formatEUR(rechargeGC.balanceCents)}</strong></p>
            <Field label="Bedrag toevoegen (€)">
              <input inputMode="decimal" value={rechargeAmountText} onChange={(e) => setRechargeAmountText(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 tabular-nums" />
            </Field>
          </div>
        </Modal>
      )}

      {viewingCustomer && (
        <Modal
          open
          onClose={() => setViewingCustomer(null)}
          title={`Klantgegevens - ${viewingCustomer.name}`}
          footer={
            <div className="flex justify-end">
              <button onClick={() => setViewingCustomer(null)} className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white font-semibold">Sluiten</button>
            </div>
          }
        >
          <div className="space-y-6 text-white max-h-[70vh] overflow-y-auto pb-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-xl">
                <h3 className="text-sm font-semibold text-zinc-400 mb-2 uppercase tracking-wide">Contactgegevens</h3>
                <p className="text-sm"><strong>Email:</strong> {viewingCustomer.email || '-'}</p>
                <p className="text-sm"><strong>Telefoon:</strong> {viewingCustomer.phone || '-'}</p>
                <p className="text-sm"><strong>Adres:</strong> {viewingCustomer.address || '-'}</p>
                <p className="mt-2 text-sm text-zinc-300"><strong className="text-white">Profielnotitie:</strong> {viewingCustomer.notes || '-'}</p>
                <p className="mt-2 text-xs text-zinc-500">Klant sinds {new Date(viewingCustomer.createdAt).toLocaleDateString()}</p>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-xl">
                <h3 className="text-sm font-semibold text-zinc-400 mb-2 uppercase tracking-wide">Statistieken</h3>
                <p className="text-sm"><strong>Aantal bezoeken:</strong> {viewingCustomer.visitCount}</p>
                <p className="text-sm"><strong>Totaal besteed:</strong> {formatEUR(viewingCustomer.totalSpentCents)}</p>
                <p className="text-sm"><strong>Laatste bezoek:</strong> {viewingCustomer.lastVisitAt ? new Date(viewingCustomer.lastVisitAt).toLocaleDateString() : '-'}</p>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-zinc-400 mb-3 flex items-center gap-2 uppercase tracking-wide">
                <CreditCard size={16} /> Cadeaubonnen
              </h3>
              {customerGiftCards.length === 0 ? (
                <p className="text-sm text-zinc-500 bg-zinc-900/50 p-3 rounded-lg border border-zinc-800 border-dashed">Geen cadeaubonnen gevonden.</p>
              ) : (
                <div className="space-y-2">
                  {customerGiftCards.map(gc => (
                    <div key={gc.id} className="flex justify-between items-center bg-zinc-900 border border-zinc-800 p-3 rounded-lg">
                      <div>
                        <p className="font-mono text-emerald-400 text-sm font-medium">{gc.code}</p>
                        <p className="text-xs text-zinc-500">Uitgegeven: {new Date(gc.issuedAt).toLocaleDateString()}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold tabular-nums text-emerald-300">{formatEUR(gc.balanceCents)}</p>
                        {!gc.isActive ? (
                          <p className="text-[10px] text-red-400 uppercase tracking-wide font-semibold mt-0.5">Geblokkeerd</p>
                        ) : gc.balanceCents === 0 ? (
                          <p className="text-[10px] text-zinc-500 uppercase tracking-wide font-semibold mt-0.5">Leeg</p>
                        ) : (
                          <p className="text-[10px] text-emerald-500 uppercase tracking-wide font-semibold mt-0.5">Actief</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <h3 className="text-sm font-semibold text-zinc-400 mb-3 flex items-center gap-2 uppercase tracking-wide">
                <Receipt size={16} /> Aankoopgeschiedenis
              </h3>
              {loadingTransactions ? (
                <p className="text-sm text-zinc-500 animate-pulse">Laden...</p>
              ) : customerTransactions.length === 0 ? (
                <p className="text-sm text-zinc-500 bg-zinc-900/50 p-3 rounded-lg border border-zinc-800 border-dashed">Nog geen aankopen geregistreerd.</p>
              ) : (
                <div className="space-y-2">
                  {customerTransactions.map(tx => (
                    <div key={tx.id} className="bg-zinc-900 border border-zinc-800 p-3 rounded-lg">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm font-medium text-zinc-300">{new Date(tx.timestamp).toLocaleString()}</span>
                        <span className="font-bold tabular-nums">{formatEUR(tx.totalCents)}</span>
                      </div>
                      <div className="space-y-1">
                        {tx.items.map((item, idx) => {
                          const modSum = (item.modifiers || []).reduce((sum, m) => sum + m.deltaCents, 0);
                          const totalItemCents = (item.product.priceCents + modSum) * item.quantity;
                          return (
                            <div key={idx} className="flex justify-between text-xs text-zinc-400">
                              <span>{item.quantity}x {item.product.name}</span>
                              <span>{formatEUR(totalItemCents)}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label className="block">
    <span className="block text-xs font-medium text-zinc-400 mb-1 uppercase tracking-wide">{label}</span>
    {children}
  </label>
);

const FilterField: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label className="block min-w-0">
    <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{label}</span>
    {children}
  </label>
);

const QuickFilterButton: React.FC<{ label: string; active: boolean; onClick: () => void }> = ({
  label,
  active,
  onClick,
}) => (
  <button
    onClick={onClick}
    aria-pressed={active}
    className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
      active
        ? 'border-blue-500/60 bg-blue-500/15 text-blue-200'
        : 'border-zinc-700 bg-zinc-950 text-zinc-400 hover:border-zinc-600 hover:text-white'
    }`}
  >
    {label}
  </button>
);

const FilterChip: React.FC<{ label: string; onClear: () => void }> = ({ label, onClear }) => (
  <span className="inline-flex items-center gap-1 rounded-full border border-blue-500/30 bg-blue-500/10 py-1 pl-2.5 pr-1.5 text-xs text-blue-200">
    {label}
    <button onClick={onClear} className="rounded-full p-0.5 hover:bg-blue-500/20" aria-label={`Filter ${label} verwijderen`}>
      <X size={12} />
    </button>
  </span>
);

const DirectionButton: React.FC<{ direction: SortDirection; label: string; onClick: () => void }> = ({ direction, label, onClick }) => (
  <button
    onClick={onClick}
    className="flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
    title={`${label} — klik om de richting om te keren`}
    aria-label={`Sorteerrichting: ${label}`}
  >
    {direction === 'asc' ? <ArrowUp size={16} /> : <ArrowDown size={16} />}
    <span className="hidden sm:inline">{label}</span>
  </button>
);

interface CustomerSortableHeaderProps {
  label: string;
  sortKey: CustomerSortKey;
  activeKey: CustomerSortKey;
  direction: SortDirection;
  onSort: (key: CustomerSortKey) => void;
  align?: 'left' | 'center' | 'right';
}

const SortableHeader: React.FC<CustomerSortableHeaderProps> = ({
  label,
  sortKey,
  activeKey,
  direction,
  onSort,
  align = 'left',
}) => {
  const active = sortKey === activeKey;
  const justify = align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start';
  return (
    <th
      className={`px-3 py-2 font-medium ${align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'}`}
      aria-sort={active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button onClick={() => onSort(sortKey)} className={`flex w-full items-center gap-1 ${justify} hover:text-white`}>
        {label}
        {active ? direction === 'asc' ? <ArrowUp size={13} /> : <ArrowDown size={13} /> : <ArrowUpDown size={13} className="opacity-40" />}
      </button>
    </th>
  );
};

interface GiftCardSortableHeaderProps {
  label: string;
  sortKey: GiftCardSortKey;
  activeKey: GiftCardSortKey;
  direction: SortDirection;
  onSort: (key: GiftCardSortKey) => void;
  align?: 'left' | 'center' | 'right';
}

const GiftCardSortableHeader: React.FC<GiftCardSortableHeaderProps> = ({
  label,
  sortKey,
  activeKey,
  direction,
  onSort,
  align = 'left',
}) => {
  const active = sortKey === activeKey;
  const justify = align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start';
  return (
    <th
      className={`px-3 py-2 font-medium ${align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'}`}
      aria-sort={active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button onClick={() => onSort(sortKey)} className={`flex w-full items-center gap-1 ${justify} hover:text-white`}>
        {label}
        {active ? direction === 'asc' ? <ArrowUp size={13} /> : <ArrowDown size={13} /> : <ArrowUpDown size={13} className="opacity-40" />}
      </button>
    </th>
  );
};

const AdminTab: React.FC<{ icon: React.ReactNode; label: string; active: boolean; onClick: () => void }> = ({ icon, label, active, onClick }) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold ${
      active ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white hover:bg-zinc-800/60'
    }`}
  >
    {icon}
    {label}
  </button>
);

const Kpi: React.FC<{ label: string; value: string; tone?: 'emerald' | 'amber' }> = ({ label, value, tone }) => (
  <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-3">
    <div className="text-xs uppercase tracking-wide text-zinc-500">{label}</div>
    <div className={`mt-1 text-xl font-bold tabular-nums ${tone === 'amber' ? 'text-amber-300' : tone === 'emerald' ? 'text-emerald-300' : 'text-white'}`}>{value}</div>
  </div>
);
