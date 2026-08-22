-- Retail inventory foundation.
--
-- The existing `products.stock_qty` remains the simple-POS compatibility
-- projection during rollout. Deep retail stock (locations, lots, serials,
-- decimal base units and pack sizes) has its own relational model, so it is
-- never silently flattened or inferred from a store's sector.

begin;

create table if not exists public.inventory_locations (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  external_id text,
  code text not null check (char_length(btrim(code)) between 1 and 80),
  normalized_code text generated always as (lower(btrim(code))) stored,
  name text not null check (char_length(btrim(name)) between 1 and 160),
  location_type text not null default 'sales-floor' check (location_type in (
    'sales-floor', 'backroom', 'warehouse', 'returns', 'quarantine', 'transit', 'other'
  )),
  is_sellable boolean not null default true,
  is_active boolean not null default true,
  sort_order integer,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (store_id, id),
  unique (store_id, external_id),
  unique (store_id, normalized_code)
);

create table if not exists public.product_inventory_profiles (
  store_id uuid not null references public.stores(id) on delete cascade,
  product_id uuid not null,
  track_stock boolean not null default false,
  -- `simple` remains the legacy POS projection. The other modes are only
  -- enabled by a dedicated server workflow; creating this schema enables none.
  stock_mode text not null default 'simple' check (stock_mode in (
    'simple', 'locations', 'lots', 'serials'
  )),
  base_unit_code text not null default 'EA'
    check (base_unit_code = upper(btrim(base_unit_code)) and char_length(base_unit_code) between 1 and 16),
  quantity_scale smallint not null default 0 check (quantity_scale between 0 and 4),
  allow_negative_stock boolean not null default false,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  primary key (store_id, product_id),
  foreign key (store_id, product_id)
    references public.products(store_id, id) on delete cascade
);

create table if not exists public.inventory_lots (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  product_id uuid not null,
  lot_code text not null check (char_length(btrim(lot_code)) between 1 and 160),
  normalized_lot_code text generated always as (lower(btrim(lot_code))) stored,
  supplier_lot_code text,
  manufactured_on date,
  expires_on date,
  status text not null default 'available' check (status in (
    'available', 'quarantine', 'expired', 'returned', 'closed'
  )),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (store_id, id, product_id),
  unique (store_id, product_id, normalized_lot_code),
  foreign key (store_id, product_id)
    references public.products(store_id, id) on delete cascade,
  check (expires_on is null or manufactured_on is null or expires_on >= manufactured_on)
);

-- A balance is either non-lot stock (lot_id IS NULL) or a specific lot at a
-- location. Serialised stock is represented per unit below and must not be
-- duplicated in this aggregate table by a future serial workflow.
create table if not exists public.inventory_stock_balances (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  product_id uuid not null,
  location_id uuid not null,
  lot_id uuid,
  on_hand_qty numeric(18,4) not null default 0 check (on_hand_qty >= 0),
  reserved_qty numeric(18,4) not null default 0 check (reserved_qty >= 0),
  available_qty numeric(18,4) generated always as (on_hand_qty - reserved_qty) stored,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (store_id, id),
  foreign key (store_id, product_id)
    references public.products(store_id, id) on delete cascade,
  foreign key (store_id, location_id)
    references public.inventory_locations(store_id, id) on delete restrict,
  foreign key (store_id, lot_id, product_id)
    references public.inventory_lots(store_id, id, product_id) on delete restrict,
  check (reserved_qty <= on_hand_qty)
);

create unique index if not exists inventory_stock_balances_non_lot_unique
  on public.inventory_stock_balances (store_id, product_id, location_id)
  where lot_id is null;
create unique index if not exists inventory_stock_balances_lot_unique
  on public.inventory_stock_balances (store_id, product_id, location_id, lot_id)
  where lot_id is not null;
create index if not exists inventory_stock_balances_location_available_idx
  on public.inventory_stock_balances (store_id, location_id, product_id, available_qty);

create table if not exists public.inventory_serial_units (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  product_id uuid not null,
  location_id uuid,
  lot_id uuid,
  serial_number text not null check (char_length(btrim(serial_number)) between 1 and 240),
  normalized_serial_number text generated always as (
    lower(regexp_replace(btrim(serial_number), '[[:space:]]+', '', 'g'))
  ) stored,
  status text not null default 'available' check (status in (
    'available', 'reserved', 'sold', 'returned', 'quarantine', 'repair', 'void'
  )),
  received_at timestamptz,
  sold_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (store_id, id, product_id),
  unique (store_id, normalized_serial_number),
  foreign key (store_id, product_id)
    references public.products(store_id, id) on delete cascade,
  foreign key (store_id, location_id)
    references public.inventory_locations(store_id, id) on delete restrict,
  foreign key (store_id, lot_id, product_id)
    references public.inventory_lots(store_id, id, product_id) on delete restrict,
  check (
    (status in ('available', 'reserved', 'returned', 'quarantine', 'repair') and location_id is not null)
    or status in ('sold', 'void')
  )
);

