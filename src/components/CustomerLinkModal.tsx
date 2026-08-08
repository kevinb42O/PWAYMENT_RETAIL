import React, { useState, useMemo, useEffect } from 'react';
import { Search, UserPlus, CheckCircle2 } from 'lucide-react';
import { Modal } from './Modal';
import { useCustomers } from '../store/useCustomers';

interface Props {
  open: boolean;
  onClose: () => void;
  onLink: (customerId: string) => void;
}

export const CustomerLinkModal: React.FC<Props> = ({ open, onClose, onLink }) => {
  const { customers, hydrate } = useCustomers();
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (open) void hydrate();
  }, [open, hydrate]);

  const activeCustomers = useMemo(() => customers.filter(c => c.isActive), [customers]);

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
                    <div className="font-semibold text-white">{c.name}</div>
                    <div className="text-xs text-zinc-500">
                      {[c.email, c.phone].filter(Boolean).join(' • ')}
                    </div>
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
