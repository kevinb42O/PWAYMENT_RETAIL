begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text,
  last_name text,
  display_name text not null,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.stores (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 160),
  legal_name text,
  vat_number text,
  address_line_1 text,
  address_line_2 text,
  postal_code text,
  city text,
  country_code text not null default 'BE' check (country_code ~ '^[A-Z]{2}$'),
  phone text,
  email text,
  website text,
  receipt_footer text,
  return_policy text,
  currency text not null default 'EUR' check (currency = 'EUR'),
  locale text not null default 'nl-BE',
  timezone text not null default 'Europe/Brussels',
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.store_memberships (
  store_id uuid not null references public.stores(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'manager', 'cashier')),
  status text not null default 'active' check (status in ('active', 'invited', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (store_id, user_id)
);

create index store_memberships_user_idx
  on public.store_memberships (user_id, status);

create or replace function private.is_store_member(target_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.store_memberships membership
    where membership.store_id = target_store_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
  );
$$;

create or replace function private.has_store_role(
  target_store_id uuid,
  allowed_roles text[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.store_memberships membership
    where membership.store_id = target_store_id
      and membership.user_id = (select auth.uid())
      and membership.status = 'active'
      and membership.role = any (allowed_roles)
  );
$$;

create or replace function private.shares_store_with(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target_user_id = (select auth.uid()) or exists (
    select 1
    from public.store_memberships mine
    join public.store_memberships theirs
      on theirs.store_id = mine.store_id
     and theirs.status = 'active'
    where mine.user_id = (select auth.uid())
      and mine.status = 'active'
      and theirs.user_id = target_user_id
  );
$$;

revoke all on function private.is_store_member(uuid) from public;
revoke all on function private.has_store_role(uuid, text[]) from public;
revoke all on function private.shares_store_with(uuid) from public;
grant execute on function private.is_store_member(uuid) to authenticated;
grant execute on function private.has_store_role(uuid, text[]) to authenticated;
grant execute on function private.shares_store_with(uuid) to authenticated;

create table public.registers (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  external_id text,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, id),
  unique (store_id, external_id)
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  external_id text,
  name text not null,
  vat_rate numeric(5,2) not null check (vat_rate >= 0 and vat_rate <= 100),
  sort_order integer,
  is_active boolean not null default true,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, id),
  unique (store_id, external_id)
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  external_id text,
  category_id uuid,
  name text not null,
  category_name text not null,
  subcategory text,
  sku text,
  barcode text,
  price_cents bigint not null check (price_cents >= 0),
  cost_price_cents bigint check (cost_price_cents is null or cost_price_cents >= 0),
  vat_rate numeric(5,2) not null check (vat_rate >= 0 and vat_rate <= 100),
  brand text,
  supplier text,
  variant text,
  stock_qty integer,
  min_stock_qty integer check (min_stock_qty is null or min_stock_qty >= 0),
  color text,
  product_type text not null default 'merchandise'
    check (product_type in ('merchandise', 'service', 'gift-card')),
  is_active boolean not null default true,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, id),
  unique (store_id, external_id),
  foreign key (store_id, category_id)
    references public.categories(store_id, id)
);

create unique index products_store_sku_unique
  on public.products (store_id, lower(sku)) where sku is not null;
create unique index products_store_barcode_unique
  on public.products (store_id, barcode) where barcode is not null;
create index products_store_active_category_idx
  on public.products (store_id, is_active, category_name);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  external_id text,
  name text not null,
  email text,
  phone text,
  address text,
  notes text,
  total_spent_cents bigint not null default 0 check (total_spent_cents >= 0),
  visit_count integer not null default 0 check (visit_count >= 0),
  last_visit_at timestamptz,
  is_active boolean not null default true,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, id),
  unique (store_id, external_id)
);

create index customers_store_active_idx on public.customers (store_id, is_active);
create index customers_store_email_idx on public.customers (store_id, lower(email));

