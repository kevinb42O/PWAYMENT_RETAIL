import React, { useEffect, useMemo, useState } from 'react';
import { CreditCard, Plus, Search, Users, Pencil, Trash2, RotateCcw, Power, PowerOff, BatteryCharging, Eye, Receipt } from 'lucide-react';
import { useCustomers, generateId, generateGiftCardCode } from '../store/useCustomers';
import { Customer, GiftCard, Transaction } from '../types';
import { formatEUR } from '../utils/money';
import { Modal } from './Modal';
import { db } from '../db/db';
const parseCents = (txt: string): number => {
  const norm = txt.replace(/\./g, '').replace(',', '.').trim();
  const n = parseFloat(norm);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
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
  const [search, setSearch] = useState('');

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

  const filteredCustomers = useMemo(() => {
    const term = search.trim().toLowerCase();
    return customers.filter((c) => {
      if (!term) return true;
      return (
        c.name.toLowerCase().includes(term) ||
        (c.email || '').toLowerCase().includes(term) ||
        (c.phone || '').toLowerCase().includes(term)
      );
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [customers, search]);

  const customerStats = useMemo(() => {
    const active = customers.filter(c => c.isActive);
    const totalSpent = active.reduce((acc, c) => acc + c.totalSpentCents, 0);
    const avgSpent = active.length > 0 ? totalSpent / active.length : 0;
    return { count: active.length, totalSpent, avgSpent };
  }, [customers]);

  const filteredGiftCards = useMemo(() => {
    const term = search.trim().toLowerCase();
    return giftCards.filter((gc) => {
      if (!term) return true;
      return gc.code.toLowerCase().includes(term);
    }).sort((a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime());
  }, [giftCards, search]);

  const gcStats = useMemo(() => {
    const active = giftCards.filter(g => g.isActive);
    const totalBalance = active.reduce((acc, g) => acc + g.balanceCents, 0);
    return { count: giftCards.length, activeCount: active.length, totalBalance };
  }, [giftCards]);

  const customerNameById = useMemo(() => {
    const map = new Map<string, string>();
    customers.forEach(c => map.set(c.id, c.name));
    return map;
  }, [customers]);

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
          <AdminTab icon={<Users size={16} />} label="Klanten" active={activeTab === 'customers'} onClick={() => { setActiveTab('customers'); setSearch(''); }} />
          <AdminTab icon={<CreditCard size={16} />} label="Cadeaubonnen" active={activeTab === 'gift_cards'} onClick={() => { setActiveTab('gift_cards'); setSearch(''); }} />
        </div>

        {activeTab === 'customers' && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Kpi label="Actieve klanten" value={String(customerStats.count)} />
              <Kpi label="Totale opbrengst" value={formatEUR(customerStats.totalSpent)} />
              <Kpi label="Gemiddelde besteding" value={formatEUR(customerStats.avgSpent)} />
            </div>

            <div className="flex flex-wrap gap-2 bg-zinc-900 border border-zinc-800 rounded-xl p-3">
              <div className="relative flex-1 min-w-[220px]">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Zoek op naam, email, telefoon..."
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-9 pr-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead className="bg-zinc-950 text-zinc-400">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">Naam</th>
                    <th className="text-left px-3 py-2 font-medium">Email</th>
                    <th className="text-left px-3 py-2 font-medium">Telefoon</th>
                    <th className="text-center px-3 py-2 font-medium">Bezoeken</th>
                    <th className="text-right px-3 py-2 font-medium">Totaal besteed</th>
                    <th className="text-center px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {filteredCustomers.length === 0 && (
                    <tr>
                      <td colSpan={7} className="text-center py-10 text-zinc-500">Geen klanten gevonden.</td>
                    </tr>
                  )}
                  {filteredCustomers.map(c => (
                    <tr key={c.id} className="border-t border-zinc-800 hover:bg-zinc-800/40">
                      <td className="px-3 py-2 font-medium">{c.name}</td>
                      <td className="px-3 py-2 text-zinc-400">{c.email || '-'}</td>
                      <td className="px-3 py-2 text-zinc-400">{c.phone || '-'}</td>
                      <td className="px-3 py-2 text-center">{c.visitCount}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatEUR(c.totalSpentCents)}</td>
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
              <Kpi label="Aantal cadeaubonnen" value={String(gcStats.count)} />
              <Kpi label="Actieve cadeaubonnen" value={String(gcStats.activeCount)} />
              <Kpi label="Openstaand saldo" value={formatEUR(gcStats.totalBalance)} />
            </div>

            <div className="flex flex-wrap gap-2 bg-zinc-900 border border-zinc-800 rounded-xl p-3">
              <div className="relative flex-1 min-w-[220px]">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Zoek op code..."
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-9 pr-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead className="bg-zinc-950 text-zinc-400">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">Code</th>
                    <th className="text-left px-3 py-2 font-medium">Klant</th>
                    <th className="text-right px-3 py-2 font-medium">Startbedrag</th>
                    <th className="text-right px-3 py-2 font-medium">Saldo</th>
                    <th className="text-left px-3 py-2 font-medium">Uitgiftedatum</th>
                    <th className="text-center px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {filteredGiftCards.length === 0 && (
                    <tr>
                      <td colSpan={7} className="text-center py-10 text-zinc-500">Geen cadeaubonnen gevonden.</td>
                    </tr>
                  )}
                  {filteredGiftCards.map(gc => (
                    <tr key={gc.id} className="border-t border-zinc-800 hover:bg-zinc-800/40">
                      <td className="px-3 py-2 font-mono text-emerald-400">{gc.code}</td>
                      <td className="px-3 py-2 text-zinc-300">{gc.customerId ? customerNameById.get(gc.customerId) || 'Onbekend' : '-'}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-zinc-400">{formatEUR(gc.initialCents)}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-bold">{formatEUR(gc.balanceCents)}</td>
                      <td className="px-3 py-2 text-zinc-400">{new Date(gc.issuedAt).toLocaleDateString()}</td>
                      <td className="px-3 py-2 text-center">
                        {!gc.isActive ? (
                          <span className="px-2 py-0.5 rounded-full text-[11px] bg-red-900/40 text-red-300">Geblokkeerd</span>
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
