import type { Customer, OrderItem } from "../types";
import {
  calculateTotals,
  findUnsupportedVatItems,
  type Totals,
} from "../utils/vat";
import { withResolvedProductPrice } from "../utils/pricing";
import type { CustomerDisplayLine } from "./protocol";

export interface DisplayCartGiftCard {
  id: string;
  amountCents: number;
}

export interface ProjectCartInput {
  orders: OrderItem[];
  linkedCustomer?: Customer | null;
  discountCents?: number;
  giftCards?: DisplayCartGiftCard[];
}

export interface ProjectedCart {
  items: OrderItem[];
  totals: Totals;
  vatBlockers: OrderItem[];
  giftCardCents: number;
  remainingCents: number;
  displayLines: CustomerDisplayLine[];
}

const unitPriceCents = (order: OrderItem): number =>
  order.product.priceCents +
  (order.modifiers ?? []).reduce(
    (sum, modifier) => sum + modifier.deltaCents,
    0,
  );

export const projectCart = ({
  orders,
  linkedCustomer,
  discountCents = 0,
  giftCards = [],
}: ProjectCartInput): ProjectedCart => {
  const items = orders.map((order) => ({
    ...order,
    product: withResolvedProductPrice(order.product, linkedCustomer),
  }));
  const vatBlockers = findUnsupportedVatItems(items);
  const totals =
    vatBlockers.length > 0
      ? calculateTotals([], 0)
      : calculateTotals(items, discountCents);
  const giftCardCents = giftCards.reduce(
    (sum, giftCard) => sum + giftCard.amountCents,
    0,
  );

  const displayLines = items.map((order): CustomerDisplayLine => {
    const unit = unitPriceCents(order);
    const standardPriceCandidate = Number(
      order.product.customFields?.standardPriceCents,
    );
    const standardUnitPriceCents =
      Number.isSafeInteger(standardPriceCandidate) &&
      standardPriceCandidate >= 0 &&
      standardPriceCandidate !== order.product.priceCents
        ? standardPriceCandidate +
          (order.modifiers ?? []).reduce(
            (sum, modifier) => sum + modifier.deltaCents,
            0,
          )
        : undefined;
    return {
      lineId: order.lineId,
      name: order.product.name,
      variant: order.product.variant?.trim() || undefined,
      modifierLabels: (order.modifiers ?? []).map((modifier) => modifier.label),
      quantity: order.quantity,
      unitPriceCents: unit,
      lineTotalCents: unit * order.quantity,
      standardUnitPriceCents,
    };
  });

  return {
    items,
    totals,
    vatBlockers,
    giftCardCents,
    remainingCents: Math.max(0, totals.total - giftCardCents),
    displayLines,
  };
};
