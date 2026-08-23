import type { MerchantInfo } from "../data/merchant";
import type { StoreConfiguration } from "../onboarding/storeConfiguration";
import type { Product, ProductCategory } from "../types";

export type PaceMilestoneId =
  | "profile"
  | "identity"
  | "categories"
  | "products"
  | "barcodes";

export interface PaceSetupMilestone {
  id: PaceMilestoneId;
  label: string;
  detail: string;
  complete: boolean;
  optional: boolean;
  action: "setup" | "categories" | "products" | "labels";
}

const PLACEHOLDER_NAMES = new Set(["pwayment", "pwayment retail", "pwayment store"]);

export const hasConfiguredMerchantIdentity = (profile: MerchantInfo): boolean => {
  const name = profile.name.trim().toLocaleLowerCase("nl-BE");
  const validVat = /^BE\s?0?\d{3}[.\s]?\d{3}[.\s]?\d{3}$/i.test(profile.vatNumber.trim());
  const placeholderAddress = /voorbeeldstraat/i.test(profile.addressLine1);
  return Boolean(
    name &&
    !PLACEHOLDER_NAMES.has(name) &&
    profile.addressLine1.trim() &&
    profile.addressLine2.trim() &&
    !placeholderAddress &&
    validVat,
  );
};

const hasScannableIdentifier = (product: Product) => Boolean(
  product.barcode?.trim() ||
  product.identifiers?.some((identifier) => identifier.isScannable && identifier.value.trim()),
);

export const derivePaceSetupMilestones = ({
  configuration,
  profile,
  categories,
  products,
}: {
  configuration: StoreConfiguration;
  profile: MerchantInfo;
  categories: ProductCategory[];
  products: Product[];
}): PaceSetupMilestone[] => {
  const activeCategories = categories.filter((category) => category.isActive !== false);
  const activeProducts = products.filter((product) => product.isActive !== false);
  const sellableProducts = activeProducts.filter((product) =>
    product.name.trim() && product.category && product.priceCents >= 0 && [0, 6, 12, 21].includes(product.vatRate),
  );
  const barcodeReady = activeProducts.length > 0 && activeProducts.some(hasScannableIdentifier);

  return [
    {
      id: "profile",
      label: "Winkelprofiel",
      detail: "Sector, verkoopmodel en werkstromen gekozen",
      complete: Boolean(configuration.completedAt),
      optional: false,
      action: "setup",
    },
    {
      id: "identity",
      label: "Ticketgegevens",
      detail: "Bedrijfsnaam, adres en Belgisch btw-nummer",
      complete: hasConfiguredMerchantIdentity(profile),
      optional: false,
      action: "setup",
    },
    {
      id: "categories",
      label: "Categorieën",
      detail: "Minstens één actieve productcategorie",
      complete: activeCategories.length > 0,
      optional: false,
      action: "categories",
    },
    {
      id: "products",
      label: "Eerste product",
      detail: "Actief product met categorie, prijs en btw",
      complete: sellableProducts.length > 0,
      optional: false,
      action: "products",
    },
    {
      id: "barcodes",
      label: "Scanbaar assortiment",
      detail: "Minstens één product met scanbare identificatie",
      complete: barcodeReady,
      optional: true,
      action: "labels",
    },
  ];
};

export const paceSetupProgress = (milestones: PaceSetupMilestone[]) => {
  const required = milestones.filter((milestone) => !milestone.optional);
  const completedRequired = required.filter((milestone) => milestone.complete).length;
  const next = milestones.find((milestone) => !milestone.complete && !milestone.optional)
    ?? milestones.find((milestone) => !milestone.complete)
    ?? null;
  return {
    completedRequired,
    requiredCount: required.length,
    percent: required.length ? Math.round((completedRequired / required.length) * 100) : 100,
    ready: completedRequired === required.length,
    next,
  };
};
