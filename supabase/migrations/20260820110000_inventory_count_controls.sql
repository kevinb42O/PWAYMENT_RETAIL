-- A product's catalog row is not an inventory journal. Physical counts are
-- recorded separately, with an expected quantity, observed quantity, reason
-- and actor. This preserves a defensible adjustment trail without changing
-- checkout or its offline outbox contract.

alter table public.products
  drop constraint if exists products_stock_qty_nonnegative_check;
alter table public.products
  add constraint products_stock_qty_nonnegative_check
  check (stock_qty is null or stock_qty >= 0) not valid;

alter table public.stock_movements
  add column if not exists quantity_before integer,
  add column if not exists quantity_after integer,
  add column if not exists adjustment_reason text,
  add column if not exists note text;

alter table public.stock_movements
  drop constraint if exists stock_movements_quantity_before_nonnegative_check,
  drop constraint if exists stock_movements_quantity_after_nonnegative_check,
  drop constraint if exists stock_movements_adjustment_reason_check,
  drop constraint if exists stock_movements_manual_adjustment_snapshot_check;
alter table public.stock_movements
  add constraint stock_movements_quantity_before_nonnegative_check
    check (quantity_before is null or quantity_before >= 0) not valid,
  add constraint stock_movements_quantity_after_nonnegative_check
    check (quantity_after is null or quantity_after >= 0) not valid,
  add constraint stock_movements_adjustment_reason_check
    check (adjustment_reason is null or adjustment_reason in (
      'cycle-count', 'opening-balance', 'damage', 'loss', 'found', 'other'
    )) not valid,
  add constraint stock_movements_manual_adjustment_snapshot_check
    check (
      reason <> 'manual-adjustment'
      or (
        quantity_before is not null
        and quantity_after is not null
        and adjustment_reason is not null
        and quantity_delta = quantity_after - quantity_before
      )
    ) not valid;

create table if not exists public.inventory_counts (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  client_request_id text not null,
  product_id uuid not null,
  product_name text not null,
  expected_stock_qty integer not null check (expected_stock_qty >= 0),
  counted_stock_qty integer not null check (counted_stock_qty >= 0),
  quantity_delta integer not null,
  reason text not null check (reason in (
    'cycle-count', 'opening-balance', 'damage', 'loss', 'found', 'other'
  )),
  note text,
  occurred_at timestamptz not null default clock_timestamp(),
  user_id uuid references auth.users(id),
  user_name text,
  created_at timestamptz not null default now(),
  unique (store_id, client_request_id),
  foreign key (store_id, product_id)
    references public.products(store_id, id)
);

create index if not exists inventory_counts_store_product_occurred_idx
  on public.inventory_counts (store_id, product_id, occurred_at desc);

alter table public.inventory_counts enable row level security;
create policy inventory_counts_member_select
  on public.inventory_counts for select to authenticated
  using ((select private.is_store_member(store_id)));
grant select on public.inventory_counts to authenticated;

