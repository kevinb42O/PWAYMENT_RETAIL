import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
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
  FileText,
} from "lucide-react";
import { useStore } from "../store/useStore";
import { useProducts } from "../store/useProducts";
import { useAuth } from "../auth/useAuth";
import { SUPPORTED_VAT_RATES } from "../utils/vat";
import { formatEUR } from "../utils/money";
import { FEATURES } from "../config/features";
import {
  CheckoutError,
  dedupeGiftCards,
  finalizeCheckout,
  type GiftCardAllocation,
  type TenderMethod,
} from "../services/checkout";
import { OrderItem, Transaction } from "../types";
import { ItemEditModal } from "./ItemEditModal";
import { DiscountModal } from "./DiscountModal";
import { CashPaymentModal } from "./CashPaymentModal";
import { ReceiptTicket } from "./ReceiptTicket";
import {
  useThermalPrinter,
  EPSON_PRODUCT_IDS,
} from "../hooks/useThermalPrinter";
import { EscPosPrintAdapter } from "./ThermalPrinterPanel";
import { CustomerLinkModal } from "./CustomerLinkModal";
import { GiftCardPaymentModal } from "./GiftCardPaymentModal";
import { useCustomers } from "../store/useCustomers";
import { isGiftCardExpired } from "../utils/giftCards";
import { Modal } from "./Modal";
import { projectCart } from "../customer-display/cartProjection";
import { useCustomerDisplayRuntime } from "../customer-display/runtime";
import type { SaleDocumentRequest } from "../types";
import { useMerchantProfile } from "../store/useMerchantProfile";
import { convertTransactionToInvoiceData } from "../utils/invoicePdfGenerator";
import { InvoicePreviewModal } from "./InvoicePreviewModal";
import { InvoiceCustomerModal } from "./InvoiceCustomerModal";

const lineUnitCents = (o: OrderItem): number =>
  o.product.priceCents +
  (o.modifiers ?? []).reduce((s, m) => s + m.deltaCents, 0);