create index if not exists inventory_serial_units_product_status_idx
  on public.inventory_serial_units (store_id, product_id, status, location_id);

create table if not exists public.product_packaging_units (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  product_id uuid not null,
  code text not null check (char_length(btrim(code)) between 1 and 48),
  normalized_code text generated always as (lower(btrim(code))) stored,
  label text not null check (char_length(btrim(label)) between 1 and 120),
  quantity_in_base_unit numeric(18,4) not null check (quantity_in_base_unit > 0),
  is_sellable boolean not null default false,
  is_purchasable boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (store_id, id, product_id),
  unique (store_id, product_id, normalized_code),
  foreign key (store_id, product_id)
    references public.products(store_id, id) on delete cascade
);

-- Append-only movement evidence for deep inventory workflows. The current
-- simple POS continues to use the older `stock_movements` table until a POS
-- location/lot/serial selection flow calls a dedicated mutation RPC.
create table if not exists private.inventory_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  product_id uuid not null,
  location_id uuid,
  lot_id uuid,
  serial_unit_id uuid,
  quantity_delta numeric(18,4) not null check (quantity_delta <> 0),
  movement_type text not null check (movement_type in (
    'receipt', 'sale', 'return', 'transfer-out', 'transfer-in',
    'reservation', 'release', 'count', 'write-off', 'adjustment'
  )),
  client_request_id text,
  source_reference text,
  note text,
  occurred_at timestamptz not null default clock_timestamp(),
  created_at timestamptz not null default clock_timestamp(),
  unique (store_id, id),
  foreign key (store_id, product_id)
    references public.products(store_id, id) on delete restrict,
  foreign key (store_id, location_id)
    references public.inventory_locations(store_id, id) on delete restrict,
  foreign key (store_id, lot_id, product_id)
    references public.inventory_lots(store_id, id, product_id) on delete restrict,
  foreign key (store_id, serial_unit_id, product_id)
    references public.inventory_serial_units(store_id, id, product_id) on delete restrict
);

create unique index if not exists inventory_ledger_entries_request_unique
  on private.inventory_ledger_entries (store_id, client_request_id, movement_type)
  where client_request_id is not null;
create index if not exists inventory_ledger_entries_product_time_idx
  on private.inventory_ledger_entries (store_id, product_id, occurred_at desc);

-- A single deterministic primary location allows legacy simple stock to keep
-- its exact meaning. Existing numeric stock is copied once, and later legacy
-- product updates keep this one balance synchronized. No store is switched to
-- a rich stock mode by this migration.
insert into public.inventory_locations (
  id, store_id, external_id, code, name, location_type, is_sellable, is_active
)
select store.id, store.id, null, 'PRIMARY', 'Primaire voorraad', 'sales-floor', true, true
from public.stores as store
on conflict (store_id, id) do nothing;

insert into public.product_inventory_profiles (
  store_id, product_id, track_stock, stock_mode, base_unit_code, quantity_scale
)
select product.store_id, product.id, product.stock_qty is not null, 'simple', 'EA', 0
from public.products as product
on conflict (store_id, product_id) do nothing;

insert into public.inventory_stock_balances (
  store_id, product_id, location_id, lot_id, on_hand_qty, reserved_qty
)
select product.store_id, product.id, product.store_id, null, product.stock_qty::numeric, 0
from public.products as product
where product.stock_qty is not null
on conflict (store_id, product_id, location_id) where lot_id is null do nothing;

