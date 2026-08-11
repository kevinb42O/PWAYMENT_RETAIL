import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type WebshopTheme = 'clean-modern' | 'lux-dark' | 'vibrant-retail' | 'editorial';

export interface DiscountCoupon {
  code: string;
  discountType: 'percent' | 'fixed';
  value: number; // e.g. 10 for 10% or 500 for €5.00
  minOrderCents?: number;
  active: boolean;
}

export interface WebshopSettings {
  // Status & General
  isEnabled: boolean;
  shopName: string;
  shopTagline: string;
  subdomain: string;
  customDomain: string;
  domainStatus: 'connected' | 'pending' | 'none';
  contactEmail: string;
  contactPhone: string;
  seoDescription: string;
  currency: string;

  // Design & Branding
  themeStyle: WebshopTheme;
  primaryColor: string; // Hex color or Tailwind class indicator
  announcementActive: boolean;
  announcementText: string;
  heroTitle: string;
  heroSubtitle: string;
  heroImageUrl: string;
  gridColumns: 3 | 4;
  showOutOfStock: boolean;
  showStockCount: boolean;

  // Catalog & Rules
  unpublishedProductIds: string[]; // List of product IDs hidden from webshop
  featuredProductIds: string[]; // List of product IDs pinned on homepage
  productDescriptions: Record<string, string>;
  productImages: Record<string, string>;
  productVariants: Record<string, string[]>;
  coupons: DiscountCoupon[];
  webshopMarkupPercent: number; // Price adjustment % (default 0)
  autoSyncStock: boolean;

  // Shipping & Pickup
  freeShippingThresholdCents: number; // Default 5000 (€50)
  shippingFeeCents: number; // Default 495 (€4.95)
  pickupEnabled: boolean;
  pickupAddress: string;
  pickupInstructions: string;

  // Payment Methods
  paymentMethods: {
    bancontact: boolean;
    ideal: boolean;
    creditcard: boolean;
    applepay: boolean;
    klarna: boolean;
    payOnPickup: boolean;
  };
  requireTermsCheckbox: boolean;
  enableOrderNotes: boolean;

  // Socials & Notifications
  instagramUrl: string;
  facebookUrl: string;
  orderNotificationEmail: string;
  autoConfirmOrders: boolean;
}

interface WebshopStoreState extends WebshopSettings {
  updateSettings: (newSettings: Partial<WebshopSettings>) => void;
  toggleProductPublished: (productId: string) => void;
  toggleProductFeatured: (productId: string) => void;
  setAllProductsPublished: (productIds: string[], published: boolean) => void;
  setProductDescription: (productId: string, description: string) => void;
  setProductImage: (productId: string, imageUrl: string) => void;
  setProductVariants: (productId: string, variants: string[]) => void;
  addCoupon: (coupon: DiscountCoupon) => void;
  deleteCoupon: (code: string) => void;
  toggleCouponActive: (code: string) => void;
}

