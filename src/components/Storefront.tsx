import React, { CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  Info,
  LockKeyhole,
  Mail,
  MapPin,
  Menu,
  Minus,
  PackageCheck,
  Phone,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  ShoppingBag,
  SlidersHorizontal,
  Store,
  Tag,
  Trash2,
  Truck,
  X,
} from 'lucide-react';
import { Product } from '../types';
import { useProducts } from '../store/useProducts';
import { DiscountCoupon, useWebshopStore } from '../store/useWebshopStore';
import { webshopCommerce } from '../services/webshopCommerce';

type CheckoutStep = 'details' | 'payment' | 'success';
type DeliveryMode = 'shipping' | 'pickup';
type PriceFilter = 'all' | 'under-50' | '50-100' | 'over-100';
type InfoPanel = 'shipping' | 'returns' | 'terms' | 'privacy' | null;

interface CartLine {
  product: Product;
  quantity: number;
}

interface ProductGroup {
  key: string;
  slug: string;
  name: string;
  brand?: string;
  category: string;
  products: Product[];
}

interface CheckoutErrors {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  street?: string;
  number?: string;
  postal?: string;
  city?: string;
  terms?: string;
  payment?: string;
  order?: string;
}

interface OrderSnapshot {
  number: string;
  totalCents: number;
  email: string;
  delivery: DeliveryMode;
  payment: string;
  paymentStatus: string;
  inventoryStatus: string;
  emailStatus: string;
}

