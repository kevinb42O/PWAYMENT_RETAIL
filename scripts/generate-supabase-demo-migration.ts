import "fake-indexeddb/auto";

import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { productCategories } from "../src/data/categories";
import { DEFAULT_MERCHANT } from "../src/data/merchant";
import { products } from "../src/data/products";

const { buildDemoRetailDataset } = await import(
  "../src/utils/demoRetailData"
);
const { DEMO_WEBSHOP_SETTINGS } = await import(
  "../src/store/useWebshopStore"
);

const outputPath = process.argv[2];
if (!outputPath) {
  throw new Error("Pass the migration output path as the first argument.");
}

const DEMO_EMAIL = "kevin@webaanzee.be";
const DEMO_SEED_NAME = "pwayment-retail-demo";
const DEMO_SEED_VERSION = 1;
const DEMO_REFERENCE_TIME = new Date("2026-08-11T07:10:00.000Z");

/** Stable UUID-shaped identifier generated from a repository fixture key. */
const stableUuid = (key: string): string => {
  const bytes = createHash("sha256")
    .update(`pwayment-retail:${key}`)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

const jsonLiteral = (value: unknown): string => {
  const json = JSON.stringify(value);
  if (json.includes("$pwayment_demo$")) {
    throw new Error("Fixture unexpectedly contains the SQL dollar-quote marker.");
  }
  return `$pwayment_demo$${json}$pwayment_demo$::jsonb`;
};

const dataset = buildDemoRetailDataset(products, DEMO_REFERENCE_TIME);
const webshopSettings = JSON.parse(JSON.stringify(DEMO_WEBSHOP_SETTINGS)) as Record<
  string,
  unknown
>;

const categoryIdByExternalId = new Map(
  productCategories.map((category) => [
    category.id,
    stableUuid(`category:${category.id}`),
  ]),
);
const productIdByExternalId = new Map(
  products.map((product) => [
    product.id,
    stableUuid(`product:${product.id}`),
  ]),
);
const customerIdByExternalId = new Map(
  dataset.customers.map((customer) => [
    customer.id,
    stableUuid(`customer:${customer.id}`),
  ]),
);
const giftCardIdByExternalId = new Map(
  dataset.giftCards.map((giftCard) => [
    giftCard.id,
    stableUuid(`gift-card:${giftCard.id}`),
  ]),
);

const categoriesPayload = productCategories.map((category) => ({
  id: categoryIdByExternalId.get(category.id),
  external_id: category.id,
  name: category.name,
  vat_rate: category.vatRate,
  sort_order: category.sortOrder ?? null,
  is_active: category.isActive !== false,
}));

const productsPayload = products.map((product) => ({
  id: productIdByExternalId.get(product.id),
  external_id: product.id,
  category_id: categoryIdByExternalId.get(product.category) ?? null,
  name: product.name,
  category_name: product.category,
  subcategory: product.subCategory ?? null,
  sku: product.sku ?? null,
  barcode: product.barcode ?? null,
  price_cents: product.priceCents,
  cost_price_cents: product.costPriceCents ?? null,
  vat_rate: product.vatRate,
  brand: product.brand ?? null,
  supplier: product.supplier ?? null,
  variant: product.variant ?? null,
  stock_qty: product.stockQty ?? null,
  min_stock_qty: product.minStockQty ?? null,
  color: product.color ?? null,
  product_type: product.productType ?? "merchandise",
  is_active: product.isActive !== false,
}));

const customersPayload = dataset.customers.map((customer) => ({
  id: customerIdByExternalId.get(customer.id),
  external_id: customer.id,
  name: customer.name,
  email: customer.email ?? null,
  phone: customer.phone ?? null,
  address: customer.address ?? null,
  notes: customer.notes ?? null,
  total_spent_cents: customer.totalSpentCents,
  visit_count: customer.visitCount,
  last_visit_at: customer.lastVisitAt ?? null,
  is_active: customer.isActive,
  created_at: customer.createdAt,
}));

const transactionIdByIndex = dataset.transactions.map((_, index) =>
  stableUuid(`transaction:${String(index + 1).padStart(5, "0")}`),
);

const transactionsPayload = dataset.transactions.map((transaction, index) => {
  const year = new Date(transaction.timestamp).getUTCFullYear();
  const ordinal = String(index + 1).padStart(7, "0");
  return {
    id: transactionIdByIndex[index],
    external_id: `demo-transaction-${ordinal}`,
    client_request_id: `demo-checkout-${ordinal}`,
    document_number: `DEMO-${year}-${ordinal}`,
    table_id: transaction.tableId,
    subtotal_cents: transaction.subtotalCents,
    vat_12_cents: transaction.vat12Cents,
    vat_21_cents: transaction.vat21Cents,
    total_cents: transaction.totalCents,
    discount_cents: transaction.discountCents,
    payment_method: transaction.paymentMethod,
    occurred_at: new Date(transaction.timestamp).toISOString(),
    is_finalized: transaction.isFinalized === 1,
    user_name: transaction.userName ?? "Kevin Demo",
    customer_id: transaction.customerId
      ? customerIdByExternalId.get(transaction.customerId)
      : null,
    source: "demo",
    kind: transaction.kind ?? "sale",
    merchant_snapshot: DEFAULT_MERCHANT,
  };
});

const transactionLinesPayload = dataset.transactions.flatMap(
  (transaction, transactionIndex) =>
    transaction.items.map((item, lineIndex) => {
      const modifierDelta = (item.modifiers ?? []).reduce(
        (total, modifier) => total + modifier.deltaCents,
        0,
      );
      return {
        id: stableUuid(
          `transaction-line:${transactionIndex + 1}:${lineIndex + 1}`,
        ),
        transaction_id: transactionIdByIndex[transactionIndex],
        line_external_id: item.lineId,
        product_id: productIdByExternalId.get(item.product.id),
        product_external_id: item.product.id,
        product_name: item.product.name,
        sku: item.product.sku ?? null,
        barcode: item.product.barcode ?? null,
        quantity: item.quantity,
        unit_price_cents: item.product.priceCents,
        unit_cost_cents: item.product.costPriceCents ?? null,
        vat_rate: item.product.vatRate,
        line_total_cents:
          (item.product.priceCents + modifierDelta) * item.quantity,
        notes: item.notes ?? null,
        modifiers: item.modifiers ?? [],
        product_snapshot: item.product,
      };
    }),
);

const tendersPayload = dataset.transactions.map((transaction, index) => ({
  id: stableUuid(`transaction-tender:${index + 1}`),
  transaction_id: transactionIdByIndex[index],
  method:
    transaction.paymentMethod === "Split" ? "PIN" : transaction.paymentMethod,
  amount_cents: transaction.totalCents,
}));

const giftCardsPayload = dataset.giftCards.map((giftCard) => ({
  id: giftCardIdByExternalId.get(giftCard.id),
  external_id: giftCard.id,
  customer_id: giftCard.customerId
    ? customerIdByExternalId.get(giftCard.customerId)
    : null,
  code: giftCard.code,
  initial_cents: giftCard.initialCents,
  balance_cents: giftCard.balanceCents,
  issued_at: giftCard.issuedAt,
  expires_at: giftCard.expiresAt ?? null,
  is_active: giftCard.isActive,
}));

const giftCardEventsPayload = dataset.giftCardEvents.map((event) => ({
  id: stableUuid(`gift-card-event:${event.id}`),
  external_id: event.id,
  gift_card_id: giftCardIdByExternalId.get(event.giftCardId),
  gift_card_code: event.giftCardCode,
  event_type: event.type,
  amount_cents: event.amountCents,
  balance_before_cents: event.balanceBeforeCents,
  balance_after_cents: event.balanceAfterCents,
  occurred_at: new Date(event.timestamp).toISOString(),
  client_request_id: event.clientRequestId ?? null,
  customer_id: event.customerId
    ? customerIdByExternalId.get(event.customerId)
    : null,
  user_name: event.userName ?? null,
  source: "demo",
  note: event.note ?? null,
  payment_tenders: event.paymentTenders ?? [],
}));

const webshopProductPayload = products.map((product) => ({
  product_id: productIdByExternalId.get(product.id),
  is_published: !(webshopSettings.unpublishedProductIds as string[]).includes(
    product.id,
  ),
  is_featured: (webshopSettings.featuredProductIds as string[]).includes(
    product.id,
  ),
  description:
    (webshopSettings.productDescriptions as Record<string, string>)[product.id] ??
    null,
  image_url:
    (webshopSettings.productImages as Record<string, string>)[product.id] ?? null,
  variants:
    (webshopSettings.productVariants as Record<string, string[]>)[product.id] ??
    [],
}));

const sql = `-- Generated from the repository's deterministic demo fixtures.
-- Regenerate with: npm run supabase:generate-demo
begin;

do $seed$
declare
  demo_user_id uuid;
  demo_store_id uuid;
begin
  select id into strict demo_user_id
  from auth.users
  where lower(email) = lower('${DEMO_EMAIL}');

  select membership.store_id into strict demo_store_id
  from public.store_memberships membership
  join public.stores store on store.id = membership.store_id
  where membership.user_id = demo_user_id
    and membership.role = 'owner'
    and membership.status = 'active'
    and store.is_demo = true;

  if exists (
    select 1 from private.demo_seed_runs
    where store_id = demo_store_id
      and seed_name = '${DEMO_SEED_NAME}'
      and seed_version = ${DEMO_SEED_VERSION}
  ) then
    return;
  end if;

  update public.stores
  set name = 'PWAYMENT Demo Store',
      legal_name = ${jsonLiteral(DEFAULT_MERCHANT.legalName ?? null)} #>> '{}',
      vat_number = ${jsonLiteral(DEFAULT_MERCHANT.vatNumber)} #>> '{}',
      address_line_1 = ${jsonLiteral(DEFAULT_MERCHANT.addressLine1)} #>> '{}',
      address_line_2 = ${jsonLiteral(DEFAULT_MERCHANT.addressLine2)} #>> '{}',
      phone = ${jsonLiteral(DEFAULT_MERCHANT.phone ?? null)} #>> '{}',
      email = ${jsonLiteral(DEFAULT_MERCHANT.email ?? null)} #>> '{}',
      website = ${jsonLiteral(DEFAULT_MERCHANT.website ?? null)} #>> '{}',
      receipt_footer = ${jsonLiteral(DEFAULT_MERCHANT.footer ?? null)} #>> '{}',
      return_policy = ${jsonLiteral(DEFAULT_MERCHANT.returnPolicy ?? null)} #>> '{}',
      is_demo = true
  where id = demo_store_id;

  insert into public.registers (id, store_id, external_id, name, is_active)
  values ('${stableUuid("register:retail-register-1")}', demo_store_id, 'retail-register-1', 'Kassa 1', true)
  on conflict (store_id, external_id) do update
    set name = excluded.name, is_active = excluded.is_active;

  insert into public.categories (
    id, store_id, external_id, name, vat_rate, sort_order, is_active, is_demo
  )
  select
    (row ->> 'id')::uuid,
    demo_store_id,
    row ->> 'external_id',
    row ->> 'name',
    (row ->> 'vat_rate')::numeric,
    (row ->> 'sort_order')::integer,
    (row ->> 'is_active')::boolean,
    true
  from jsonb_array_elements(${jsonLiteral(categoriesPayload)}) row
  on conflict (store_id, external_id) do update set
    name = excluded.name,
    vat_rate = excluded.vat_rate,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    is_demo = true;

  insert into public.products (
    id, store_id, external_id, category_id, name, category_name, subcategory,
    sku, barcode, price_cents, cost_price_cents, vat_rate, brand, supplier,
    variant, stock_qty, min_stock_qty, color, product_type, is_active, is_demo
  )
  select
    (row ->> 'id')::uuid,
    demo_store_id,
    row ->> 'external_id',
    (row ->> 'category_id')::uuid,
    row ->> 'name',
    row ->> 'category_name',
    row ->> 'subcategory',
    row ->> 'sku',
    row ->> 'barcode',
    (row ->> 'price_cents')::bigint,
    (row ->> 'cost_price_cents')::bigint,
    (row ->> 'vat_rate')::numeric,
    row ->> 'brand',
    row ->> 'supplier',
    row ->> 'variant',
    (row ->> 'stock_qty')::integer,
    (row ->> 'min_stock_qty')::integer,
    row ->> 'color',
    row ->> 'product_type',
    (row ->> 'is_active')::boolean,
    true
  from jsonb_array_elements(${jsonLiteral(productsPayload)}) row
  on conflict (store_id, external_id) do update set
    category_id = excluded.category_id,
    name = excluded.name,
    category_name = excluded.category_name,
    subcategory = excluded.subcategory,
    sku = excluded.sku,
    barcode = excluded.barcode,
    price_cents = excluded.price_cents,
    cost_price_cents = excluded.cost_price_cents,
    vat_rate = excluded.vat_rate,
    brand = excluded.brand,
    supplier = excluded.supplier,
    variant = excluded.variant,
    stock_qty = excluded.stock_qty,
    min_stock_qty = excluded.min_stock_qty,
    color = excluded.color,
    product_type = excluded.product_type,
    is_active = excluded.is_active,
    is_demo = true;

  insert into public.customers (
    id, store_id, external_id, name, email, phone, address, notes,
    total_spent_cents, visit_count, last_visit_at, is_active, is_demo, created_at
  )
  select
    (row ->> 'id')::uuid,
    demo_store_id,
    row ->> 'external_id',
    row ->> 'name',
    row ->> 'email',
    row ->> 'phone',
    row ->> 'address',
    row ->> 'notes',
    (row ->> 'total_spent_cents')::bigint,
    (row ->> 'visit_count')::integer,
    (row ->> 'last_visit_at')::timestamptz,
    (row ->> 'is_active')::boolean,
    true,
    (row ->> 'created_at')::timestamptz
  from jsonb_array_elements(${jsonLiteral(customersPayload)}) row
  on conflict (store_id, external_id) do update set
    name = excluded.name,
    email = excluded.email,
    phone = excluded.phone,
    address = excluded.address,
    notes = excluded.notes,
    total_spent_cents = excluded.total_spent_cents,
    visit_count = excluded.visit_count,
    last_visit_at = excluded.last_visit_at,
    is_active = excluded.is_active,
    is_demo = true;

  insert into public.transactions (
    id, store_id, external_id, client_request_id, document_number, table_id,
    subtotal_cents, vat_12_cents, vat_21_cents, total_cents, discount_cents,
    payment_method, occurred_at, is_finalized, user_id, user_name, customer_id,
    source, kind, merchant_snapshot, register_id
  )
  select
    (row ->> 'id')::uuid,
    demo_store_id,
    row ->> 'external_id',
    row ->> 'client_request_id',
    row ->> 'document_number',
    (row ->> 'table_id')::integer,
    (row ->> 'subtotal_cents')::bigint,
    (row ->> 'vat_12_cents')::bigint,
    (row ->> 'vat_21_cents')::bigint,
    (row ->> 'total_cents')::bigint,
    (row ->> 'discount_cents')::bigint,
    row ->> 'payment_method',
    (row ->> 'occurred_at')::timestamptz,
    (row ->> 'is_finalized')::boolean,
    demo_user_id,
    row ->> 'user_name',
    (row ->> 'customer_id')::uuid,
    row ->> 'source',
    row ->> 'kind',
    row -> 'merchant_snapshot',
    '${stableUuid("register:retail-register-1")}'::uuid
  from jsonb_array_elements(${jsonLiteral(transactionsPayload)}) row
  on conflict (store_id, client_request_id) do nothing;

  insert into public.transaction_lines (
    id, store_id, transaction_id, line_external_id, product_id,
    product_external_id, product_name, sku, barcode, quantity,
    unit_price_cents, unit_cost_cents, vat_rate, line_total_cents,
    notes, modifiers, product_snapshot
  )
  select
    (row ->> 'id')::uuid,
    demo_store_id,
    (row ->> 'transaction_id')::uuid,
    row ->> 'line_external_id',
    (row ->> 'product_id')::uuid,
    row ->> 'product_external_id',
    row ->> 'product_name',
    row ->> 'sku',
    row ->> 'barcode',
    (row ->> 'quantity')::integer,
    (row ->> 'unit_price_cents')::bigint,
    (row ->> 'unit_cost_cents')::bigint,
    (row ->> 'vat_rate')::numeric,
    (row ->> 'line_total_cents')::bigint,
    row ->> 'notes',
    row -> 'modifiers',
    row -> 'product_snapshot'
  from jsonb_array_elements(${jsonLiteral(transactionLinesPayload)}) row
  on conflict (store_id, transaction_id, line_external_id) do nothing;

  insert into public.transaction_tenders (
    id, store_id, transaction_id, method, amount_cents
  )
  select
    (row ->> 'id')::uuid,
    demo_store_id,
    (row ->> 'transaction_id')::uuid,
    row ->> 'method',
    (row ->> 'amount_cents')::bigint
  from jsonb_array_elements(${jsonLiteral(tendersPayload)}) row
  on conflict (id) do nothing;

  insert into public.gift_cards (
    id, store_id, external_id, customer_id, code, initial_cents,
    balance_cents, issued_at, expires_at, is_active, is_demo
  )
  select
    (row ->> 'id')::uuid,
    demo_store_id,
    row ->> 'external_id',
    (row ->> 'customer_id')::uuid,
    row ->> 'code',
    (row ->> 'initial_cents')::bigint,
    (row ->> 'balance_cents')::bigint,
    (row ->> 'issued_at')::timestamptz,
    (row ->> 'expires_at')::timestamptz,
    (row ->> 'is_active')::boolean,
    true
  from jsonb_array_elements(${jsonLiteral(giftCardsPayload)}) row
  on conflict (store_id, external_id) do nothing;

  insert into public.gift_card_events (
    id, store_id, external_id, gift_card_id, gift_card_code, event_type,
    amount_cents, balance_before_cents, balance_after_cents, occurred_at,
    client_request_id, customer_id, user_id, user_name, source, note,
    payment_tenders
  )
  select
    (row ->> 'id')::uuid,
    demo_store_id,
    row ->> 'external_id',
    (row ->> 'gift_card_id')::uuid,
    row ->> 'gift_card_code',
    row ->> 'event_type',
    (row ->> 'amount_cents')::bigint,
    (row ->> 'balance_before_cents')::bigint,
    (row ->> 'balance_after_cents')::bigint,
    (row ->> 'occurred_at')::timestamptz,
    row ->> 'client_request_id',
    (row ->> 'customer_id')::uuid,
    demo_user_id,
    row ->> 'user_name',
    row ->> 'source',
    row ->> 'note',
    row -> 'payment_tenders'
  from jsonb_array_elements(${jsonLiteral(giftCardEventsPayload)}) row
  on conflict (store_id, external_id) do nothing;

  insert into public.webshop_settings (
    store_id, settings, is_enabled, subdomain, custom_domain, is_demo
  ) values (
    demo_store_id,
    ${jsonLiteral(webshopSettings)},
    ${Boolean(webshopSettings.isEnabled)},
    ${jsonLiteral(webshopSettings.subdomain ?? null)} #>> '{}',
    ${jsonLiteral(webshopSettings.customDomain ?? null)} #>> '{}',
    true
  )
  on conflict (store_id) do update set
    settings = excluded.settings,
    is_enabled = excluded.is_enabled,
    subdomain = excluded.subdomain,
    custom_domain = excluded.custom_domain,
    is_demo = true;

  insert into public.webshop_product_settings (
    store_id, product_id, is_published, is_featured, description,
    image_url, variants
  )
  select
    demo_store_id,
    (row ->> 'product_id')::uuid,
    (row ->> 'is_published')::boolean,
    (row ->> 'is_featured')::boolean,
    row ->> 'description',
    row ->> 'image_url',
    row -> 'variants'
  from jsonb_array_elements(${jsonLiteral(webshopProductPayload)}) row
  on conflict (store_id, product_id) do update set
    is_published = excluded.is_published,
    is_featured = excluded.is_featured,
    description = excluded.description,
    image_url = excluded.image_url,
    variants = excluded.variants;

  insert into private.demo_seed_runs (
    store_id, seed_name, seed_version, row_counts
  ) values (
    demo_store_id,
    '${DEMO_SEED_NAME}',
    ${DEMO_SEED_VERSION},
    jsonb_build_object(
      'categories', ${categoriesPayload.length},
      'products', ${productsPayload.length},
      'customers', ${customersPayload.length},
      'transactions', ${transactionsPayload.length},
      'transaction_lines', ${transactionLinesPayload.length},
      'gift_cards', ${giftCardsPayload.length},
      'gift_card_events', ${giftCardEventsPayload.length}
    )
  );
end;
$seed$;

commit;
`;

writeFileSync(resolve(outputPath), sql, { encoding: "utf8", mode: 0o600 });

console.log(
  JSON.stringify({
    output: resolve(outputPath),
    categories: categoriesPayload.length,
    products: productsPayload.length,
    customers: customersPayload.length,
    transactions: transactionsPayload.length,
    transactionLines: transactionLinesPayload.length,
    giftCards: giftCardsPayload.length,
    giftCardEvents: giftCardEventsPayload.length,
  }),
);
