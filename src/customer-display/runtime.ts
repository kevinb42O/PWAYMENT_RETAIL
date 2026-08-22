import { create } from "zustand";
import type { TenderMethod, Transaction } from "../types";

export type CustomerDisplayConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "stale";

export type CustomerDisplayPaymentRuntimePhase =
  | "cart"
  | "payment-pending"
  | "payment-failed"
  | "payment-succeeded";

export type CustomerDisplayPaymentMessageCode =
  | "follow-terminal"
  | "processing"
  | "cancelled"
  | "declined"
  | "commit-error";

interface CustomerDisplayRuntimeState {
  paymentPhase: CustomerDisplayPaymentRuntimePhase;
  paymentMethod: TenderMethod | null;
  paymentMessageCode: CustomerDisplayPaymentMessageCode | null;
  completedTransaction: Transaction | null;
  connectionStatus: CustomerDisplayConnectionStatus;
  lastAckAt: number | null;
  viewport: { width: number; height: number } | null;
  beginPayment: (method: TenderMethod) => void;
  failPayment: (
    method: TenderMethod,
    messageCode?: Extract<
      CustomerDisplayPaymentMessageCode,
      "cancelled" | "declined" | "commit-error"
    >,
  ) => void;
  completePayment: (transaction: Transaction) => void;
  resetPayment: () => void;
  setConnectionStatus: (status: CustomerDisplayConnectionStatus) => void;
  acknowledge: (
    at: number,
    viewport?: { width: number; height: number },
  ) => void;
}

export const useCustomerDisplayRuntime = create<CustomerDisplayRuntimeState>(
  (set) => ({
    paymentPhase: "cart",
    paymentMethod: null,
    paymentMessageCode: null,
    completedTransaction: null,
    connectionStatus: "disconnected",
    lastAckAt: null,
    viewport: null,
    beginPayment: (paymentMethod) =>
      set({
        paymentPhase: "payment-pending",
        paymentMethod,
        paymentMessageCode:
          paymentMethod === "PIN" ? "follow-terminal" : "processing",
        completedTransaction: null,
      }),
    failPayment: (paymentMethod, paymentMessageCode = "commit-error") =>
      set({
        paymentPhase: "payment-failed",
        paymentMethod,
        paymentMessageCode,
        completedTransaction: null,
      }),
    completePayment: (completedTransaction) =>
      set({
        paymentPhase: "payment-succeeded",
        paymentMethod: null,
        paymentMessageCode: null,
        completedTransaction,
      }),
    resetPayment: () =>
      set({
        paymentPhase: "cart",
        paymentMethod: null,
        paymentMessageCode: null,
        completedTransaction: null,
      }),
    setConnectionStatus: (connectionStatus) => set({ connectionStatus }),
    acknowledge: (lastAckAt, viewport) =>
      set({
        connectionStatus: "connected",
        lastAckAt,
        viewport: viewport ?? null,
      }),
  }),
);