const createCheckoutRequestId = () => globalThis.crypto?.randomUUID?.() ?? `web-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const CATEGORY_IMAGES: Record<string, string> = {
  skateboards: 'https://images.unsplash.com/photo-1520045892732-304bc3ac5d8e?auto=format&fit=crop&w=1200&q=82',
  components: 'https://images.unsplash.com/photo-1547447134-cd3f5c716030?auto=format&fit=crop&w=1200&q=82',
  footwear: 'https://images.unsplash.com/photo-1552346154-21d32810aba3?auto=format&fit=crop&w=1200&q=82',
  apparel: 'https://images.unsplash.com/photo-1556905055-8f358a7a47b2?auto=format&fit=crop&w=1200&q=82',
  protection: 'https://images.unsplash.com/photo-1572776685600-aca8c3456337?auto=format&fit=crop&w=1200&q=82',
  accessories: 'https://images.unsplash.com/photo-1508599589920-14cfa1c1fe4d?auto=format&fit=crop&w=1200&q=82',
  maintenance: 'https://images.unsplash.com/photo-1531948371443-d5afa127d9e2?auto=format&fit=crop&w=1200&q=82',
  services: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=1200&q=82',
};

const CATEGORY_LABELS: Record<string, string> = {
  skateboards: 'Skateboards',
  components: 'Onderdelen',
  footwear: 'Schoenen',
  apparel: 'Kleding',
  protection: 'Bescherming',
  accessories: 'Accessoires',
  maintenance: 'Onderhoud',
  services: 'Services',
};

const PAYMENT_LABELS: Record<string, string> = {
  bancontact: 'Bancontact',
  ideal: 'iDEAL',
  creditcard: 'Visa / Mastercard',
  applepay: 'Apple Pay / Google Pay',
  klarna: 'Klarna',
  pickup: 'Betalen bij afhalen',
};

const PAYMENT_BADGES: Record<string, string> = {
  bancontact: 'BE',
  ideal: 'NL',
  creditcard: 'VISA',
  applepay: 'PAY',
  klarna: 'K',
  pickup: 'SHOP',
};

const CART_STORAGE_KEY = 'pwayment_storefront_cart_v2';

const formatPrice = (cents: number) =>
  new Intl.NumberFormat('nl-BE', { style: 'currency', currency: 'EUR' }).format(cents / 100);

const slugify = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

const getAvailableQuantity = (product: Product) =>
  product.stockQty == null ? Number.POSITIVE_INFINITY : Math.max(0, product.stockQty);

const getVariantLabel = (product: Product) => product.variant || 'Standaard';

const getProductImage = (product: Product, configuredImages: Record<string, string>) =>
  configuredImages[product.id] || CATEGORY_IMAGES[product.category] || CATEGORY_IMAGES.accessories;

const buildProductGroups = (products: Product[]): ProductGroup[] => {
  const grouped = new Map<string, ProductGroup>();
  products.forEach((product) => {
    const key = `${product.brand || ''}|${product.category}|${product.name}`.toLowerCase();
    const existing = grouped.get(key);
    if (existing) {
      existing.products.push(product);
      return;
    }
    grouped.set(key, {
      key,
      slug: slugify(`${product.brand || ''}-${product.name}`),
      name: product.name,
      brand: product.brand,
      category: product.category,
      products: [product],
    });
  });
  return Array.from(grouped.values()).map((group) => ({
    ...group,
    products: [...group.products].sort((a, b) => getVariantLabel(a).localeCompare(getVariantLabel(b), 'nl-BE')),
  }));
};

const readStoredCart = (): CartLine[] => {
  try {
    const raw = window.localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CartLine[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((line) => line?.product?.id && Number.isFinite(line.quantity) && line.quantity > 0);
  } catch {
    return [];
  }
};

const getAccentContrast = (hex: string) => {
  const normalized = hex.replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return '#ffffff';
  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 155 ? '#020617' : '#ffffff';
};

const getRoute = () => {
  const productMatch = window.location.pathname.match(/^\/shop\/product\/([^/]+)$/);
  return {
    productSlug: productMatch ? decodeURIComponent(productMatch[1]) : null,
    checkout: window.location.pathname === '/shop/checkout',
  };
};

const ModalShell = ({
  children,
  onClose,
  label,
  wide = false,
}: {
  children: React.ReactNode;
  onClose: () => void;
  label: string;
  wide?: boolean;
}) => {
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    const firstControl = dialog?.querySelector<HTMLElement>('button, a, input, select, textarea, [tabindex]:not([tabindex="-1"])');
    (firstControl || dialog)?.focus();
    return () => previouslyFocused?.focus();
  }, []);

  const keepFocusInside = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Tab') return;
    const controls = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'),
    ).filter((element) => element.offsetParent !== null);
    if (controls.length === 0) {
      event.preventDefault();
      event.currentTarget.focus();
      return;
    }
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      className="fixed inset-0 z-70 flex items-end justify-center bg-slate-950/70 p-0 backdrop-blur-md sm:items-center sm:p-5"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        onKeyDown={keepFocusInside}
        className={`sf-surface sf-modal relative max-h-[96dvh] w-full overflow-y-auto rounded-t-[1.75rem] shadow-2xl outline-none sm:rounded-[1.75rem] ${wide ? 'max-w-6xl' : 'max-w-xl'}`}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label={`${label} sluiten`}
          className="sf-icon-button absolute right-4 top-4 z-20 grid h-11 w-11 place-items-center rounded-full"
        >
          <X size={18} />
        </button>
        {children}
      </section>
    </div>
  );
};

const ProductVisual = ({
  product,
  className = '',
  eager = false,
}: {
  product: Product;
  className?: string;
  eager?: boolean;
}) => {
  const images = useWebshopStore((state) => state.productImages);
  const [failed, setFailed] = useState(false);
  const source = getProductImage(product, images);

  useEffect(() => setFailed(false), [source]);

  return (
    <div className={`sf-product-visual relative overflow-hidden ${className}`}>
      {!failed ? (
        <img
          src={source}
          alt={`${product.name}${product.variant ? ` – ${product.variant}` : ''}`}
          onError={() => setFailed(true)}
          loading={eager ? 'eager' : 'lazy'}
          fetchPriority={eager ? 'high' : 'auto'}
          className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.035]"
        />
      ) : (
        <div className="sf-muted grid h-full w-full place-items-center">
          <ShoppingBag size={38} />
        </div>
      )}
    </div>
  );
};

const Storefront: React.FC = () => {
  const webshop = useWebshopStore();
  const products = useProducts((state) => state.list);
  const hydrated = useProducts((state) => state.hydrated);
  const hydrateProducts = useProducts((state) => state.hydrate);
  const refreshProducts = useProducts((state) => state.refresh);
  const syncPersistedProducts = useProducts((state) => state.syncPersisted);
  const [route, setRoute] = useState(getRoute);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [onlyInStock, setOnlyInStock] = useState(false);
  const [priceFilter, setPriceFilter] = useState<PriceFilter>('all');
  const [sort, setSort] = useState<'featured' | 'price-asc' | 'price-desc' | 'name'>('featured');
  const [visibleCount, setVisibleCount] = useState(24);
  const [selectedVariantId, setSelectedVariantId] = useState('');
  const [cart, setCart] = useState<CartLine[]>(readStoredCart);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutStep, setCheckoutStep] = useState<CheckoutStep>('details');
  const [delivery, setDelivery] = useState<DeliveryMode>('shipping');
  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<DiscountCoupon | null>(null);
  const [couponMessage, setCouponMessage] = useState<string | null>(null);
  const [selectedPayment, setSelectedPayment] = useState('bancontact');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [orderNote, setOrderNote] = useState('');
  const [errors, setErrors] = useState<CheckoutErrors>({});
  const [order, setOrder] = useState<OrderSnapshot | null>(null);
  const [placingOrder, setPlacingOrder] = useState(false);
  const [checkoutRequestId, setCheckoutRequestId] = useState(createCheckoutRequestId);
  const [toast, setToast] = useState<string | null>(null);
  const [infoPanel, setInfoPanel] = useState<InfoPanel>(null);
  const checkoutRef = useRef<HTMLDivElement>(null);
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    street: '',
    number: '',
    postal: '',
    city: '',
    country: 'België',
  });

  useEffect(() => {
    void hydrateProducts();
  }, [hydrateProducts]);

  useEffect(() => {
    const onOrderChange = () => void refreshProducts();
    window.addEventListener('pwayment:webshop-orders-changed', onOrderChange);
    const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('pwayment-webshop-orders') : null;
    if (channel) channel.onmessage = onOrderChange;
    return () => {
      window.removeEventListener('pwayment:webshop-orders-changed', onOrderChange);
      channel?.close();
    };
  }, [refreshProducts]);

  useEffect(() => {
    const onPopState = () => setRoute(getRoute());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
    } catch {
      // The cart still works for this session when device storage is unavailable.
    }
  }, [cart]);

  useEffect(() => {
    if (!hydrated || cart.length === 0) return;
    const byId = new Map(products.map((product) => [product.id, product]));
    setCart((current) => current.flatMap((line) => {
      const freshProduct = byId.get(line.product.id);
      if (!freshProduct || freshProduct.isActive === false) return [];
      return [{ ...line, product: freshProduct, quantity: Math.min(line.quantity, getAvailableQuantity(freshProduct)) }];
    }).filter((line) => line.quantity > 0));
  }, [hydrated, products]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const previousTitle = document.title;
    const description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    const previousDescription = description?.content;
    document.title = webshop.shopName;
    if (description) description.content = webshop.seoDescription;
    return () => {
      document.title = previousTitle;
      if (description && previousDescription) description.content = previousDescription;
    };
  }, [webshop.seoDescription, webshop.shopName]);

  useEffect(() => {
    const overlayOpen = cartOpen || route.checkout || Boolean(route.productSlug) || Boolean(infoPanel) || filtersOpen;
    if (!overlayOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [cartOpen, filtersOpen, infoPanel, route.checkout, route.productSlug]);

  const publishedProducts = useMemo(
    () => products.filter((product) => product.isActive !== false && !webshop.unpublishedProductIds.includes(product.id)),
    [products, webshop.unpublishedProductIds],
  );

  const productGroups = useMemo(() => buildProductGroups(publishedProducts), [publishedProducts]);
  const categories = useMemo(() => Array.from(new Set(productGroups.map((group) => group.category))), [productGroups]);
  const brands = useMemo(
    () => Array.from(new Set(productGroups.map((group) => group.brand).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b, 'nl-BE')),
    [productGroups],
  );

  const priceFor = (product: Product) =>
    Math.round(product.priceCents * (1 + Math.max(0, webshop.webshopMarkupPercent) / 100));

  const representativeFor = (group: ProductGroup) =>
    group.products.find((product) => getAvailableQuantity(product) > 0) || group.products[0];

  const visibleGroups = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    const list = productGroups.filter((group) => {
      const availableProducts = group.products.filter((product) => getAvailableQuantity(product) > 0);
      if (!webshop.showOutOfStock && availableProducts.length === 0) return false;
      if (onlyInStock && availableProducts.length === 0) return false;
      if (category !== 'all' && group.category !== category) return false;
      if (selectedBrands.length > 0 && (!group.brand || !selectedBrands.includes(group.brand))) return false;
      const lowestPrice = Math.min(...group.products.map((product) => priceFor(product)));
      if (priceFilter === 'under-50' && lowestPrice >= 5000) return false;
      if (priceFilter === '50-100' && (lowestPrice < 5000 || lowestPrice > 10000)) return false;
      if (priceFilter === 'over-100' && lowestPrice <= 10000) return false;
      if (!normalized) return true;
      return [group.name, group.brand, CATEGORY_LABELS[group.category], ...group.products.flatMap((product) => [product.variant, product.sku])]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalized));
    });

    return [...list].sort((a, b) => {
      const priceA = Math.min(...a.products.map((product) => priceFor(product)));
      const priceB = Math.min(...b.products.map((product) => priceFor(product)));
      if (sort === 'price-asc') return priceA - priceB;
      if (sort === 'price-desc') return priceB - priceA;
      if (sort === 'name') return a.name.localeCompare(b.name, 'nl-BE');
      const featuredA = a.products.some((product) => webshop.featuredProductIds.includes(product.id));
      const featuredB = b.products.some((product) => webshop.featuredProductIds.includes(product.id));
      if (featuredA !== featuredB) return featuredB ? 1 : -1;
      return a.name.localeCompare(b.name, 'nl-BE');
    });
  }, [category, onlyInStock, priceFilter, productGroups, search, selectedBrands, sort, webshop.featuredProductIds, webshop.showOutOfStock, webshop.webshopMarkupPercent]);

  useEffect(() => setVisibleCount(24), [category, onlyInStock, priceFilter, search, selectedBrands, sort]);

  const activeFilterCount = selectedBrands.length + Number(onlyInStock) + Number(priceFilter !== 'all');
  const selectedGroup = route.productSlug ? productGroups.find((group) => group.slug === route.productSlug) || null : null;
  const selectedVariant = selectedGroup?.products.find((product) => product.id === selectedVariantId) || (selectedGroup ? representativeFor(selectedGroup) : null);

  useEffect(() => {
    if (!selectedGroup) return;
    setSelectedVariantId(representativeFor(selectedGroup).id);
  }, [selectedGroup?.key]);

  const navigate = (path: string) => {
    window.history.pushState({}, '', path);
    setRoute(getRoute());
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openProduct = (group: ProductGroup) => navigate(`/shop/product/${encodeURIComponent(group.slug)}`);
  const closeProduct = () => navigate('/shop');

  const cartCount = cart.reduce((sum, line) => sum + line.quantity, 0);
  const subtotalCents = cart.reduce((sum, line) => sum + priceFor(line.product) * line.quantity, 0);
  const couponIsEligible = Boolean(appliedCoupon && (!appliedCoupon.minOrderCents || subtotalCents >= appliedCoupon.minOrderCents));
  const discountCents = !couponIsEligible || !appliedCoupon
    ? 0
    : appliedCoupon.discountType === 'percent'
      ? Math.min(subtotalCents, Math.round(subtotalCents * Math.min(100, Math.max(0, appliedCoupon.value)) / 100))
      : Math.min(subtotalCents, Math.max(0, appliedCoupon.value));
  const shippingCents = delivery === 'pickup' || subtotalCents >= webshop.freeShippingThresholdCents ? 0 : webshop.shippingFeeCents;
  const totalCents = Math.max(0, subtotalCents - discountCents + shippingCents);
  const freeShippingRemaining = Math.max(0, webshop.freeShippingThresholdCents - subtotalCents);
  const freeShippingProgress = webshop.freeShippingThresholdCents <= 0
    ? 100
    : Math.min(100, Math.round((subtotalCents / webshop.freeShippingThresholdCents) * 100));

  const availablePayments = useMemo(() => {
    const methods = [
      ['bancontact', webshop.paymentMethods.bancontact],
      ['ideal', webshop.paymentMethods.ideal],
      ['creditcard', webshop.paymentMethods.creditcard],
      ['applepay', webshop.paymentMethods.applepay],
      ['klarna', webshop.paymentMethods.klarna],
      ['pickup', delivery === 'pickup' && webshop.paymentMethods.payOnPickup],
    ] as Array<[string, boolean]>;
    return methods.filter(([, enabled]) => enabled).map(([id]) => id);
  }, [delivery, webshop.paymentMethods]);

  useEffect(() => {
    if (!availablePayments.includes(selectedPayment)) setSelectedPayment(availablePayments[0] || '');
  }, [availablePayments, selectedPayment]);

  useEffect(() => {
    if (!route.checkout) return;
    checkoutRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [checkoutStep, route.checkout]);

  const addToCart = (product: Product) => {
    const available = getAvailableQuantity(product);
    if (available <= 0) return;
    setCart((current) => {
      const existing = current.find((line) => line.product.id === product.id);
      if (!existing) return [...current, { product, quantity: 1 }];
      return current.map((line) =>
        line.product.id === product.id
          ? { ...line, quantity: Math.min(available, line.quantity + 1) }
          : line,
      );
    });
    setToast(`${product.name}${product.variant ? ` · ${product.variant}` : ''} is toegevoegd.`);
  };

  const updateQuantity = (productId: string, delta: number) => {
    setCart((current) => current.flatMap((line) => {
      if (line.product.id !== productId) return [line];
      const next = line.quantity + delta;
      if (next <= 0) return [];
      return [{ ...line, quantity: Math.min(getAvailableQuantity(line.product), next) }];
    }));
  };

  const applyCoupon = () => {
    const code = couponInput.trim().toUpperCase();
    const coupon = webshop.coupons.find((item) => item.active && item.code.toUpperCase() === code);
    if (!coupon) {
      setAppliedCoupon(null);
      setCouponMessage('Deze code is niet geldig of niet meer actief.');
      return;
    }
    if (coupon.minOrderCents && subtotalCents < coupon.minOrderCents) {
      setAppliedCoupon(null);
      setCouponMessage(`Nog ${formatPrice(coupon.minOrderCents - subtotalCents)} nodig voor deze code.`);
      return;
    }
    setAppliedCoupon(coupon);
    setCouponMessage(`${coupon.code} is toegepast.`);
  };

  const startCheckout = () => {
    setCartOpen(false);
    setCheckoutStep('details');
    setCheckoutRequestId(createCheckoutRequestId());
    setErrors({});
    navigate('/shop/checkout');
  };

  const validateDetails = () => {
    const next: CheckoutErrors = {};
    if (form.firstName.trim().length < 2) next.firstName = 'Vul uw voornaam in.';
    if (form.lastName.trim().length < 2) next.lastName = 'Vul uw achternaam in.';
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) next.email = 'Vul een geldig e-mailadres in.';
    if (form.phone.trim().replace(/\D/g, '').length < 8) next.phone = 'Vul een geldig telefoonnummer in.';
    if (delivery === 'shipping' && form.street.trim().length < 2) next.street = 'Vul uw straat in.';
    if (delivery === 'shipping' && form.number.trim().length < 1) next.number = 'Vul uw huisnummer in.';
    if (delivery === 'shipping' && !/^\d{4}$/.test(form.postal.trim())) next.postal = 'Vul een geldige postcode in.';
    if (delivery === 'shipping' && form.city.trim().length < 2) next.city = 'Vul uw gemeente in.';
    setErrors(next);
    if (Object.keys(next).length > 0) return false;
    setCheckoutStep('payment');
    return true;
  };

  const placeOrder = async () => {
    const next: CheckoutErrors = {};
    if (!selectedPayment || !availablePayments.includes(selectedPayment)) next.payment = 'Kies een beschikbare betaalmethode.';
    if (webshop.requireTermsCheckbox && !acceptedTerms) next.terms = 'Ga akkoord met de voorwaarden om verder te gaan.';
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    if (placingOrder) return;

    setPlacingOrder(true);
    try {
      const result = await webshopCommerce.placeOrder({
        clientRequestId: checkoutRequestId,
        lines: cart.map((line) => ({
          productId: line.product.id,
          productName: line.product.name,
          variant: line.product.variant,
          sku: line.product.sku,
          quantity: line.quantity,
          unitPriceCents: priceFor(line.product),
        })),
        customer: {
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          email: form.email.trim().toLowerCase(),
          phone: form.phone.trim(),
        },
        deliveryMode: delivery,
        shippingAddress: delivery === 'shipping' ? {
          street: form.street.trim(),
          number: form.number.trim(),
          postal: form.postal.trim(),
          city: form.city.trim(),
          country: form.country,
        } : undefined,
        pickupAddress: delivery === 'pickup' ? webshop.pickupAddress : undefined,
        paymentMethod: selectedPayment,
        note: orderNote,
        couponCode: appliedCoupon?.code,
        subtotalCents,
        discountCents,
        shippingCents,
        totalCents,
        autoConfirm: webshop.autoConfirmOrders,
        notificationEmail: webshop.orderNotificationEmail,
        shopName: webshop.shopName,
      });
      syncPersistedProducts(result.updatedProducts);
      setOrder({
        number: result.order.number,
        totalCents: result.order.totalCents,
        email: result.order.customer.email,
        delivery: result.order.deliveryMode,
        payment: result.order.paymentMethod,
        paymentStatus: result.order.paymentStatus,
        inventoryStatus: result.order.inventoryStatus,
        emailStatus: result.order.confirmationEmail.status,
      });
      setCheckoutStep('success');
    } catch (error) {
      setErrors({ order: error instanceof Error ? error.message : 'De bestelling kon niet worden geplaatst. Probeer opnieuw.' });
      await refreshProducts();
    } finally {
      setPlacingOrder(false);
    }
  };

  const closeCompletedOrder = () => {
    setCheckoutStep('details');
    setCart([]);
    setAppliedCoupon(null);
    setCouponInput('');
    setCouponMessage(null);
    setAcceptedTerms(false);
    setOrderNote('');
    setOrder(null);
    setCheckoutRequestId(createCheckoutRequestId());
    navigate('/shop');
  };

  const resetFilters = () => {
    setSearch('');
    setCategory('all');
    setSelectedBrands([]);
    setOnlyInStock(false);
    setPriceFilter('all');
  };

  const themeStyle = {
    '--sf-accent': webshop.primaryColor,
    '--sf-accent-contrast': getAccentContrast(webshop.primaryColor),
  } as CSSProperties;

  const topCategories = categories.slice(0, 4);
  const displayedGroups = visibleGroups.slice(0, visibleCount);

  const renderOrderSummary = (compact = false) => (
    <div className={`sf-order-summary ${compact ? 'p-4' : 'p-5 sm:p-6'}`}>
      <div className="flex items-center justify-between">
        <h3 className="sf-heading text-sm font-extrabold">Uw bestelling</h3>
        <span className="sf-text-muted text-xs">{cartCount} {cartCount === 1 ? 'artikel' : 'artikelen'}</span>
      </div>
      <div className="mt-4 space-y-3">
        {cart.map((line) => (
          <div key={line.product.id} className="flex items-center gap-3">
            <ProductVisual product={line.product} className="h-14 w-14 shrink-0 rounded-xl" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-bold">{line.product.name}</div>
              <div className="sf-text-muted text-[11px]">{getVariantLabel(line.product)} · {line.quantity}×</div>
            </div>
            <div className="text-xs font-extrabold">{formatPrice(priceFor(line.product) * line.quantity)}</div>
          </div>
        ))}
      </div>
      <div className="sf-divider mt-5 space-y-2 border-t pt-4 text-xs">
        <div className="flex justify-between"><span className="sf-text-muted">Subtotaal</span><strong>{formatPrice(subtotalCents)}</strong></div>
        {discountCents > 0 && <div className="flex justify-between text-emerald-700"><span>Korting</span><strong>− {formatPrice(discountCents)}</strong></div>}
        <div className="flex justify-between"><span className="sf-text-muted">Verzending</span><strong>{shippingCents === 0 ? 'Gratis' : formatPrice(shippingCents)}</strong></div>
        <div className="sf-divider flex justify-between border-t pt-3 text-base font-black"><span>Totaal</span><span>{formatPrice(totalCents)}</span></div>
      </div>
    </div>
  );

  if (!webshop.isEnabled) {
    return (
      <div className="storefront sf-page min-h-dvh" data-shop-theme={webshop.themeStyle} style={themeStyle}>
        <header className="sf-header border-b">
          <div className="mx-auto flex h-18 max-w-5xl items-center gap-3 px-4 sm:px-6">
            <span className="sf-button-primary grid h-11 w-11 place-items-center rounded-xl text-lg font-black">{webshop.shopName.charAt(0)}</span>
            <span className="sf-heading text-sm font-black">{webshop.shopName}</span>
          </div>
        </header>
        <main className="mx-auto grid min-h-[calc(100dvh-4.5rem)] max-w-xl place-items-center px-6 py-16 text-center">
          <div>
            <Store size={34} className="sf-text-muted mx-auto" />
            <h1 className="sf-heading mt-5 text-3xl font-black tracking-tight">We zijn zo weer terug.</h1>
            <p className="sf-text-muted mt-3 text-sm font-medium leading-6">De webshop is tijdelijk niet beschikbaar. Neem voor vragen contact op via {webshop.contactEmail}.</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="storefront sf-page min-h-dvh" data-shop-theme={webshop.themeStyle} style={themeStyle}>
      {webshop.announcementActive && (
        <div className="sf-announcement px-4 py-2 text-center text-[11px] font-bold sm:text-xs">{webshop.announcementText}</div>
      )}

      <header className="sf-header sticky top-0 z-40 border-b backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:h-18 sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={() => setMobileMenuOpen((open) => !open)}
            aria-label={mobileMenuOpen ? 'Menu sluiten' : 'Menu openen'}
            aria-expanded={mobileMenuOpen}
            className="sf-icon-button grid h-11 w-11 shrink-0 place-items-center rounded-xl sm:hidden"
          >
            {mobileMenuOpen ? <X size={19} /> : <Menu size={19} />}
          </button>

          <a href="/shop" className="flex min-w-0 items-center gap-3" aria-label={`${webshop.shopName} home`}>
            <span className="sf-brand-mark grid h-10 w-10 shrink-0 place-items-center rounded-xl text-lg font-black">{webshop.shopName.charAt(0)}</span>
            <span className="min-w-0">
              <span className="sf-heading block truncate text-sm font-black tracking-tight sm:text-base">{webshop.shopName}</span>
              <span className="sf-text-muted hidden truncate text-[10px] font-medium lg:block">{webshop.shopTagline}</span>
            </span>
          </a>

          <div className="relative ml-auto hidden max-w-xl flex-1 sm:block">
            <Search size={17} className="sf-text-muted absolute left-4 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label="Zoek in de webshop"
              placeholder="Zoek op product, merk, maat of SKU…"
              className="sf-input w-full rounded-2xl py-3 pl-11 pr-10 text-sm"
            />
            {search && (
              <button type="button" onClick={() => setSearch('')} aria-label="Zoekopdracht wissen" className="sf-text-muted absolute right-3 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full"><X size={15} /></button>
            )}
          </div>

          <button
            type="button"
            onClick={() => setCartOpen(true)}
            className="sf-button-primary relative flex h-11 items-center gap-2 rounded-xl px-3 text-xs font-extrabold sm:px-4"
            aria-label={`Winkelmand met ${cartCount} artikelen`}
          >
            <ShoppingBag size={17} />
            <span className="hidden md:inline">Winkelmand</span>
            {cartCount > 0 && <span className="sf-cart-count rounded-full px-2 py-0.5 text-[10px]">{cartCount}</span>}
          </button>
        </div>

        <div className="px-4 pb-3 sm:hidden">
          <div className="relative">
            <Search size={16} className="sf-text-muted absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label="Zoek in de webshop"
              placeholder="Zoek producten…"
              className="sf-input w-full rounded-xl py-2.5 pl-10 pr-10 text-sm"
            />
            {search && <button type="button" onClick={() => setSearch('')} aria-label="Zoekopdracht wissen" className="sf-text-muted absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center"><X size={15} /></button>}
          </div>
        </div>

        <nav className={`${mobileMenuOpen ? 'flex' : 'hidden'} sf-category-nav mx-auto max-w-7xl gap-2 overflow-x-auto px-4 pb-3 sm:flex sm:px-6 lg:px-8`} aria-label="Productcategorieën">
          <button type="button" onClick={() => { setCategory('all'); setMobileMenuOpen(false); }} aria-pressed={category === 'all'} className={`sf-category-chip whitespace-nowrap rounded-full px-4 py-2.5 text-xs font-bold ${category === 'all' ? 'is-active' : ''}`}>Alles</button>
          {categories.map((item) => (
            <button key={item} type="button" onClick={() => { setCategory(item); setMobileMenuOpen(false); }} aria-pressed={category === item} className={`sf-category-chip whitespace-nowrap rounded-full px-4 py-2.5 text-xs font-bold ${category === item ? 'is-active' : ''}`}>
              {CATEGORY_LABELS[item] || item}
            </button>
          ))}
        </nav>
      </header>

      <main>
        <section className="mx-auto max-w-7xl px-4 pt-4 sm:px-6 sm:pt-7 lg:px-8">
          <div className="sf-hero relative isolate min-h-[350px] overflow-hidden px-6 py-9 sm:min-h-[400px] sm:px-12 sm:py-12 lg:px-16">
            <img src={webshop.heroImageUrl} alt="" fetchPriority="high" className="absolute inset-0 -z-20 h-full w-full object-cover" />
            <div className="sf-hero-overlay absolute inset-0 -z-10" />
            <div className="flex min-h-[280px] max-w-2xl flex-col justify-center sm:min-h-[305px]">
              <div className="sf-hero-eyebrow mb-4 inline-flex w-fit items-center rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em]">Selectie van {webshop.shopName}</div>
              <h1 className="sf-heading max-w-2xl text-4xl font-black leading-[0.98] tracking-[-0.045em] sm:text-6xl lg:text-7xl">{webshop.heroTitle}</h1>
              <p className="sf-hero-copy mt-4 max-w-xl text-sm font-medium leading-6 sm:text-base">{webshop.heroSubtitle}</p>
              <div className="mt-7 flex flex-wrap gap-3">
                <button type="button" onClick={() => document.getElementById('collectie')?.scrollIntoView({ behavior: 'smooth' })} className="sf-hero-primary inline-flex min-h-11 items-center gap-2 rounded-xl px-5 py-3 text-xs font-black">Bekijk de collectie <ArrowRight size={16} /></button>
                {categories.includes('skateboards') && <button type="button" onClick={() => { setCategory('skateboards'); document.getElementById('collectie')?.scrollIntoView({ behavior: 'smooth' }); }} className="sf-hero-secondary inline-flex min-h-11 items-center rounded-xl px-5 py-3 text-xs font-black">Bekijk skateboards</button>}
              </div>
            </div>
          </div>
        </section>

        {topCategories.length > 0 && (
          <section className="mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-7 lg:px-8" aria-label="Shop per categorie">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {topCategories.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => { setCategory(item); document.getElementById('collectie')?.scrollIntoView({ behavior: 'smooth' }); }}
                  className="sf-category-card group relative min-h-28 overflow-hidden text-left sm:min-h-36"
                >
                  <img src={CATEGORY_IMAGES[item]} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                  <span className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-950/20 to-transparent" />
                  <span className="absolute inset-x-4 bottom-3 flex items-center justify-between text-sm font-black text-white sm:bottom-4">
                    {CATEGORY_LABELS[item] || item}<ArrowRight size={16} />
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}

        <section id="service" className="mx-auto grid max-w-7xl grid-cols-1 gap-3 px-4 pb-7 sm:grid-cols-3 sm:px-6 lg:px-8">
          {[
            [PackageCheck, 'Actuele winkelvoorraad', 'Online aanbod en winkelvoorraad blijven op elkaar afgestemd.'],
            [Truck, 'Duidelijke levering', `Gratis vanaf ${formatPrice(webshop.freeShippingThresholdCents)} of afhalen in de winkel.`],
            [ShieldCheck, 'Persoonlijke service', `Vragen? Bel ${webshop.contactPhone} of mail de winkel.`],
          ].map(([Icon, title, body]) => {
            const FeatureIcon = Icon as React.ElementType;
            return (
              <div key={String(title)} className="sf-card flex items-center gap-3 p-4">
                <span className="sf-accent-soft grid h-11 w-11 shrink-0 place-items-center rounded-xl"><FeatureIcon size={19} /></span>
                <span><strong className="sf-heading block text-xs font-black">{String(title)}</strong><span className="sf-text-muted text-[11px] font-medium leading-4">{String(body)}</span></span>
              </div>
            );
          })}
        </section>

        <section id="collectie" className="mx-auto max-w-7xl scroll-mt-36 px-4 pb-18 sm:px-6 lg:px-8">
          <div className="sf-divider mb-5 flex flex-col gap-4 border-b pb-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="sf-accent-text text-[10px] font-black uppercase tracking-[0.2em]">Online assortiment</p>
              <h2 className="sf-heading mt-1 text-3xl font-black tracking-[-0.035em]">{category === 'all' ? 'Ontdek de collectie' : CATEGORY_LABELS[category] || category}</h2>
              <p className="sf-text-muted mt-1 text-xs font-medium">{visibleGroups.length} producten · varianten samengevoegd</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => setFiltersOpen(true)} className="sf-button-secondary relative inline-flex min-h-11 items-center gap-2 rounded-xl px-4 text-xs font-bold">
                <SlidersHorizontal size={16} /> Filters
                {activeFilterCount > 0 && <span className="sf-accent-bg grid h-5 min-w-5 place-items-center rounded-full px-1 text-[10px] font-black">{activeFilterCount}</span>}
              </button>
              <label className="relative flex items-center gap-2 text-xs font-bold">
                <span className="sr-only">Sorteer producten</span>
                <select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)} className="sf-select min-h-11 appearance-none rounded-xl py-2.5 pl-3 pr-9 text-xs font-bold">
                  <option value="featured">Aanbevolen</option>
                  <option value="price-asc">Prijs laag–hoog</option>
                  <option value="price-desc">Prijs hoog–laag</option>
                  <option value="name">Naam A–Z</option>
                </select>
                <ChevronDown size={14} className="pointer-events-none absolute right-3" />
              </label>
            </div>
          </div>

          {(activeFilterCount > 0 || search) && (
            <div className="mb-4 flex flex-wrap items-center gap-2">
              {search && <button type="button" onClick={() => setSearch('')} className="sf-filter-chip">Zoeken: “{search}” <X size={13} /></button>}
              {selectedBrands.map((brand) => <button key={brand} type="button" onClick={() => setSelectedBrands((current) => current.filter((item) => item !== brand))} className="sf-filter-chip">{brand} <X size={13} /></button>)}
              {onlyInStock && <button type="button" onClick={() => setOnlyInStock(false)} className="sf-filter-chip">Op voorraad <X size={13} /></button>}
              {priceFilter !== 'all' && <button type="button" onClick={() => setPriceFilter('all')} className="sf-filter-chip">Prijsfilter <X size={13} /></button>}
              <button type="button" onClick={resetFilters} className="sf-accent-text min-h-9 px-2 text-xs font-bold">Alles wissen</button>
            </div>
          )}

          {!hydrated ? (
            <div className={`grid grid-cols-2 gap-3 sm:gap-5 ${webshop.gridColumns === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-3 xl:grid-cols-4'}`} aria-label="Producten laden">
              {Array.from({ length: 8 }).map((_, index) => <div key={index} className="sf-card h-80 animate-pulse" />)}
            </div>
          ) : visibleGroups.length === 0 ? (
            <div className="sf-card px-6 py-18 text-center">
              <Search size={30} className="sf-text-muted mx-auto" />
              <h3 className="sf-heading mt-3 text-sm font-black">Geen producten gevonden</h3>
              <p className="sf-text-muted mt-1 text-xs">Pas uw zoekterm of filters aan.</p>
              <button type="button" onClick={resetFilters} className="sf-button-primary mt-4 min-h-11 rounded-xl px-4 text-xs font-bold">Wis alle filters</button>
            </div>
          ) : (
            <>
              <div className={`grid grid-cols-2 gap-3 sm:gap-5 ${webshop.gridColumns === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-3 xl:grid-cols-4'}`}>
                {displayedGroups.map((group, index) => {
                  const representative = representativeFor(group);
                  const availableVariants = group.products.filter((product) => getAvailableQuantity(product) > 0);
                  const outOfStock = availableVariants.length === 0;
                  const featured = group.products.some((product) => webshop.featuredProductIds.includes(product.id));
                  const prices = group.products.map((product) => priceFor(product));
                  const minPrice = Math.min(...prices);
                  const maxPrice = Math.max(...prices);
                  return (
                    <article key={group.key} className="sf-card sf-product-card group flex min-w-0 flex-col overflow-hidden">
                      <button type="button" onClick={() => openProduct(group)} className="relative block aspect-[4/4.35] w-full text-left" aria-label={`${group.name} bekijken`}>
                        <ProductVisual product={representative} className="h-full w-full" eager={index < 4} />
                        <span className="absolute left-3 top-3 flex flex-col items-start gap-1.5">
                          {featured && <span className="sf-featured-badge rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-wide">Uitgelicht</span>}
                          {outOfStock && <span className="rounded-full bg-rose-700 px-2.5 py-1 text-[9px] font-black uppercase text-white">Uitverkocht</span>}
                        </span>
                      </button>
                      <div className="flex flex-1 flex-col p-3 sm:p-4">
                        <div className="sf-accent-text text-[9px] font-black uppercase tracking-[0.13em] sm:text-[10px]">{group.brand || CATEGORY_LABELS[group.category]}</div>
                        <button type="button" onClick={() => openProduct(group)} className="mt-1 text-left">
                          <h3 className="sf-heading line-clamp-2 text-xs font-black leading-4 sm:text-sm sm:leading-5">{group.name}</h3>
                        </button>
                        <div className="sf-text-muted mt-1 min-h-4 text-[10px] font-medium sm:text-[11px]">
                          {group.products.length > 1 ? `${availableVariants.length} van ${group.products.length} varianten beschikbaar` : getVariantLabel(representative)}
                        </div>
                        <div className="mt-auto flex items-end justify-between gap-2 pt-3">
                          <div>
                            <div className="sf-heading text-sm font-black sm:text-base">{minPrice === maxPrice ? formatPrice(minPrice) : `vanaf ${formatPrice(minPrice)}`}</div>
                            <div className="sf-text-muted hidden text-[9px] sm:block">incl. btw</div>
                          </div>
                          <button
                            type="button"
                            onClick={() => group.products.length === 1 ? addToCart(representative) : openProduct(group)}
                            disabled={outOfStock}
                            aria-label={group.products.length === 1 ? `${group.name} toevoegen` : `Kies een variant van ${group.name}`}
                            className="sf-button-primary grid h-11 w-11 shrink-0 place-items-center rounded-xl disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {group.products.length === 1 ? <Plus size={17} /> : <ArrowRight size={17} />}
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
              {visibleCount < visibleGroups.length && (
                <div className="mt-8 text-center">
                  <button type="button" onClick={() => setVisibleCount((count) => count + 24)} className="sf-button-secondary min-h-12 rounded-xl px-6 text-xs font-black">Meer producten laden · nog {visibleGroups.length - visibleCount}</button>
                </div>
              )}
            </>
          )}
        </section>
      </main>

      <footer className="sf-footer border-t">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:grid-cols-2 sm:px-6 lg:grid-cols-4 lg:px-8">
          <div>
            <div className="sf-heading text-base font-black">{webshop.shopName}</div>
            <p className="sf-text-muted mt-3 max-w-xs text-xs font-medium leading-5">{webshop.seoDescription}</p>
          </div>
          <div>
            <h3 className="sf-heading text-xs font-black">Service</h3>
            <div className="sf-text-muted mt-3 grid justify-start gap-2 text-left text-xs">
              <button type="button" onClick={() => setInfoPanel('shipping')} className="text-left hover:underline">Verzending & afhalen</button>
              <button type="button" onClick={() => setInfoPanel('returns')} className="text-left hover:underline">Retourneren</button>
              <a href={`mailto:${webshop.contactEmail}`} className="hover:underline">Contact & support</a>
            </div>
          </div>
          <div>
            <h3 className="sf-heading text-xs font-black">Voorwaarden</h3>
            <div className="sf-text-muted mt-3 grid justify-start gap-2 text-left text-xs">
              <button type="button" onClick={() => setInfoPanel('terms')} className="text-left hover:underline">Algemene voorwaarden</button>
              <button type="button" onClick={() => setInfoPanel('privacy')} className="text-left hover:underline">Privacybeleid</button>
            </div>
          </div>
          <div id="contact">
            <h3 className="sf-heading text-xs font-black">Contact</h3>
            <div className="sf-text-muted mt-3 space-y-2 text-xs">
              <a href={`mailto:${webshop.contactEmail}`} className="flex items-start gap-2 hover:underline"><Mail size={14} className="mt-0.5 shrink-0" />{webshop.contactEmail}</a>
              <a href={`tel:${webshop.contactPhone.replace(/\s/g, '')}`} className="flex items-start gap-2 hover:underline"><Phone size={14} className="mt-0.5 shrink-0" />{webshop.contactPhone}</a>
              {webshop.pickupEnabled && <div className="flex items-start gap-2"><MapPin size={14} className="mt-0.5 shrink-0" />{webshop.pickupAddress}</div>}
              <div className="flex gap-3 pt-2">
                {webshop.instagramUrl && <a href={webshop.instagramUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-bold hover:underline">Instagram <ExternalLink size={12} /></a>}
                {webshop.facebookUrl && <a href={webshop.facebookUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-bold hover:underline">Facebook <ExternalLink size={12} /></a>}
              </div>
            </div>
          </div>
        </div>
        <div className="sf-divider border-t px-4 py-4 text-center text-[10px] font-semibold opacity-60">Powered by Pwayment Retail · © {new Date().getFullYear()}</div>
      </footer>

      {filtersOpen && (
        <ModalShell label="Productfilters" onClose={() => setFiltersOpen(false)}>
          <div className="p-6 pt-8 sm:p-8">
            <div className="pr-12">
              <p className="sf-accent-text text-[10px] font-black uppercase tracking-[0.18em]">Verfijn collectie</p>
              <h2 className="sf-heading mt-1 text-2xl font-black">Filters</h2>
              <p className="sf-text-muted mt-1 text-xs">{visibleGroups.length} producten passen bij uw selectie.</p>
            </div>
            <div className="sf-divider mt-6 border-t pt-5">
              <h3 className="sf-heading text-xs font-black">Beschikbaarheid</h3>
              <label className="mt-3 flex min-h-11 cursor-pointer items-center justify-between rounded-xl border px-4 text-xs font-bold sf-control-border">
                Alleen producten op voorraad
                <input type="checkbox" checked={onlyInStock} onChange={(event) => setOnlyInStock(event.target.checked)} className="h-5 w-5 accent-[var(--sf-accent)]" />
              </label>
            </div>
            <div className="sf-divider mt-5 border-t pt-5">
              <h3 className="sf-heading text-xs font-black">Prijs</h3>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {([
                  ['all', 'Alle prijzen'],
                  ['under-50', 'Tot € 50'],
                  ['50-100', '€ 50 – € 100'],
                  ['over-100', 'Vanaf € 100'],
                ] as Array<[PriceFilter, string]>).map(([id, label]) => (
                  <button key={id} type="button" onClick={() => setPriceFilter(id)} aria-pressed={priceFilter === id} className={`sf-choice min-h-11 rounded-xl px-3 text-left text-xs font-bold ${priceFilter === id ? 'is-active' : ''}`}>{label}</button>
                ))}
              </div>
            </div>
            <div className="sf-divider mt-5 border-t pt-5">
              <h3 className="sf-heading text-xs font-black">Merk</h3>
              <div className="mt-3 grid max-h-52 grid-cols-2 gap-2 overflow-y-auto pr-1">
                {brands.map((brand) => {
                  const active = selectedBrands.includes(brand);
                  return <button key={brand} type="button" onClick={() => setSelectedBrands((current) => active ? current.filter((item) => item !== brand) : [...current, brand])} aria-pressed={active} className={`sf-choice min-h-11 rounded-xl px-3 text-left text-xs font-bold ${active ? 'is-active' : ''}`}>{brand}</button>;
                })}
              </div>
            </div>
            <div className="mt-7 grid grid-cols-2 gap-3">
              <button type="button" onClick={resetFilters} className="sf-button-secondary min-h-12 rounded-xl text-xs font-black">Alles wissen</button>
              <button type="button" onClick={() => setFiltersOpen(false)} className="sf-button-primary min-h-12 rounded-xl text-xs font-black">Toon {visibleGroups.length} producten</button>
            </div>
          </div>
        </ModalShell>
      )}

      {selectedGroup && selectedVariant && (
        <ModalShell label="Productdetails" onClose={closeProduct} wide>
          <div className="grid lg:grid-cols-[1.05fr_0.95fr]">
            <div className="relative min-h-[340px] lg:min-h-[680px]">
              <ProductVisual product={selectedVariant} className="absolute inset-0 h-full w-full" eager />
              {selectedGroup.products.length > 1 && (
                <div className="absolute bottom-4 left-4 right-4 flex gap-2 overflow-x-auto rounded-2xl bg-white/88 p-2 shadow-xl backdrop-blur-md">
                  {selectedGroup.products.map((product) => (
                    <button key={product.id} type="button" onClick={() => setSelectedVariantId(product.id)} aria-label={`Toon variant ${getVariantLabel(product)}`} aria-pressed={selectedVariant.id === product.id} className={`h-14 w-14 shrink-0 overflow-hidden rounded-xl border-2 ${selectedVariant.id === product.id ? 'border-slate-950' : 'border-transparent'}`}>
                      <ProductVisual product={product} className="h-full w-full" />
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex flex-col p-6 sm:p-9 lg:p-10">
              <div className="pr-12">
                <div className="sf-accent-text text-[10px] font-black uppercase tracking-[0.18em]">{selectedGroup.brand || CATEGORY_LABELS[selectedGroup.category]}</div>
                <h2 className="sf-heading mt-2 text-3xl font-black tracking-[-0.035em] sm:text-4xl">{selectedGroup.name}</h2>
              </div>
              {selectedGroup.products.length > 1 && (
                <div className="mt-6">
                  <div className="flex items-center justify-between"><span className="sf-heading text-xs font-black">Kies een variant</span><span className="sf-text-muted text-[11px]">{getVariantLabel(selectedVariant)}</span></div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {selectedGroup.products.map((product) => {
                      const available = getAvailableQuantity(product) > 0;
                      return <button key={product.id} type="button" onClick={() => setSelectedVariantId(product.id)} disabled={!available} aria-pressed={selectedVariant.id === product.id} className={`sf-choice min-h-11 rounded-xl px-4 text-xs font-bold ${selectedVariant.id === product.id ? 'is-active' : ''} disabled:cursor-not-allowed disabled:line-through disabled:opacity-40`}>{getVariantLabel(product)}</button>;
                    })}
                  </div>
                </div>
              )}
              <div className="sf-heading mt-6 text-3xl font-black">{formatPrice(priceFor(selectedVariant))}</div>
              <div className={`mt-2 flex items-center gap-2 text-xs font-bold ${getAvailableQuantity(selectedVariant) > 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                {getAvailableQuantity(selectedVariant) > 0 ? <CheckCircle2 size={16} /> : <Info size={16} />}
                {getAvailableQuantity(selectedVariant) <= 0
                  ? 'Tijdelijk uitverkocht'
                  : webshop.showStockCount && getAvailableQuantity(selectedVariant) !== Number.POSITIVE_INFINITY
                    ? `${getAvailableQuantity(selectedVariant)} direct beschikbaar`
                    : 'Op voorraad'}
              </div>
              <p className="sf-text-muted mt-6 text-sm font-medium leading-6">{webshop.productDescriptions[selectedVariant.id] || `Een zorgvuldig geselecteerde ${selectedGroup.name.toLowerCase()} met aandacht voor kwaliteit, duurzaamheid en dagelijks gebruik.`}</p>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <div className="sf-muted rounded-xl p-4 text-xs"><Truck size={18} className="sf-accent-text mb-2" /><strong className="sf-heading block">Levering</strong><span className="sf-text-muted mt-1 block">Gratis vanaf {formatPrice(webshop.freeShippingThresholdCents)}</span></div>
                {webshop.pickupEnabled && <div className="sf-muted rounded-xl p-4 text-xs"><Store size={18} className="sf-accent-text mb-2" /><strong className="sf-heading block">Afhalen</strong><span className="sf-text-muted mt-1 block">{webshop.pickupInstructions}</span></div>}
              </div>
              <button type="button" onClick={() => addToCart(selectedVariant)} disabled={getAvailableQuantity(selectedVariant) <= 0} className="sf-button-primary mt-7 flex min-h-13 w-full items-center justify-center gap-2 rounded-xl px-5 text-sm font-black disabled:opacity-40 lg:mt-auto">
                <ShoppingBag size={18} />{getAvailableQuantity(selectedVariant) <= 0 ? 'Tijdelijk uitverkocht' : 'Toevoegen aan winkelmand'}
              </button>
              <button type="button" onClick={() => { addToCart(selectedVariant); closeProduct(); setCartOpen(true); }} disabled={getAvailableQuantity(selectedVariant) <= 0} className="sf-accent-text mt-3 min-h-11 text-xs font-bold disabled:opacity-40">Toevoegen en winkelmand bekijken</button>
            </div>
          </div>
        </ModalShell>
      )}

      {cartOpen && (
        <div className="fixed inset-0 z-70 flex justify-end bg-slate-950/60 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setCartOpen(false); }}>
          <aside role="dialog" aria-modal="true" aria-label="Winkelmand" className="sf-surface flex h-full w-full max-w-md flex-col shadow-2xl">
            <div className="sf-divider flex items-center justify-between border-b p-5">
              <div><div className="sf-heading text-lg font-black">Uw winkelmand</div><div className="sf-text-muted text-[11px]">{cartCount} {cartCount === 1 ? 'artikel' : 'artikelen'}</div></div>
              <button type="button" onClick={() => setCartOpen(false)} aria-label="Winkelmand sluiten" className="sf-icon-button grid h-11 w-11 place-items-center rounded-full"><X size={18} /></button>
            </div>
            {cart.length > 0 && (
              <div className="sf-divider border-b p-5">
                <div className="flex justify-between text-[11px] font-bold"><span>{freeShippingRemaining > 0 ? `Nog ${formatPrice(freeShippingRemaining)} voor gratis verzending` : 'Gratis verzending bereikt'}</span><span>{freeShippingProgress}%</span></div>
                <div className="sf-muted mt-2 h-2 overflow-hidden rounded-full"><div className="sf-accent-bg h-full rounded-full transition-all" style={{ width: `${freeShippingProgress}%` }} /></div>
              </div>
            )}
            <div className="flex-1 space-y-3 overflow-y-auto p-5">
              {cart.length === 0 ? (
                <div className="grid h-full place-items-center text-center"><div><ShoppingBag size={42} className="sf-text-muted mx-auto" /><h3 className="sf-heading mt-3 text-sm font-black">Uw winkelmand is leeg</h3><p className="sf-text-muted mt-1 text-xs">Ontdek de collectie en voeg uw favorieten toe.</p><button type="button" onClick={() => setCartOpen(false)} className="sf-button-primary mt-5 min-h-11 rounded-xl px-4 text-xs font-bold">Verder winkelen</button></div></div>
              ) : cart.map((line) => (
                <div key={line.product.id} className="sf-control-border flex gap-3 rounded-2xl border p-3">
                  <ProductVisual product={line.product} className="h-20 w-20 shrink-0 rounded-xl" />
                  <div className="min-w-0 flex-1">
                    <div className="sf-heading truncate text-xs font-black">{line.product.name}</div>
                    <div className="sf-text-muted text-[10px]">{getVariantLabel(line.product)}</div>
                    <div className="mt-2 flex items-center justify-between">
                      <div className="sf-control-border flex items-center rounded-xl border">
                        <button type="button" onClick={() => updateQuantity(line.product.id, -1)} aria-label={`${line.product.name} verminderen`} className="grid h-9 w-9 place-items-center"><Minus size={13} /></button>
                        <span className="min-w-6 text-center text-xs font-black">{line.quantity}</span>
                        <button type="button" onClick={() => updateQuantity(line.product.id, 1)} disabled={line.quantity >= getAvailableQuantity(line.product)} aria-label={`${line.product.name} vermeerderen`} className="grid h-9 w-9 place-items-center disabled:opacity-30"><Plus size={13} /></button>
                      </div>
                      <div className="sf-heading text-xs font-black">{formatPrice(priceFor(line.product) * line.quantity)}</div>
                    </div>
                  </div>
                  <button type="button" onClick={() => setCart((current) => current.filter((item) => item.product.id !== line.product.id))} aria-label={`${line.product.name} verwijderen`} className="self-start p-2 text-slate-400 hover:text-rose-600"><Trash2 size={15} /></button>
                </div>
              ))}
            </div>
            <div className="sf-divider border-t p-5">
              {cart.length > 0 && (
                <>
                  <div className="mb-4 flex gap-2">
                    <div className="relative flex-1"><Tag size={14} className="sf-text-muted absolute left-3 top-1/2 -translate-y-1/2" /><input value={couponInput} onChange={(event) => setCouponInput(event.target.value.toUpperCase())} placeholder="Kortingscode" aria-label="Kortingscode" className="sf-input w-full rounded-xl py-2.5 pl-9 pr-3 text-xs font-bold" /></div>
                    <button type="button" onClick={applyCoupon} className="sf-button-secondary min-h-11 rounded-xl px-3 text-xs font-black">Toepassen</button>
                  </div>
                  {couponMessage && <div className={`mb-3 text-[11px] font-bold ${appliedCoupon ? 'text-emerald-700' : 'text-rose-600'}`} role="status">{couponMessage}</div>}
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between"><span className="sf-text-muted">Subtotaal</span><strong>{formatPrice(subtotalCents)}</strong></div>
                    {discountCents > 0 && <div className="flex justify-between text-emerald-700"><span>Korting</span><strong>− {formatPrice(discountCents)}</strong></div>}
                    <div className="flex justify-between"><span className="sf-text-muted">Verzending</span><strong>{shippingCents === 0 ? 'Gratis' : formatPrice(shippingCents)}</strong></div>
                    <div className="sf-divider flex justify-between border-t pt-3 text-base font-black"><span>Totaal</span><span>{formatPrice(totalCents)}</span></div>
                  </div>
                  <button type="button" onClick={startCheckout} className="sf-button-primary mt-4 flex min-h-13 w-full items-center justify-center gap-2 rounded-xl text-sm font-black">Veilig afrekenen <ArrowRight size={17} /></button>
                </>
              )}
            </div>
          </aside>
        </div>
      )}

      {route.checkout && (
        <div ref={checkoutRef} className="sf-page fixed inset-0 z-70 overflow-y-auto" role="dialog" aria-modal="true" aria-label="Checkout">
          <header className="sf-header sf-divider sticky top-0 z-10 border-b">
            <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
              <button type="button" onClick={() => navigate('/shop')} className="sf-heading flex min-h-11 items-center gap-2 text-sm font-black"><span className="sf-brand-mark grid h-9 w-9 place-items-center rounded-xl">{webshop.shopName.charAt(0)}</span>{webshop.shopName}</button>
              <div className="flex items-center gap-2 text-[11px] font-bold text-emerald-700"><LockKeyhole size={15} /> Veilig afrekenen</div>
            </div>
          </header>
          {cart.length === 0 && checkoutStep !== 'success' ? (
            <main className="mx-auto grid min-h-[calc(100dvh-4rem)] max-w-lg place-items-center px-4 py-12 text-center sm:px-6">
              <div className="sf-card sf-surface w-full p-8">
                <ShoppingBag size={40} className="sf-text-muted mx-auto" />
                <h1 className="sf-heading mt-4 text-2xl font-black">Uw winkelmand is leeg</h1>
                <p className="sf-text-muted mt-2 text-sm leading-6">Voeg eerst een product toe voordat u verdergaat naar de checkout.</p>
                <button type="button" onClick={() => navigate('/shop')} className="sf-button-primary mt-6 min-h-12 w-full rounded-xl text-sm font-black">Terug naar de collectie</button>
              </div>
            </main>
          ) : (
          <main className="mx-auto grid max-w-6xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_390px] lg:py-10">
            <section className="sf-surface sf-card p-5 sm:p-8">
              <div className="flex gap-2" aria-label="Checkoutvoortgang">
                {[
                  ['details', 'Gegevens'],
                  ['payment', 'Betaling'],
                  ['success', 'Bevestiging'],
                ].map(([id, label], index) => {
                  const stepIndex = ['details', 'payment', 'success'].indexOf(checkoutStep);
                  return <div key={id} className="flex flex-1 items-center gap-2"><span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-[10px] font-black ${stepIndex >= index ? 'sf-accent-bg' : 'sf-muted sf-text-muted'}`}>{stepIndex > index ? <Check size={13} /> : index + 1}</span><span className="sf-text-muted hidden text-[10px] font-bold sm:inline">{label}</span></div>;
                })}
              </div>

              {checkoutStep === 'details' && (
                <div className="mt-8">
                  <h1 className="sf-heading text-2xl font-black tracking-tight">Levering en contact</h1>
                  <p className="sf-text-muted mt-1 text-xs">Vul uw gegevens in en kies hoe u de bestelling wilt ontvangen.</p>
                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <button type="button" onClick={() => setDelivery('shipping')} aria-pressed={delivery === 'shipping'} className={`sf-choice min-h-28 rounded-2xl p-4 text-left text-xs font-black ${delivery === 'shipping' ? 'is-active' : ''}`}><Truck size={20} className="mb-3" />Thuisbezorging<span className="sf-text-muted mt-1 block text-[10px] font-medium">{shippingCents === 0 ? 'Gratis' : formatPrice(shippingCents)}</span></button>
                    {webshop.pickupEnabled && <button type="button" onClick={() => setDelivery('pickup')} aria-pressed={delivery === 'pickup'} className={`sf-choice min-h-28 rounded-2xl p-4 text-left text-xs font-black ${delivery === 'pickup' ? 'is-active' : ''}`}><Store size={20} className="mb-3" />Afhalen in winkel<span className="sf-text-muted mt-1 block text-[10px] font-medium">Gratis · {webshop.pickupAddress}</span></button>}
                  </div>
                  <div className="mt-6 grid gap-4 sm:grid-cols-2">
                    <label className="sf-label">Voornaam<input value={form.firstName} onChange={(event) => setForm({ ...form, firstName: event.target.value })} autoComplete="given-name" aria-invalid={Boolean(errors.firstName)} className="sf-input mt-1.5 w-full rounded-xl p-3" />{errors.firstName && <span className="sf-error">{errors.firstName}</span>}</label>
                    <label className="sf-label">Achternaam<input value={form.lastName} onChange={(event) => setForm({ ...form, lastName: event.target.value })} autoComplete="family-name" aria-invalid={Boolean(errors.lastName)} className="sf-input mt-1.5 w-full rounded-xl p-3" />{errors.lastName && <span className="sf-error">{errors.lastName}</span>}</label>
                    <label className="sf-label">E-mailadres<input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} autoComplete="email" aria-invalid={Boolean(errors.email)} className="sf-input mt-1.5 w-full rounded-xl p-3" />{errors.email && <span className="sf-error">{errors.email}</span>}</label>
                    <label className="sf-label">Telefoonnummer<input type="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} autoComplete="tel" aria-invalid={Boolean(errors.phone)} className="sf-input mt-1.5 w-full rounded-xl p-3" />{errors.phone && <span className="sf-error">{errors.phone}</span>}</label>
                    {delivery === 'shipping' && (
                      <>
                        <label className="sf-label sm:col-span-1">Straat<input value={form.street} onChange={(event) => setForm({ ...form, street: event.target.value })} autoComplete="address-line1" aria-invalid={Boolean(errors.street)} className="sf-input mt-1.5 w-full rounded-xl p-3" />{errors.street && <span className="sf-error">{errors.street}</span>}</label>
                        <label className="sf-label">Huisnummer<input value={form.number} onChange={(event) => setForm({ ...form, number: event.target.value })} autoComplete="address-line2" aria-invalid={Boolean(errors.number)} className="sf-input mt-1.5 w-full rounded-xl p-3" />{errors.number && <span className="sf-error">{errors.number}</span>}</label>
                        <label className="sf-label">Postcode<input inputMode="numeric" value={form.postal} onChange={(event) => setForm({ ...form, postal: event.target.value })} autoComplete="postal-code" aria-invalid={Boolean(errors.postal)} className="sf-input mt-1.5 w-full rounded-xl p-3" />{errors.postal && <span className="sf-error">{errors.postal}</span>}</label>
                        <label className="sf-label">Gemeente<input value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} autoComplete="address-level2" aria-invalid={Boolean(errors.city)} className="sf-input mt-1.5 w-full rounded-xl p-3" />{errors.city && <span className="sf-error">{errors.city}</span>}</label>
                      </>
                    )}
                  </div>
                  {delivery === 'pickup' && <div className="sf-accent-soft mt-5 rounded-xl p-4 text-xs"><strong className="sf-heading block">Afhaalinstructies</strong><span className="mt-1 block">{webshop.pickupInstructions}</span></div>}
                  {webshop.enableOrderNotes && <label className="sf-label mt-4 block">Opmerking voor de winkel <span className="sf-text-muted font-medium">(optioneel)</span><textarea rows={2} value={orderNote} onChange={(event) => setOrderNote(event.target.value)} className="sf-input mt-1.5 w-full resize-none rounded-xl p-3" placeholder="Bijvoorbeeld een cadeauverpakking…" /></label>}
                  <button type="button" onClick={validateDetails} className="sf-button-primary mt-6 flex min-h-13 w-full items-center justify-center gap-2 rounded-xl text-sm font-black">Naar betaling <ArrowRight size={17} /></button>
                </div>
              )}

              {checkoutStep === 'payment' && (
                <div className="mt-8">
                  <button type="button" onClick={() => setCheckoutStep('details')} className="sf-text-muted mb-4 inline-flex min-h-10 items-center gap-1 text-xs font-bold hover:underline"><ArrowLeft size={14} /> Gegevens wijzigen</button>
                  <h1 className="sf-heading text-2xl font-black tracking-tight">Betaalmethode</h1>
                  <p className="sf-text-muted mt-1 text-xs">Kies hoe u deze bestelling wilt betalen.</p>
                  <div className="sf-accent-soft mt-4 flex items-start gap-2 rounded-xl p-3 text-[11px] font-semibold leading-5"><Info size={15} className="mt-0.5 shrink-0" /><span><strong>Demomodus:</strong> de betaalstatus wordt realistisch verwerkt, maar er wordt geen echt bedrag afgeschreven.</span></div>
                  <div className="mt-5 space-y-2">
                    {availablePayments.map((method) => (
                      <button key={method} type="button" onClick={() => setSelectedPayment(method)} aria-pressed={selectedPayment === method} className={`sf-choice flex min-h-16 w-full items-center justify-between rounded-2xl p-4 text-left text-xs font-black ${selectedPayment === method ? 'is-active' : ''}`}>
                        <span className="flex items-center gap-3"><span className="sf-payment-badge grid h-9 min-w-12 place-items-center rounded-lg px-2 text-[9px] font-black">{PAYMENT_BADGES[method]}</span>{PAYMENT_LABELS[method]}</span>
                        {selectedPayment === method && <Check size={17} className="sf-accent-text" />}
                      </button>
                    ))}
                  </div>
                  {availablePayments.length === 0 && <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-xs font-bold text-amber-900">Er is nog geen betaalmethode geactiveerd.</div>}
                  {errors.payment && <div className="sf-error mt-2">{errors.payment}</div>}
                  {webshop.requireTermsCheckbox && <label className="sf-control-border mt-5 flex min-h-14 cursor-pointer items-start gap-3 rounded-xl border p-3 text-[11px] font-medium leading-4"><input type="checkbox" checked={acceptedTerms} onChange={(event) => setAcceptedTerms(event.target.checked)} className="mt-0.5 h-5 w-5 accent-[var(--sf-accent)]" /><span>Ik ga akkoord met de <button type="button" onClick={(event) => { event.preventDefault(); setInfoPanel('terms'); }} className="sf-accent-text font-bold underline">algemene voorwaarden</button> en het privacybeleid.</span></label>}
                  {errors.terms && <div className="sf-error mt-2">{errors.terms}</div>}
                  {errors.order && <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-700" role="alert">{errors.order}</div>}
                  <button type="button" onClick={() => void placeOrder()} disabled={availablePayments.length === 0 || placingOrder} className="sf-button-primary mt-5 flex min-h-13 w-full items-center justify-center gap-2 rounded-xl text-sm font-black disabled:opacity-40"><LockKeyhole size={17} /> {placingOrder ? 'Bestelling wordt verwerkt…' : `Bestelling plaatsen · ${formatPrice(totalCents)}`}</button>
                </div>
              )}

              {checkoutStep === 'success' && order && (
                <div className="py-10 text-center">
                  <div className="mx-auto grid h-18 w-18 place-items-center rounded-full bg-emerald-100 text-emerald-700"><CheckCircle2 size={38} /></div>
                  <p className="mt-5 text-[10px] font-black uppercase tracking-[0.2em] text-emerald-700">Bestelling bevestigd</p>
                  <h1 className="sf-heading mt-2 text-3xl font-black tracking-tight">Bedankt, {form.firstName}.</h1>
                  <p className="sf-text-muted mx-auto mt-3 max-w-sm text-xs font-medium leading-5">De demo-bestelling is opgeslagen en de bevestigingsmail is aangemaakt voor {order.email}.</p>
                  <div className="sf-muted mx-auto mt-6 max-w-md rounded-2xl p-5 text-left text-xs">
                    <div className="sf-divider flex justify-between border-b pb-3"><span className="sf-text-muted">Bestelnummer</span><strong className="font-mono">{order.number}</strong></div>
                    <div className="mt-3 flex justify-between"><span className="sf-text-muted">Ontvangst</span><strong>{order.delivery === 'pickup' ? 'Afhalen in winkel' : 'Thuisbezorging'}</strong></div>
                    <div className="mt-2 flex justify-between"><span className="sf-text-muted">Betaalmethode</span><strong>{PAYMENT_LABELS[order.payment]}</strong></div>
                    <div className="mt-2 flex justify-between"><span className="sf-text-muted">Betaling</span><strong>{order.paymentStatus === 'paid' ? 'Demo betaald' : 'Te betalen bij afhalen'}</strong></div>
                    <div className="mt-2 flex justify-between"><span className="sf-text-muted">Voorraad</span><strong>{order.inventoryStatus === 'reserved' ? 'Gereserveerd' : order.inventoryStatus}</strong></div>
                    <div className="mt-2 flex justify-between"><span className="sf-text-muted">E-mail</span><strong>{order.emailStatus === 'sent-demo' ? 'Demo verzonden' : 'In wachtrij'}</strong></div>
                    <div className="sf-divider mt-3 flex justify-between border-t pt-3 text-base font-black"><span>Totaal</span><span>{formatPrice(order.totalCents)}</span></div>
                  </div>
                  <button type="button" onClick={closeCompletedOrder} className="sf-button-primary mt-6 min-h-13 w-full max-w-md rounded-xl text-sm font-black">Verder winkelen</button>
                </div>
              )}
            </section>

            <aside className="order-first lg:order-last">
              <div className="sf-card sf-surface lg:sticky lg:top-24">{renderOrderSummary()}</div>
            </aside>
          </main>
          )}
        </div>
      )}

      {infoPanel && (
        <ModalShell label="Winkelinformatie" onClose={() => setInfoPanel(null)}>
          <div className="p-6 pt-8 sm:p-8">
            {infoPanel === 'shipping' && <><Truck size={24} className="sf-accent-text" /><h2 className="sf-heading mt-4 text-2xl font-black">Verzending en afhalen</h2><p className="sf-text-muted mt-3 text-sm leading-6">Thuisbezorging kost {formatPrice(webshop.shippingFeeCents)} en is gratis vanaf {formatPrice(webshop.freeShippingThresholdCents)}.</p>{webshop.pickupEnabled && <div className="sf-muted mt-5 rounded-xl p-4 text-sm"><strong className="sf-heading block">Afhalen bij {webshop.shopName}</strong><span className="sf-text-muted mt-1 block">{webshop.pickupAddress}</span><span className="sf-text-muted mt-2 block">{webshop.pickupInstructions}</span></div>}</>}
            {infoPanel === 'returns' && <><RotateCcw size={24} className="sf-accent-text" /><h2 className="sf-heading mt-4 text-2xl font-black">Retourneren</h2><p className="sf-text-muted mt-3 text-sm leading-6">Neem vóór een retour contact op met {webshop.shopName}. We bevestigen de retourinstructies en helpen u met ruilen of terugbrengen in de winkel.</p><a href={`mailto:${webshop.contactEmail}?subject=Retouraanvraag`} className="sf-button-primary mt-6 inline-flex min-h-11 items-center rounded-xl px-4 text-xs font-black">Retour aanvragen</a></>}
            {infoPanel === 'terms' && <><Info size={24} className="sf-accent-text" /><h2 className="sf-heading mt-4 text-2xl font-black">Algemene voorwaarden</h2><p className="sf-text-muted mt-3 text-sm leading-6">Prijzen worden in euro en inclusief btw weergegeven. Een bestelling is definitief na bevestiging door de winkel. Levering, betaling, garantie en retour worden uitgevoerd volgens de informatie die tijdens het afrekenen wordt getoond.</p><p className="sf-text-muted mt-3 text-sm leading-6">Voor vragen of een volledig exemplaar kunt u contact opnemen via {webshop.contactEmail}.</p></>}
            {infoPanel === 'privacy' && <><ShieldCheck size={24} className="sf-accent-text" /><h2 className="sf-heading mt-4 text-2xl font-black">Privacybeleid</h2><p className="sf-text-muted mt-3 text-sm leading-6">Uw contact- en bestelgegevens worden uitsluitend gebruikt om uw bestelling te verwerken, u over de bestelling te informeren en aan wettelijke verplichtingen te voldoen.</p><p className="sf-text-muted mt-3 text-sm leading-6">Vragen over uw gegevens kunt u sturen naar {webshop.contactEmail}.</p></>}
          </div>
        </ModalShell>
      )}

      {toast && (
        <div className="sf-toast fixed bottom-4 left-1/2 z-80 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-center gap-3 rounded-2xl p-3 shadow-2xl sm:bottom-6" role="status" aria-live="polite">
          <span className="sf-accent-bg grid h-9 w-9 shrink-0 place-items-center rounded-xl"><Check size={16} /></span>
          <span className="min-w-0 flex-1 text-xs font-bold">{toast}</span>
          <button type="button" onClick={() => { setToast(null); setCartOpen(true); }} className="sf-accent-text min-h-10 shrink-0 px-2 text-xs font-black">Bekijk mand</button>
        </div>
      )}
    </div>
  );
};

export default Storefront;