create table public.register_shifts (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  register_id uuid not null,
  shift_number bigint not null check (shift_number > 0),
  opened_at timestamptz not null,
  opened_by_user_id uuid references auth.users(id),
  opened_by_user_name text,
  opening_float_cents bigint not null check (opening_float_cents >= 0),
  closed_at timestamptz,
  closed_by_user_id uuid references auth.users(id),
  closed_by_user_name text,
  counted_cash_cents bigint check (counted_cash_cents is null or counted_cash_cents >= 0),
  expected_cash_cents bigint,
  cash_difference_cents bigint,
  cash_difference_reason text,
  status text not null check (status in ('open', 'closed')),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, id),
  unique (store_id, register_id, shift_number),
  foreign key (store_id, register_id)
    references public.registers(store_id, id)
);

create unique index register_shifts_one_open_per_register
  on public.register_shifts (store_id, register_id) where status = 'open';

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  external_id text,
  client_request_id text not null,
  document_number text not null,
  table_id integer not null default 1,
  subtotal_cents bigint not null,
  vat_12_cents bigint not null default 0,
  vat_21_cents bigint not null default 0,
  total_cents bigint not null,
  discount_cents bigint not null default 0 check (discount_cents >= 0),
  discount_reason text,
  discount_approved_by_user_id uuid references auth.users(id),
  tip_cents bigint not null default 0 check (tip_cents >= 0),
  tendered_cents bigint,
  payment_method text not null check (payment_method in ('Cash', 'PIN', 'Cadeaubon', 'Split')),
  occurred_at timestamptz not null,
  is_finalized boolean not null default false,
  user_id uuid references auth.users(id),
  user_name text,
  customer_id uuid,
  source text not null default 'live' check (source in ('live', 'demo', 'webshop', 'import')),
  kind text not null default 'sale' check (kind in ('sale', 'refund')),
  original_transaction_id uuid,
  correction_reason text,
  merchant_snapshot jsonb not null default '{}'::jsonb,
  register_id uuid,
  shift_id uuid,
  is_demo boolean generated always as (source = 'demo') stored,
  created_at timestamptz not null default now(),
  unique (store_id, id),
  unique (store_id, client_request_id),
  unique (store_id, document_number),
  unique (store_id, external_id),
  foreign key (store_id, customer_id)
    references public.customers(store_id, id),
  foreign key (store_id, register_id)
    references public.registers(store_id, id),
  foreign key (store_id, shift_id)
    references public.register_shifts(store_id, id),
  foreign key (store_id, original_transaction_id)
    references public.transactions(store_id, id)
);

create index transactions_store_occurred_idx
  on public.transactions (store_id, occurred_at desc);
create index transactions_store_source_idx
  on public.transactions (store_id, source, occurred_at desc);

create table public.transaction_lines (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  transaction_id uuid not null,
  line_external_id text not null,
  product_id uuid,
  product_external_id text,
  product_name text not null,
  sku text,
  barcode text,
  quantity integer not null check (quantity > 0),
  unit_price_cents bigint not null check (unit_price_cents >= 0),
  unit_cost_cents bigint check (unit_cost_cents is null or unit_cost_cents >= 0),
  vat_rate numeric(5,2) not null check (vat_rate >= 0 and vat_rate <= 100),
  line_total_cents bigint not null,
  notes text,
  modifiers jsonb not null default '[]'::jsonb check (jsonb_typeof(modifiers) = 'array'),
  product_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (store_id, transaction_id, line_external_id),
  foreign key (store_id, transaction_id)
    references public.transactions(store_id, id) on delete cascade,
  foreign key (store_id, product_id)
    references public.products(store_id, id)
);

create table public.transaction_tenders (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  transaction_id uuid not null,
  method text not null check (method in ('Cash', 'PIN', 'Cadeaubon')),
  amount_cents bigint not null check (amount_cents > 0),
  created_at timestamptz not null default now(),
  foreign key (store_id, transaction_id)
    references public.transactions(store_id, id) on delete cascade
);

