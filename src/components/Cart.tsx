import React, { useMemo, useState } from 'react';
import {
  Banknote,
  CheckCircle,
  CreditCard,
  Minus,
  Percent,
  Plus,
  ShoppingCart,
  StickyNote,
  Trash2,
  User,
  Gift,
} from 'lucide-react';
import { useStore } from '../store/useStore';
import { useProducts } from '../store/useProducts';
import { useAuth, audit } from '../auth/useAuth';
import { calculateTotals } from '../utils/vat';
import { formatEUR } from '../utils/money';
import { db } from '../db/db';
import { enqueueOutbox } from '../db/outbox';
import { OrderItem, PaymentMethod, Transaction } from '../types';
import { ItemEditModal } from './ItemEditModal';
import { DiscountModal } from './DiscountModal';
import { CashPaymentModal } from './CashPaymentModal';
import { ReceiptTicket } from './ReceiptTicket';
import { useThermalPrinter, EPSON_PRODUCT_IDS } from '../hooks/useThermalPrinter';
import { EscPosPrintAdapter } from './ThermalPrinterPanel';
import { CustomerLinkModal } from './CustomerLinkModal';
import { GiftCardPaymentModal } from './GiftCardPaymentModal';
import { useCustomers } from '../store/useCustomers';

const lineUnitCents = (o: OrderItem): number =>
  o.product.priceCents + (o.modifiers ?? []).reduce((s, m) => s + m.deltaCents, 0);