create or replace function private.sync_default_inventory_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  profile public.product_inventory_profiles%rowtype;
begin
  if tg_op = 'INSERT' then
    insert into public.inventory_locations (
      id, store_id, external_id, code, name, location_type, is_sellable, is_active
    ) values (
      new.store_id, new.store_id, null, 'PRIMARY', 'Primaire voorraad', 'sales-floor', true, true
    ) on conflict (store_id, id) do nothing;

    insert into public.product_inventory_profiles (
      store_id, product_id, track_stock, stock_mode, base_unit_code, quantity_scale
    ) values (
      new.store_id, new.id, new.stock_qty is not null, 'simple', 'EA', 0
    ) on conflict (store_id, product_id) do nothing;
  end if;

  select * into profile
  from public.product_inventory_profiles
  where store_id = new.store_id and product_id = new.id;
  if not found or profile.stock_mode <> 'simple' then
    return new;
  end if;

  if new.stock_qty is null then
    update public.product_inventory_profiles
    set track_stock = false,
        updated_at = clock_timestamp()
    where store_id = new.store_id and product_id = new.id and track_stock;
    delete from public.inventory_stock_balances
    where store_id = new.store_id
      and product_id = new.id
      and location_id = new.store_id
      and lot_id is null;
    return new;
  end if;

  update public.product_inventory_profiles
  set track_stock = true,
      updated_at = clock_timestamp()
  where store_id = new.store_id and product_id = new.id and not track_stock;
  insert into public.inventory_stock_balances (
    store_id, product_id, location_id, lot_id, on_hand_qty, reserved_qty
  ) values (
    new.store_id, new.id, new.store_id, null, new.stock_qty::numeric, 0
  ) on conflict (store_id, product_id, location_id) where lot_id is null do update
    set on_hand_qty = excluded.on_hand_qty,
        reserved_qty = least(inventory_stock_balances.reserved_qty, excluded.on_hand_qty),
        updated_at = clock_timestamp();
  return new;
end;
$$;

drop trigger if exists products_sync_default_inventory_profile on public.products;
create trigger products_sync_default_inventory_profile
  after insert or update of stock_qty on public.products
  for each row execute function private.sync_default_inventory_profile();

do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'inventory_locations', 'product_inventory_profiles', 'inventory_lots',
    'inventory_stock_balances', 'inventory_serial_units', 'product_packaging_units'
  ]
  loop
    execute format('drop trigger if exists %I_set_updated_at on public.%I', target_table, target_table);
    execute format(
      'create trigger %I_set_updated_at before update on public.%I for each row execute function private.set_updated_at()',
      target_table, target_table
    );
  end loop;
end;
$$;

alter table public.inventory_locations enable row level security;
alter table public.product_inventory_profiles enable row level security;
alter table public.inventory_lots enable row level security;
alter table public.inventory_stock_balances enable row level security;
alter table public.inventory_serial_units enable row level security;
alter table public.product_packaging_units enable row level security;

revoke all on private.inventory_ledger_entries from public, anon, authenticated;
revoke insert, update, delete on public.product_inventory_profiles,
  public.inventory_lots, public.inventory_stock_balances,
  public.inventory_serial_units from public, anon, authenticated;
grant select, insert, update, delete on public.inventory_locations,
  public.product_packaging_units to authenticated;
grant select on public.inventory_stock_balances to authenticated;
grant select on public.product_inventory_profiles, public.inventory_lots,
  public.inventory_serial_units to authenticated;

do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'inventory_locations', 'product_packaging_units'
  ]
  loop
    execute format('drop policy if exists %I_member_select on public.%I', target_table, target_table);
    execute format(
      'create policy %I_member_select on public.%I for select to authenticated using ((select private.is_store_member(store_id)))',
      target_table, target_table
    );
    execute format('drop policy if exists %I_management_insert on public.%I', target_table, target_table);
    execute format('drop policy if exists %I_management_update on public.%I', target_table, target_table);
    execute format('drop policy if exists %I_management_delete on public.%I', target_table, target_table);
    execute format(
      'create policy %I_management_insert on public.%I for insert to authenticated with check ((select private.has_store_role(store_id, array[''owner'', ''manager''])))',
      target_table, target_table
    );
    execute format(
      'create policy %I_management_update on public.%I for update to authenticated using ((select private.has_store_role(store_id, array[''owner'', ''manager'']))) with check ((select private.has_store_role(store_id, array[''owner'', ''manager''])))',
      target_table, target_table
    );
    execute format(
      'create policy %I_management_delete on public.%I for delete to authenticated using ((select private.has_store_role(store_id, array[''owner'', ''manager''])))',
      target_table, target_table
    );
  end loop;

  foreach target_table in array array[
    'product_inventory_profiles', 'inventory_lots', 'inventory_serial_units'
  ]
  loop
    execute format('drop policy if exists %I_member_select on public.%I', target_table, target_table);
    execute format(
      'create policy %I_member_select on public.%I for select to authenticated using ((select private.is_store_member(store_id)))',
      target_table, target_table
    );
    execute format('drop policy if exists %I_management_insert on public.%I', target_table, target_table);
    execute format('drop policy if exists %I_management_update on public.%I', target_table, target_table);
    execute format('drop policy if exists %I_management_delete on public.%I', target_table, target_table);
  end loop;

  execute 'drop policy if exists inventory_stock_balances_member_select on public.inventory_stock_balances';
  execute 'create policy inventory_stock_balances_member_select on public.inventory_stock_balances for select to authenticated using ((select private.is_store_member(store_id)))';
end;
$$;

commit;