export const DEMO_WEBSHOP_SETTINGS: WebshopSettings = {
  isEnabled: true,
  shopName: 'Pwayment Skate Shop',
  shopTagline: 'De nummer 1 winkel voor skateboards, apparel en accessoires.',
  subdomain: 'pwayment-skateshop',
  customDomain: 'www.pwayment-skateshop.be',
  domainStatus: 'connected',
  contactEmail: 'webshop@pwayment-skateshop.be',
  contactPhone: '+32 9 234 56 78',
  seoDescription: 'Shop de nieuwste decks, trucks, wielen en streetwear online met snelle levering in België en Nederland.',
  currency: 'EUR (€)',

  themeStyle: 'clean-modern',
  primaryColor: '#0ea5e9', // Sky blue
  announcementActive: true,
  announcementText: '⚡ GRATIS verzending bij bestellingen vanaf €50 | Vandaag besteld = morgen in huis',
  heroTitle: 'Exclusieve Boards & Urban Culture',
  heroSubtitle: 'Ontdek onze handgeplukte collectie skateboards, sneakers en streetwear in de officiële webshop.',
  heroImageUrl: 'https://images.unsplash.com/photo-1520045892732-304bc3ac5d8e?auto=format&fit=crop&w=1600&q=80',
  gridColumns: 3,
  showOutOfStock: true,
  showStockCount: true,

  unpublishedProductIds: [],
  featuredProductIds: [
    'skateboards-decks-street-antwerp-skate-co-popsicle-maple-deck-8-25-8-25-inch',
    'apparel-truien-hoodies-antwerp-skate-co-heavy-logo-hoodie-black-m',
    'components-trucks-axis-hardware-raw-trucks-set-149-149-mm',
  ],
  productDescriptions: {
    'skateboards-decks-street-antwerp-skate-co-popsicle-maple-deck-8-25-8-25-inch': 'Hoogwaardig 7-ply Canadees esdoorn skateboarddeck. Perfect voor street en park met sterke pop, betrouwbare concave en een duurzame constructie.',
    'apparel-truien-hoodies-antwerp-skate-co-heavy-logo-hoodie-black-m': 'Zware premium hoodie met zachte fleecevoering en een relaxte skatesilhouet. Ontworpen voor dagelijks gebruik, van eerste push tot late sessie.',
    'components-trucks-axis-hardware-raw-trucks-set-149-149-mm': 'Solide 149 mm trucks met een voorspelbare turn en stabiele grind. Een betrouwbare keuze voor decks van 8.25 tot 8.5 inch.',
  },
  productImages: {
    'skateboards-decks-street-antwerp-skate-co-popsicle-maple-deck-8-25-8-25-inch': 'https://images.unsplash.com/photo-1547447134-cd3f5c716030?auto=format&fit=crop&w=1000&q=82',
    'apparel-truien-hoodies-antwerp-skate-co-heavy-logo-hoodie-black-m': 'https://images.unsplash.com/photo-1556905055-8f358a7a47b2?auto=format&fit=crop&w=1000&q=82',
    'components-trucks-axis-hardware-raw-trucks-set-149-149-mm': 'https://images.unsplash.com/photo-1520045892732-304bc3ac5d8e?auto=format&fit=crop&w=1000&q=82',
  },
  productVariants: {},
  coupons: [
    { code: 'WELKOM10', discountType: 'percent', value: 10, minOrderCents: 0, active: true },
    { code: 'SKATE5', discountType: 'fixed', value: 500, minOrderCents: 2500, active: true },
  ],
  webshopMarkupPercent: 0,
  autoSyncStock: true,

  freeShippingThresholdCents: 5000, // €50.00
  shippingFeeCents: 495, // €4.95
  pickupEnabled: true,
  pickupAddress: 'Kouter 12, 9000 Gent, België',
  pickupInstructions: 'Haal uw bestelling gratis op in de winkel binnen 2 uur na bevestiging.',

  paymentMethods: {
    bancontact: true,
    ideal: true,
    creditcard: true,
    applepay: true,
    klarna: true,
    payOnPickup: true,
  },
  requireTermsCheckbox: true,
  enableOrderNotes: true,

  instagramUrl: 'https://instagram.com/pwayment',
  facebookUrl: 'https://facebook.com/pwayment',
  orderNotificationEmail: 'bestellingen@pwayment-skateshop.be',
  autoConfirmOrders: true,
};

export const EMPTY_WEBSHOP_SETTINGS: WebshopSettings = {
  ...DEMO_WEBSHOP_SETTINGS,
  isEnabled: false,
  shopName: '',
  shopTagline: '',
  subdomain: '',
  customDomain: '',
  domainStatus: 'none',
  contactEmail: '',
  contactPhone: '',
  seoDescription: '',
  announcementActive: false,
  announcementText: '',
  heroTitle: '',
  heroSubtitle: '',
  heroImageUrl: '',
  unpublishedProductIds: [],
  featuredProductIds: [],
  productDescriptions: {},
  productImages: {},
  productVariants: {},
  coupons: [],
  freeShippingThresholdCents: 0,
  shippingFeeCents: 0,
  pickupEnabled: false,
  pickupAddress: '',
  pickupInstructions: '',
  paymentMethods: {
    bancontact: false,
    ideal: false,
    creditcard: false,
    applepay: false,
    klarna: false,
    payOnPickup: false,
  },
  requireTermsCheckbox: false,
  enableOrderNotes: false,
  instagramUrl: '',
  facebookUrl: '',
  orderNotificationEmail: '',
  autoConfirmOrders: false,
};

