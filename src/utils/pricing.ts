import type { Customer, Product } from "../types";

export const DEFAULT_PRICE_GROUP = "standard";

export const normalizePriceGroup = (value: string): string =>
  value
    .trim()
    .toLocaleLowerCase("nl-BE")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);

export interface ResolvedPrice {
  standardPriceCents: number;
  priceCents: number;
  priceGroup: string;
  source: "standard" | "customer-group";
}

export const resolveProductPrice = (
  product: Product,
  customer?: Pick<Customer, "priceGroup"> | null,
): ResolvedPrice => {
  const priceGroup = normalizePriceGroup(customer?.priceGroup ?? "");
  const tierPrice = priceGroup ? product.priceTiers?.[priceGroup] : undefined;
  if (
    tierPrice != null &&
    Number.isSafeInteger(tierPrice) &&
    tierPrice >= 0
  ) {
    return {
      standardPriceCents: product.priceCents,
      priceCents: tierPrice,
      priceGroup,
      source: "customer-group",
    };
  }
  return {
    standardPriceCents: product.priceCents,
    priceCents: product.priceCents,
    priceGroup: DEFAULT_PRICE_GROUP,
    source: "standard",
  };
};

export const withResolvedProductPrice = (
  product: Product,
  customer?: Pick<Customer, "priceGroup"> | null,
): Product => {
  const resolved = resolveProductPrice(product, customer);
  if (resolved.priceCents === product.priceCents) return product;
  return {
    ...product,
    priceCents: resolved.priceCents,
    customFields: {
      ...product.customFields,
      standardPriceCents: resolved.standardPriceCents,
      appliedPriceGroup: resolved.priceGroup,
    },
  };
};
