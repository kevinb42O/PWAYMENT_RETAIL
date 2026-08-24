-- Make Migration Hub activation one server transaction. Categories are
-- inserted in topological order with their real parent immediately, products
-- therefore receive canonical leaf references on first write, and explicit
-- family/variant relations are committed before the activation is acknowledged.

begin;

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
  category_items jsonb := coalesce(migration_payload -> 'categories', '[]'::jsonb);
  product_items jsonb := coalesce(migration_payload -> 'products', '[]'::jsonb);
  customer_items jsonb := coalesce(migration_payload -> 'customers', '[]'::jsonb);
  family_items jsonb := coalesce(migration_payload -> 'catalogFamilies', '[]'::jsonb);
  migration_id uuid;
  inserted_root_ids text[] := array[]::text[];
  inserted_child_ids text[] := array[]::text[];
  inserted_category_ids text[] := array[]::text[];
  created_categories integer := 0;
  created_products integer := 0;
  created_customers integer := 0;
  catalog_result jsonb := '{}'::jsonb;
begin
  if not private.has_store_role(target_store_id, array['owner', 'manager']) then
    raise exception using errcode = '42501', message = 'migration:not-authorized';
  end if;
  if pg_catalog.jsonb_typeof(migration_payload) <> 'object'
     or pg_catalog.jsonb_typeof(activation) <> 'object' then
    raise exception using errcode = '22023', message = 'migration:invalid-activation-payload';
  end if;
  if pg_catalog.jsonb_typeof(category_items) <> 'array'
     or pg_catalog.jsonb_typeof(product_items) <> 'array'
     or pg_catalog.jsonb_typeof(customer_items) <> 'array'
     or pg_catalog.jsonb_typeof(family_items) <> 'array' then
    raise exception using errcode = '22023', message = 'migration:invalid-entity-arrays';
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
    pg_catalog.to_timestamp(coalesce((activation ->> 'activatedAt')::double precision, extract(epoch from pg_catalog.now()) * 1000) / 1000)
  ) on conflict (id) do nothing;

  if not exists (
    select 1 from private.migration_activations as existing_activation
    where existing_activation.id = migration_id
      and existing_activation.store_id = target_store_id
      and existing_activation.status = 'active'
  ) then
    raise exception using errcode = '23505', message = 'migration:activation-id-or-status-conflict';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(category_items) as item
    where nullif(pg_catalog.btrim(item ->> 'id'), '') is null
       or nullif(pg_catalog.btrim(item ->> 'name'), '') is null
  ) then
    raise exception using errcode = '22023', message = 'migration:category-identity-required';
  end if;
  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(category_items) as item
    group by item ->> 'id'
    having count(*) > 1
  ) then
    raise exception using errcode = '22023', message = 'migration:duplicate-category-id';
  end if;

  -- Payload categories are creation-only. Existing categories used by mapped
  -- products are deliberately omitted by the mapper; a payload collision is
  -- therefore stale state or a retry. Only this activation's receipt may own it.
  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(category_items) as item
    join public.categories as existing_category
      on existing_category.store_id = target_store_id
     and existing_category.external_id = item ->> 'id'
    where not exists (
      select 1 from private.migration_inverse_changes as inverse_change
      where inverse_change.migration_id = migration_id
        and inverse_change.entity_type = 'category'
        and inverse_change.action_type = 'delete-created'
        and inverse_change.entity_id = item ->> 'id'
    )
  ) then
    raise exception using errcode = '23505', message = 'migration:category-create-conflict';
  end if;

  with inserted_roots as (
    insert into public.categories (
      store_id, external_id, parent_id, name, vat_rate, sort_order, is_active, is_demo
    )
    select
      target_store_id,
      item ->> 'id',
      null,
      item ->> 'name',
      coalesce((item ->> 'vatRate')::numeric, 21),
      (item ->> 'sortOrder')::integer,
      coalesce((item ->> 'isActive')::boolean, true),
      false
    from pg_catalog.jsonb_array_elements(category_items) as item
    where nullif(pg_catalog.btrim(item ->> 'parentId'), '') is null
    on conflict (store_id, external_id) do nothing
    returning external_id
  )
  select coalesce(pg_catalog.array_agg(inserted_roots.external_id), array[]::text[])
  into inserted_root_ids
  from inserted_roots;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(category_items) as item
    left join public.categories as parent_category
      on parent_category.store_id = target_store_id
     and parent_category.external_id = item ->> 'parentId'
     and parent_category.parent_id is null
    where nullif(pg_catalog.btrim(item ->> 'parentId'), '') is not null
      and parent_category.id is null
  ) then
    raise exception using errcode = '23503', message = 'migration:category-parent-not-found';
  end if;

  with inserted_children as (
    insert into public.categories (
      store_id, external_id, parent_id, name, vat_rate, sort_order, is_active, is_demo
    )
    select
      target_store_id,
      item ->> 'id',
      parent_category.id,
      item ->> 'name',
      parent_category.vat_rate,
      (item ->> 'sortOrder')::integer,
      coalesce((item ->> 'isActive')::boolean, true),
      false
    from pg_catalog.jsonb_array_elements(category_items) as item
    join public.categories as parent_category
      on parent_category.store_id = target_store_id
     and parent_category.external_id = item ->> 'parentId'
     and parent_category.parent_id is null
    where nullif(pg_catalog.btrim(item ->> 'parentId'), '') is not null
    on conflict (store_id, external_id) do update set
      parent_id = excluded.parent_id,
      name = excluded.name,
      vat_rate = excluded.vat_rate,
      sort_order = excluded.sort_order,
      is_active = excluded.is_active,
      updated_at = pg_catalog.clock_timestamp()
    returning external_id
  )
  select coalesce(pg_catalog.array_agg(inserted_children.external_id), array[]::text[])
  into inserted_child_ids
  from inserted_children;

  inserted_category_ids := inserted_root_ids || inserted_child_ids;
  with inserted_inverse as (
    insert into private.migration_inverse_changes (
      id, migration_id, sequence, action_type, entity_type, entity_id,
      before_image_or_inverse_payload, created_at
    )
    select
      (item ->> 'id')::uuid,
      migration_id,
      (item ->> 'sequence')::integer,
      item ->> 'actionType',
      item ->> 'entityType',
      item ->> 'entityId',
      coalesce(item -> 'beforeImageOrInversePayload', '{}'::jsonb),
      pg_catalog.to_timestamp(coalesce((item ->> 'createdAt')::double precision, extract(epoch from pg_catalog.now()) * 1000) / 1000)
    from pg_catalog.jsonb_array_elements(coalesce(migration_payload -> 'inverseChanges', '[]'::jsonb)) as item
    join pg_catalog.unnest(inserted_category_ids) as inserted(external_id)
      on inserted.external_id = item ->> 'entityId'
    where item ->> 'actionType' = 'delete-created'
      and item ->> 'entityType' = 'category'
    on conflict (id) do nothing
    returning 1
  )
  select count(*) into created_categories from inserted_inverse;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(product_items) as item
    where nullif(pg_catalog.btrim(item ->> 'id'), '') is null
       or nullif(pg_catalog.btrim(item ->> 'name'), '') is null
  ) then
    raise exception using errcode = '22023', message = 'migration:product-identity-required';
  end if;
  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(product_items) as item
    group by item ->> 'id'
    having count(*) > 1
  ) then
    raise exception using errcode = '22023', message = 'migration:duplicate-product-id';
  end if;
  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(product_items) as item
    join public.products as existing_product
      on existing_product.store_id = target_store_id
     and existing_product.external_id = item ->> 'id'
    where not exists (
      select 1 from private.migration_inverse_changes as inverse_change
      where inverse_change.migration_id = migration_id
        and inverse_change.entity_type = 'product'
        and inverse_change.action_type = 'delete-created'
        and inverse_change.entity_id = item ->> 'id'
    )
  ) then
    raise exception using errcode = '23505', message = 'migration:product-create-conflict';
  end if;
  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(product_items) as item
    left join public.categories as assigned_category
      on assigned_category.store_id = target_store_id
     and assigned_category.external_id = item ->> 'category'
    where nullif(pg_catalog.btrim(item ->> 'category'), '') is null
       or assigned_category.id is null
  ) then
    raise exception using errcode = '23503', message = 'migration:product-category-not-found';
  end if;

  with inserted_products as (
    insert into public.products (
      store_id, external_id, category_id, category_name, name, subcategory, sku, barcode,
      price_cents, cost_price_cents, vat_rate, brand, supplier, supplier_code, variant,
      price_tiers, custom_fields, stock_qty, min_stock_qty, color, product_type, is_active, is_demo
    )
    select
      target_store_id,
      item ->> 'id',
      assigned_category.id,
      assigned_category.name,
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
    from pg_catalog.jsonb_array_elements(product_items) as item
    join public.categories as assigned_category
      on assigned_category.store_id = target_store_id
     and assigned_category.external_id = item ->> 'category'
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
      pg_catalog.to_timestamp(coalesce((item ->> 'createdAt')::double precision, extract(epoch from pg_catalog.now()) * 1000) / 1000)
    from pg_catalog.jsonb_array_elements(coalesce(migration_payload -> 'inverseChanges', '[]'::jsonb)) as item
    join inserted_products on inserted_products.external_id = item ->> 'entityId'
    where item ->> 'actionType' = 'delete-created' and item ->> 'entityType' = 'product'
    on conflict (id) do nothing
  )
  select count(*) into created_products from inserted_products;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(customer_items) as item
    where nullif(pg_catalog.btrim(item ->> 'id'), '') is null
       or nullif(pg_catalog.btrim(item ->> 'name'), '') is null
  ) then
    raise exception using errcode = '22023', message = 'migration:customer-identity-required';
  end if;
  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(customer_items) as item
    group by item ->> 'id'
    having count(*) > 1
  ) then
    raise exception using errcode = '22023', message = 'migration:duplicate-customer-id';
  end if;
  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(customer_items) as item
    join public.customers as existing_customer
      on existing_customer.store_id = target_store_id
     and existing_customer.external_id = item ->> 'id'
    where not exists (
      select 1 from private.migration_inverse_changes as inverse_change
      where inverse_change.migration_id = migration_id
        and inverse_change.entity_type = 'customer'
        and inverse_change.action_type = 'delete-created'
        and inverse_change.entity_id = item ->> 'id'
    )
  ) then
    raise exception using errcode = '23505', message = 'migration:customer-create-conflict';
  end if;

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
      coalesce(nullif(item ->> 'createdAt', '')::timestamptz, pg_catalog.now())
    from pg_catalog.jsonb_array_elements(customer_items) as item
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
      pg_catalog.to_timestamp(coalesce((item ->> 'createdAt')::double precision, extract(epoch from pg_catalog.now()) * 1000) / 1000)
    from pg_catalog.jsonb_array_elements(coalesce(migration_payload -> 'inverseChanges', '[]'::jsonb)) as item
    join inserted_customers on inserted_customers.external_id = item ->> 'entityId'
    where item ->> 'actionType' = 'delete-created' and item ->> 'entityType' = 'customer'
    on conflict (id) do nothing
  )
  select count(*) into created_customers from inserted_customers;

  -- A family ID is creation-only too. A family already owned exclusively by
  -- products from this activation is a retry; any other collision is rejected.
  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(family_items) as item
    where nullif(pg_catalog.btrim(item ->> 'externalId'), '') is null
       or nullif(pg_catalog.btrim(item ->> 'name'), '') is null
       or pg_catalog.jsonb_typeof(item -> 'variants') is distinct from 'array'
  ) then
    raise exception using errcode = '22023', message = 'migration:family-identity-or-variants-required';
  end if;
  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(family_items) as item
    group by item ->> 'externalId'
    having count(*) > 1
  ) then
    raise exception using errcode = '22023', message = 'migration:duplicate-family-id';
  end if;
  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(family_items) as family
    cross join lateral pg_catalog.jsonb_array_elements(family -> 'variants') as variant
    group by variant ->> 'productExternalId'
    having nullif(pg_catalog.btrim(variant ->> 'productExternalId'), '') is null
       or count(*) > 1
  ) then
    raise exception using errcode = '22023', message = 'migration:duplicate-or-missing-family-product';
  end if;
  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(family_items) as item
    join public.product_families as existing_family
      on existing_family.store_id = target_store_id
     and existing_family.external_id = item ->> 'externalId'
    where not exists (
      select 1
      from public.product_family_variants as existing_variant
      join public.products as family_product
        on family_product.store_id = existing_variant.store_id
       and family_product.id = existing_variant.product_id
      join private.migration_inverse_changes as inverse_change
        on inverse_change.migration_id = migration_id
       and inverse_change.entity_type = 'product'
       and inverse_change.action_type = 'delete-created'
       and inverse_change.entity_id = family_product.external_id
      where existing_variant.store_id = target_store_id
        and existing_variant.family_id = existing_family.id
    )
    or exists (
      select 1
      from public.product_family_variants as existing_variant
      join public.products as family_product
        on family_product.store_id = existing_variant.store_id
       and family_product.id = existing_variant.product_id
      where existing_variant.store_id = target_store_id
        and existing_variant.family_id = existing_family.id
        and not exists (
          select 1 from private.migration_inverse_changes as inverse_change
          where inverse_change.migration_id = migration_id
            and inverse_change.entity_type = 'product'
            and inverse_change.action_type = 'delete-created'
            and inverse_change.entity_id = family_product.external_id
        )
    )
  ) then
    raise exception using errcode = '23505', message = 'migration:family-create-conflict';
  end if;

  if pg_catalog.jsonb_array_length(family_items) > 0 then
    catalog_result := public.apply_retail_catalog_relations(
      target_store_id,
      pg_catalog.jsonb_build_object(
        'activationId', migration_id,
        'families', family_items
      )
    );
  end if;

  return pg_catalog.jsonb_build_object(
    'migration_id', migration_id,
    'categories_created', created_categories,
    'products_created', created_products,
    'customers_created', created_customers,
    'catalog_relations', catalog_result,
    'taxonomy_atomic', true,
    'catalog_relations_atomic', true
  );
end;
$$;

revoke all on function public.apply_migration_activation(uuid, jsonb) from public, anon;
grant execute on function public.apply_migration_activation(uuid, jsonb) to authenticated;

commit;
