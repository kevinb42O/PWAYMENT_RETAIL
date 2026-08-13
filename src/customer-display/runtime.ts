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

interface CustomerDisplayRuntimeState {
  paymentPhase: CustomerDisplayPaymentRuntimePhase;
  paymentMethod: TenderMethod | null;
  completedTransaction: Transaction | null;
  connectionStatus: CustomerDisplayConnectionStatus;
  lastAckAt: number | null;
  viewport: { width: number; height: number } | null;
  beginPayment: (method: TenderMethod) => void;
  failPayment: (method: TenderMethod) => void;
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
    completedTransaction: null,
    connectionStatus: "disconnected",
    lastAckAt: null,
    viewport: null,
    beginPayment: (paymentMethod) =>
      set({
        paymentPhase: "payment-pending",
        paymentMethod,
        completedTransaction: null,
      }),
    failPayment: (paymentMethod) =>
      set({
        paymentPhase: "payment-failed",
        paymentMethod,
        completedTransaction: null,
      }),
    completePayment: (completedTransaction) =>
      set({
        paymentPhase: "payment-succeeded",
        paymentMethod: null,
        completedTransaction,
      }),
    resetPayment: () =>
      set({
        paymentPhase: "cart",
        paymentMethod: null,
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
