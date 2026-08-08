import React, { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Modal } from './Modal';
import { Modifier, OrderItem } from '../types';
import { MODIFIER_CATALOG, VOID_REASONS } from '../data/modifiers';
import { formatEUR } from '../utils/money';
import { useStore } from '../store/useStore';
import { useAuth } from '../auth/useAuth';

interface Props {
  tableId: number | null;
  lineId: string | null;
  onClose: () => void;
}

export const ItemEditModal: React.FC<Props> = ({ tableId, lineId, onClose }) => {
  const cart = useStore((s) => s.cart);
  const setNotes = useStore((s) => s.setOrderItemNotes);
  const setMods = useStore((s) => s.setOrderItemModifiers);
  const voidItem = useStore((s) => s.voidOrderItem);
  const auth = useAuth();

  const order: OrderItem | undefined =
    tableId != null && lineId != null
      ? cart.orders.find((o) => o.lineId === lineId)
      : undefined;

  const [draftMods, setDraftMods] = useState<Modifier[]>([]);
  const [draftNotes, setDraftNotes] = useState('');
  const [showVoid, setShowVoid] = useState(false);
  const [voidReason, setVoidReason] = useState<string>(VOID_REASONS[0]);
  const [customReason, setCustomReason] = useState('');

  useEffect(() => {
    if (order) {
      setDraftMods(order.modifiers ?? []);
      setDraftNotes(order.notes ?? '');
    }
    setShowVoid(false);
    setVoidReason(VOID_REASONS[0]);
    setCustomReason('');
  }, [order?.lineId]); // eslint-disable-line react-hooks/exhaustive-deps

  const open = order != null && tableId != null && lineId != null;

  const toggleMod = (m: Modifier) => {
    setDraftMods((cur) =>
      cur.some((x) => x.id === m.id) ? cur.filter((x) => x.id !== m.id) : [...cur, m],
    );
  };

  const save = () => {
    if (tableId == null || lineId == null) return;
    setMods(lineId, draftMods);
    setNotes(lineId, draftNotes.trim());
    onClose();
  };

  const performVoid = async () => {
    if (tableId == null || lineId == null) return;
    const reason = voidReason === 'Andere' ? customReason.trim() || 'Andere' : voidReason;
    await voidItem(lineId, reason);
    onClose();
  };

  const canVoid = auth.hasRole('owner', 'manager');

  if (!open || !order) {
    return (
      <Modal open={false} onClose={onClose} title="">
        <span />
      </Modal>
    );
  }

  const baseLineCents = order.product.priceCents * order.quantity;
  const modCents = draftMods.reduce((s, m) => s + m.deltaCents, 0) * order.quantity;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={order.product.name}
      size="lg"
      footer={
        <div className="flex items-center justify-between gap-2">
          {canVoid ? (
            <button
              onClick={() => setShowVoid((v) => !v)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-900/40 hover:bg-red-900/60 text-red-300 text-sm"
            >
              <Trash2 size={14} />
              Annuleer regel
            </button>
          ) : (
            <span className="text-xs text-zinc-500">Annuleren vereist manager.</span>
          )}
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700"
            >
              Annuleren
            </button>
            <button
              onClick={save}
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 font-bold"
            >
              Opslaan
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="flex justify-between items-center text-sm text-zinc-400">
          <span>
            {order.quantity}× {formatEUR(order.product.priceCents)}
          </span>
          <span>
            Lijn{' '}
            <span className="text-white font-bold tabular-nums">
              {formatEUR(baseLineCents + modCents)}
            </span>
          </span>
        </div>

        <div>
          <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-2">
            Modifiers
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {MODIFIER_CATALOG.map((m) => {
              const active = draftMods.some((x) => x.id === m.id);
              return (
                <button
                  key={m.id}
                  onClick={() => toggleMod(m)}
                  className={`flex items-center justify-between px-3 py-2 rounded-lg border text-sm transition-colors ${
                    active
                      ? 'bg-indigo-600/20 border-indigo-500 text-indigo-200'
                      : 'bg-zinc-950 border-zinc-800 text-zinc-300 hover:border-zinc-700'
                  }`}
                >
                  <span className="text-left">{m.label}</span>
                  <span className="text-xs text-zinc-500">
                    {m.deltaCents > 0 ? `+${formatEUR(m.deltaCents)}` : '—'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-2">
            Notitie voor verkoop / service
          </h3>
          <textarea
            value={draftNotes}
            onChange={(e) => setDraftNotes(e.target.value)}
            rows={3}
            placeholder="bv. maat apart leggen, montage later, klant belt terug..."
            className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-sm focus:outline-none focus:border-indigo-500"
          />
        </div>

        {showVoid && canVoid && (
          <div className="border border-red-900/60 bg-red-950/30 rounded-xl p-4 space-y-3">
            <div className="text-sm text-red-200 font-bold">Reden van annulatie</div>
            <div className="flex flex-wrap gap-2">
              {VOID_REASONS.map((r) => (
                <button
                  key={r}
                  onClick={() => setVoidReason(r)}
                  className={`px-3 py-1 rounded-full text-xs font-medium ${
                    voidReason === r
                      ? 'bg-red-600 text-white'
                      : 'bg-zinc-900 text-zinc-300 hover:bg-zinc-800'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
            {voidReason === 'Andere' && (
              <input
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                placeholder="Reden specificeren..."
                className="w-full px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-sm"
              />
            )}
            <button
              onClick={() => void performVoid()}
              className="w-full py-2 rounded-lg bg-red-600 hover:bg-red-500 font-bold text-white"
            >
              Annuleer regel definitief
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
};
