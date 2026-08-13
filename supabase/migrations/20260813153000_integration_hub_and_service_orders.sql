-- Integration Hub product extensibility and tenant-scoped service orders.
-- Core financial fields stay typed; merchant-specific import fields live in
-- bounded JSON documents so onboarding does not require a schema migration.

alter table public.products
  add column if not exists supplier_code text,
  add column if not exists price_tiers jsonb not null default '{}'::jsonb,
  add column if not exists custom_fields jsonb not null default '{}'::jsonb;

alter table public.customers
  add column if not exists price_group text;

alter table public.products
  drop constraint if exists products_price_tiers_object;
alter table public.products
  add constraint products_price_tiers_object
  check (pg_catalog.jsonb_typeof(price_tiers) = 'object');

alter table public.products
  drop constraint if exists products_custom_fields_object;
alter table public.products
  add constraint products_custom_fields_object
  check (pg_catalog.jsonb_typeof(custom_fields) = 'object');

create table if not exists public.service_orders (
  id uuid primary key,
  store_id uuid not null references public.stores(id) on delete cascade,
  number text not null,
  tracking_token text not null unique,
  status text not null check (status in ('open', 'in-progress', 'blocked', 'ready', 'closed', 'cancelled')),
  substatus text not null default '',
  route text not null check (route in ('internal-repair', 'external-repair', 'exchange', 'warranty-return')),
  customer_name text not null,
  customer_email text,
  customer_phone text,
  asset_type text not null,
  identifier_value text,
  payload jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (store_id, number),
  constraint service_orders_payload_object check (pg_catalog.jsonb_typeof(payload) = 'object'),
  constraint service_orders_tracking_token check (tracking_token ~ '^[a-f0-9]{64}$'),
  constraint service_orders_payload_size check (pg_catalog.octet_length(payload::text) <= 2097152)
);

create index if not exists service_orders_store_updated_idx
  on public.service_orders (store_id, updated_at desc);
create index if not exists service_orders_store_status_idx
  on public.service_orders (store_id, status, updated_at desc);

alter table public.service_orders enable row level security;

drop policy if exists service_orders_tenant_select on public.service_orders;
create policy service_orders_tenant_select on public.service_orders
  for select to authenticated
  using ((select private.has_store_role(store_id, array['owner', 'manager', 'cashier'])));

drop policy if exists service_orders_tenant_insert on public.service_orders;
create policy service_orders_tenant_insert on public.service_orders
  for insert to authenticated
  with check ((select private.has_store_role(store_id, array['owner', 'manager', 'cashier'])));

drop policy if exists service_orders_tenant_update on public.service_orders;
create policy service_orders_tenant_update on public.service_orders
  for update to authenticated
  using ((select private.has_store_role(store_id, array['owner', 'manager', 'cashier'])))
  with check ((select private.has_store_role(store_id, array['owner', 'manager', 'cashier'])));

revoke all on public.service_orders from anon, authenticated;
grant select, insert, update on public.service_orders to authenticated;