create table public.gift_cards (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  external_id text,
  customer_id uuid,
  code text not null,
  initial_cents bigint not null check (initial_cents >= 0),
  balance_cents bigint not null check (balance_cents >= 0),
  issued_at timestamptz not null,
  expires_at timestamptz,
  is_active boolean not null default true,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, id),
  unique (store_id, external_id),
  unique (store_id, code),
  foreign key (store_id, customer_id)
    references public.customers(store_id, id)
);

create table public.gift_card_events (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  external_id text,
  gift_card_id uuid not null,
  gift_card_code text not null,
  event_type text not null check (event_type in (
    'issue', 'recharge', 'redeem', 'deactivate', 'activate', 'refund', 'expire', 'opening-balance'
  )),
  amount_cents bigint not null check (amount_cents >= 0),
  balance_before_cents bigint not null check (balance_before_cents >= 0),
  balance_after_cents bigint not null check (balance_after_cents >= 0),
  occurred_at timestamptz not null,
  transaction_id uuid,
  client_request_id text,
  customer_id uuid,
  user_id uuid references auth.users(id),
  user_name text,
  source text not null default 'live' check (source in ('live', 'demo', 'migration')),
  note text,
  payment_tenders jsonb not null default '[]'::jsonb check (jsonb_typeof(payment_tenders) = 'array'),
  daily_report_id uuid,
  created_at timestamptz not null default now(),
  unique (store_id, id),
  unique (store_id, external_id),
  foreign key (store_id, gift_card_id)
    references public.gift_cards(store_id, id),
  foreign key (store_id, transaction_id)
    references public.transactions(store_id, id),
  foreign key (store_id, customer_id)
    references public.customers(store_id, id)
);

create unique index gift_card_events_idempotency_unique
  on public.gift_card_events (store_id, client_request_id)
  where client_request_id is not null;

create table public.daily_reports (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  report_number bigint not null check (report_number > 0),
  occurred_at timestamptz not null,
  totals jsonb not null check (jsonb_typeof(totals) = 'object'),
  hash text not null,
  previous_hash text,
  closed_by_user_id uuid references auth.users(id),
  closed_by_user_name text,
  register_id uuid,
  shift_id uuid,
  opening_float_cents bigint,
  counted_cash_cents bigint,
  expected_cash_cents bigint,
  cash_difference_cents bigint,
  cash_difference_reason text,
  hash_payload_version integer not null default 1,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  unique (store_id, id),
  unique (store_id, report_number),
  foreign key (store_id, register_id)
    references public.registers(store_id, id),
  foreign key (store_id, shift_id)
    references public.register_shifts(store_id, id)
);

alter table public.gift_card_events
  add constraint gift_card_events_daily_report_fk
  foreign key (store_id, daily_report_id)
  references public.daily_reports(store_id, id);

create table public.daily_report_transactions (
  store_id uuid not null references public.stores(id) on delete cascade,
  daily_report_id uuid not null,
  transaction_id uuid not null,
  primary key (store_id, daily_report_id, transaction_id),
  foreign key (store_id, daily_report_id)
    references public.daily_reports(store_id, id) on delete cascade,
  foreign key (store_id, transaction_id)
    references public.transactions(store_id, id)
);

create table public.void_entries (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  occurred_at timestamptz not null,
  table_id integer not null,
  product_id uuid,
  product_name text not null,
  quantity integer not null check (quantity > 0),
  amount_cents bigint not null check (amount_cents >= 0),
  reason text not null,
  by_user_id uuid not null references auth.users(id),
  by_user_name text not null,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  foreign key (store_id, product_id)
    references public.products(store_id, id)
);

create table public.audit_entries (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  occurred_at timestamptz not null default now(),
  user_id uuid references auth.users(id),
  user_name text,
  action text not null,
  detail jsonb,
  source text not null default 'app',
  is_demo boolean not null default false
);

create index audit_entries_store_occurred_idx
  on public.audit_entries (store_id, occurred_at desc);

create table public.business_actions (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  external_id text,
  action_type text not null,
  status text not null,
  source_signal_id text not null,
  title text not null,
  description text not null,
  due_at timestamptz,
  completed_at timestamptz,
  owner_user_id uuid references auth.users(id),
  owner_name text,
  baseline jsonb not null default '{}'::jsonb,
  inventory_items jsonb,
  customer_ids jsonb,
  transaction_ids jsonb,
  note text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, external_id)
);

