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
  ExternalLink,
  LoaderCircle,
  MoreHorizontal,
  Clock3,
  Monitor,
  Pin,
  PinOff,
  X,
} from "lucide-react";
import { useStore } from "../store/useStore";
import { useProducts } from "../store/useProducts";
import { useAuth } from "../auth/useAuth";
import { SUPPORTED_VAT_RATES } from "../utils/vat";
import { formatEUR, parseDecimalToCents } from "../utils/money";
import { FEATURES } from "../config/features";
import {
  CheckoutError,
  dedupeGiftCards,
  finalizeCheckout,
  type GiftCardAllocation,
  type CheckoutTenderInput,
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
import { generateGiftCardCode, generateId, useCustomers } from "../store/useCustomers";
import { isGiftCardExpired } from "../utils/giftCards";
import { Modal } from "./Modal";
import { projectCart } from "../customer-display/cartProjection";
import { useCustomerDisplayRuntime } from "../customer-display/runtime";
import { openLocalCustomerDisplay } from "../customer-display/localSession";
import {
  customerDisplayStoreKey,
  DEFAULT_CUSTOMER_DISPLAY_CONFIG,
  useCustomerDisplaySettings,
} from "../customer-display/settings";
import {
  FEATURE_KEYS,
  isFeatureEnabledForSnapshot,
  useEntitlements,
} from "../billing/entitlements";
import { useEntitlementClock } from "../billing/useEntitlementClock";
import { useMerchantProfile } from "../store/useMerchantProfile";
import { convertTransactionToInvoiceData } from "../utils/invoicePdfGenerator";
import { InvoicePreviewModal } from "./InvoicePreviewModal";
import { InvoiceCustomerModal } from "./InvoiceCustomerModal";
import { SplitPaymentModal } from "./SplitPaymentModal";
import {
  cashRoundingAdjustmentCents,
  roundCashSettlementCents,
} from "../utils/cashRounding";
import {
  SuspendedCartsModal,
  type SuspendedCartListItem,
} from "./SuspendedCartsModal";
import {
  cancelMollieTerminalPayment,
  createMollieTestSimulatorPayment,
  createMollieTerminalPayment,
  getMollieTerminalPayment,
  MollieTerminalError,
  type MollieTerminalPayment,
} from "../services/mollieTerminal";
import { playRegisterSound } from "../sound/registerSounds";

type CardCheckoutExtras = {
  tenderedCents?: number;
  giftCards?: GiftCardAllocation[];
  tenders?: CheckoutTenderInput[];
};

type MollieFlow = {
  phase: "creating" | "waiting" | "booking" | "booking-error" | "status-error" | "declined";
  payment?: MollieTerminalPayment;
  clientRequestId: string;
  amountCents: number;
  mollieIdempotencyKey: string;
  method: TenderMethod;
  extras: CardCheckoutExtras;
  error?: string;
  storeId: string | null;
};

const mollieFlowStorageKey = (storeId: string | null) =>
  `pwayment:mollie-terminal-flow:v1:${storeId ?? "unscoped"}`;

const restoredMollieFlow = (storeId: string | null): MollieFlow | null => {
  try {
    const raw = globalThis.localStorage?.getItem(mollieFlowStorageKey(storeId));
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<MollieFlow>;
    if (
      !value.clientRequestId || !value.mollieIdempotencyKey ||
      !Number.isSafeInteger(value.amountCents) || Number(value.amountCents) <= 0 ||
      !value.method || !value.extras || value.storeId !== storeId
    ) return null;
    return {
      ...value,
      phase: value.payment?.status === "paid" ? "booking-error" : "status-error",
      error: value.payment?.status === "paid"
        ? "De kaartbetaling is gelukt. Rond de verkoopboeking opnieuw af."
        : "Een onderbroken terminalbetaling is teruggevonden. Controleer de status vóór u opnieuw afrekent.",
    } as MollieFlow;
  } catch {
    return null;
  }
};

const lineUnitCents = (o: OrderItem): number =>
  o.product.priceCents +
  (o.modifiers ?? []).reduce((s, m) => s + m.deltaCents, 0);

const documentRequestLabel = (
  request: { type: "receipt" | "invoice-b2c" | "invoice-b2b" },
): string => {
  if (request.type === "invoice-b2b") return "B2B-factuur";
  if (request.type === "invoice-b2c") return "B2C-factuur";
  return "Kassabon";
};

interface CartProps {
  desktopPanelMode?: "open" | "pinned";
  onCloseDesktopPanel?: () => void;
  onToggleDesktopPin?: () => void;
  onReceiptVisibilityChange?: (visible: boolean) => void;
}

export const Cart: React.FC<CartProps> = ({
  desktopPanelMode,
  onCloseDesktopPanel,
  onToggleDesktopPin,
  onReceiptVisibilityChange,
}) => {
  const cart = useStore((s) => s.cart);
  const updateOrderItemQuantity = useStore((s) => s.updateOrderItemQuantity);
  const removeOrderItem = useStore((s) => s.removeOrderItem);
  const clearCart = useStore((s) => s.clearCart);
  const voidOrderItem = useStore((s) => s.voidOrderItem);
  const cartDiscount = useStore((s) => s.cartDiscount);
  const setCartDiscount = useStore((s) => s.setCartDiscount);
  const documentRequest = useStore((s) => s.cartDocumentRequest);
  const setDocumentRequest = useStore((s) => s.setCartDocumentRequest);
  const cartCheckoutRequestId = useStore((s) => s.cartCheckoutRequestId);
  const setCartCheckoutRequestId = useStore(
    (s) => s.setCartCheckoutRequestId,
  );
  const suspendedCarts = useStore((s) => s.suspendedCarts);
  const suspendCurrentCart = useStore((s) => s.suspendCurrentCart);
  const resumeSuspendedCart = useStore((s) => s.resumeSuspendedCart);
  const discardSuspendedCart = useStore((s) => s.discardSuspendedCart);
  const resetCartExtras = useStore((s) => s.resetCartExtras);
  const cartGiftCards = useStore((s) => s.cartGiftCards);
  const addCartGiftCard = useStore((s) => s.addCartGiftCard);
  const removeCartGiftCard = useStore((s) => s.removeCartGiftCard);
  const syncPersistedProducts = useProducts((s) => s.syncPersisted);
  const auth = useAuth();
  const customerDisplaySettingsKey = customerDisplayStoreKey(
    auth.currentStoreId,
  );
  const customerDisplayConfig = useCustomerDisplaySettings(
    (state) =>
      state.configsByStore[customerDisplaySettingsKey] ??
      DEFAULT_CUSTOMER_DISPLAY_CONFIG,
  );
  const entitlementSnapshot = useEntitlements((state) => state.snapshot);
  const { now: entitlementNow } = useEntitlementClock();
  const customerDisplayEntitled = isFeatureEnabledForSnapshot(
    entitlementSnapshot,
    FEATURE_KEYS.customerDisplay,
    entitlementNow,
  );
  const [clearCartOpen, setClearCartOpen] = useState(false);
  const [clearCartReason, setClearCartReason] = useState(
    "Klant ziet af van aankoop",
  );

  const linkedCustomerId = useStore((s) => s.linkedCustomerId);
  const linkCustomer = useStore((s) => s.linkCustomer);
  const unlinkCustomer = useStore((s) => s.unlinkCustomer);
  const addGiftCardCheckoutItem = useStore((s) => s.addGiftCardCheckoutItem);

  const {
    customers,
    giftCards,
    hydrate,
    upsertCustomer,
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

  const queuedCartsForStore = useMemo(
    () =>
      suspendedCarts.filter((suspendedCart) =>
        suspendedCart.storeId === auth.currentStoreId,
      ),
    [auth.currentStoreId, suspendedCarts],
  );

  const queuedCartItems = useMemo<SuspendedCartListItem[]>(
    () =>
      queuedCartsForStore
        .map((suspendedCart) => {
          const customer = suspendedCart.linkedCustomerId
            ? customers.find(
                (candidate) => candidate.id === suspendedCart.linkedCustomerId,
              )
            : undefined;
          const projection = projectCart({
            orders: suspendedCart.cart.orders,
            linkedCustomer: customer,
            discountCents: suspendedCart.cartDiscount?.amountCents ?? 0,
            giftCards: suspendedCart.cartGiftCards,
          });
          const defaultLabel = customer?.name ?? "Wachtende klant";
          const label = suspendedCart.label?.trim() || defaultLabel;
          return {
            id: suspendedCart.id,
            label,
            heldAt: suspendedCart.suspendedAt,
            lineCount: suspendedCart.cart.orders.reduce(
              (sum, order) => sum + order.quantity,
              0,
            ),
            totalCents: projection.remainingCents,
            documentLabel: documentRequestLabel(suspendedCart.documentRequest),
            ...(customer && customer.name !== label
              ? { customerName: customer.name }
              : {}),
          };
        })
        .sort((left, right) => left.heldAt - right.heldAt),
    [customers, queuedCartsForStore],
  );

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
  const [mollieFlow, setMollieFlow] = useState<MollieFlow | null>(() => restoredMollieFlow(auth.currentStoreId));
  const ignoredMolliePayments = useRef(new Set<string>());
  const lastMollieAttentionKey = useRef("");
  const [receipt, setReceipt] = useState<Transaction | null>(null);
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [discountOpen, setDiscountOpen] = useState(false);
  const [cashOpen, setCashOpen] = useState(false);
  const [splitOpen, setSplitOpen] = useState(false);
  const [pendingSplitTenders, setPendingSplitTenders] = useState<CheckoutTenderInput[] | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [giftOpen, setGiftOpen] = useState(false);
  const [invoiceCustomerOpen, setInvoiceCustomerOpen] = useState(false);
  const [invoicePreviewOpen, setInvoicePreviewOpen] = useState(false);
  const [cartActionsOpen, setCartActionsOpen] = useState(false);
  const [giftCardSaleOpen, setGiftCardSaleOpen] = useState(false);
  const [giftCardSaleMode, setGiftCardSaleMode] = useState<"issue" | "recharge">("issue");
  const [giftCardSaleCode, setGiftCardSaleCode] = useState("");
  const [giftCardSaleAmount, setGiftCardSaleAmount] = useState("25,00");
  const [giftCardSaleCustomerId, setGiftCardSaleCustomerId] = useState("");
  const [giftCardSaleNewCustomer, setGiftCardSaleNewCustomer] = useState(false);
  const [giftCardSaleCustomerName, setGiftCardSaleCustomerName] = useState("");
  const [giftCardSaleCustomerEmail, setGiftCardSaleCustomerEmail] = useState("");
  const [giftCardSaleCustomerPhone, setGiftCardSaleCustomerPhone] = useState("");
  const [giftCardSaleExpiresAt, setGiftCardSaleExpiresAt] = useState("");
  const [giftCardSaleBusinessOpen, setGiftCardSaleBusinessOpen] = useState(false);
  const [giftCardSaleCompany, setGiftCardSaleCompany] = useState("");
  const [giftCardSaleVat, setGiftCardSaleVat] = useState("");
  const [giftCardSaleAddress, setGiftCardSaleAddress] = useState("");
  const [giftCardSalePostalCode, setGiftCardSalePostalCode] = useState("");
  const [giftCardSaleCity, setGiftCardSaleCity] = useState("");
  const [giftCardSaleCustomerIsBuyer, setGiftCardSaleCustomerIsBuyer] = useState(true);
  const [giftCardSaleError, setGiftCardSaleError] = useState<string | null>(null);
  const [queueOpen, setQueueOpen] = useState(false);
  const [resumeCartId, setResumeCartId] = useState<string | null>(null);
  const [discardCartId, setDiscardCartId] = useState<string | null>(null);
  const cartActionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      if (mollieFlow) {
        globalThis.localStorage?.setItem(mollieFlowStorageKey(auth.currentStoreId), JSON.stringify(mollieFlow));
      } else {
        globalThis.localStorage?.removeItem(mollieFlowStorageKey(auth.currentStoreId));
      }
    } catch {
      // The active in-memory flow remains safe when storage is unavailable.
    }
  }, [auth.currentStoreId, mollieFlow]);

  useEffect(() => {
    if (!mollieFlow || (mollieFlow.phase !== "status-error" && mollieFlow.phase !== "booking-error")) {
      return;
    }
    const key = `${mollieFlow.phase}:${mollieFlow.payment?.id ?? "new"}:${mollieFlow.error ?? ""}`;
    if (lastMollieAttentionKey.current === key) return;
    lastMollieAttentionKey.current = key;
    void playRegisterSound("attention");
  }, [mollieFlow]);

  useEffect(() => {
    if (!cartActionsOpen) return;
    const closeWhenOutside = (event: MouseEvent) => {
      if (!cartActionsRef.current?.contains(event.target as Node)) {
        setCartActionsOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setCartActionsOpen(false);
    };
    document.addEventListener("mousedown", closeWhenOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeWhenOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [cartActionsOpen]);

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
  const pendingCashTender = pendingSplitTenders?.find(
    (tender) => tender.method === "Cash",
  );
  const pendingPinCents = (pendingSplitTenders ?? [])
    .filter((tender) => tender.method === "PIN")
    .reduce((sum, tender) => sum + tender.amountCents, 0);
  const cashModalCommercialCents = pendingCashTender
    ? Math.max(0, remainingTotal - pendingPinCents)
    : remainingTotal;
  const cashModalTotalCents = pendingCashTender
    ? pendingCashTender.amountCents
    : roundCashSettlementCents(cashModalCommercialCents);
  const cashModalRoundingAdjustmentCents = cashRoundingAdjustmentCents(
    cashModalCommercialCents,
  );
  const checkoutBlocked =
    !hasItemsToCheckout || isProcessing || mollieFlow !== null || vatBlockers.length > 0;
  const completedInvoice = useMemo(
    () => receipt && receipt.documentRequest?.type !== "receipt"
      ? convertTransactionToInvoiceData(receipt, receipt.merchantSnapshot ?? merchantProfile, linkedCustomer)
      : null,
    [receipt, merchantProfile, linkedCustomer],
  );

  const openGiftCardSale = () => {
    setCartActionsOpen(false);
    setGiftCardSaleMode("issue");
    setGiftCardSaleCode(generateGiftCardCode());
    setGiftCardSaleAmount("25,00");
    setGiftCardSaleCustomerId(linkedCustomerId ?? "");
    setGiftCardSaleNewCustomer(false);
    setGiftCardSaleCustomerName("");
    setGiftCardSaleCustomerEmail("");
    setGiftCardSaleCustomerPhone("");
    const expiry = new Date();
    expiry.setFullYear(expiry.getFullYear() + 1);
    setGiftCardSaleExpiresAt(expiry.toISOString().slice(0, 10));
    setGiftCardSaleBusinessOpen(false);
    setGiftCardSaleCompany(""); setGiftCardSaleVat(""); setGiftCardSaleAddress(""); setGiftCardSalePostalCode(""); setGiftCardSaleCity("");
    setGiftCardSaleCustomerIsBuyer(true);
    setGiftCardSaleError(null);
    setGiftCardSaleOpen(true);
  };
  const prepareGiftCardSale = async () => {
    const parsed = parseDecimalToCents(giftCardSaleAmount);
    if (!parsed.ok || parsed.cents <= 0) return setGiftCardSaleError("Geef een geldig positief bedrag in.");
    const code = giftCardSaleCode.trim().toUpperCase();
    const existing = giftCards.find((card) => card.code.replace(/[\s-]/g, "").toUpperCase() === code.replace(/[\s-]/g, "").toUpperCase());
    if (giftCardSaleMode === "recharge" && !existing) return setGiftCardSaleError("Geen bestaande cadeaubon gevonden voor deze code.");
    if (giftCardSaleMode === "issue" && existing) return setGiftCardSaleError("Deze cadeauboncode bestaat al. Kies een andere code.");
    if (giftCardSaleMode === "issue" && !giftCardSaleExpiresAt) return setGiftCardSaleError("Een vervaldatum is verplicht voor een nieuwe cadeaubon.");
    let customerId = giftCardSaleCustomerId || undefined;
    if (giftCardSaleMode === "issue" && giftCardSaleNewCustomer) {
      const name = giftCardSaleCustomerName.trim();
      if (!name) return setGiftCardSaleError("Vul minstens de naam van de nieuwe klant in.");
      const businessDetailsStarted = [giftCardSaleCompany, giftCardSaleVat, giftCardSaleAddress, giftCardSalePostalCode, giftCardSaleCity]
        .some((value) => value.trim().length > 0);
      if (businessDetailsStarted && (!giftCardSaleCompany.trim() || !giftCardSaleAddress.trim() || !giftCardSalePostalCode.trim() || !giftCardSaleCity.trim())) return setGiftCardSaleError("Vul bedrijfsnaam en volledig facturatieadres in, of wis de begonnen zakelijke gegevens.");
      customerId = generateId();
      await upsertCustomer({ id: customerId, name, email: giftCardSaleCustomerEmail.trim() || undefined, phone: giftCardSaleCustomerPhone.trim() || undefined, totalSpentCents: 0, visitCount: 0, createdAt: new Date().toISOString(), isActive: true, billingProfile: businessDetailsStarted ? { type: "business", companyName: giftCardSaleCompany.trim(), contactName: name, addressLine1: giftCardSaleAddress.trim(), postalCode: giftCardSalePostalCode.trim(), city: giftCardSaleCity.trim(), countryCode: "BE", vatNumber: giftCardSaleVat.trim().toUpperCase() || undefined, email: giftCardSaleCustomerEmail.trim() || undefined } : undefined });
      if (giftCardSaleCustomerIsBuyer) linkCustomer(customerId);
    }
    addGiftCardCheckoutItem({
      action: giftCardSaleMode, cardId: existing?.id ?? generateId(), code,
      amountCents: parsed.cents, customerId: giftCardSaleMode === "recharge" ? existing?.customerId : customerId,
      expiresAt: giftCardSaleMode === "issue" ? new Date(`${giftCardSaleExpiresAt}T23:59:59`).toISOString() : undefined,
    });
    setGiftCardSaleOpen(false);
  };

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
            <ReceiptTicket transaction={receipt} />
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
                await adapter.printReceipt(receipt, { copy: "reprint" });
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
              onReceiptVisibilityChange?.(false);
              setReceipt(null);
              onCloseDesktopPanel?.();
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
    extras: CardCheckoutExtras & {
      clientRequestId?: string;
      paymentProviderReference?: string;
    } = {},
  ) => {
    if (!hasItemsToCheckout || isProcessing || vatBlockers.length > 0) return false;
    if (cartDiscount?.requiresReapproval && !auth.hasRole("owner", "manager")) {
      setDiscountOpen(true);
      alert(
        "Deze korting stond in wacht. Vraag vóór betaling opnieuw managergoedkeuring.",
      );
      return false;
    }
    if (documentRequest.type !== "receipt" && (
      !linkedCustomer || documentRequest.recipient?.customerId !== linkedCustomer.id
    )) {
      setInvoiceCustomerOpen(true);
      alert("Een factuur vereist een gekoppelde klant met volledige facturatiegegevens.");
      return false;
    }
    setIsProcessing(true);
    const displayMethod = extras.tenders?.some((tender) => tender.method === "PIN")
      ? "PIN"
      : method;
    useCustomerDisplayRuntime.getState().beginPayment(displayMethod);
    const clientRequestId = extras.clientRequestId ?? cartCheckoutRequestId ?? crypto.randomUUID();
    if (!cartCheckoutRequestId) setCartCheckoutRequestId(clientRequestId);

    try {
      const result = await finalizeCheckout({
        clientRequestId,
        cartId: cart.id,
        items: itemsToCheckout,
        discountCents: totalDiscountCents,
        discountReason: cartDiscount?.reason,
        discountApprovedByUserId: cartDiscount?.approvedByUserId,
        discountApprovalId: cartDiscount?.approvalId,
        giftCards: extras.giftCards ?? cartGiftCards,
        method,
        paymentProvider: extras.paymentProviderReference ? "mollie" : undefined,
        paymentProviderReference: extras.paymentProviderReference,
        tenders: extras.tenders,
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

      setCartCheckoutRequestId(null);
      useCustomerDisplayRuntime
        .getState()
        .completePayment(result.transaction);
      onReceiptVisibilityChange?.(true);
      clearCart();
      setReceipt(result.transaction);
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
      return true;
    } catch (error) {
      useCustomerDisplayRuntime.getState().failPayment(displayMethod);
      void playRegisterSound("attention");
      console.error("Checkout failed:", error);
      alert(
        error instanceof CheckoutError
          ? error.message
          : "Er ging iets mis bij het afrekenen. Er is niets geboekt — probeer opnieuw.",
      );
      return false;
    } finally {
      setIsProcessing(false);
    }
  };

  const checkoutPreflight = () => {
    if (!hasItemsToCheckout || isProcessing || vatBlockers.length > 0) return false;
    if (cartDiscount?.requiresReapproval && !auth.hasRole("owner", "manager")) {
      setDiscountOpen(true);
      alert("Deze korting stond in wacht. Vraag vóór betaling opnieuw managergoedkeuring.");
      return false;
    }
    if (documentRequest.type !== "receipt" && (
      !linkedCustomer || documentRequest.recipient?.customerId !== linkedCustomer.id
    )) {
      setInvoiceCustomerOpen(true);
      alert("Een factuur vereist een gekoppelde klant met volledige facturatiegegevens.");
      return false;
    }
    return true;
  };

  const bookConfirmedMolliePayment = async (flow: MollieFlow, payment: MollieTerminalPayment) => {
    setMollieFlow({ ...flow, phase: "booking", payment, error: undefined });
    const booked = await runCheckout(flow.method, {
      ...flow.extras,
      clientRequestId: flow.clientRequestId,
      // A simulator payment is only a local UI aid: no Mollie transaction
      // exists and therefore no external reconciliation reference may be sent.
      paymentProviderReference: payment.simulator ? undefined : payment.id,
    });
    if (booked) {
      setMollieFlow(null);
    } else {
      setMollieFlow({
        ...flow,
        phase: "booking-error",
        payment,
        error: "De kaartbetaling is gelukt, maar de verkoopboeking moet opnieuw worden geprobeerd.",
      });
    }
  };

  const followMolliePayment = async (flow: MollieFlow, initial: MollieTerminalPayment) => {
    let payment = initial;
    if (payment.amountCents !== flow.amountCents) {
      setMollieFlow({
        ...flow,
        phase: "status-error",
        payment,
        error: "Het bedrag bij Mollie komt niet overeen met de winkelwagen. De verkoop is niet geboekt.",
      });
      return;
    }
    setMollieFlow({ ...flow, phase: "waiting", payment, error: undefined });
    if (payment.simulator) {
      if (payment.status === "paid") await bookConfirmedMolliePayment(flow, payment);
      return;
    }
    for (let attempt = 0; attempt < 150; attempt += 1) {
      if (ignoredMolliePayments.current.has(payment.id)) return;
      if (payment.status === "paid") {
        await bookConfirmedMolliePayment(flow, payment);
        return;
      }
      if (["failed", "canceled", "expired"].includes(payment.status)) {
        setMollieFlow({
          ...flow,
          phase: "declined",
          payment,
          error: payment.status === "canceled"
            ? "De betaling is geannuleerd."
            : payment.status === "expired"
              ? "De betaling is verlopen."
              : "De kaartbetaling is geweigerd of mislukt.",
        });
        return;
      }
      await new Promise<void>((resolve) => window.setTimeout(resolve, 2_000));
      try {
        payment = await getMollieTerminalPayment(payment.id);
        if (payment.amountCents !== flow.amountCents) {
          setMollieFlow({
            ...flow,
            phase: "status-error",
            payment,
            error: "Het bedrag bij Mollie komt niet overeen met de winkelwagen. De verkoop is niet geboekt.",
          });
          return;
        }
        setMollieFlow({ ...flow, phase: "waiting", payment });
      } catch (error) {
        setMollieFlow({
          ...flow,
          phase: "status-error",
          payment,
          error: error instanceof Error ? error.message : "De betaalstatus kon niet worden opgehaald.",
        });
        return;
      }
    }
    setMollieFlow({
      ...flow,
      phase: "status-error",
      payment,
      error: "De terminal reageert niet binnen vijf minuten. Controleer de betaalstatus opnieuw.",
    });
  };

  const createMolliePaymentWithTestFallback = async (flow: MollieFlow) => {
    // The dedicated public E2E bundle has no Supabase auth session or payment
    // API. Keep production behaviour untouched while making checkout tests use
    // the same deterministic terminal simulator as the server test-mode path.
    if (import.meta.env.VITE_E2E_BUILD === "true") {
      return {
        ...createMollieTestSimulatorPayment(flow.amountCents),
        status: "paid" as const,
      };
    }
    try {
      return await createMollieTerminalPayment({
        amountCents: flow.amountCents,
        description: `PWAYMENT kassaverkoop ${flow.clientRequestId.slice(0, 12)}`,
        idempotencyKey: flow.mollieIdempotencyKey,
      });
    } catch (error) {
      if (error instanceof MollieTerminalError && error.code === "MOLLIE_TEST_TERMINAL_NOT_READY") {
        return createMollieTestSimulatorPayment(flow.amountCents);
      }
      throw error;
    }
  };

  const startMollieCheckout = async (method: TenderMethod, extras: CardCheckoutExtras = {}) => {
    if (!checkoutPreflight()) return;
    const giftCardCents = (extras.giftCards ?? cartGiftCards)
      .reduce((sum, allocation) => sum + allocation.amountCents, 0);
    const amountCents = (extras.tenders ?? [{
      method: "PIN" as const,
      amountCents: Math.max(0, grandTotal - giftCardCents),
    }])
      .filter((tender) => tender.method === "PIN")
      .reduce((sum, tender) => sum + tender.amountCents, 0);
    if (amountCents <= 0) return;
    const clientRequestId = cartCheckoutRequestId ?? crypto.randomUUID();
    if (!cartCheckoutRequestId) setCartCheckoutRequestId(clientRequestId);
    const flow: MollieFlow = {
      phase: "creating",
      clientRequestId,
      amountCents,
      mollieIdempotencyKey: `${clientRequestId}:mollie:${crypto.randomUUID()}`,
      storeId: auth.currentStoreId,
      method,
      extras,
    };
    setMollieFlow(flow);
    try {
      const payment = await createMolliePaymentWithTestFallback(flow);
      await followMolliePayment(flow, payment);
    } catch (error) {
      setMollieFlow({
        ...flow,
        phase: "status-error",
        error: error instanceof Error ? error.message : "De terminalbetaling kon niet worden gestart.",
      });
    }
  };

  const cancelActiveMolliePayment = async () => {
    const flow = mollieFlow;
    if (!flow?.payment) return;
    ignoredMolliePayments.current.add(flow.payment.id);
    if (flow.payment.simulator) {
      const payment = { ...flow.payment, status: "canceled" as const };
      setMollieFlow({ ...flow, phase: "declined", payment, error: "De testbetaling is geannuleerd." });
      return;
    }
    try {
      const payment = await cancelMollieTerminalPayment(flow.payment.id);
      setMollieFlow({ ...flow, phase: "declined", payment, error: "De betaling is geannuleerd." });
    } catch (error) {
      ignoredMolliePayments.current.delete(flow.payment.id);
      setMollieFlow({
        ...flow,
        phase: "status-error",
        error: error instanceof Error ? error.message : "Annuleren is niet gelukt. Controleer eerst de betaalstatus.",
      });
    }
  };

  const retryMollieFlow = async () => {
    const flow = mollieFlow;
    if (!flow) return;
    if (flow.phase === "booking-error" && flow.payment) {
      await bookConfirmedMolliePayment(flow, flow.payment);
      return;
    }
    try {
      ignoredMolliePayments.current.delete(flow.payment?.id ?? "");
      const payment = flow.payment ?? await createMolliePaymentWithTestFallback(flow);
      await followMolliePayment(flow, payment);
    } catch (error) {
      setMollieFlow({
        ...flow,
        phase: "status-error",
        error: error instanceof Error ? error.message : "De betaalstatus kon niet worden gecontroleerd.",
      });
    }
  };

  const completeSimulatedMolliePayment = async (status: "paid" | "failed") => {
    const flow = mollieFlow;
    if (!flow?.payment?.simulator) return;
    const payment = { ...flow.payment, status };
    if (status === "paid") {
      await bookConfirmedMolliePayment(flow, payment);
      return;
    }
    setMollieFlow({
      ...flow,
      phase: "declined",
      payment,
      error: "De testkaartbetaling is geweigerd.",
    });
  };

  const closeMollieFlow = () => {
    if (!mollieFlow) return;
    const safeToDismiss = mollieFlow.phase === "declined"
      || (mollieFlow.phase === "status-error" && !mollieFlow.payment);
    if (!safeToDismiss) return;
    if (!mollieFlow.payment) setCartCheckoutRequestId(null);
    setMollieFlow(null);
  };

  const handleCheckout = (method: TenderMethod) => {
    if (method === "Cash") {
      setPendingSplitTenders(null);
      setCashOpen(true);
      return;
    }
    void startMollieCheckout(method);
  };

  const openCustomerDisplay = () => {
    setCartActionsOpen(false);
    if (!customerDisplayEntitled || !customerDisplayConfig.enabled) return;
    const opened = openLocalCustomerDisplay();
    if (!opened) {
      alert(
        "De browser heeft het venster geblokkeerd. Sta pop-ups toe voor PWAYMENT en probeer opnieuw.",
      );
      return;
    }
    opened.focus();
  };

  const activeCartLabel = linkedCustomer?.name;
  const heldBy = {
    userId: auth.currentUserId,
    userName: auth.currentUserName,
  };

  const holdCurrentCart = () => {
    setCartActionsOpen(false);
    if (isProcessing || cart.orders.length === 0) return;
    const snapshot = suspendCurrentCart({
      storeId: auth.currentStoreId,
      heldBy,
      label: activeCartLabel,
    });
    if (snapshot) {
      setEditingLineId(null);
      setPendingSplitTenders(null);
      useCustomerDisplayRuntime.getState().resetPayment();
    }
  };

  const restoreQueuedCart = (id: string, suspendCurrent = false) => {
    const restored = resumeSuspendedCart(id, {
      storeId: auth.currentStoreId,
      suspendCurrent,
      suspendLabel: activeCartLabel,
      heldBy,
    });
    if (!restored) {
      alert("Dit wachtende mandje is niet meer beschikbaar op deze kassa.");
      return;
    }
    setResumeCartId(null);
    setQueueOpen(false);
    setCartActionsOpen(false);
    setEditingLineId(null);
    setPendingSplitTenders(null);
    useCustomerDisplayRuntime.getState().resetPayment();
  };

  const requestResumeQueuedCart = (id: string) => {
    if (cart.orders.length > 0) {
      setQueueOpen(false);
      setResumeCartId(id);
      return;
    }
    restoreQueuedCart(id);
  };

  const discardQueuedCart = (id: string) => {
    const discarded = discardSuspendedCart(id, {
      storeId: auth.currentStoreId,
    });
    if (!discarded) {
      alert("Dit wachtende mandje is niet meer beschikbaar op deze kassa.");
    }
    setDiscardCartId(null);
  };

  return (
    <div className="pos-cart flex flex-col h-full border-l border-slate-200">
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
        <div className="flex shrink-0 items-center gap-1">
          {desktopPanelMode && onToggleDesktopPin && (
            <button
              type="button"
              onClick={onToggleDesktopPin}
              className="pos-cart-icon-button rounded-xl border border-transparent p-2 transition-colors"
              title={desktopPanelMode === "pinned" ? "Winkelwagen losmaken" : "Winkelwagen vastzetten"}
              aria-label={desktopPanelMode === "pinned" ? "Winkelwagen losmaken" : "Winkelwagen vastzetten"}
            >
              {desktopPanelMode === "pinned" ? <PinOff size={18} /> : <Pin size={18} />}
            </button>
          )}
          {desktopPanelMode === "open" && onCloseDesktopPanel && (
            <button
              type="button"
              onClick={onCloseDesktopPanel}
              className="pos-cart-icon-button rounded-xl border border-transparent p-2 transition-colors"
              title="Winkelwagen sluiten"
              aria-label="Winkelwagen sluiten"
            >
              <X size={19} />
            </button>
          )}
          <div ref={cartActionsRef} className="relative shrink-0">
            <button
              type="button"
              onClick={() => setCartActionsOpen((open) => !open)}
              className={`pos-cart-icon-button rounded-xl border p-2 transition-colors ${
                cartActionsOpen
                  ? "pos-cart-icon-button--active"
                  : "border-transparent"
              }`}
              title="Winkelwagenacties"
              aria-label="Winkelwagenacties"
              aria-expanded={cartActionsOpen}
              aria-haspopup="menu"
            >
              <MoreHorizontal size={20} />
            </button>
            {cartActionsOpen && (
              <div
                role="menu"
                aria-label="Winkelwagenacties"
                className="pos-cart-actions absolute right-0 top-11 z-40 w-64 rounded-2xl border p-1.5 shadow-xl"
              >
              <button
                type="button"
                role="menuitem"
                disabled={cart.orders.length === 0 || isProcessing}
                onClick={holdCurrentCart}
                className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-bold text-sky-800 transition-colors hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Clock3 size={16} /> In wachtrij zetten
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setCartActionsOpen(false);
                  setQueueOpen(true);
                }}
                className="pos-cart-action-row flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-bold transition-colors"
              >
                <span className="inline-flex items-center gap-2">
                  <Clock3 size={16} /> Wachtende klanten
                </span>
                {queuedCartItems.length > 0 && (
                  <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-black text-sky-800">
                    {queuedCartItems.length}
                  </span>
                )}
              </button>
              {customerDisplayEntitled && (
                <button
                  type="button"
                  role="menuitem"
                  disabled={!customerDisplayConfig.enabled}
                  onClick={openCustomerDisplay}
                  title={
                    customerDisplayConfig.enabled
                      ? "Open het tweede klantenscherm"
                      : "Schakel het klantenscherm eerst in via Instellingen → Hardware."
                  }
                  className="pos-cart-action-row flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <span className="inline-flex items-center gap-2">
                    <Monitor size={16} /> Open klantenscherm
                  </span>
                  {!customerDisplayConfig.enabled && (
                    <span className="text-[10px] font-bold text-slate-400">
                      Uit
                    </span>
                  )}
                </button>
              )}
              <div className="my-1.5 border-t border-slate-100" />
              <button
                type="button"
                role="menuitem"
                disabled={cart.orders.length > 0 || isProcessing}
                onClick={openGiftCardSale}
                title={cart.orders.length > 0 ? "Werk cadeaubonnen als een aparte kassatransactie af." : "Nieuwe cadeaubon uitgeven of bestaande opladen"}
                className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-bold text-sky-800 transition-colors hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Gift size={16} /> Cadeaubon uitgeven of opladen
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setCartActionsOpen(false);
                  setInvoiceCustomerOpen(true);
                }}
                className="pos-cart-action-row flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition-colors"
              >
                <FileText size={16} />
                {documentRequest.type === "receipt"
                  ? "Factuur opmaken"
                  : "Factuur wijzigen"}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setCartActionsOpen(false);
                  setLinkOpen(true);
                }}
                className="pos-cart-action-row flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition-colors"
              >
                <User size={16} />
                {linkedCustomer ? "Gekoppelde klant wijzigen" : "Klant koppelen"}
              </button>
              {cart.orders.length > 0 && (
                <>
                  <div className="my-1.5 border-t border-slate-100" />
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setCartActionsOpen(false);
                      setClearCartOpen(true);
                    }}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-bold text-red-600 transition-colors hover:bg-red-50"
                  >
                    <Trash2 size={16} /> Winkelwagen annuleren
                  </button>
                </>
              )}
              </div>
            )}
          </div>
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
            {queuedCartItems.length > 0 && (
              <button
                type="button"
                onClick={() => setQueueOpen(true)}
                className="mt-4 inline-flex items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-bold text-sky-800 transition-colors hover:bg-sky-100"
              >
                <Clock3 size={15} />
                {queuedCartItems.length === 1
                  ? "1 klant wacht"
                  : `${queuedCartItems.length} klanten wachten`}
              </button>
            )}
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
                className="pos-cart-line rounded-xl border p-3 shadow-sm transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <button
                    onClick={() => setEditingLineId(order.lineId)}
                    className="flex-1 text-left pr-2"
                  >
                    <div className="pos-cart-line-title flex items-center gap-2 text-sm font-semibold leading-tight">
                      <span>{order.product.name}</span>
                    </div>
                    <div className="pos-cart-line-price mt-0.5 text-sm">
                      {formatEUR(unit)}
                      {standardPrice !== order.product.priceCents && (
                        <span className="ml-1.5 rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-bold text-sky-800">
                          {String(order.product.customFields?.appliedPriceGroup)} · normaal {formatEUR(standardPrice)}
                        </span>
                      )}
                      {unit !== order.product.priceCents && (
                        <span className="pos-cart-line-base-price">
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
                            className="pos-cart-modifier rounded px-1.5 py-0.5 text-[11px]"
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
                  <div className="pos-cart-quantity flex items-center gap-1 rounded-lg border p-1">
                    <button
                      type="button"
                      aria-label={
                        order.quantity === 1
                          ? `${order.product.name} verwijderen`
                          : `Aantal ${order.product.name} verlagen`
                      }
                      title={
                        order.quantity === 1
                          ? "Product verwijderen"
                          : "Aantal verlagen"
                      }
                      onClick={() => {
                        if (order.quantity === 1) {
                          removeOrderItem(order.lineId);
                          return;
                        }
                        updateOrderItemQuantity(
                          order.lineId,
                          order.quantity - 1,
                        );
                      }}
                      className={`pos-cart-quantity-button flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
                        order.quantity === 1
                          ? "pos-cart-quantity-button--remove"
                          : ""
                      }`}
                    >
                      <Minus size={16} />
                    </button>
                    <span className="pos-cart-quantity-value w-6 text-center text-sm font-semibold">
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
                      className="pos-cart-quantity-button flex h-8 w-8 items-center justify-center rounded-md transition-colors"
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
          <div className="pos-checkout-row pos-checkout-row--muted flex justify-between">
            <span>Subtotaal</span>
            <span className="tabular-nums">{formatEUR(totals.subtotal)}</span>
          </div>
          <div className="pos-checkout-row flex items-center justify-between">
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
            <div className="pos-checkout-row pos-checkout-row--muted flex justify-between text-xs">
              <span>{cartDiscount?.reason ?? "Toegepaste korting"}</span>
              <span>In totaal verwerkt</span>
            </div>
          )}
          {totals.vatBreakdown.map((line) => (
            <div key={line.rate} className="pos-checkout-row flex justify-between text-xs">
              <span>BTW {line.rate}%</span>
              <span className="tabular-nums">{formatEUR(line.vatCents)}</span>
            </div>
          ))}
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
          <div className="pos-checkout-total mt-2 flex justify-between border-t pt-3 text-xl font-bold">
            <span>
              {cartGiftCards.length > 0 ? "Nog te betalen" : "Totaal"}
            </span>
            <span className="tabular-nums">{formatEUR(remainingTotal)}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => handleCheckout("Cash")}
            disabled={checkoutBlocked}
            className="pos-payment-secondary flex flex-col items-center justify-center gap-1.5 rounded-xl border py-3 font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50"
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
            <span className="text-sm">Kaart</span>
          </button>
        </div>
        <button
          type="button"
          onClick={() => {
            if (!checkoutBlocked) setSplitOpen(true);
          }}
          disabled={checkoutBlocked}
          className="pos-checkout-split mt-2 w-full rounded-lg px-3 py-2 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-50"
        >
          Deels betalen of cadeaubon gebruiken
        </button>
      </div>

      <ItemEditModal
        tableId={cart.id}
        lineId={editingLineId}
        onClose={() => setEditingLineId(null)}
      />
      <DiscountModal
        open={discountOpen}
        onClose={() => setDiscountOpen(false)}
        cartId={cart.id}
        subtotalCents={totals.subtotal}
        onApply={(d) => setCartDiscount(d)}
      />
      <CashPaymentModal
        open={cashOpen}
        onClose={() => {
          setCashOpen(false);
          setPendingSplitTenders(null);
        }}
        totalCents={
          cashModalTotalCents
        }
        commercialTotalCents={cashModalCommercialCents}
        roundingAdjustmentCents={cashModalRoundingAdjustmentCents}
        onConfirm={(t) => {
          setCashOpen(false);
          const splitTenders = pendingSplitTenders;
          setPendingSplitTenders(null);
          const method = splitTenders?.some((tender) => tender.method === "PIN")
            ? "PIN"
            : "Cash";
          const extras = { tenderedCents: t, tenders: splitTenders ?? undefined };
          if (method === "PIN") void startMollieCheckout(method, extras);
          else void runCheckout(method, extras);
        }}
      />
      <SplitPaymentModal
        open={splitOpen}
        totalCents={remainingTotal}
        onClose={() => setSplitOpen(false)}
        onUseGiftCard={() => {
          setSplitOpen(false);
          setGiftOpen(true);
        }}
        onConfirm={(tenders) => {
          setSplitOpen(false);
          const cashTender = tenders.find((tender) => tender.method === "Cash");
          if (cashTender) {
            setPendingSplitTenders(tenders);
            setCashOpen(true);
            return;
          }
          void startMollieCheckout("PIN", { tenders });
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
              void startMollieCheckout("PIN", { giftCards: nextCartGiftCards });
            }
          } else if (grandTotal - allocated <= 0) {
            void runCheckout("Cadeaubon", { giftCards: nextCartGiftCards });
          }
        }}
      />
      <Modal
        open={giftCardSaleOpen}
        onClose={() => setGiftCardSaleOpen(false)}
        title="Cadeaubon via kassa"
        subtitle="Het saldo wijzigt pas na de normale betaling."
        icon={<Gift size={20} />}
        footer={<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" onClick={() => setGiftCardSaleOpen(false)} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700">Annuleren</button><button type="button" onClick={() => void prepareGiftCardSale()} className="rounded-xl bg-sky-700 px-4 py-2 text-sm font-bold text-white hover:bg-sky-800">Naar betaling</button></div>}
      >
        <div className="space-y-4">
          {giftCardSaleError && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{giftCardSaleError}</p>}
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
            {(["issue", "recharge"] as const).map((mode) => <button key={mode} type="button" onClick={() => { setGiftCardSaleMode(mode); setGiftCardSaleError(null); }} className={`rounded-lg px-3 py-2 text-sm font-bold ${giftCardSaleMode === mode ? "bg-white text-sky-800 shadow-sm" : "text-slate-500"}`}>{mode === "issue" ? "Nieuwe bon" : "Opladen"}</button>)}
          </div>
          <label className="block text-sm font-bold text-slate-700">Cadeauboncode<input value={giftCardSaleCode} onChange={(event) => setGiftCardSaleCode(event.target.value.toUpperCase())} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2 font-mono text-sm" placeholder="Scan of voer code in" autoFocus /></label>
          <div className="grid grid-cols-5 gap-2">{[10,25,50,75,100].map((amount) => <button key={amount} type="button" onClick={() => setGiftCardSaleAmount(`${amount},00`)} className={`rounded-lg border px-1 py-2 text-xs font-bold ${giftCardSaleAmount === `${amount},00` ? "border-sky-500 bg-sky-50 text-sky-800" : "border-slate-200 text-slate-600"}`}>€{amount}</button>)}</div>
          <label className="block text-sm font-bold text-slate-700">Bedrag (€)<input inputMode="decimal" value={giftCardSaleAmount} onChange={(event) => setGiftCardSaleAmount(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2 tabular-nums" /></label>
          {giftCardSaleMode === "issue" && <label className="block text-sm font-bold text-slate-700">Geldig tot<input type="date" required value={giftCardSaleExpiresAt} min={new Date().toISOString().slice(0, 10)} onChange={(event) => setGiftCardSaleExpiresAt(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2" /></label>}
          {giftCardSaleMode === "issue" && <div className="space-y-2"><div className="flex items-center justify-between"><span className="text-sm font-bold text-slate-700">Houder van de cadeaubon <span className="font-normal text-slate-400">(optioneel)</span></span><button type="button" onClick={() => setGiftCardSaleNewCustomer((open) => !open)} className="text-xs font-bold text-sky-700 hover:text-sky-900">{giftCardSaleNewCustomer ? "Bestaande klant kiezen" : "+ Nieuwe klant"}</button></div>{giftCardSaleNewCustomer ? <div className="grid gap-2 rounded-xl border border-sky-100 bg-sky-50 p-3"><input value={giftCardSaleCustomerName} onChange={(event) => setGiftCardSaleCustomerName(event.target.value)} placeholder="Naam *" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" autoFocus /><div className="grid grid-cols-2 gap-2"><input value={giftCardSaleCustomerEmail} onChange={(event) => setGiftCardSaleCustomerEmail(event.target.value)} placeholder="E-mail" className="min-w-0 rounded-lg border border-slate-300 px-3 py-2 text-sm" /><input value={giftCardSaleCustomerPhone} onChange={(event) => setGiftCardSaleCustomerPhone(event.target.value)} placeholder="Telefoon" className="min-w-0 rounded-lg border border-slate-300 px-3 py-2 text-sm" /></div><label className="flex items-center gap-2 text-xs font-semibold text-slate-700"><input type="checkbox" checked={giftCardSaleCustomerIsBuyer} onChange={(event) => setGiftCardSaleCustomerIsBuyer(event.target.checked)} /> Deze klant is ook de koper/factuurklant</label><button type="button" onClick={() => setGiftCardSaleBusinessOpen((open) => !open)} className="w-fit text-xs font-bold text-sky-700">{giftCardSaleBusinessOpen ? "Zakelijke gegevens verbergen" : "+ Zakelijke/facturatiegegevens"}</button>{giftCardSaleBusinessOpen && <div className="grid gap-2 border-t border-sky-200 pt-2"><input value={giftCardSaleCompany} onChange={(event) => setGiftCardSaleCompany(event.target.value)} placeholder="Bedrijfsnaam *" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" /><input value={giftCardSaleVat} onChange={(event) => setGiftCardSaleVat(event.target.value)} placeholder="BTW-nummer" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" /><input value={giftCardSaleAddress} onChange={(event) => setGiftCardSaleAddress(event.target.value)} placeholder="Straat en nummer *" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" /><div className="grid grid-cols-2 gap-2"><input value={giftCardSalePostalCode} onChange={(event) => setGiftCardSalePostalCode(event.target.value)} placeholder="Postcode *" className="min-w-0 rounded-lg border border-slate-300 px-3 py-2 text-sm" /><input value={giftCardSaleCity} onChange={(event) => setGiftCardSaleCity(event.target.value)} placeholder="Gemeente *" className="min-w-0 rounded-lg border border-slate-300 px-3 py-2 text-sm" /></div></div>}</div> : <select value={giftCardSaleCustomerId} onChange={(event) => setGiftCardSaleCustomerId(event.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2"><option value="">Anonieme cadeaubon</option>{customers.filter((customer) => customer.isActive).map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select>}<p className="text-xs leading-5 text-slate-500">Koper/factuurklant kan verschillen van de houder. Kies hem via Winkelwagenacties → Klant koppelen of Factuur opmaken.</p></div>}
          {giftCardSaleMode === "recharge" && <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">Scan de bestaande kaart. Het actuele saldo wordt opnieuw gecontroleerd zodra de betaling wordt geboekt.</p>}
        </div>
      </Modal>
      <Modal
        open={mollieFlow !== null}
        onClose={closeMollieFlow}
        title="Betalen met Mollie"
        subtitle={mollieFlow?.payment ? `Referentie ${mollieFlow.payment.id}` : "Beveiligde terminalbetaling"}
        icon={mollieFlow?.phase === "declined" ? <AlertTriangle size={20} /> : <CreditCard size={20} />}
        closeOnBackdrop={false}
        footer={mollieFlow && (
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            {mollieFlow.phase === "status-error" && !mollieFlow.payment && (
              <button
                type="button"
                onClick={closeMollieFlow}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
              >
                Sluiten
              </button>
            )}
            {mollieFlow.phase === "waiting" && mollieFlow.payment && (
              <button
                type="button"
                onClick={() => void cancelActiveMolliePayment()}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
              >
                Betaling annuleren
              </button>
            )}
            {(mollieFlow.phase === "status-error" || mollieFlow.phase === "booking-error") && (
              <button
                type="button"
                onClick={() => void retryMollieFlow()}
                className="rounded-xl bg-sky-700 px-4 py-2 text-sm font-bold text-white hover:bg-sky-800"
              >
                {mollieFlow.phase === "booking-error" ? "Verkoop opnieuw boeken" : "Status opnieuw controleren"}
              </button>
            )}
            {mollieFlow.phase === "declined" && (
              <button
                type="button"
                onClick={closeMollieFlow}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800"
              >
                Sluiten
              </button>
            )}
          </div>
        )}
      >
        {mollieFlow && (
          <div className="space-y-4 text-center">
            {(mollieFlow.phase === "creating" || mollieFlow.phase === "waiting" || mollieFlow.phase === "booking") && (
              <LoaderCircle className="mx-auto animate-spin text-sky-700" size={42} aria-hidden="true" />
            )}
            <div>
              <p className="text-lg font-black text-slate-900">
                {mollieFlow.phase === "creating" && "Terminal wordt gestart…"}
                {mollieFlow.phase === "waiting" && "Volg de instructies op de terminal"}
                {mollieFlow.phase === "booking" && "Betaling gelukt — verkoop wordt geboekt…"}
                {mollieFlow.phase === "booking-error" && "Kaartbetaling gelukt"}
                {mollieFlow.phase === "status-error" && "Statuscontrole onderbroken"}
                {mollieFlow.phase === "declined" && "Betaling niet voltooid"}
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Te betalen via kaart: {formatEUR(mollieFlow.amountCents)}
              </p>
            </div>
            {mollieFlow.error && (
              <p role="alert" className={`rounded-xl border px-3 py-2 text-left text-sm ${
                mollieFlow.phase === "booking-error"
                  ? "border-amber-200 bg-amber-50 text-amber-800"
                  : "border-red-200 bg-red-50 text-red-700"
              }`}>
                {mollieFlow.error}
              </p>
            )}
            {mollieFlow.payment?.testMode && mollieFlow.payment.changePaymentStateUrl && mollieFlow.phase === "waiting" && (
              <a
                href={mollieFlow.payment.changePaymentStateUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-bold text-blue-800 hover:bg-blue-100"
              >
                Teststatus kiezen <ExternalLink size={15} />
              </a>
            )}
            {mollieFlow.payment?.simulator && mollieFlow.phase === "waiting" && (
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => void completeSimulatedMolliePayment("failed")}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
                >
                  Simuleer weigering
                </button>
                <button
                  type="button"
                  onClick={() => void completeSimulatedMolliePayment("paid")}
                  className="rounded-xl bg-emerald-600 px-3 py-2 text-sm font-bold text-white hover:bg-emerald-700"
                >
                  Simuleer geslaagde betaling
                </button>
              </div>
            )}
            {mollieFlow.payment?.testMode && (
              <p className="text-xs leading-5 text-slate-400">
                {mollieFlow.payment.simulator
                  ? "PWAYMENT terminalsimulator — er wordt niets naar Mollie gestuurd en geen geld afgeschreven."
                  : "Mollie testmodus — er wordt geen echt geld afgeschreven."}
              </p>
            )}
          </div>
        )}
      </Modal>
      <SuspendedCartsModal
        open={queueOpen}
        carts={queuedCartItems}
        onClose={() => setQueueOpen(false)}
        onResume={requestResumeQueuedCart}
        onDiscard={(id) => setDiscardCartId(id)}
      />
      <Modal
        open={resumeCartId !== null}
        onClose={() => setResumeCartId(null)}
        title="Huidige winkelwagen ook parkeren?"
        subtitle="De huidige klant gaat veilig mee in de wachtrij."
        icon={<Clock3 size={20} />}
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => setResumeCartId(null)}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50"
            >
              Annuleren
            </button>
            <button
              type="button"
              onClick={() => {
                if (resumeCartId) restoreQueuedCart(resumeCartId, true);
              }}
              className="rounded-xl bg-sky-700 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-sky-800"
            >
              Huidige winkelwagen parkeren &amp; openen
            </button>
          </div>
        }
      >
        <p className="text-sm leading-relaxed text-slate-600">
          Je verliest niets: deze mand met {cart.orders.reduce(
            (sum, order) => sum + order.quantity,
            0,
          )} artikelen wordt eerst in wacht gezet. Daarna openen we de gekozen
          klant.
        </p>
      </Modal>
      <Modal
        open={discardCartId !== null}
        onClose={() => setDiscardCartId(null)}
        title="Wachtend mandje verwijderen?"
        subtitle="Dit is nog geen verkoop."
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => setDiscardCartId(null)}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50"
            >
              Behouden
            </button>
            <button
              type="button"
              onClick={() => {
                if (discardCartId) discardQueuedCart(discardCartId);
              }}
              className="rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-red-700"
            >
              Verwijderen uit wachtrij
            </button>
          </div>
        }
      >
        <p className="text-sm leading-relaxed text-slate-600">
          Er is geen betaling, voorraadmutatie of cadeaubonboeking gedaan. Alleen
          het lokaal bewaarde wachtende mandje wordt verwijderd.
        </p>
      </Modal>
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