create or replace function public.save_service_order(
  target_store_id uuid,
  order_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  order_id uuid;
  order_number text := nullif(pg_catalog.btrim(order_payload ->> 'number'), '');
  token text := nullif(pg_catalog.btrim(order_payload ->> 'trackingToken'), '');
  order_status text := nullif(pg_catalog.btrim(order_payload ->> 'status'), '');
  order_route text := nullif(pg_catalog.btrim(order_payload ->> 'route'), '');
  created_millis bigint;
  updated_millis bigint;
begin
  if actor_id is null
     or not private.has_store_role(target_store_id, array['owner', 'manager', 'cashier']) then
    raise exception using errcode = '42501', message = 'service-order:forbidden:Geen toegang tot deze winkel.';
  end if;
  if pg_catalog.jsonb_typeof(order_payload) is distinct from 'object'
     or pg_catalog.octet_length(order_payload::text) > 2097152 then
    raise exception using errcode = 'P0001', message = 'service-order:invalid:Ongeldig of te groot dossier.';
  end if;
  begin
    order_id := (order_payload ->> 'id')::uuid;
    created_millis := (order_payload ->> 'createdAt')::bigint;
    updated_millis := (order_payload ->> 'updatedAt')::bigint;
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception using errcode = 'P0001', message = 'service-order:invalid:Ongeldige dossieridentificatie.';
  end;
  if order_number is null or pg_catalog.length(order_number) > 80
     or token is null or token !~ '^[a-f0-9]{64}$'
     or order_status not in ('open', 'in-progress', 'blocked', 'ready', 'closed', 'cancelled')
     or order_route not in ('internal-repair', 'external-repair', 'exchange', 'warranty-return')
     or nullif(pg_catalog.btrim(order_payload ->> 'customerName'), '') is null
     or nullif(pg_catalog.btrim(order_payload ->> 'assetType'), '') is null then
    raise exception using errcode = 'P0001', message = 'service-order:invalid:Onvolledig dossier.';
  end if;

  insert into public.service_orders (
    id, store_id, number, tracking_token, status, substatus, route,
    customer_name, customer_email, customer_phone, asset_type,
    identifier_value, payload, created_at, updated_at
  ) values (
    order_id,
    target_store_id,
    order_number,
    token,
    order_status,
    coalesce(order_payload ->> 'substatus', ''),
    order_route,
    order_payload ->> 'customerName',
    nullif(order_payload ->> 'customerEmail', ''),
    nullif(order_payload ->> 'customerPhone', ''),
    order_payload ->> 'assetType',
    nullif(order_payload ->> 'identifierValue', ''),
    order_payload,
    pg_catalog.to_timestamp(created_millis::double precision / 1000.0),
    pg_catalog.to_timestamp(updated_millis::double precision / 1000.0)
  )
  on conflict (id) do update set
    number = excluded.number,
    tracking_token = excluded.tracking_token,
    status = excluded.status,
    substatus = excluded.substatus,
    route = excluded.route,
    customer_name = excluded.customer_name,
    customer_email = excluded.customer_email,
    customer_phone = excluded.customer_phone,
    asset_type = excluded.asset_type,
    identifier_value = excluded.identifier_value,
    payload = excluded.payload,
    updated_at = excluded.updated_at
  where public.service_orders.store_id = target_store_id;

  if not found then
    raise exception using errcode = '42501', message = 'service-order:forbidden:Dossier behoort tot een andere winkel.';
  end if;
  return pg_catalog.jsonb_build_object('id', order_id, 'saved', true);
end;
$$;

create or replace function public.list_service_orders(target_store_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null
     or not private.has_store_role(target_store_id, array['owner', 'manager', 'cashier']) then
    raise exception using errcode = '42501', message = 'service-order:forbidden:Geen toegang tot deze winkel.';
  end if;
  return (
    select coalesce(pg_catalog.jsonb_agg(orders.payload order by orders.updated_at desc), '[]'::jsonb)
    from public.service_orders orders
    where orders.store_id = target_store_id
  );
end;
$$;

create or replace function public.get_public_service_order(tracking_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_payload jsonb;
  public_events jsonb;
begin
  if tracking_token is null or tracking_token !~ '^[a-f0-9]{64}$' then
    return null;
  end if;
  select orders.payload into source_payload
  from public.service_orders orders
  where orders.tracking_token = get_public_service_order.tracking_token;
  if source_payload is null then return null; end if;

  select coalesce(pg_catalog.jsonb_agg((event - 'userId' - 'userName') order by (event ->> 'timestamp')::bigint), '[]'::jsonb)
  into public_events
  from pg_catalog.jsonb_array_elements(coalesce(source_payload -> 'events', '[]'::jsonb)) event
  where event ->> 'type' in ('created', 'status');

  return pg_catalog.jsonb_build_object(
    'number', source_payload -> 'number',
    'createdAt', source_payload -> 'createdAt',
    'updatedAt', source_payload -> 'updatedAt',
    'promisedAt', source_payload -> 'promisedAt',
    'status', source_payload -> 'status',
    'substatus', source_payload -> 'substatus',
    'route', source_payload -> 'route',
    'customerName', source_payload -> 'customerName',
    'assetType', source_payload -> 'assetType',
    'brand', source_payload -> 'brand',
    'model', source_payload -> 'model',
    'issue', source_payload -> 'issue',
    'totalCents', source_payload -> 'totalCents',
    'paidCents', source_payload -> 'paidCents',
    'events', public_events,
    'merchantSnapshot', source_payload -> 'merchantSnapshot'
  );
end;
$$;

revoke all on function public.save_service_order(uuid, jsonb) from public, anon;
revoke all on function public.list_service_orders(uuid) from public, anon;
revoke all on function public.get_public_service_order(text) from public;
grant execute on function public.save_service_order(uuid, jsonb) to authenticated;
grant execute on function public.list_service_orders(uuid) to authenticated;
grant execute on function public.get_public_service_order(text) to anon, authenticated;

-- Make checkout customer-price aware without duplicating the complete,
-- security-hardened checkout function. The migration deliberately verifies
-- the exact trusted fragments before replacing them and fails closed if the
-- deployed function has diverged.
do $migration$
declare
  definition text;
  patched text;
  lookup_fragment text := $fragment$
  if nullif(payload ->> 'customer_id', '') is not null then
    select id, price_group into customer_id, customer_price_group
    from public.customers
    where store_id = target_store_id
      and (external_id = payload ->> 'customer_id' or id::text = payload ->> 'customer_id')
      and is_active
    for update;
    if customer_id is null then
      raise exception using errcode = 'P0001', message = 'checkout:customer-not-found:Klant bestaat niet meer.';
    end if;
  end if;

  -- Lock and debit stock while deriving totals from trusted catalog rows.$fragment$;
  price_fragment text := $fragment$    unit_price_cents := (
      case
        when customer_price_group is not null
          and product_record.price_tiers ? customer_price_group
          and (product_record.price_tiers ->> customer_price_group) ~ '^[0-9]+$'
        then (product_record.price_tiers ->> customer_price_group)::bigint
        else product_record.price_cents
      end
    ) + modifier_total;$fragment$;
begin
  select pg_catalog.pg_get_functiondef('public.checkout_sale(uuid,jsonb)'::pg_catalog.regprocedure)
  into definition;
  if position('customer_price_group text;' in definition) > 0 then
    return;
  end if;
  if position('  customer_id uuid;' in definition) = 0
     or position('  -- Lock and debit stock while deriving totals from trusted catalog rows.' in definition) = 0
     or position('    unit_price_cents := product_record.price_cents + modifier_total;' in definition) = 0 then
    raise exception 'checkout_sale definition changed; customer pricing patch refused';
  end if;
  patched := pg_catalog.replace(
    definition,
    '  customer_id uuid;',
    E'  customer_id uuid;\n  customer_price_group text;'
  );
  patched := pg_catalog.replace(
    patched,
    '  -- Lock and debit stock while deriving totals from trusted catalog rows.',
    lookup_fragment
  );
  patched := pg_catalog.replace(
    patched,
    '    unit_price_cents := product_record.price_cents + modifier_total;',
    price_fragment
  );
  execute patched;
end;
$migration$;