create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  external_id text,
  supplier text not null,
  status text not null check (status in ('draft', 'ordered', 'partially-received', 'received', 'cancelled')),
  source text not null default 'inventory-forecast',
  ordered_at timestamptz,
  received_at timestamptz,
  expected_delivery_at timestamptz,
  reference text,
  note text,
  owner_user_id uuid references auth.users(id),
  owner_name text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, id),
  unique (store_id, external_id)
);

create table public.purchase_order_lines (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  purchase_order_id uuid not null,
  product_id uuid,
  product_external_id text,
  product_name text not null,
  sku text,
  ordered_qty integer not null check (ordered_qty > 0),
  received_qty integer not null default 0 check (received_qty >= 0),
  unit_cost_cents bigint,
  forecast_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  foreign key (store_id, purchase_order_id)
    references public.purchase_orders(store_id, id) on delete cascade,
  foreign key (store_id, product_id)
    references public.products(store_id, id)
);

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  product_id uuid not null,
  product_name text not null,
  quantity_delta integer not null check (quantity_delta <> 0),
  reason text not null check (reason in (
    'purchase-receipt', 'webshop-reservation', 'webshop-release',
    'pos-sale', 'pos-refund', 'manual-adjustment'
  )),
  occurred_at timestamptz not null,
  purchase_order_id uuid,
  transaction_id uuid,
  user_id uuid references auth.users(id),
  user_name text,
  client_request_id text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  foreign key (store_id, product_id)
    references public.products(store_id, id),
  foreign key (store_id, purchase_order_id)
    references public.purchase_orders(store_id, id),
  foreign key (store_id, transaction_id)
    references public.transactions(store_id, id)
);

create unique index stock_movements_idempotency_unique
  on public.stock_movements (store_id, client_request_id)
  where client_request_id is not null;

create table public.webshop_settings (
  store_id uuid primary key references public.stores(id) on delete cascade,
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  is_enabled boolean not null default false,
  subdomain text,
  custom_domain text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index webshop_settings_subdomain_unique
  on public.webshop_settings (lower(subdomain)) where subdomain is not null;
create unique index webshop_settings_domain_unique
  on public.webshop_settings (lower(custom_domain)) where custom_domain is not null;

create table public.webshop_product_settings (
  store_id uuid not null references public.stores(id) on delete cascade,
  product_id uuid not null,
  is_published boolean not null default false,
  is_featured boolean not null default false,
  description text,
  image_url text,
  variants jsonb not null default '[]'::jsonb check (jsonb_typeof(variants) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (store_id, product_id),
  foreign key (store_id, product_id)
    references public.products(store_id, id) on delete cascade
);

create table public.webshop_orders (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  external_id text,
  client_request_id text not null,
  order_number text not null,
  source text not null check (source in ('demo', 'live')),
  status text not null check (status in ('pending', 'confirmed', 'completed', 'cancelled')),
  payment_status text not null check (payment_status in ('pending', 'paid', 'failed', 'refunded')),
  fulfillment_status text not null check (fulfillment_status in ('unfulfilled', 'processing', 'ready-for-pickup', 'shipped', 'picked-up')),
  inventory_status text not null check (inventory_status in ('reserved', 'committed', 'released')),
  payment_method text not null,
  payment_reference text,
  delivery_mode text not null check (delivery_mode in ('shipping', 'pickup')),
  customer_snapshot jsonb not null,
  shipping_address jsonb,
  pickup_address text,
  note text,
  coupon_code text,
  subtotal_cents bigint not null check (subtotal_cents >= 0),
  discount_cents bigint not null default 0 check (discount_cents >= 0),
  shipping_cents bigint not null default 0 check (shipping_cents >= 0),
  total_cents bigint not null check (total_cents >= 0),
  confirmation_email jsonb not null default '{}'::jsonb,
  is_demo boolean generated always as (source = 'demo') stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, id),
  unique (store_id, external_id),
  unique (store_id, client_request_id),
  unique (store_id, order_number)
);

create table public.webshop_order_lines (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  webshop_order_id uuid not null,
  product_id uuid,
  product_external_id text,
  product_name text not null,
  variant text,
  sku text,
  quantity integer not null check (quantity > 0),
  unit_price_cents bigint not null check (unit_price_cents >= 0),
  line_total_cents bigint not null check (line_total_cents >= 0),
  created_at timestamptz not null default now(),
  foreign key (store_id, webshop_order_id)
    references public.webshop_orders(store_id, id) on delete cascade,
  foreign key (store_id, product_id)
    references public.products(store_id, id)
);

create table private.demo_seed_runs (
  store_id uuid not null references public.stores(id) on delete cascade,
  seed_name text not null,
  seed_version integer not null check (seed_version > 0),
  applied_at timestamptz not null default now(),
  row_counts jsonb not null default '{}'::jsonb,
  primary key (store_id, seed_name, seed_version)
);

-- Maintain timestamps without trusting callers.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'profiles', 'stores', 'store_memberships', 'registers', 'categories',
    'products', 'customers', 'register_shifts', 'gift_cards',
    'business_actions', 'purchase_orders', 'webshop_settings',
    'webshop_product_settings', 'webshop_orders'
  ]
  loop
    execute format(
      'create trigger %I_set_updated_at before update on public.%I for each row execute function private.set_updated_at()',
      table_name,
      table_name
    );
  end loop;