create or replace function public.record_inventory_adjustment(
  target_store_id uuid,
  payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  actor_name text;
  request_id text := nullif(btrim(payload ->> 'client_request_id'), '');
  product_external_id text := nullif(btrim(payload ->> 'product_id'), '');
  expected_qty integer;
  counted_qty integer;
  quantity_delta integer;
  count_reason text := nullif(btrim(payload ->> 'reason'), '');
  count_note text := nullif(btrim(payload ->> 'note'), '');
  product_record public.products%rowtype;
  existing_count public.inventory_counts%rowtype;
begin
  if actor_id is null or not private.has_store_role(target_store_id, array['owner', 'manager']) then
    raise exception using errcode = '42501', message =
      'inventory-count:forbidden:Alleen een manager of eigenaar kan een voorraadtelling vastleggen.';
  end if;
  if request_id is null or product_external_id is null
     or count_reason not in ('cycle-count', 'opening-balance', 'damage', 'loss', 'found', 'other')
     or (count_reason = 'other' and count_note is null) then
    raise exception using errcode = 'P0001', message =
      'inventory-count:invalid-request:Vul product, reden en een unieke telreferentie correct in.';
  end if;
  -- Serialize equal retry keys before checking idempotency. Without this lock,
  -- two simultaneous browser retries could both miss the count row and the
  -- second one would incorrectly fail the later expected-quantity check.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      target_store_id::text || ':inventory-count:' || request_id,
      0
    )
  );
  begin
    expected_qty := (payload ->> 'expected_stock_qty')::integer;
    counted_qty := (payload ->> 'counted_stock_qty')::integer;
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception using errcode = 'P0001', message =
      'inventory-count:invalid-quantity:Het getelde aantal is ongeldig.';
  end;
  if expected_qty < 0 or counted_qty < 0 then
    raise exception using errcode = 'P0001', message =
      'inventory-count:invalid-quantity:Voorraad kan niet negatief zijn.';
  end if;

  select * into existing_count
  from public.inventory_counts
  where store_id = target_store_id and client_request_id = request_id;
  if found then
    return pg_catalog.jsonb_build_object(
      'count_id', existing_count.id,
      'product_id', existing_count.product_id,
      'expected_stock_qty', existing_count.expected_stock_qty,
      'counted_stock_qty', existing_count.counted_stock_qty,
      'quantity_delta', existing_count.quantity_delta,
      'duplicate', true
    );
  end if;

  select * into product_record
  from public.products
  where store_id = target_store_id
    and (external_id = product_external_id or id::text = product_external_id)
  for update;
  if not found then
    raise exception using errcode = 'P0001', message =
      'inventory-count:product-not-found:Dit product bestaat niet meer.';
  end if;
  if product_record.stock_qty is null then
    raise exception using errcode = 'P0001', message =
      'inventory-count:stock-not-tracked:Voor dit product wordt geen voorraad bijgehouden.';
  end if;
  if product_record.stock_qty <> expected_qty then
    raise exception using errcode = 'P0001', message =
      'inventory-count:stock-changed:De systeemvoorraad wijzigde sinds de telling. Heropen en bevestig de telling.';
  end if;

  select coalesce(p.display_name, split_part(u.email, '@', 1), 'Gebruiker')
  into actor_name
  from auth.users u
  left join public.profiles p on p.id = u.id
  where u.id = actor_id;

  quantity_delta := counted_qty - product_record.stock_qty;
  update public.products
  set stock_qty = counted_qty, updated_at = clock_timestamp()
  where id = product_record.id and store_id = target_store_id;

  insert into public.inventory_counts (
    store_id, client_request_id, product_id, product_name,
    expected_stock_qty, counted_stock_qty, quantity_delta,
    reason, note, occurred_at, user_id, user_name
  ) values (
    target_store_id, request_id, product_record.id, product_record.name,
    expected_qty, counted_qty, quantity_delta,
    count_reason, count_note, clock_timestamp(), actor_id, actor_name
  ) returning * into existing_count;

  if quantity_delta <> 0 then
    insert into public.stock_movements (
      store_id, product_id, product_name, quantity_delta, reason,
      occurred_at, user_id, user_name, client_request_id,
      quantity_before, quantity_after, adjustment_reason, note
    ) values (
      target_store_id, product_record.id, product_record.name, quantity_delta,
      'manual-adjustment', existing_count.occurred_at, actor_id, actor_name,
      request_id, product_record.stock_qty, counted_qty, count_reason, count_note
    );
  end if;

  insert into public.audit_entries (
    store_id, occurred_at, user_id, user_name, action, detail, source
  ) values (
    target_store_id, existing_count.occurred_at, actor_id, actor_name,
    'inventory.count',
    pg_catalog.jsonb_build_object(
      'countId', existing_count.id,
      'clientRequestId', request_id,
      'productId', product_record.id,
      'productName', product_record.name,
      'expectedStockQty', expected_qty,
      'countedStockQty', counted_qty,
      'quantityDelta', quantity_delta,
      'reason', count_reason,
      'note', count_note
    ),
    'app'
  );

  return pg_catalog.jsonb_build_object(
    'count_id', existing_count.id,
    'product_id', product_record.id,
    'expected_stock_qty', expected_qty,
    'counted_stock_qty', counted_qty,
    'quantity_delta', quantity_delta,
    'duplicate', false
  );
end;
$$;

revoke all on function public.record_inventory_adjustment(uuid, jsonb) from public, anon;
grant execute on function public.record_inventory_adjustment(uuid, jsonb) to authenticated;
