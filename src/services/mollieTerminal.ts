import { supabase } from "../lib/supabase";

export type MolliePaymentStatus =
  | "open"
  | "pending"
  | "authorized"
  | "paid"
  | "failed"
  | "canceled"
  | "expired";

export interface MollieTerminalPayment {
  id: string;
  status: MolliePaymentStatus;
  amountCents: number;
  testMode: boolean;
  changePaymentStateUrl?: string;
}

export class MollieTerminalError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "MollieTerminalError";
  }
}

const authorizationHeader = async (): Promise<string> => {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    throw new MollieTerminalError(
      "Meld opnieuw aan om de betaalterminal te gebruiken.",
      "AUTH_REQUIRED",
    );
  }
  return `Bearer ${token}`;
};

const readResponse = async (response: Response): Promise<MollieTerminalPayment> => {
  const body = await response.json().catch(() => ({})) as {
    error?: string;
    message?: string;
  } & Partial<MollieTerminalPayment>;
  if (!response.ok) {
    throw new MollieTerminalError(
      body.message || "De Mollie-terminal is momenteel niet bereikbaar.",
      body.error || "MOLLIE_REQUEST_FAILED",
      response.status >= 500 || response.status === 429,
    );
  }
  if (!body.id || !body.status || typeof body.amountCents !== "number") {
    throw new MollieTerminalError(
      "Mollie gaf een ongeldig betaalantwoord terug.",
      "INVALID_RESPONSE",
    );
  }
  return body as MollieTerminalPayment;
};

export const createMollieTerminalPayment = async (input: {
  amountCents: number;
  description: string;
  idempotencyKey: string;
}): Promise<MollieTerminalPayment> => {
  const authorization = await authorizationHeader();
  const response = await fetch("/api/mollie/payments", {
    method: "POST",
    headers: { Authorization: authorization, "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return readResponse(response);
};

export const getMollieTerminalPayment = async (
  paymentId: string,
): Promise<MollieTerminalPayment> => {
  const authorization = await authorizationHeader();
  const response = await fetch(`/api/mollie/payments?id=${encodeURIComponent(paymentId)}`, {
    headers: { Authorization: authorization },
  });
  return readResponse(response);
};

export const cancelMollieTerminalPayment = async (
  paymentId: string,
): Promise<MollieTerminalPayment> => {
  const authorization = await authorizationHeader();
  const response = await fetch(`/api/mollie/payments?id=${encodeURIComponent(paymentId)}`, {
    method: "DELETE",
    headers: { Authorization: authorization },
  });
  return readResponse(response);
};

export const isMollieTerminalStatus = (value: unknown): value is MolliePaymentStatus =>
  ["open", "pending", "authorized", "paid", "failed", "canceled", "expired"].includes(String(value));