end;
$$;

-- Auth identity bootstrap. Authorization is stored in memberships, never in
-- caller-editable user metadata. App metadata is only used for admin invites.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_store_id uuid;
  invited_store_text text;
  member_role text;
  requested_store_name text;
  first_name_value text;
  last_name_value text;
  display_name_value text;
begin
  first_name_value := nullif(btrim(new.raw_user_meta_data ->> 'first_name'), '');
  last_name_value := nullif(btrim(new.raw_user_meta_data ->> 'last_name'), '');
  display_name_value := coalesce(
    nullif(btrim(concat_ws(' ', first_name_value, last_name_value)), ''),
    split_part(coalesce(new.email, 'Gebruiker'), '@', 1)
  );

  insert into public.profiles (id, first_name, last_name, display_name)
  values (new.id, first_name_value, last_name_value, display_name_value)
  on conflict (id) do nothing;

  invited_store_text := nullif(new.raw_app_meta_data ->> 'invited_store_id', '');
  if invited_store_text is not null then
    target_store_id := invited_store_text::uuid;
    if not exists (select 1 from public.stores where id = target_store_id) then
      raise exception 'Invited store does not exist';
    end if;
    member_role := coalesce(nullif(new.raw_app_meta_data ->> 'invited_role', ''), 'cashier');
    if member_role not in ('owner', 'manager', 'cashier') then
      raise exception 'Invalid invited role';
    end if;
  else
    requested_store_name := nullif(btrim(new.raw_user_meta_data ->> 'store_name'), '');
    if lower(coalesce(new.email, '')) = 'kevin@webaanzee.be' then
      requested_store_name := 'PWAYMENT Demo Store';
    end if;

    insert into public.stores (name, is_demo)
    values (
      coalesce(requested_store_name, 'Mijn winkel'),
      lower(coalesce(new.email, '')) = 'kevin@webaanzee.be'
    )
    returning id into target_store_id;
    member_role := 'owner';
  end if;

  insert into public.store_memberships (store_id, user_id, role, status)
  values (target_store_id, new.id, member_role, 'active')
  on conflict (store_id, user_id) do nothing;

  return new;
end;
$$;

revoke all on function public.handle_new_auth_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

