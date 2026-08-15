begin;

-- These RPCs are the server half of the offline-first migration protocol.
-- Dexie commits the receipt and its outbox command first; these functions make
-- the remote projection idempotent and transactional once connectivity exists.

create or replace function public.apply_migration_activation(
  target_store_id uuid,
  migration_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  activation jsonb := migration_payload -> 'activation';
  migration_id uuid;
  created_categories integer := 0;
  created_products integer := 0;
  created_customers integer := 0;
begin
  if not private.has_store_role(target_store_id, array['owner', 'manager']) then
    raise exception using errcode = '42501', message = 'migration:not-authorized';
  end if;
  if jsonb_typeof(migration_payload) <> 'object' or jsonb_typeof(activation) <> 'object' then
    raise exception using errcode = '22023', message = 'migration:invalid-activation-payload';
  end if;

  migration_id := nullif(activation ->> 'id', '')::uuid;
  if migration_id is null then
    raise exception using errcode = '22023', message = 'migration:activation-id-required';
  end if;

  insert into private.migration_activations (
    id, store_id, status, graph_version, answers_json, receipt_json, activated_at
  ) values (
    migration_id,
    target_store_id,
    'active',
    greatest(coalesce((activation ->> 'graphVersion')::integer, 1), 1),
    coalesce(activation -> 'answersJson', '{}'::jsonb),
    coalesce(activation -> 'receiptJson', '{}'::jsonb),
    to_timestamp(coalesce((activation ->> 'activatedAt')::double precision, extract(epoch from now()) * 1000) / 1000)
  ) on conflict (id) do nothing;

  -- The inverse receipt is written only for rows this command actually creates
  -- on the server. A retry or a pre-existing external ID must never make an
  -- undo delete a record that predates this migration.
  with inserted_categories as (
    insert into public.categories (
      store_id, external_id, name, vat_rate, sort_order, is_active, is_demo
    )
    select
      target_store_id,
      item ->> 'id',
      item ->> 'name',
      coalesce((item ->> 'vatRate')::numeric, 21),
      (item ->> 'sortOrder')::integer,
      coalesce((item ->> 'isActive')::boolean, true),
      false
    from jsonb_array_elements(coalesce(migration_payload -> 'categories', '[]'::jsonb)) item
    on conflict (store_id, external_id) do nothing
    returning external_id
  ), inserted_inverse as (
    insert into private.migration_inverse_changes (
      id, migration_id, sequence, action_type, entity_type, entity_id,
      before_image_or_inverse_payload, created_at
    )
    select
      (item ->> 'id')::uuid, migration_id, (item ->> 'sequence')::integer,
      item ->> 'actionType', item ->> 'entityType', item ->> 'entityId',
      coalesce(item -> 'beforeImageOrInversePayload', '{}'::jsonb),
      to_timestamp(coalesce((item ->> 'createdAt')::double precision, extract(epoch from now()) * 1000) / 1000)
    from jsonb_array_elements(coalesce(migration_payload -> 'inverseChanges', '[]'::jsonb)) item
    join inserted_categories on inserted_categories.external_id = item ->> 'entityId'
    where item ->> 'actionType' = 'delete-created' and item ->> 'entityType' = 'category'
    on conflict (id) do nothing
  )
  select count(*) into created_categories from inserted_categories;

  with inserted_products as (
    insert into public.products (
      store_id, external_id, category_id, category_name, name, subcategory, sku, barcode,
      price_cents, cost_price_cents, vat_rate, brand, supplier, supplier_code, variant,
      price_tiers, custom_fields, stock_qty, min_stock_qty, color, product_type, is_active, is_demo
    )
    select
      target_store_id,
      item ->> 'id',
      category.id,
      coalesce(category.name, item ->> 'category'),
      item ->> 'name',
      nullif(item ->> 'subCategory', ''),
      nullif(item ->> 'sku', ''),
      nullif(item ->> 'barcode', ''),
      coalesce((item ->> 'priceCents')::bigint, 0),
      (item ->> 'costPriceCents')::bigint,
      coalesce((item ->> 'vatRate')::numeric, 21),
      nullif(item ->> 'brand', ''),
      nullif(item ->> 'supplier', ''),
      nullif(item ->> 'supplierCode', ''),
      nullif(item ->> 'variant', ''),
      coalesce(item -> 'priceTiers', '{}'::jsonb),
      coalesce(item -> 'customFields', '{}'::jsonb),
      (item ->> 'stockQty')::integer,
      (item ->> 'minStockQty')::integer,
      nullif(item ->> 'color', ''),
      coalesce(nullif(item ->> 'productType', ''), 'merchandise'),
      coalesce((item ->> 'isActive')::boolean, true),
      false
    from jsonb_array_elements(coalesce(migration_payload -> 'products', '[]'::jsonb)) item
    left join public.categories category
      on category.store_id = target_store_id
     and category.external_id = item ->> 'category'
    on conflict (store_id, external_id) do nothing
    returning external_id
  ), inserted_inverse as (
    insert into private.migration_inverse_changes (
      id, migration_id, sequence, action_type, entity_type, entity_id,
      before_image_or_inverse_payload, created_at
    )
    select
      (item ->> 'id')::uuid, migration_id, (item ->> 'sequence')::integer,
      item ->> 'actionType', item ->> 'entityType', item ->> 'entityId',
      coalesce(item -> 'beforeImageOrInversePayload', '{}'::jsonb),
      to_timestamp(coalesce((item ->> 'createdAt')::double precision, extract(epoch from now()) * 1000) / 1000)
    from jsonb_array_elements(coalesce(migration_payload -> 'inverseChanges', '[]'::jsonb)) item
    join inserted_products on inserted_products.external_id = item ->> 'entityId'
    where item ->> 'actionType' = 'delete-created' and item ->> 'entityType' = 'product'
    on conflict (id) do nothing
  )
  select count(*) into created_products from inserted_products;

  with inserted_customers as (
    insert into public.customers (
      store_id, external_id, name, email, phone, address, notes, price_group,
      total_spent_cents, visit_count, last_visit_at, is_active, is_demo, created_at
    )
    select
      target_store_id,
      item ->> 'id',
      item ->> 'name',
      nullif(item ->> 'email', ''),
      nullif(item ->> 'phone', ''),
      nullif(item ->> 'address', ''),
      nullif(item ->> 'notes', ''),
      nullif(item ->> 'priceGroup', ''),
      coalesce((item ->> 'totalSpentCents')::bigint, 0),
      coalesce((item ->> 'visitCount')::integer, 0),
      nullif(item ->> 'lastVisitAt', '')::timestamptz,
      coalesce((item ->> 'isActive')::boolean, true),
      false,
      coalesce(nullif(item ->> 'createdAt', '')::timestamptz, now())
    from jsonb_array_elements(coalesce(migration_payload -> 'customers', '[]'::jsonb)) item
    on conflict (store_id, external_id) do nothing
    returning external_id
  ), inserted_inverse as (
    insert into private.migration_inverse_changes (
      id, migration_id, sequence, action_type, entity_type, entity_id,
      before_image_or_inverse_payload, created_at
    )
    select
      (item ->> 'id')::uuid, migration_id, (item ->> 'sequence')::integer,
      item ->> 'actionType', item ->> 'entityType', item ->> 'entityId',
      coalesce(item -> 'beforeImageOrInversePayload', '{}'::jsonb),
      to_timestamp(coalesce((item ->> 'createdAt')::double precision, extract(epoch from now()) * 1000) / 1000)
    from jsonb_array_elements(coalesce(migration_payload -> 'inverseChanges', '[]'::jsonb)) item
    join inserted_customers on inserted_customers.external_id = item ->> 'entityId'
    where item ->> 'actionType' = 'delete-created' and item ->> 'entityType' = 'customer'
    on conflict (id) do nothing
  )
  select count(*) into created_customers from inserted_customers;

  return jsonb_build_object(
    'migration_id', migration_id,
    'categories_created', created_categories,
    'products_created', created_products,
    'customers_created', created_customers
  );
end;
$$;

create or replace function public.seal_migration_activation(
  target_store_id uuid,
  lock_payload jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  activation private.migration_activations%rowtype;
  lock_id uuid;
  occurred_at timestamptz;
begin
  if not private.is_store_member(target_store_id) then
    raise exception using errcode = '42501', message = 'migration:not-authorized';
  end if;
  lock_id := nullif(lock_payload ->> 'id', '')::uuid;
  occurred_at := to_timestamp(coalesce((lock_payload ->> 'occurredAt')::double precision, extract(epoch from now()) * 1000) / 1000);
  select * into activation
  from private.migration_activations
  where id = nullif(lock_payload ->> 'migrationId', '')::uuid
    and store_id = target_store_id
  for update;
  if not found then return false; end if;
  if activation.status = 'locked' then return true; end if;
  if activation.status <> 'active' or activation.first_meaningful_activity_at is not null then
    raise exception using errcode = 'P0001', message = 'migration:cannot-seal';
  end if;

  update private.migration_activations set
    status = 'locked',
    first_meaningful_activity_at = occurred_at,
    first_meaningful_activity_type = lock_payload ->> 'activityType',
    first_meaningful_activity_entity_type = lock_payload ->> 'entityType',
    first_meaningful_activity_entity_id = lock_payload ->> 'entityId',
    locked_at = occurred_at
  where id = activation.id;
  insert into private.migration_activity_locks (
    id, migration_id, store_id, activity_type, entity_type, entity_id,
    occurred_at, actor_user_id, actor_name, correlation_id
  ) values (
    lock_id, activation.id, target_store_id, lock_payload ->> 'activityType',
    lock_payload ->> 'entityType', lock_payload ->> 'entityId', occurred_at,
    case when coalesce(lock_payload ->> 'actorUserId', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then (lock_payload ->> 'actorUserId')::uuid end,
    nullif(lock_payload ->> 'actorName', ''),
    nullif(lock_payload ->> 'correlationId', '')
  ) on conflict (id) do nothing;
  return true;
end;
$$;

create or replace function public.undo_migration_activation(
  target_store_id uuid,
  target_migration_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  activation private.migration_activations%rowtype;
begin
  if not private.has_store_role(target_store_id, array['owner', 'manager']) then
    raise exception using errcode = '42501', message = 'migration:not-authorized';
  end if;
  select * into activation from private.migration_activations
  where id = target_migration_id and store_id = target_store_id for update;
  if not found then return false; end if;
  if activation.status = 'undone' then return true; end if;
  if activation.status <> 'active' or activation.first_meaningful_activity_at is not null then
    raise exception using errcode = 'P0001', message = 'migration:undo-window-closed';
  end if;

  delete from public.products
  where store_id = target_store_id and external_id in (
    select entity_id from private.migration_inverse_changes
    where migration_id = target_migration_id and action_type = 'delete-created' and entity_type = 'product'
  );
  delete from public.customers
  where store_id = target_store_id and external_id in (
    select entity_id from private.migration_inverse_changes
    where migration_id = target_migration_id and action_type = 'delete-created' and entity_type = 'customer'
  );
  delete from public.categories
  where store_id = target_store_id and external_id in (
    select entity_id from private.migration_inverse_changes
    where migration_id = target_migration_id and action_type = 'delete-created' and entity_type = 'category'
  );
  update private.migration_activations set status = 'undone', undone_at = now()
  where id = target_migration_id;
  return true;
end;
$$;

revoke all on function public.apply_migration_activation(uuid, jsonb) from public;
revoke all on function public.seal_migration_activation(uuid, jsonb) from public;
revoke all on function public.undo_migration_activation(uuid, uuid) from public;
grant execute on function public.apply_migration_activation(uuid, jsonb) to authenticated;
grant execute on function public.seal_migration_activation(uuid, jsonb) to authenticated;
grant execute on function public.undo_migration_activation(uuid, uuid) to authenticated;

commit;