export const Cart: React.FC = () => {
  const cart = useStore((s) => s.cart);
  const updateOrderItemQuantity = useStore((s) => s.updateOrderItemQuantity);
  const clearCart = useStore((s) => s.clearCart);
  const cartDiscount = useStore((s) => s.cartDiscount);
  const setCartDiscount = useStore((s) => s.setCartDiscount);
  const resetCartExtras = useStore((s) => s.resetCartExtras);
  const cartGiftCards = useStore((s) => s.cartGiftCards);
  const addCartGiftCard = useStore((s) => s.addCartGiftCard);
  const removeCartGiftCard = useStore((s) => s.removeCartGiftCard);
  const applySale = useProducts((s) => s.applySale);
  const auth = useAuth();

  const linkedCustomerId = useStore((s) => s.linkedCustomerId);
  const linkCustomer = useStore((s) => s.linkCustomer);
  const unlinkCustomer = useStore((s) => s.unlinkCustomer);

  const { customers, recordVisit, deductGiftCard } = useCustomers();
  const linkedCustomer = useMemo(() => customers.find(c => c.id === linkedCustomerId), [customers, linkedCustomerId]);

  const [isProcessing, setIsProcessing] = useState(false);
  const [receipt, setReceipt] = useState<Transaction | null>(null);
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [discountOpen, setDiscountOpen] = useState(false);
  const [cashOpen, setCashOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [giftOpen, setGiftOpen] = useState(false);

  // ── Thermal printer (WebUSB) ───────────────────────────────────────────
  // The hook manages the USB device lifecycle. `connect()` must be called
  // from a user-gesture (button click) — Chrome's WebUSB security rule.
  const { status: printerStatus, isConnected: printerConnected, connect: connectPrinter, sendRaw } =
    useThermalPrinter();

  const itemsToCheckout: OrderItem[] = cart.orders;

  const hasItemsToCheckout = itemsToCheckout.length > 0;
  const manualDiscountCents = cartDiscount?.amountCents ?? 0;
  const totalDiscountCents = manualDiscountCents;
  const totals = useMemo(
    () => calculateTotals(itemsToCheckout, totalDiscountCents),
    [itemsToCheckout, totalDiscountCents],
  );
  const grandTotal = totals.total;

  const giftCardsTotal = cartGiftCards.reduce((s, gc) => s + gc.amountCents, 0);
  const remainingTotal = Math.max(0, grandTotal - giftCardsTotal);

  if (receipt) {
    return (
      <div className="flex flex-col h-full bg-zinc-900 border-l border-zinc-800">
        {/* Receipt screen header */}
        <div className="px-4 py-3 border-b border-zinc-800">
          <div className="flex items-center gap-2 text-emerald-400">
            <CheckCircle size={20} />
            <span className="font-semibold text-white">Betaling gelukt</span>
            <span className="text-sm text-zinc-400">— {receipt.paymentMethod}</span>
          </div>
          {/* Printer status — shown only when disconnected so cashier knows to connect */}
          {!printerConnected && (
            <div className="mt-2 flex items-center gap-2">
              <span
                className="inline-block w-2 h-2 rounded-full"
                style={{ background: printerStatus === 'error' ? '#ef4444' : '#6b7280' }}
              />
              <span className="text-xs text-zinc-500">
                Printer niet verbonden —{' '}
                <button
                  onClick={() => void connectPrinter(EPSON_PRODUCT_IDS.TM_T20II_B)}
                  className="text-blue-400 hover:text-blue-300 underline"
                >
                  Verbinden
                </button>
              </span>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4 flex justify-center items-start">
          <div data-receipt-root>
            <ReceiptTicket transaction={receipt} ticketNumber={receipt.id} />
          </div>
        </div>

        <div className="px-4 py-3 border-t border-zinc-800 flex gap-2">
          {/* Reprint button — ESC/POS to thermal printer */}
          <button
            onClick={async () => {
              if (!printerConnected) {
                // Connect first (user gesture required by Chrome WebUSB policy)
                await connectPrinter(EPSON_PRODUCT_IDS.TM_T20II_B);
                return;
              }
              try {
                const adapter = new EscPosPrintAdapter(sendRaw);
                await adapter.printReceipt(receipt);
              } catch (e) {
                console.error('Reprint failed:', e);
                alert(`Herdruk mislukt: ${e instanceof Error ? e.message : String(e)}`);
              }
            }}
            className="flex-1 py-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white font-medium"
          >
            {printerConnected ? '🖨️ Herdruk' : '🔌 Verbind & Druk'}
          </button>
          <button
            onClick={() => setReceipt(null)}
            className="flex-1 py-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
          >
            Sluiten
          </button>
        </div>
      </div>
    );
  }

  if (!cart) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-zinc-500 bg-zinc-900 border-l border-zinc-800 p-8 text-center">
        <ShoppingCart size={48} className="mb-4 opacity-20" />
        <p className="text-lg font-medium">Geen actieve kassa</p>
        <p className="text-sm mt-2">Herlaad de pagina om de kassa opnieuw te initialiseren</p>
      </div>
    );
  }

  const finalizeCheckout = async (
    method: PaymentMethod,
    extras: { tenderedCents?: number } = {},
  ) => {
    if (!hasItemsToCheckout) return;
    setIsProcessing(true);

    let finalMethod: PaymentMethod = method;
    let splitTenders = undefined;

    if (cartGiftCards.length > 0) {
      finalMethod = 'Split';
      splitTenders = cartGiftCards.map(gc => ({ method: 'Cadeaubon' as const, amountCents: gc.amountCents }));
      if (remainingTotal > 0 && (method === 'Cash' || method === 'PIN')) {
        splitTenders.push({ method: method as 'Cash' | 'PIN', amountCents: remainingTotal });
      }
    }

    const tx: Transaction = {
      tableId: cart.id,
      items: itemsToCheckout,
      subtotalCents: totals.subtotal,
      vat12Cents: totals.vat12,
      vat21Cents: totals.vat21,
      totalCents: grandTotal,
      discountCents: totals.discount,
      discountReason: cartDiscount?.reason,
      discountApprovedByUserId: cartDiscount?.approvedByUserId,
      tenderedCents: extras.tenderedCents,
      paymentMethod: finalMethod,
      splitTenders,
      timestamp: Date.now(),
      isFinalized: 0,
      userId: auth.currentUserId ?? undefined,
      userName: auth.currentUserName ?? undefined,
      customerId: linkedCustomerId ?? undefined,
    };

    try {
      const id = await db.transactions.add(tx);
      const persisted: Transaction = { ...tx, id: id as number };

      // Send ESC/POS bytes directly to the thermal printer over WebUSB.
      // Falls back silently if the printer is not connected (cashier can
      // always reprint manually via the "Herdruk" button on the receipt screen).
      if (printerConnected) {
        try {
          const adapter = new EscPosPrintAdapter(sendRaw);
          await adapter.printReceipt(persisted);
        } catch (printErr) {
          // Don't fail the whole checkout over a print error — the transaction
          // is already persisted in IndexedDB.
          console.error('Thermal print failed (transaction saved):', printErr);
        }
      }

      await audit('checkout', {
        cartId: cart.id,
        totalCents: grandTotal,
        method,
        discountCents: tx.discountCents,
      });
      await applySale(itemsToCheckout);
      await enqueueOutbox('transaction', persisted);

      for (const gc of cartGiftCards) {
        await deductGiftCard(gc.id, gc.amountCents);
      }

      if (linkedCustomerId) {
        await recordVisit(linkedCustomerId, grandTotal);
      }

      resetCartExtras();
      clearCart();

      setReceipt(persisted);
    } catch (error) {
      console.error('Checkout failed:', error);
      alert('Er ging iets mis bij het afrekenen.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCheckout = (method: PaymentMethod) => {
    if (method === 'Cash') {
      setCashOpen(true);
      return;
    }
    void finalizeCheckout(method);
  };

  return (
    <div className="pos-cart flex flex-col h-full bg-zinc-900 border-l border-zinc-800 text-white">
      <div className="px-4 py-3 border-b border-zinc-800 flex justify-between items-start">
        <div>
          <div className="flex items-center gap-2">
            <ShoppingCart size={18} className="pos-accent-text" />
            <h2 className="text-lg font-semibold leading-none">Winkelwagen</h2>
            <span className="pos-cart-count rounded-full px-2 py-0.5 text-[11px] font-semibold">
              {cart.orders.reduce((sum, order) => sum + order.quantity, 0)}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-2.5">
            {linkedCustomer ? (
              <button 
                onClick={() => setLinkOpen(true)}
                className="pos-soft-accent flex items-center gap-1.5 px-2 py-1 rounded-md border text-xs font-medium transition-colors"
              >
                <User size={14} /> {linkedCustomer.name}
              </button>
            ) : (
              <button 
                onClick={() => setLinkOpen(true)}
                className="pos-neutral-action flex items-center gap-1.5 px-2 py-1 rounded-md border border-zinc-200 bg-white text-zinc-500 text-xs font-medium transition-colors"
              >
                <User size={14} /> Klant koppelen
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {cart.orders.length > 0 && (
            <button
              onClick={() => {
                resetCartExtras();
                clearCart();
              }}
              className="text-red-400 hover:text-red-300 p-2 ml-1"
              title="Winkelwagen legen"
            >
              <Trash2 size={20} />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {cart.orders.length === 0 ? (
          <div className="flex h-full min-h-48 flex-col items-center justify-center text-center text-zinc-400">
            <ShoppingCart size={32} className="mb-3 text-zinc-300" />
            <span className="text-sm font-medium text-zinc-500">Winkelwagen is leeg</span>
            <span className="mt-1 text-xs">Scan of kies een product</span>
          </div>
        ) : (
          cart.orders.map((order) => {
            const unit = lineUnitCents(order);
            return (
              <div
                key={order.lineId}
                className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm transition-colors hover:border-zinc-300"
              >
                <div className="flex items-center justify-between gap-2">
                  <button
                    onClick={() => setEditingLineId(order.lineId)}
                    className="flex-1 text-left pr-2"
                  >
                    <div className="text-sm font-semibold leading-tight text-zinc-900 flex items-center gap-2">
                      <span>{order.product.name}</span>
                    </div>
                    <div className="text-zinc-400 text-sm mt-0.5">
                      {formatEUR(unit)}
                      {unit !== order.product.priceCents && (
                        <span className="text-zinc-500"> · basis {formatEUR(order.product.priceCents)}</span>
                      )}
                    </div>
                    {(order.modifiers?.length ?? 0) > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {order.modifiers!.map((m) => (
                          <span
                            key={m.id}
                            className="text-[11px] px-1.5 py-0.5 rounded bg-zinc-950 text-zinc-300 border border-zinc-700"
                          >
                            + {m.label}
                            {m.deltaCents > 0 ? ` (${formatEUR(m.deltaCents)})` : ''}
                          </span>
                        ))}
                      </div>
                    )}
                    {order.notes && (
                      <div className="mt-1 flex items-start gap-1 text-[11px] text-amber-300">
                        <StickyNote size={12} className="mt-px flex-shrink-0" />
                        <span className="italic">{order.notes}</span>
                      </div>
                    )}
                  </button>
                  <div className="flex items-center gap-1 bg-zinc-50 rounded-lg p-1 border border-zinc-200">
                    <button
                      onClick={() => updateOrderItemQuantity(order.lineId, order.quantity - 1)}
                      className="w-8 h-8 flex items-center justify-center bg-white hover:bg-zinc-100 rounded-md text-zinc-600"
                    >
                      <Minus size={16} />
                    </button>
                    <span className="w-6 text-center font-semibold text-sm text-zinc-900">{order.quantity}</span>
                    <button
                      onClick={() => updateOrderItemQuantity(order.lineId, order.quantity + 1)}
                      className="w-8 h-8 flex items-center justify-center bg-white hover:bg-zinc-100 rounded-md text-zinc-600"
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="pos-checkout border-t border-zinc-200 bg-white p-4">
        <div className="space-y-1.5 mb-4 text-sm">
          <div className="flex justify-between text-zinc-400">
            <span>Subtotaal</span>
            <span className="tabular-nums">{formatEUR(totals.subtotal)}</span>
          </div>
          <div className="flex items-center justify-between text-zinc-500">
            <span>Korting</span>
            <button
              onClick={() => setDiscountOpen(true)}
              disabled={!hasItemsToCheckout}
              className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                cartDiscount
                  ? 'bg-amber-50 text-amber-700'
                  : 'pos-accent-link'
              } disabled:opacity-40`}
            >
              <Percent size={13} />
              {cartDiscount ? `−${formatEUR(cartDiscount.amountCents)}` : 'Toevoegen'}
            </button>
          </div>
          {manualDiscountCents > 0 && (
            <div className="flex justify-between text-xs text-zinc-400">
              <span>{cartDiscount?.reason ?? 'Toegepaste korting'}</span>
              <span>In totaal verwerkt</span>
            </div>
          )}
          <div className="flex justify-between text-zinc-500 text-xs">
            <span>BTW 21%</span>
            <span className="tabular-nums">{formatEUR(totals.vat21)}</span>
          </div>
          {totals.vat12 > 0 && (
            <div className="flex justify-between text-zinc-500 text-xs">
              <span>BTW 12%</span>
              <span className="tabular-nums">{formatEUR(totals.vat12)}</span>
            </div>
          )}
          {cartGiftCards.map(gc => (
            <div key={gc.id} className="flex justify-between text-[#667619]">
              <div className="flex items-center gap-1">
                <button onClick={() => removeCartGiftCard(gc.id)} className="text-red-400 hover:text-red-300 mr-1"><Minus size={14} /></button>
                <span>Cadeaubon ({gc.code})</span>
              </div>
              <span className="tabular-nums">−{formatEUR(gc.amountCents)}</span>
            </div>
          ))}
          <div className="flex justify-between text-xl font-bold text-zinc-950 pt-3 mt-2 border-t border-zinc-200">
            <span>{cartGiftCards.length > 0 ? 'Nog te betalen' : 'Totaal'}</span>
            <span className="tabular-nums">{formatEUR(remainingTotal)}</span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={() => handleCheckout('Cash')}
            disabled={isProcessing || !hasItemsToCheckout}
            className="pos-payment-secondary flex flex-col items-center justify-center gap-1.5 py-3 border border-zinc-200 bg-white text-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl font-semibold transition-colors"
          >
            <Banknote size={24} />
            <span className="text-sm">Cash</span>
          </button>
          <button
            onClick={() => handleCheckout('PIN')}
            disabled={isProcessing || !hasItemsToCheckout}
            className="pos-primary-action flex flex-col items-center justify-center gap-1.5 py-3 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl font-semibold shadow-sm transition-colors"
          >
            <CreditCard size={24} />
            <span className="text-sm">PIN</span>
          </button>
          <button
            onClick={() => { if (hasItemsToCheckout) setGiftOpen(true); }}
            disabled={isProcessing || !hasItemsToCheckout}
            className="pos-payment-secondary flex flex-col items-center justify-center gap-1.5 py-3 border border-zinc-200 bg-white text-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl font-semibold transition-colors"
          >
            <Gift size={24} />
            <span className="text-sm">Cadeaubon</span>
          </button>
        </div>
      </div>

      <ItemEditModal
        tableId={cart.id}
        lineId={editingLineId}
        onClose={() => setEditingLineId(null)}
      />
      <DiscountModal
        open={discountOpen}
        onClose={() => setDiscountOpen(false)}
        subtotalCents={totals.subtotal + manualDiscountCents}
        onApply={(d) => setCartDiscount(d)}
      />
      <CashPaymentModal
        open={cashOpen}
        onClose={() => setCashOpen(false)}
        totalCents={remainingTotal}
        onConfirm={(t) => {
          setCashOpen(false);
          void finalizeCheckout('Cash', { tenderedCents: t });
        }}
      />
      <CustomerLinkModal
        open={linkOpen}
        onClose={() => setLinkOpen(false)}
        onLink={(id) => {
          linkCustomer(id);
          setLinkOpen(false);
        }}
      />
      <GiftCardPaymentModal
        open={giftOpen}
        onClose={() => setGiftOpen(false)}
        totalCents={remainingTotal}
        onConfirm={(giftCardId, amountCents, code) => {
          setGiftOpen(false);
          addCartGiftCard({ id: giftCardId, amountCents, code });
          if (remainingTotal - amountCents <= 0) {
            void finalizeCheckout('Cadeaubon');
          }
        }}
      />
    </div>
  );
};