alter table public.profiles enable row level security;
alter table public.stores enable row level security;
alter table public.store_memberships enable row level security;
alter table public.registers enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.customers enable row level security;
alter table public.register_shifts enable row level security;
alter table public.transactions enable row level security;
alter table public.transaction_lines enable row level security;
alter table public.transaction_tenders enable row level security;
alter table public.gift_cards enable row level security;
alter table public.gift_card_events enable row level security;
alter table public.daily_reports enable row level security;
alter table public.daily_report_transactions enable row level security;
alter table public.void_entries enable row level security;
alter table public.audit_entries enable row level security;
alter table public.business_actions enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.purchase_order_lines enable row level security;
alter table public.stock_movements enable row level security;
alter table public.webshop_settings enable row level security;
alter table public.webshop_product_settings enable row level security;
alter table public.webshop_orders enable row level security;
alter table public.webshop_order_lines enable row level security;

create policy profiles_select_colleagues
  on public.profiles for select to authenticated
  using ((select private.shares_store_with(id)));
create policy profiles_update_self
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy stores_select_member
  on public.stores for select to authenticated
  using ((select private.is_store_member(id)));
create policy stores_update_owner
  on public.stores for update to authenticated
  using ((select private.has_store_role(id, array['owner'])))
  with check ((select private.has_store_role(id, array['owner'])));

create policy memberships_select_member
  on public.store_memberships for select to authenticated
  using ((select private.is_store_member(store_id)));
create policy memberships_insert_owner
  on public.store_memberships for insert to authenticated
  with check ((select private.has_store_role(store_id, array['owner'])));
create policy memberships_update_owner
  on public.store_memberships for update to authenticated
  using ((select private.has_store_role(store_id, array['owner'])))
  with check ((select private.has_store_role(store_id, array['owner'])));
create policy memberships_delete_owner
  on public.store_memberships for delete to authenticated
  using ((select private.has_store_role(store_id, array['owner'])));

-- All active store members may read their store's operational data.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'registers', 'categories', 'products', 'customers', 'register_shifts',
    'transactions', 'transaction_lines', 'transaction_tenders', 'gift_cards',
    'gift_card_events', 'daily_reports', 'daily_report_transactions',
    'void_entries', 'business_actions', 'purchase_orders',
    'purchase_order_lines', 'stock_movements', 'webshop_settings',
    'webshop_product_settings', 'webshop_orders', 'webshop_order_lines'
  ]
  loop
    execute format(
      'create policy %I_member_select on public.%I for select to authenticated using ((select private.is_store_member(store_id)))',
      table_name,
      table_name
    );
  end loop;
end;
$$;

create policy audit_entries_management_select
  on public.audit_entries for select to authenticated
  using ((select private.has_store_role(store_id, array['owner', 'manager'])));

-- Owner/manager CRUD for non-ledger management data. Financial ledgers remain
-- read-only to the browser and will be written through reviewed RPCs.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'registers', 'categories', 'products', 'customers', 'business_actions',
    'purchase_orders', 'purchase_order_lines', 'webshop_settings',
    'webshop_product_settings', 'webshop_orders', 'webshop_order_lines'
  ]
  loop
    execute format(
      'create policy %I_management_insert on public.%I for insert to authenticated with check ((select private.has_store_role(store_id, array[''owner'', ''manager''])))',
      table_name,
      table_name
    );
    execute format(
      'create policy %I_management_update on public.%I for update to authenticated using ((select private.has_store_role(store_id, array[''owner'', ''manager'']))) with check ((select private.has_store_role(store_id, array[''owner'', ''manager''])))',
      table_name,
      table_name
    );
    execute format(
      'create policy %I_management_delete on public.%I for delete to authenticated using ((select private.has_store_role(store_id, array[''owner'', ''manager''])))',
      table_name,
      table_name
    );
  end loop;
end;
$$;

grant usage on schema public to authenticated;
grant select, update on public.profiles to authenticated;
grant select, update on public.stores to authenticated;
grant select, insert, update, delete on public.store_memberships to authenticated;
grant select on all tables in schema public to authenticated;
grant insert, update, delete on
  public.registers,
  public.categories,
  public.products,
  public.customers,
  public.business_actions,
  public.purchase_orders,
  public.purchase_order_lines,
  public.webshop_settings,
  public.webshop_product_settings,
  public.webshop_orders,
  public.webshop_order_lines
to authenticated;

-- New tables/functions should not become reachable accidentally.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;

commit;