const legacyProductIdMap: Record<string, string> = {
  'deck-popsicle-825-maple': 'skateboards-decks-street-antwerp-skate-co-popsicle-maple-deck-8-25-8-25-inch',
  'hoodie-logo-black': 'apparel-truien-hoodies-antwerp-skate-co-heavy-logo-hoodie-black-m',
  'trucks-independent-149': 'components-trucks-axis-hardware-raw-trucks-set-149-149-mm',
  'wheels-spitfire-formula-four-52': 'components-wielen-street-rollfast-street-wheels-52mm-99a-52-mm-99a',
  'gift-card-50': 'accessories-cadeaubonnen-pwayment-retail-gift-card-eur-50',
};

const remapProductIds = (ids: string[] = []) =>
  Array.from(new Set(ids.map((id) => legacyProductIdMap[id] || id)));

const remapProductRecord = <T,>(record: Record<string, T> = {}) =>
  Object.fromEntries(Object.entries(record).map(([id, value]) => [legacyProductIdMap[id] || id, value]));

export const useWebshopStore = create<WebshopStoreState>()(
  persist(
    (set, get) => ({
      ...EMPTY_WEBSHOP_SETTINGS,

      updateSettings: (newSettings) => {
        set((state) => ({ ...state, ...newSettings }));
      },

      toggleProductPublished: (productId) => {
        set((state) => {
          const isCurrentlyUnpublished = state.unpublishedProductIds.includes(productId);
          const nextUnpublished = isCurrentlyUnpublished
            ? state.unpublishedProductIds.filter((id) => id !== productId)
            : [...state.unpublishedProductIds, productId];
          return { unpublishedProductIds: nextUnpublished };
        });
      },

      toggleProductFeatured: (productId) => {
        set((state) => {
          const isCurrentlyFeatured = state.featuredProductIds.includes(productId);
          const nextFeatured = isCurrentlyFeatured
            ? state.featuredProductIds.filter((id) => id !== productId)
            : [...state.featuredProductIds, productId];
          return { featuredProductIds: nextFeatured };
        });
      },

      setAllProductsPublished: (productIds, published) => {
        set((state) => {
          if (published) {
            const setIds = new Set(productIds);
            return {
              unpublishedProductIds: state.unpublishedProductIds.filter((id) => !setIds.has(id)),
            };
          } else {
            const combined = Array.from(new Set([...state.unpublishedProductIds, ...productIds]));
            return { unpublishedProductIds: combined };
          }
        });
      },

      setProductDescription: (productId, description) => {
        set((state) => ({
          productDescriptions: {
            ...state.productDescriptions,
            [productId]: description,
          },
        }));
      },

      setProductImage: (productId, imageUrl) => {
        set((state) => ({
          productImages: {
            ...state.productImages,
            [productId]: imageUrl,
          },
        }));
      },

      setProductVariants: (productId, variants) => {
        set((state) => ({
          productVariants: {
            ...state.productVariants,
            [productId]: variants,
          },
        }));
      },

      addCoupon: (coupon) => {
        set((state) => ({
          coupons: [...state.coupons.filter((c) => c.code !== coupon.code), coupon],
        }));
      },

      deleteCoupon: (code) => {
        set((state) => ({
          coupons: state.coupons.filter((c) => c.code !== code),
        }));
      },

      toggleCouponActive: (code) => {
        set((state) => ({
          coupons: state.coupons.map((c) =>
            c.code === code ? { ...c, active: !c.active } : c,
          ),
        }));
      },
    }),
    {
      name: 'pwayment_webshop_settings_v1',
      version: 3,
      migrate: (persistedState) => {
        const persisted = (persistedState || {}) as Record<string, unknown>;
        const { activePlan: _legacyPlan, ...withoutLegacyPlan } = persisted;
        void _legacyPlan;
        const state = withoutLegacyPlan as Partial<WebshopSettings>;
        return {
          ...state,
          featuredProductIds: remapProductIds(state.featuredProductIds),
          unpublishedProductIds: remapProductIds(state.unpublishedProductIds),
          productDescriptions: remapProductRecord(state.productDescriptions),
          productImages: remapProductRecord(state.productImages),
          productVariants: {},
        };
      },
      merge: (persistedState, currentState) => {
        const persisted = (persistedState || {}) as Record<string, unknown>;
        const { activePlan: _legacyPlan, ...safePersisted } = persisted;
        void _legacyPlan;
        return { ...currentState, ...safePersisted } as WebshopStoreState;
      },
    },
  ),
);
