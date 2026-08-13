import React, { useState, useMemo, useEffect } from 'react';
import { Search, CheckCircle2, Gift } from 'lucide-react';
import { Modal } from './Modal';
import { useCustomers } from '../store/useCustomers';
import { formatEUR } from '../utils/money';
import { isGiftCardExpired } from '../utils/giftCards';

interface Props {
  open: boolean;
  onClose: () => void;
  onLink: (customerId: string) => void;
}

export const CustomerLinkModal: React.FC<Props> = ({ open, onClose, onLink }) => {
  const { customers, giftCards, hydrate } = useCustomers();
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (open) void hydrate();
  }, [open, hydrate]);

  const activeCustomers = useMemo(() => customers.filter(c => c.isActive), [customers]);

  const customerGiftCardMap = useMemo(() => {
    const map = new Map<string, { count: number; totalCents: number }>();
    for (const gc of giftCards) {
      if (gc.customerId && gc.isActive && !isGiftCardExpired(gc) && gc.balanceCents > 0) {
        const current = map.get(gc.customerId) ?? { count: 0, totalCents: 0 };
        map.set(gc.customerId, {
          count: current.count + 1,
          totalCents: current.totalCents + gc.balanceCents,
        });
      }
    }
    return map;
  }, [giftCards]);

  const filtered = useMemo(() => {
    const term = search.toLowerCase().trim();
    if (!term) return activeCustomers;
    return activeCustomers.filter(c => 
      c.name.toLowerCase().includes(term) || 
      (c.email && c.email.toLowerCase().includes(term)) || 
      (c.phone && c.phone.toLowerCase().includes(term))
    );
  }, [search, activeCustomers]);

  return (
    <Modal open={open} onClose={onClose} title="Klant koppelen" size="lg">
      <div className="space-y-4">
        <div className="relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Zoek op naam, email of telefoon..."
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-10 pr-4 py-2 text-white placeholder-zinc-500"
            autoFocus
          />
        </div>
        <div className="max-h-[60vh] overflow-y-auto space-y-2">
          {filtered.length === 0 ? (
            <div className="text-center py-8 text-zinc-500">
              {search ? 'Geen klanten gevonden.' : 'Geen klanten beschikbaar.'}
            </div>
          ) : (
            filtered.map(c => (
              <button
                key={c.id}
                onClick={() => onLink(c.id)}
                className="w-full flex items-center justify-between p-3 rounded-lg bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 hover:border-zinc-700 transition-colors text-left group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold">
                    {c.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="font-semibold text-white flex items-center gap-2">
                      <span>{c.name}</span>
                      {customerGiftCardMap.has(c.id) && (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[11px] font-medium flex items-center gap-1">
                          <Gift size={12} /> {customerGiftCardMap.get(c.id)!.count}{' '}
                          {customerGiftCardMap.get(c.id)!.count === 1 ? 'bon' : 'bonnen'} ·{' '}
                          {formatEUR(customerGiftCardMap.get(c.id)!.totalCents)}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-zinc-500">
                      {[c.email, c.phone].filter(Boolean).join(' • ')}
                    </div>
                    {c.priceGroup && (
                      <span className="mt-1 inline-flex rounded-full bg-sky-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sky-300">
                        Prijsgroep · {c.priceGroup}
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-zinc-400">
                  <CheckCircle2 size={20} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </Modal>
  );
};
