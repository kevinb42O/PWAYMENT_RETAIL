import { useCallback, useEffect, useMemo, useRef } from "react";
import { useAuth } from "../auth/useAuth";
import { useMerchantProfile } from "../store/useMerchantProfile";
import { useCustomers } from "../store/useCustomers";
import { useStore } from "../store/useStore";
import type { PaymentMethod, TenderMethod, Transaction } from "../types";
import { projectCart } from "./cartProjection";
import {
  CUSTOMER_DISPLAY_PROTOCOL_VERSION,
  type CustomerDisplayMessage,
  type CustomerDisplaySnapshot,
  isCustomerDisplayMessage,
} from "./protocol";
import {
  customerDisplayChannelName,
  getLocalCustomerDisplaySessionId,
} from "./localSession";
import {
  customerDisplayStoreKey,
  DEFAULT_CUSTOMER_DISPLAY_CONFIG,
  useCustomerDisplaySettings,
} from "./settings";
import { useCustomerDisplayRuntime } from "./runtime";

const REGISTER_ID = "retail-register-1";
const HEARTBEAT_MS = 5_000;
const STALE_ACK_MS = 10_000;

const createRuntimeId = (): string =>
  globalThis.crypto?.randomUUID?.() ??
  `display-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const toDisplayPaymentMethod = (
  method: PaymentMethod | TenderMethod | null,
): "cash" | "card" | "gift-card" | "split" | undefined => {
  if (method === "Cash") return "cash";
  if (method === "PIN") return "card";
  if (method === "Cadeaubon") return "gift-card";
  if (method === "Split") return "split";
  return undefined;
};

const transactionGiftCardCents = (transaction: Transaction): number =>
  (transaction.tenders ?? transaction.splitTenders ?? [])
    .filter((tender) => tender.method === "Cadeaubon")
    .reduce((sum, tender) => sum + tender.amountCents, 0);

const transactionCashTenderCents = (transaction: Transaction): number =>
  (transaction.tenders ?? transaction.splitTenders ?? [])
    .filter((tender) => tender.method === "Cash")
    .reduce((sum, tender) => sum + tender.amountCents, 0);

export const CustomerDisplayPublisher = () => {
  const currentStoreId = useAuth((state) => state.currentStoreId);
  const currentStoreName = useAuth((state) => state.currentStoreName);
  const merchant = useMerchantProfile((state) => state.profile);
  const cart = useStore((state) => state.cart);
  const cartDiscount = useStore((state) => state.cartDiscount);
  const cartGiftCards = useStore((state) => state.cartGiftCards);
  const linkedCustomerId = useStore((state) => state.linkedCustomerId);
  const customers = useCustomers((state) => state.customers);
  const configsByStore = useCustomerDisplaySettings(
    (state) => state.configsByStore,
  );
  const paymentPhase = useCustomerDisplayRuntime(
    (state) => state.paymentPhase,
  );
  const paymentMethod = useCustomerDisplayRuntime(
    (state) => state.paymentMethod,
  );
  const completedTransaction = useCustomerDisplayRuntime(
    (state) => state.completedTransaction,
  );

  const storeKey = customerDisplayStoreKey(currentStoreId);
  const config = configsByStore[storeKey] ?? DEFAULT_CUSTOMER_DISPLAY_CONFIG;
  const linkedCustomer = useMemo(
    () =>
      customers.find((customer) => customer.id === linkedCustomerId) ?? null,
    [customers, linkedCustomerId],
  );
  const projectedCart = useMemo(
    () =>
      projectCart({
        orders: cart.orders,
        linkedCustomer,
        discountCents: cartDiscount?.amountCents ?? 0,
        giftCards: cartGiftCards,
      }),
    [cart.orders, cartDiscount?.amountCents, cartGiftCards, linkedCustomer],
  );

  const sessionIdRef = useRef(getLocalCustomerDisplaySessionId());
  const epochIdRef = useRef(createRuntimeId());
  const revisionRef = useRef(0);
  const cartSessionIdRef = useRef<string | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const lastAckAtRef = useRef<number | null>(null);

  if (cart.orders.length > 0 && !cartSessionIdRef.current) {
    cartSessionIdRef.current = createRuntimeId();
  } else if (
    cart.orders.length === 0 &&
    paymentPhase !== "payment-succeeded"
  ) {
    cartSessionIdRef.current = null;
  }

  const buildSnapshot = useCallback((): CustomerDisplaySnapshot => {
    const enabled = config.enabled;
    let phase: CustomerDisplaySnapshot["phase"] = enabled ? "idle" : "disabled";
    let lines = projectedCart.displayLines;
    let totals: CustomerDisplaySnapshot["totals"] = {
      subtotalCents: projectedCart.totals.subtotal,
      discountCents: projectedCart.totals.discount,
      giftCardCents: projectedCart.giftCardCents,
      totalCents: projectedCart.totals.total,
      remainingCents: projectedCart.remainingCents,
      vat12Cents: projectedCart.totals.vat12,
      vat21Cents: projectedCart.totals.vat21,
    };
    let payment: CustomerDisplaySnapshot["payment"];

    if (enabled && paymentPhase === "payment-succeeded" && completedTransaction) {
      const committedProjection = projectCart({
        orders: completedTransaction.items,
        discountCents: completedTransaction.discountCents,
        giftCards: (completedTransaction.giftCardAllocations ?? []).map(
          (allocation) => ({
            id: allocation.giftCardId,
            amountCents: allocation.amountCents,
          }),
        ),
      });
      const giftCardCents = transactionGiftCardCents(completedTransaction);
      const cashTenderCents = transactionCashTenderCents(completedTransaction);
      const tenderedCents = completedTransaction.tenderedCents;
      phase = "payment-succeeded";
      lines = committedProjection.displayLines;
      totals = {
        subtotalCents: completedTransaction.subtotalCents,
        discountCents: completedTransaction.discountCents,
        giftCardCents,
        totalCents: completedTransaction.totalCents,
        remainingCents: 0,
        vat12Cents: completedTransaction.vat12Cents,
        vat21Cents: completedTransaction.vat21Cents,
      };
      payment = {
        method: toDisplayPaymentMethod(completedTransaction.paymentMethod),
        tenderedCents,
        changeCents:
          tenderedCents == null
            ? undefined
            : Math.max(0, tenderedCents - cashTenderCents),
      };
    } else if (enabled && projectedCart.items.length > 0) {
      if (paymentPhase === "payment-pending") {
        phase = "payment-pending";
        payment = {
          method: toDisplayPaymentMethod(paymentMethod),
          messageCode:
            paymentMethod === "PIN" ? "follow-terminal" : "processing",
        };
      } else if (paymentPhase === "payment-failed") {
        phase = "payment-failed";
        payment = {
          method: toDisplayPaymentMethod(paymentMethod),
          messageCode: "commit-error",
        };
      } else {
        phase = "cart";
      }
    }

    revisionRef.current += 1;
    return {
      protocolVersion: CUSTOMER_DISPLAY_PROTOCOL_VERSION,
      storeId: currentStoreId ?? "local-store",
      registerId: REGISTER_ID,
      displaySessionId: sessionIdRef.current,
      cartSessionId:
        completedTransaction?.clientRequestId ?? cartSessionIdRef.current,
      epochId: epochIdRef.current,
      revision: revisionRef.current,
      emittedAt: Date.now(),
      phase,
      merchant: {
        displayName:
          merchant.name.trim() || currentStoreName?.trim() || "PWAYMENT",
        logoUrl: "/branding/pwayment-logo.svg",
        locale: "nl-BE",
        currency: "EUR",
      },
      presentation: {
        idleHeadline: config.idleHeadline.trim() || "Welkom",
        idleMessage: config.idleMessage.trim(),
        accentColor: config.accentColor,
        showClock: config.showClock,
        showVatBreakdown: config.showVatBreakdown,
        showPaymentMethods: config.showPaymentMethods,
      },
      lines,
      totals,
      payment,
      acceptedPaymentMethods: config.acceptedPaymentMethods,
    };
  }, [
    completedTransaction,
    config,
    currentStoreId,
    currentStoreName,
    merchant.name,
    paymentMethod,
    paymentPhase,
    projectedCart,
  ]);

  const latestSnapshotFactoryRef = useRef(buildSnapshot);
  latestSnapshotFactoryRef.current = buildSnapshot;

  const publishSnapshot = useCallback(() => {
    const channel = channelRef.current;
    if (!channel) return;
    const message: CustomerDisplayMessage = {
      type: "SNAPSHOT",
      snapshot: latestSnapshotFactoryRef.current(),
    };
    channel.postMessage(message);
  }, []);

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") {
      useCustomerDisplayRuntime
        .getState()
        .setConnectionStatus("disconnected");
      return;
    }

    const channel = new BroadcastChannel(
      customerDisplayChannelName(sessionIdRef.current),
    );
    channelRef.current = channel;
    useCustomerDisplayRuntime.getState().setConnectionStatus("connecting");

    channel.onmessage = (event: MessageEvent<unknown>) => {
      if (!isCustomerDisplayMessage(event.data)) return;
      const message = event.data;
      if (
        "displaySessionId" in message &&
        message.displaySessionId !== sessionIdRef.current
      ) {
        return;
      }
      if (message.type === "HELLO" || message.type === "STATE_REQUEST") {
        useCustomerDisplayRuntime.getState().setConnectionStatus("connecting");
        publishSnapshot();
      } else if (
        message.type === "ACK" &&
        message.epochId === epochIdRef.current
      ) {
        lastAckAtRef.current = Date.now();
        useCustomerDisplayRuntime
          .getState()
          .acknowledge(lastAckAtRef.current, message.viewport);
      }
    };

    const heartbeatTimer = window.setInterval(() => {
      const heartbeat: CustomerDisplayMessage = {
        type: "HEARTBEAT",
        displaySessionId: sessionIdRef.current,
        epochId: epochIdRef.current,
        revision: revisionRef.current,
        sentAt: Date.now(),
      };
      channel.postMessage(heartbeat);
      const lastAckAt = lastAckAtRef.current;
      if (!lastAckAt) {
        useCustomerDisplayRuntime
          .getState()
          .setConnectionStatus("connecting");
      } else if (Date.now() - lastAckAt > STALE_ACK_MS) {
        useCustomerDisplayRuntime.getState().setConnectionStatus("stale");
      }
    }, HEARTBEAT_MS);

    publishSnapshot();

    return () => {
      window.clearInterval(heartbeatTimer);
      const goodbye: CustomerDisplayMessage = {
        type: "GOODBYE",
        displaySessionId: sessionIdRef.current,
        reason: "logout",
      };
      channel.postMessage(goodbye);
      channel.close();
      channelRef.current = null;
      const runtime = useCustomerDisplayRuntime.getState();
      runtime.setConnectionStatus("disconnected");
      runtime.resetPayment();
    };
  }, [publishSnapshot]);

  useEffect(() => {
    publishSnapshot();
  }, [buildSnapshot, publishSnapshot]);

  useEffect(() => {
    if (paymentPhase !== "payment-succeeded") return;
    const timer = window.setTimeout(
      () => useCustomerDisplayRuntime.getState().resetPayment(),
      config.thankYouDurationSeconds * 1_000,
    );
    return () => window.clearTimeout(timer);
  }, [config.thankYouDurationSeconds, paymentPhase]);

  return null;
};
