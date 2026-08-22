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
  card: "Kaart",
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
const safeTimestamp = z.number().int().safe().positive();
const sessionIdSchema = z.string().min(16).max(200);

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

const customerDisplaySnapshotShape = z.object({
  protocolVersion: z.literal(CUSTOMER_DISPLAY_PROTOCOL_VERSION),
  storeId: z.string().min(1).max(160),
  registerId: z.string().min(1).max(160),
  displaySessionId: sessionIdSchema,
  cartSessionId: z.string().max(200).nullable(),
  epochId: z.string().min(16).max(200),
  revision: z.number().int().safe().nonnegative(),
  emittedAt: safeTimestamp,
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
    roundingAdjustmentCents: z.number().int().safe().min(-2).max(2).optional().default(0),
    vat12Cents: safeCents,
    vat21Cents: safeCents,
    // Optional for a rolling update: a display that was already open can
    // safely accept a snapshot from the previous 12/21-only publisher.
    vatBreakdown: z.array(z.object({
      rate: z.union([z.literal(0), z.literal(6), z.literal(12), z.literal(21)]),
      vatCents: safeCents,
    })).max(4).optional().default([]),
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
  availabilityReason: z
    .enum(["module-disabled", "not-entitled"])
    .optional(),
});

/**
 * A syntactically valid amount is not necessarily a financially valid amount.
 * These invariants prevent a receiver from ever rendering a snapshot whose
 * lines, subtotal and amount due contradict each other.
 */
export const customerDisplaySnapshotSchema = customerDisplaySnapshotShape.superRefine(
  (snapshot, context) => {
    snapshot.lines.forEach((line, index) => {
      if (line.lineTotalCents !== line.unitPriceCents * line.quantity) {
        context.addIssue({
          code: "custom",
          path: ["lines", index, "lineTotalCents"],
          message: "Lijnbedrag komt niet overeen met aantal × eenheidsprijs.",
        });
      }
    });

    const lineSubtotal = snapshot.lines.reduce(
      (sum, line) => sum + line.lineTotalCents,
      0,
    );
    if (lineSubtotal !== snapshot.totals.subtotalCents) {
      context.addIssue({
        code: "custom",
        path: ["totals", "subtotalCents"],
        message: "Subtotaal komt niet overeen met de som van de aankoopregels.",
      });
    }

    if (snapshot.totals.discountCents > snapshot.totals.subtotalCents) {
      context.addIssue({
        code: "custom",
        path: ["totals", "discountCents"],
        message: "Korting kan niet groter zijn dan het subtotaal.",
      });
    }
    const expectedTotal = Math.max(
      0,
      snapshot.totals.subtotalCents - snapshot.totals.discountCents,
    );
    if (snapshot.totals.totalCents !== expectedTotal) {
      context.addIssue({
        code: "custom",
        path: ["totals", "totalCents"],
        message: "Totaal komt niet overeen met subtotaal minus korting.",
      });
    }
    if (snapshot.totals.giftCardCents > snapshot.totals.totalCents) {
      context.addIssue({
        code: "custom",
        path: ["totals", "giftCardCents"],
        message: "Cadeaubonbedrag kan niet groter zijn dan het totaal.",
      });
    }

    const expectedRemaining =
      snapshot.phase === "payment-succeeded"
        ? 0
        : Math.max(
            0,
            snapshot.totals.totalCents - snapshot.totals.giftCardCents,
          );
    if (snapshot.totals.remainingCents !== expectedRemaining) {
      context.addIssue({
        code: "custom",
        path: ["totals", "remainingCents"],
        message: "Nog te betalen bedrag is financieel inconsistent.",
      });
    }

    const isInactive = ["disabled", "idle"].includes(snapshot.phase);
    if (isInactive && (snapshot.lines.length > 0 || lineSubtotal !== 0)) {
      context.addIssue({
        code: "custom",
        path: ["lines"],
        message: "Een inactief scherm mag geen aankoopregels bevatten.",
      });
    }
    if (
      ["cart", "payment-pending", "payment-failed", "payment-succeeded"].includes(
        snapshot.phase,
      ) && snapshot.lines.length === 0
    ) {
      context.addIssue({
        code: "custom",
        path: ["lines"],
        message: "Een transactiestatus vereist minstens één aankoopregel.",
      });
    }
    if (
      ["payment-pending", "payment-failed", "payment-succeeded"].includes(
        snapshot.phase,
      ) && !snapshot.payment
    ) {
      context.addIssue({
        code: "custom",
        path: ["payment"],
        message: "Een betaalstatus vereist betaalinformatie.",
      });
    }

    if (new Set(snapshot.acceptedPaymentMethods).size !== snapshot.acceptedPaymentMethods.length) {
      context.addIssue({
        code: "custom",
        path: ["acceptedPaymentMethods"],
        message: "Betaalmethodes moeten uniek zijn.",
      });
    }
  },
);

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

const customerDisplayMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("HELLO"), displaySessionId: sessionIdSchema }),
  z.object({
    type: z.literal("STATE_REQUEST"),
    displaySessionId: sessionIdSchema,
    lastRevision: z.number().int().safe().nonnegative().optional(),
  }),
  z.object({ type: z.literal("SNAPSHOT"), snapshot: customerDisplaySnapshotSchema }),
  z.object({
    type: z.literal("ACK"),
    displaySessionId: sessionIdSchema,
    epochId: sessionIdSchema,
    revision: z.number().int().safe().nonnegative(),
    renderedAt: safeTimestamp,
    viewport: z
      .object({
        width: z.number().int().positive().max(16_384),
        height: z.number().int().positive().max(16_384),
      })
      .optional(),
  }),
  z.object({
    type: z.literal("HEARTBEAT"),
    displaySessionId: sessionIdSchema,
    epochId: sessionIdSchema,
    revision: z.number().int().safe().nonnegative(),
    sentAt: safeTimestamp,
  }),
  z.object({
    type: z.literal("GOODBYE"),
    displaySessionId: sessionIdSchema,
    reason: z.enum(["closed", "logout", "replaced"]),
  }),
]);

export const parseCustomerDisplayMessage = (
  value: unknown,
): CustomerDisplayMessage | null => {
  const parsed = customerDisplayMessageSchema.safeParse(value);
  return parsed.success ? (parsed.data as CustomerDisplayMessage) : null;
};

export const isCustomerDisplayMessage = (
  value: unknown,
): value is CustomerDisplayMessage => parseCustomerDisplayMessage(value) != null;