export const Cart: React.FC = () => {
  const cart = useStore((s) => s.cart);
  const updateOrderItemQuantity = useStore((s) => s.updateOrderItemQuantity);
  const clearCart = useStore((s) => s.clearCart);
  const voidOrderItem = useStore((s) => s.voidOrderItem);
  const cartDiscount = useStore((s) => s.cartDiscount);
  const setCartDiscount = useStore((s) => s.setCartDiscount);
  const resetCartExtras = useStore((s) => s.resetCartExtras);
  const cartGiftCards = useStore((s) => s.cartGiftCards);
  const addCartGiftCard = useStore((s) => s.addCartGiftCard);
  const removeCartGiftCard = useStore((s) => s.removeCartGiftCard);
  const syncPersistedProducts = useProducts((s) => s.syncPersisted);
  const auth = useAuth();
  const [clearCartOpen, setClearCartOpen] = useState(false);
  const [clearCartReason, setClearCartReason] = useState(
    "Klant ziet af van aankoop",
  );

  const linkedCustomerId = useStore((s) => s.linkedCustomerId);
  const linkCustomer = useStore((s) => s.linkCustomer);
  const unlinkCustomer = useStore((s) => s.unlinkCustomer);

  const {
    customers,
    giftCards,
    hydrate,
    syncPersisted: syncPersistedCustomers,
  } = useCustomers();
  const linkedCustomer = useMemo(
    () => customers.find((c) => c.id === linkedCustomerId),
    [customers, linkedCustomerId],
  );
  const merchantProfile = useMerchantProfile((state) => state.profile);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const appliedGiftCardCents = useMemo(() => {
    const applied: Record<string, number> = {};
    for (const gc of cartGiftCards)
      applied[gc.id] = (applied[gc.id] ?? 0) + gc.amountCents;
    return applied;
  }, [cartGiftCards]);

  const linkedCustomerGiftCards = useMemo(() => {
    if (!linkedCustomerId) return [];
    return giftCards.filter(
      (gc) =>
        gc.customerId === linkedCustomerId &&
        gc.isActive &&
        !isGiftCardExpired(gc) &&
        Math.max(0, gc.balanceCents - (appliedGiftCardCents[gc.id] ?? 0)) > 0,
    );
  }, [linkedCustomerId, giftCards, appliedGiftCardCents]);

  const linkedCustomerGiftCardTotal = useMemo(() => {
    return linkedCustomerGiftCards.reduce(
      (sum, gc) =>
        sum + Math.max(0, gc.balanceCents - (appliedGiftCardCents[gc.id] ?? 0)),
      0,
    );
  }, [linkedCustomerGiftCards]);

  const [isProcessing, setIsProcessing] = useState(false);
  const [receipt, setReceipt] = useState<Transaction | null>(null);
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [discountOpen, setDiscountOpen] = useState(false);
  const [cashOpen, setCashOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [giftOpen, setGiftOpen] = useState(false);
  const [invoiceCustomerOpen, setInvoiceCustomerOpen] = useState(false);
  const [documentRequest, setDocumentRequest] = useState<SaleDocumentRequest>({ type: "receipt" });
  const [invoicePreviewOpen, setInvoicePreviewOpen] = useState(false);
  // Kept across retries so a retried checkout can never create a second sale.
  const requestIdRef = useRef<string | null>(null);

  // ── Thermal printer (WebUSB) ───────────────────────────────────────────
  // The hook manages the USB device lifecycle. `connect()` must be called
  // from a user-gesture (button click) — Chrome's WebUSB security rule.
  const {
    status: printerStatus,
    isConnected: printerConnected,
    connect: connectPrinter,
    sendRaw,
  } = useThermalPrinter();

  const manualDiscountCents = cartDiscount?.amountCents ?? 0;
  const cartProjection = useMemo(
    () =>
      projectCart({
        orders: cart.orders,
        linkedCustomer,
        discountCents: manualDiscountCents,
        giftCards: cartGiftCards,
      }),
    [cart.orders, linkedCustomer, manualDiscountCents, cartGiftCards],
  );
  const itemsToCheckout: OrderItem[] = cartProjection.items;
  const hasItemsToCheckout = itemsToCheckout.length > 0;
  const totalDiscountCents = manualDiscountCents;
  const vatBlockers = cartProjection.vatBlockers;
  const totals = cartProjection.totals;
  const grandTotal = totals.total;

  const remainingTotal = cartProjection.remainingCents;
  const checkoutBlocked =
    !hasItemsToCheckout || isProcessing || vatBlockers.length > 0;
  const completedInvoice = useMemo(
    () => receipt && receipt.documentRequest?.type !== "receipt"
      ? convertTransactionToInvoiceData(receipt, receipt.merchantSnapshot ?? merchantProfile, linkedCustomer)
      : null,
    [receipt, merchantProfile, linkedCustomer],
  );

  if (receipt) {
    return (
      <div className="flex flex-col h-full bg-zinc-900 border-l border-zinc-800">
        {/* Receipt screen header */}
        <div className="px-4 py-3 border-b border-zinc-800">
          <div className="flex items-center gap-2 text-emerald-400">
            <CheckCircle size={20} />
            <span className="font-semibold text-white">Betaling gelukt</span>
            <span className="text-sm text-zinc-400">
              — {completedInvoice ? `Factuur ${completedInvoice.invoiceNumber}` : receipt.paymentMethod}
            </span>
          </div>
          {/* Printer status — shown only when disconnected so cashier knows to connect */}
          {!printerConnected && (
            <div className="mt-2 flex items-center gap-2">
              <span
                className="inline-block w-2 h-2 rounded-full"
                style={{
                  background: printerStatus === "error" ? "#ef4444" : "#6b7280",
                }}
              />
              <span className="text-xs text-zinc-500">
                Printer niet verbonden —{" "}
                <button
                  onClick={() =>
                    void connectPrinter(EPSON_PRODUCT_IDS.TM_T20II_B)
                  }
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
                console.error("Reprint failed:", e);
                alert(
                  `Herdruk mislukt: ${e instanceof Error ? e.message : String(e)}`,
                );
              }
            }}
            className="flex-1 py-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white font-medium"
          >
            {printerConnected ? "🖨️ Herdruk" : "🔌 Verbind & Druk"}
          </button>
          {completedInvoice && (
            <button
              type="button"
              onClick={() => setInvoicePreviewOpen(true)}
              className="flex-1 rounded-lg bg-sky-600 py-3 font-semibold text-white hover:bg-sky-500"
            >
              <span className="inline-flex items-center gap-1.5"><FileText size={16} /> Factuur</span>
            </button>
          )}
          <button
            onClick={() => {
              useCustomerDisplayRuntime.getState().resetPayment();
              setReceipt(null);
            }}
            className="flex-1 py-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
          >
            Sluiten
          </button>
        </div>
        <InvoicePreviewModal invoice={invoicePreviewOpen ? completedInvoice : null} onClose={() => setInvoicePreviewOpen(false)} />
      </div>
    );
  }

  if (!cart) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-zinc-500 bg-zinc-900 border-l border-zinc-800 p-8 text-center">
        <ShoppingCart size={48} className="mb-4 opacity-20" />
        <p className="text-lg font-medium">Geen actieve kassa</p>
        <p className="text-sm mt-2">
          Herlaad de pagina om de kassa opnieuw te initialiseren
        </p>
      </div>
    );
  }

  const runCheckout = async (
    method: TenderMethod,
    extras: { tenderedCents?: number; giftCards?: GiftCardAllocation[] } = {},
  ) => {
    if (checkoutBlocked) return;
    if (documentRequest.type !== "receipt" && (
      !linkedCustomer || documentRequest.recipient?.customerId !== linkedCustomer.id
    )) {
      setInvoiceCustomerOpen(true);
      alert("Een factuur vereist een gekoppelde klant met volledige facturatiegegevens.");
      return;
    }
    setIsProcessing(true);
    useCustomerDisplayRuntime.getState().beginPayment(method);
    requestIdRef.current ??= crypto.randomUUID();

    try {
      const result = await finalizeCheckout({
        clientRequestId: requestIdRef.current,
        cartId: cart.id,
        items: itemsToCheckout,
        discountCents: totalDiscountCents,
        discountReason: cartDiscount?.reason,
        discountApprovedByUserId: cartDiscount?.approvedByUserId,
        giftCards: extras.giftCards ?? cartGiftCards,
        method,
        tenderedCents: extras.tenderedCents,
        customerId: linkedCustomerId ?? undefined,
        userId: auth.currentUserId ?? undefined,
        userName: auth.currentUserName ?? undefined,
        documentRequest,
      });

      syncPersistedProducts(result.updatedProducts);
      syncPersistedCustomers({
        customer: result.updatedCustomer,
        giftCards: result.updatedGiftCards,
      });

      requestIdRef.current = null;
      useCustomerDisplayRuntime
        .getState()
        .completePayment(result.transaction);
      clearCart();
      setReceipt(result.transaction);
      setDocumentRequest({ type: "receipt" });

      // Printing happens only after the commit, so a printer failure can never
      // leave a half-booked sale behind.
      if (printerConnected) {
        try {
          const adapter = new EscPosPrintAdapter(sendRaw);
          await adapter.printReceipt(result.transaction);
        } catch (printErr) {
          console.error("Thermal print failed (transaction saved):", printErr);
        }
      }
    } catch (error) {
      useCustomerDisplayRuntime.getState().failPayment(method);
      console.error("Checkout failed:", error);
      alert(
        error instanceof CheckoutError
          ? error.message
          : "Er ging iets mis bij het afrekenen. Er is niets geboekt — probeer opnieuw.",
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCheckout = (method: TenderMethod) => {
    if (method === "Cash") {
      setCashOpen(true);
      return;
    }
    void runCheckout(method);
  };

  return (
    <div className="pos-cart flex flex-col h-full border-l border-slate-200 text-slate-900">
      <div className="pos-cart-header px-4 py-4 border-b border-slate-200 flex justify-between items-start">
        <div>
          <div className="flex items-center gap-2">
            <ShoppingCart size={18} className="pos-accent-text" />
            <h2 className="pos-cart-title text-lg font-semibold leading-none">
              Winkelwagen
            </h2>
            <span className="pos-cart-count rounded-full px-2 py-0.5 text-[11px] font-semibold">
              {cart.orders.reduce((sum, order) => sum + order.quantity, 0)}
            </span>
          </div>
          <div className="flex flex-col gap-1.5 mt-2.5">
            <div className="flex items-center gap-2">
              {linkedCustomer ? (
                <button
                  onClick={() => setLinkOpen(true)}
                  className="pos-soft-accent flex items-center gap-1.5 px-2 py-1 rounded-md border text-xs font-medium transition-colors"
                >
                  <User size={14} /> {linkedCustomer.name}
                  {linkedCustomer.priceGroup && (
                    <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-sky-800">
                      {linkedCustomer.priceGroup}
                    </span>
                  )}
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
            {documentRequest.type !== "receipt" && linkedCustomer && (
              <button
                type="button"
                onClick={() => setInvoiceCustomerOpen(true)}
                className="w-fit rounded-md border border-sky-200 bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-800 hover:border-sky-300"
              >
                <span className="inline-flex items-center gap-1"><FileText size={13} /> Factuur voor {linkedCustomer.name}</span>
              </button>
            )}
            {linkedCustomerGiftCardTotal > 0 && (
              <div className="p-2 bg-emerald-950/40 border border-emerald-500/30 rounded-lg flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-1.5 text-emerald-300 font-medium">
                  <Gift size={14} className="text-emerald-400 shrink-0" />
                  <span>
                    {linkedCustomerGiftCards.length === 1
                      ? `1 cadeaubon (${formatEUR(linkedCustomerGiftCardTotal)})`
                      : `${linkedCustomerGiftCards.length} cadeaubonnen (totaal ${formatEUR(linkedCustomerGiftCardTotal)})`}
                  </span>
                </div>
                <button
                  onClick={() => setGiftOpen(true)}
                  disabled={checkoutBlocked}
                  className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition-colors shrink-0 disabled:opacity-50 text-[11px]"
                >
                  Gebruiken
                </button>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setInvoiceCustomerOpen(true)}
            className="rounded-md p-2 text-sky-700 hover:bg-sky-50"
            title="Factuur opmaken"
            aria-label="Factuur opmaken"
          >
            <FileText size={19} />
          </button>
          {cart.orders.length > 0 && (
            <button
              onClick={() => setClearCartOpen(true)}
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
          <div className="flex h-full min-h-48 flex-col items-center justify-center px-6 text-center text-zinc-400">
            <div className="pos-empty-cart-icon mb-4 grid h-16 w-16 place-items-center rounded-2xl">
              <ShoppingCart size={27} className="text-cyan-300" />
            </div>
            <span className="pos-empty-cart-title text-sm font-semibold text-zinc-200">
              Klaar voor de eerste scan
            </span>
            <span className="pos-empty-cart-copy mt-1.5 max-w-44 text-xs leading-relaxed text-zinc-500">
              Scan een barcode of tik op een product uit de catalogus.
            </span>
          </div>
        ) : (
          itemsToCheckout.map((order) => {
            const unit = lineUnitCents(order);
            const standardPrice = Number(
              order.product.customFields?.standardPriceCents ??
                order.product.priceCents,
            );
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
                      {standardPrice !== order.product.priceCents && (
                        <span className="ml-1.5 rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-bold text-sky-800">
                          {String(order.product.customFields?.appliedPriceGroup)} · normaal {formatEUR(standardPrice)}
                        </span>
                      )}
                      {unit !== order.product.priceCents && (
                        <span className="text-zinc-500">
                          {" "}
                          · basis {formatEUR(order.product.priceCents)}
                        </span>
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
                            {m.deltaCents > 0
                              ? ` (${formatEUR(m.deltaCents)})`
                              : ""}
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
                      type="button"
                      aria-label={`Aantal ${order.product.name} verlagen`}
                      onClick={() =>
                        updateOrderItemQuantity(
                          order.lineId,
                          order.quantity - 1,
                        )
                      }
                      disabled={order.quantity <= 1}
                      className="w-8 h-8 flex items-center justify-center bg-white hover:bg-zinc-100 rounded-md text-zinc-600"
                    >
                      <Minus size={16} />
                    </button>
                    <span className="w-6 text-center font-semibold text-sm text-zinc-900">
                      {order.quantity}
                    </span>
                    <button
                      type="button"
                      aria-label={`Aantal ${order.product.name} verhogen`}
                      onClick={() =>
                        updateOrderItemQuantity(
                          order.lineId,
                          order.quantity + 1,
                        )
                      }
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
        {vatBlockers.length > 0 && (
          <div className="mb-3 flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 p-3 text-xs text-red-800">
            <AlertTriangle size={16} className="mt-px flex-shrink-0" />
            <div>
              <div className="font-semibold">
                Afrekenen geblokkeerd — niet-ondersteund BTW-tarief
              </div>
              <div className="mt-1">
                Enkel {SUPPORTED_VAT_RATES.join("% en ")}% zijn ondersteund.
                Corrigeer:{" "}
                {vatBlockers
                  .map(
                    (o) => `${o.product.name} (${String(o.product.vatRate)}%)`,
                  )
                  .join(", ")}
              </div>
            </div>
          </div>
        )}
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
                cartDiscount ? "bg-amber-50 text-amber-700" : "pos-accent-link"
              } disabled:opacity-40`}
            >
              <Percent size={13} />
              {cartDiscount
                ? `−${formatEUR(cartDiscount.amountCents)}`
                : "Toevoegen"}
            </button>
          </div>
          {manualDiscountCents > 0 && (
            <div className="flex justify-between text-xs text-zinc-400">
              <span>{cartDiscount?.reason ?? "Toegepaste korting"}</span>
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
          {cartGiftCards.map((gc) => (
            <div key={gc.id} className="flex justify-between text-[#667619]">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  aria-label={`Cadeaubon ${gc.code} verwijderen`}
                  onClick={() => removeCartGiftCard(gc.id)}
                  className="text-red-400 hover:text-red-300 mr-1"
                >
                  <Minus size={14} />
                </button>
                <span>Cadeaubon ({gc.code})</span>
              </div>
              <span className="tabular-nums">−{formatEUR(gc.amountCents)}</span>
            </div>
          ))}
          <div className="flex justify-between text-xl font-bold text-zinc-950 pt-3 mt-2 border-t border-zinc-200">
            <span>
              {cartGiftCards.length > 0 ? "Nog te betalen" : "Totaal"}
            </span>
            <span className="tabular-nums">{formatEUR(remainingTotal)}</span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={() => handleCheckout("Cash")}
            disabled={checkoutBlocked}
            className="pos-payment-secondary flex flex-col items-center justify-center gap-1.5 py-3 border border-zinc-200 bg-white text-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl font-semibold transition-colors"
          >
            <Banknote size={24} />
            <span className="text-sm">Cash</span>
          </button>
          <button
            onClick={() => handleCheckout("PIN")}
            disabled={checkoutBlocked}
            className="pos-primary-action flex flex-col items-center justify-center gap-1.5 py-3 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl font-semibold shadow-sm transition-colors"
          >
            <CreditCard size={24} />
            <span className="text-sm">PIN</span>
          </button>
          <button
            onClick={() => {
              if (!checkoutBlocked) setGiftOpen(true);
            }}
            disabled={checkoutBlocked}
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
        subtotalCents={totals.subtotal}
        onApply={(d) => setCartDiscount(d)}
      />
      <CashPaymentModal
        open={cashOpen}
        onClose={() => setCashOpen(false)}
        totalCents={remainingTotal}
        onConfirm={(t) => {
          setCashOpen(false);
          void runCheckout("Cash", { tenderedCents: t });
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
      <InvoiceCustomerModal
        open={invoiceCustomerOpen}
        linkedCustomer={linkedCustomer}
        onClose={() => setInvoiceCustomerOpen(false)}
        onComplete={(customer, request) => {
          linkCustomer(customer.id);
          setDocumentRequest(request);
        }}
      />
      <GiftCardPaymentModal
        open={giftOpen}
        onClose={() => setGiftOpen(false)}
        totalCents={remainingTotal}
        appliedCentsByCardId={appliedGiftCardCents}
        linkedCustomerId={linkedCustomerId}
        onConfirm={(allocations, splitMethod) => {
          setGiftOpen(false);
          const nextCartGiftCards = dedupeGiftCards([
            ...cartGiftCards,
            ...allocations,
          ]);
          for (const item of allocations) {
            addCartGiftCard(item);
          }
          const allocated = nextCartGiftCards.reduce(
            (s, a) => s + a.amountCents,
            0,
          );

          if (splitMethod) {
            if (splitMethod === "Cash") {
              setCashOpen(true);
            } else {
              void runCheckout("PIN", { giftCards: nextCartGiftCards });
            }
          } else if (grandTotal - allocated <= 0) {
            void runCheckout("Cadeaubon", { giftCards: nextCartGiftCards });
          }
        }}
      />
      <Modal
        open={clearCartOpen}
        onClose={() => setClearCartOpen(false)}
        title="Winkelwagen annuleren"
        footer={
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setClearCartOpen(false)}
              className="rounded-lg bg-zinc-200 px-4 py-2 text-sm font-bold text-zinc-800"
            >
              Behouden
            </button>
            <button
              disabled={clearCartReason.trim().length < 3}
              onClick={() => {
                const lines = [...cart.orders];
                void (async () => {
                  for (const line of lines)
                    await voidOrderItem(line.lineId, clearCartReason.trim());
                  resetCartExtras();
                  useCustomerDisplayRuntime.getState().resetPayment();
                  setClearCartOpen(false);
                })();
              }}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
            >
              Annuleren en registreren
            </button>
          </div>
        }
      >
        <p className="text-sm text-zinc-300">
          Alle {cart.orders.length} regels worden als geannuleerd in de audit-
          en voidhistoriek bewaard.
        </p>
        <label className="mt-4 block text-xs font-bold text-zinc-400">
          Reden
          <textarea
            autoFocus
            value={clearCartReason}
            onChange={(event) => setClearCartReason(event.target.value)}
            className="mt-1.5 min-h-24 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-white"
          />
        </label>
      </Modal>
    </div>
  );
};
