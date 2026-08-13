import { z } from "zod";

export const CUSTOMER_DISPLAY_PROTOCOL_VERSION = 1 as const;

export const acceptedPaymentMethodIds = [
  "cash",
  "card",
  "bancontact",
  "visa",
  "mastercard",
  "apple-pay",
  "gift-card",
] as const;

export type AcceptedPaymentMethodId =
  (typeof acceptedPaymentMethodIds)[number];

export const ACCEPTED_PAYMENT_METHOD_LABELS: Record<
  AcceptedPaymentMethodId,
  string
> = {
  cash: "Cash",
  card: "Kaart / PIN",
  bancontact: "Bancontact",
  visa: "Visa",
  mastercard: "Mastercard",
  "apple-pay": "Apple Pay",
  "gift-card": "Cadeaubon",
};
export const customerDisplayPhaseSchema = z.enum([
  "disabled",
  "idle",
  "cart",
  "payment-pending",
  "payment-failed",
  "payment-succeeded",
]);

export type CustomerDisplayPhase = z.infer<
  typeof customerDisplayPhaseSchema
>;

const safeCents = z.number().int().safe().nonnegative();

export const customerDisplayLineSchema = z.object({
  lineId: z.string().min(1).max(160),
  name: z.string().min(1).max(180),
  variant: z.string().max(120).optional(),
  modifierLabels: z.array(z.string().min(1).max(120)).max(12),
  quantity: z.number().int().safe().positive(),
  unitPriceCents: safeCents,
  lineTotalCents: safeCents,
  standardUnitPriceCents: safeCents.optional(),
});

export const customerDisplaySnapshotSchema = z.object({
  protocolVersion: z.literal(CUSTOMER_DISPLAY_PROTOCOL_VERSION),
  storeId: z.string().min(1).max(160),
  registerId: z.string().min(1).max(160),
  displaySessionId: z.string().min(16).max(200),
  cartSessionId: z.string().max(200).nullable(),
  epochId: z.string().min(16).max(200),
  revision: z.number().int().safe().nonnegative(),
  emittedAt: z.number().int().safe().positive(),
  phase: customerDisplayPhaseSchema,
  merchant: z.object({
    displayName: z.string().min(1).max(120),
    logoUrl: z.string().max(500).optional(),
    locale: z.literal("nl-BE"),
    currency: z.literal("EUR"),
  }),
  presentation: z.object({
    idleHeadline: z.string().min(1).max(120),
    idleMessage: z.string().max(240),
    accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    showClock: z.boolean(),
    showVatBreakdown: z.boolean(),
    showPaymentMethods: z.boolean(),
  }),
  lines: z.array(customerDisplayLineSchema).max(250),
  totals: z.object({
    subtotalCents: safeCents,
    discountCents: safeCents,
    giftCardCents: safeCents,
    totalCents: safeCents,
    remainingCents: safeCents,
    vat12Cents: safeCents,
    vat21Cents: safeCents,
  }),
  payment: z
    .object({
      method: z.enum(["cash", "card", "gift-card", "split"]).optional(),
      tenderedCents: safeCents.optional(),
      changeCents: safeCents.optional(),
      messageCode: z
        .enum([
          "follow-terminal",
          "processing",
          "cancelled",
          "declined",
          "commit-error",
        ])
        .optional(),
    })
    .optional(),
  acceptedPaymentMethods: z
    .array(z.enum(acceptedPaymentMethodIds))
    .max(acceptedPaymentMethodIds.length),
});

export type CustomerDisplayLine = z.infer<
  typeof customerDisplayLineSchema
>;

export type CustomerDisplaySnapshot = z.infer<
  typeof customerDisplaySnapshotSchema
>;

export interface CustomerDisplayHelloMessage {
  type: "HELLO";
  displaySessionId: string;
}

export interface CustomerDisplayStateRequestMessage {
  type: "STATE_REQUEST";
  displaySessionId: string;
  lastRevision?: number;
}

export interface CustomerDisplaySnapshotMessage {
  type: "SNAPSHOT";
  snapshot: CustomerDisplaySnapshot;
}

export interface CustomerDisplayAckMessage {
  type: "ACK";
  displaySessionId: string;
  epochId: string;
  revision: number;
  renderedAt: number;
  viewport?: { width: number; height: number };
}

export interface CustomerDisplayHeartbeatMessage {
  type: "HEARTBEAT";
  displaySessionId: string;
  epochId: string;
  revision: number;
  sentAt: number;
}

export interface CustomerDisplayGoodbyeMessage {
  type: "GOODBYE";
  displaySessionId: string;
  reason: "closed" | "logout" | "replaced";
}

export type CustomerDisplayMessage =
  | CustomerDisplayHelloMessage
  | CustomerDisplayStateRequestMessage
  | CustomerDisplaySnapshotMessage
  | CustomerDisplayAckMessage
  | CustomerDisplayHeartbeatMessage
  | CustomerDisplayGoodbyeMessage;

export const isCustomerDisplayMessage = (
  value: unknown,
): value is CustomerDisplayMessage => {
  if (!value || typeof value !== "object") return false;
  const type = (value as { type?: unknown }).type;
  return [
    "HELLO",
    "STATE_REQUEST",
    "SNAPSHOT",
    "ACK",
    "HEARTBEAT",
    "GOODBYE",
  ].includes(String(type));
};
