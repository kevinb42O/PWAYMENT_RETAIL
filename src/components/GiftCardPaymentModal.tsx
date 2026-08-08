import React, { useState, useMemo } from 'react';
import { Gift, ScanLine, Users } from 'lucide-react';
import { Modal } from './Modal';
import { useCustomers } from '../store/useCustomers';
import { formatEUR } from '../utils/money';

interface Props {
  open: boolean;
  onClose: () => void;
  totalCents: number;
  onConfirm: (giftCardId: string, amountCents: number, code: string) => void;
}

export const GiftCardPaymentModal: React.FC<Props> = ({ open, onClose, totalCents, onConfirm }) => {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { customers, giftCards, findGiftCardByCode } = useCustomers();

  const customerMap = useMemo(() => {
    const map = new Map<string, string>();
    customers.forEach(c => map.set(c.id, c.name));
    return map;
  }, [customers]);

  const validGiftCards = useMemo(() => {
    return giftCards
      .filter(gc => gc.isActive && gc.balanceCents > 0)
      .map(gc => ({
        ...gc,
        customerName: gc.customerId ? customerMap.get(gc.customerId) || 'Onbekend' : 'Anoniem'
      }))
      .sort((a, b) => {
        if (a.customerName === 'Anoniem' && b.customerName !== 'Anoniem') return 1;
        if (b.customerName === 'Anoniem' && a.customerName !== 'Anoniem') return -1;
        return a.customerName.localeCompare(b.customerName);
      });
  }, [giftCards, customerMap]);

  const handleVerifyAndPay = () => {
    setError(null);
    if (!code.trim()) {
      setError('Voer een boncode in.');
      return;
    }
    
    const card = findGiftCardByCode(code);
    if (!card) {
      setError('Cadeaubon niet gevonden.');
      return;
    }
    
    if (!card.isActive) {
      setError('Deze cadeaubon is geblokkeerd of ongeldig.');
      return;
    }
    
    if (card.balanceCents <= 0) {
      setError('Deze cadeaubon heeft geen saldo meer.');
      return;
    }
    
    const deductAmount = Math.min(totalCents, card.balanceCents);
    onConfirm(card.id, deductAmount, card.code);
    setCode('');
  };

  return (
    <Modal open={open} onClose={() => { setCode(''); setError(null); onClose(); }} title="Betalen met Cadeaubon" size="md">
      <div className="space-y-6">
        <div className="text-center p-6 bg-zinc-950 rounded-xl border border-zinc-800">
          <div className="text-zinc-400 text-sm mb-1">Te betalen bedrag</div>
          <div className="text-4xl font-bold text-white tabular-nums">{formatEUR(totalCents)}</div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-2">Selecteer klant met cadeaubon</label>
            <div className="relative">
              <Users size={20} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <select
                value={validGiftCards.some(gc => gc.code === code) ? code : ''}
                onChange={e => {
                  setCode(e.target.value);
                  setError(null);
                }}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-10 pr-4 py-3 text-white appearance-none cursor-pointer"
              >
                <option value="">-- Kies een klant of anonieme bon --</option>
                {validGiftCards.map(gc => (
                  <option key={gc.id} value={gc.code}>
                    {gc.customerName} - Saldo: {formatEUR(gc.balanceCents)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="relative flex items-center py-2">
            <div className="flex-grow border-t border-zinc-800"></div>
            <span className="flex-shrink-0 mx-4 text-zinc-500 text-xs font-semibold uppercase tracking-wider">OF</span>
            <div className="flex-grow border-t border-zinc-800"></div>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-2">Scan of typ boncode</label>
            <div className="relative">
              <ScanLine size={20} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                value={code}
                onChange={e => setCode(e.target.value.toUpperCase())}
                placeholder="XXXX-XXXX-XXXX"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-10 pr-4 py-3 text-white placeholder-zinc-600 font-mono text-lg uppercase tracking-wider"
                autoFocus
              />
            </div>
            {error && <div className="mt-2 text-sm text-red-400 font-medium">{error}</div>}
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            onClick={() => { setCode(''); setError(null); onClose(); }}
            className="flex-1 py-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white font-medium"
          >
            Annuleren
          </button>
          <button
            onClick={handleVerifyAndPay}
            disabled={!code.trim()}
            className="flex-1 py-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white font-bold flex items-center justify-center gap-2"
          >
            <Gift size={18} /> Controleer & Betaal
          </button>
        </div>
      </div>
    </Modal>
  );
};
