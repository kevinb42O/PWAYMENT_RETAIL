import React, { useState } from 'react';
import { Modal } from './Modal';
import { DISCOUNT_REASONS } from '../data/modifiers';
import { useAuth } from '../auth/useAuth';
import { formatEUR } from '../utils/money';
import { isSupabaseConfigured } from '../lib/supabase';
import { requestServerDiscountApproval } from '../services/discountApprovals';

interface Props {
  open: boolean;
  onClose: () => void;
  cartId: number;
  subtotalCents: number;
  onApply: (params: {
    amountCents: number;
    reason: string;
    approvedByUserId: string;
    approvalId?: string;
  }) => void;
}

export const DiscountModal: React.FC<Props> = ({ open, onClose, cartId, subtotalCents, onApply }) => {
  const auth = useAuth();
  const [mode, setMode] = useState<'percent' | 'amount'>('percent');
  const [percent, setPercent] = useState('10');
  const [amount, setAmount] = useState('5,00');
  const [reason, setReason] = useState<string>(DISCOUNT_REASONS[0]);
  const [customReason, setCustomReason] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const reset = () => {
    setMode('percent');
    setPercent('10');
    setAmount('5,00');
    setReason(DISCOUNT_REASONS[0]);
    setCustomReason('');
    setPin('');
    setError(null);
  };

  const close = () => {
    reset();
    onClose();
  };

  const computeCents = (): number => {
    if (mode === 'percent') {
      const p = Number(percent.replace(',', '.'));
      if (!Number.isFinite(p) || p <= 0 || p > 100) return 0;
      return Math.round(subtotalCents * (p / 100));
    }
    const n = Number(amount.replace(',', '.'));
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.min(subtotalCents, Math.round(n * 100));
  };

  const submit = async () => {
    if (isSubmitting) return;
    setError(null);
    const cents = computeCents();
    if (cents <= 0) {
      setError('Ongeldig bedrag');
      return;
    }
    if (cents > subtotalCents) {
      setError('Korting groter dan totaal');
      return;
    }
    const finalReason = reason === 'Andere' ? customReason.trim() || 'Andere' : reason;
    if (auth.hasRole('owner', 'manager')) {
      onApply({ amountCents: cents, reason: finalReason, approvedByUserId: auth.currentUserId ?? '' });
      close();
      return;
    }

    // A connected production cashier needs a server-issued, single-use
    // approval.  Demo/no-backend remains intentionally local for fixtures.
    if (isSupabaseConfigured && !auth.currentStoreIsDemo) {
      setIsSubmitting(true);
      try {
        const approval = await requestServerDiscountApproval({
          cartId,
          discountCents: cents,
          reason: finalReason,
          approvalPin: pin,
        });
        onApply({
          amountCents: cents,
          reason: finalReason,
          approvedByUserId: approval.approvedByUserId,
          approvalId: approval.approvalId,
        });
        close();
      } catch (approvalError) {
        const message = approvalError instanceof Error
          ? approvalError.message
          : 'Managergoedkeuring kon niet worden bevestigd.';
        setError(/fetch|network|offline/i.test(message)
          ? 'Managergoedkeuring vereist tijdelijk een online verbinding.'
          : message);
      } finally {
        setIsSubmitting(false);
      }
      return;
    }
    // Otherwise require the explicitly isolated demo/local manager PIN.
    const approver = await auth.verifyManager(pin);
    if (!approver) {
      setError('Ongeldige manager PIN');
      return;
    }
    onApply({ amountCents: cents, reason: finalReason, approvedByUserId: approver });
    close();
  };

  const cents = computeCents();

  return (
    <Modal
      open={open}
      onClose={close}
      title="Korting toepassen"
      size="md"
      footer={
        <div className="flex justify-end gap-2">
          <button
            onClick={close}
            className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700"
          >
            Annuleren
          </button>
          <button
            onClick={() => void submit()}
            disabled={isSubmitting}
            className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold"
          >
            {isSubmitting ? 'Controleren…' : `Toepassen (${formatEUR(cents)})`}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex bg-zinc-950 rounded-lg p-1">
          <button
            onClick={() => setMode('percent')}
            className={`flex-1 py-2 rounded-md font-bold ${
              mode === 'percent' ? 'bg-zinc-800 text-white' : 'text-zinc-400'
            }`}
          >
            Percentage
          </button>
          <button
            onClick={() => setMode('amount')}
            className={`flex-1 py-2 rounded-md font-bold ${
              mode === 'amount' ? 'bg-zinc-800 text-white' : 'text-zinc-400'
            }`}
          >
            Vast bedrag
          </button>
        </div>

        {mode === 'percent' ? (
          <div>
            <label className="block text-sm text-zinc-400 mb-2">Korting %</label>
            <div className="flex gap-2 mb-2">
              {[5, 10, 15, 20, 50].map((p) => (
                <button
                  key={p}
                  onClick={() => setPercent(String(p))}
                  className="flex-1 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-sm font-bold"
                >
                  {p}%
                </button>
              ))}
            </div>
            <input
              inputMode="decimal"
              value={percent}
              onChange={(e) => setPercent(e.target.value)}
              className="discount-modal-input w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xl font-bold text-right tabular-nums text-zinc-100"
            />
          </div>
        ) : (
          <div>
            <label className="block text-sm text-zinc-400 mb-2">Bedrag €</label>
            <input
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="discount-modal-input w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-xl font-bold text-right tabular-nums text-zinc-100"
            />
          </div>
        )}

        <div>
          <label className="block text-sm text-zinc-400 mb-2">Reden</label>
          <div className="flex flex-wrap gap-2">
            {DISCOUNT_REASONS.map((r) => (
              <button
                key={r}
                onClick={() => setReason(r)}
                className={`px-3 py-1 rounded-full text-xs font-medium ${
                  reason === r
                    ? 'bg-indigo-600 text-white'
                    : 'bg-zinc-900 text-zinc-300 hover:bg-zinc-800'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
          {reason === 'Andere' && (
            <input
              value={customReason}
              onChange={(e) => setCustomReason(e.target.value)}
              placeholder="Reden specificeren..."
              className="discount-modal-input w-full mt-2 px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-sm text-zinc-100"
            />
          )}
        </div>

        {!auth.hasRole('owner', 'manager') && (
          <div className="border border-amber-700/40 bg-amber-900/20 rounded-lg p-3">
            <label className="block text-xs uppercase tracking-wider text-amber-300 font-bold mb-2">
              Manager-PIN vereist
            </label>
            <input
              inputMode="numeric"
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="••••••"
              className="discount-modal-input w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-center text-xl tracking-[0.5em] text-zinc-100"
            />
          </div>
        )}

        <div className="flex justify-between text-sm border-t border-zinc-800 pt-3">
          <span className="text-zinc-400">Subtotaal</span>
          <span className="tabular-nums">{formatEUR(subtotalCents)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-zinc-400">Korting</span>
          <span className="tabular-nums text-amber-400">−{formatEUR(cents)}</span>
        </div>
        <div className="flex justify-between font-bold">
          <span>Nieuwe totaal</span>
          <span className="tabular-nums">{formatEUR(Math.max(0, subtotalCents - cents))}</span>
        </div>

        {error && <div className="text-red-400 text-sm">{error}</div>}
      </div>
    </Modal>
  );
};
