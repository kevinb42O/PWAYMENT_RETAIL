-- Retail catalog core, built beside the existing sellable-SKU table.
-- `public.products` remains the source for checkout, returns and historic
-- documents during this migration. The new relations make a product family,
-- option matrix and multiple identifiers explicit without rewriting history.

begin;

alter table public.categories
  add column if not exists parent_id uuid;
alter table public.categories
  drop constraint if exists categories_store_parent_id_fkey;
alter table public.categories
  add constraint categories_store_parent_id_fkey
    foreign key (store_id, parent_id)
    references public.categories(store_id, id)
    on delete restrict;
alter table public.categories
  drop constraint if exists categories_parent_not_self_check;
alter table public.categories
  add constraint categories_parent_not_self_check
    check (parent_id is null or parent_id <> id);
create index if not exists categories_store_parent_sort_idx
  on public.categories (store_id, parent_id, sort_order nulls last, name);

create or replace function private.prevent_catalog_category_cycle()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.parent_id is null then
    return new;
  end if;
  if new.parent_id = new.id then
    raise exception using errcode = '23514', message = 'catalog-category:cycle:Een categorie kan niet haar eigen ouder zijn.';
  end if;
  if exists (
    with recursive ancestors as (
      select category.id, category.parent_id
      from public.categories as category
      where category.store_id = new.store_id and category.id = new.parent_id
      union all
      select category.id, category.parent_id
      from public.categories as category
      join ancestors on category.id = ancestors.parent_id
        and category.store_id = new.store_id
    )
    select 1 from ancestors where id = new.id
  ) then
    raise exception using errcode = '23514', message = 'catalog-category:cycle:Een categorie kan geen afstammeling als ouder krijgen.';
  end if;
  return new;
end;
$$;

drop trigger if exists categories_prevent_catalog_cycle on public.categories;
create trigger categories_prevent_catalog_cycle
  before insert or update of parent_id on public.categories
  for each row execute function private.prevent_catalog_category_cycle();

create table if not exists public.product_families (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  external_id text,
  name text not null check (char_length(btrim(name)) between 1 and 320),
  brand text,
  category_id uuid,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (store_id, id),
  unique (store_id, external_id),
  foreign key (store_id, category_id)
    references public.categories(store_id, id)
);

create index if not exists product_families_store_category_active_idx
  on public.product_families (store_id, category_id, is_active, name);

create table if not exists public.product_family_variants (
  store_id uuid not null references public.stores(id) on delete cascade,
  product_id uuid not null,
  family_id uuid not null,
  display_name text,
  display_order integer,
  option_signature text not null default '',
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  primary key (store_id, product_id),
  unique (store_id, product_id, family_id),
  foreign key (store_id, product_id)
    references public.products(store_id, id) on delete cascade,
  foreign key (store_id, family_id)
    references public.product_families(store_id, id) on delete cascade
);

create index if not exists product_family_variants_family_order_idx
  on public.product_family_variants (store_id, family_id, display_order nulls last, product_id);
create unique index if not exists product_family_variants_option_signature_unique
  on public.product_family_variants (store_id, family_id, option_signature)
  where option_signature <> '';

create table if not exists public.product_family_option_definitions (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  family_id uuid not null,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  normalized_name text generated always as (lower(btrim(name))) stored,
  display_order integer,
  is_active boolean not null default true,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (store_id, id, family_id),
  unique (store_id, family_id, normalized_name),
  foreign key (store_id, family_id)
    references public.product_families(store_id, id) on delete cascade
);

create table if not exists public.product_family_option_values (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  family_id uuid not null,
  definition_id uuid not null,
  value text not null check (char_length(btrim(value)) between 1 and 160),
  normalized_value text generated always as (lower(btrim(value))) stored,
  display_order integer,
  is_active boolean not null default true,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (store_id, id, family_id, definition_id),
  unique (store_id, definition_id, normalized_value),
  foreign key (store_id, definition_id, family_id)
    references public.product_family_option_definitions(store_id, id, family_id)
    on delete cascade
);

create table if not exists public.product_variant_option_values (
  store_id uuid not null references public.stores(id) on delete cascade,
  product_id uuid not null,
  family_id uuid not null,
  definition_id uuid not null,
  value_id uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key (store_id, product_id, definition_id),
  foreign key (store_id, product_id, family_id)
    references public.product_family_variants(store_id, product_id, family_id)
    on delete cascade,
  foreign key (store_id, definition_id, family_id)
    references public.product_family_option_definitions(store_id, id, family_id)
    on delete cascade,
  foreign key (store_id, value_id, family_id, definition_id)
    references public.product_family_option_values(store_id, id, family_id, definition_id)
    on delete restrict
);

create index if not exists product_variant_option_values_value_idx
  on public.product_variant_option_values (store_id, family_id, definition_id, value_id);

-- Scannable identifiers are unique across active SKUs in one tenant. A
-- supplier reference may repeat, but can never be exposed as an ambiguous
-- scan code. Legacy SKU/barcode values stay authoritative until a reviewed
-- identifier migration populates this table.
create table if not exists public.product_identifiers (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  product_id uuid not null,
  identifier_type text not null check (identifier_type in (
    'internal-sku', 'ean', 'upc', 'gtin', 'supplier-code', 'alternate'
  )),
  identifier_value text not null check (char_length(btrim(identifier_value)) between 1 and 240),
  normalized_value text generated always as (
    lower(regexp_replace(btrim(identifier_value), '[[:space:]]+', '', 'g'))
  ) stored,
  is_scannable boolean not null default false,
  is_primary boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (store_id, id),
  foreign key (store_id, product_id)
    references public.products(store_id, id) on delete cascade
);

create unique index if not exists product_identifiers_active_scan_unique
  on public.product_identifiers (store_id, normalized_value)
  where is_active and is_scannable;
create unique index if not exists product_identifiers_active_primary_unique
  on public.product_identifiers (store_id, product_id)
  where is_active and is_primary;
create unique index if not exists product_identifiers_active_value_unique
  on public.product_identifiers (store_id, product_id, identifier_type, normalized_value)
  where is_active;
create index if not exists product_identifiers_product_idx
  on public.product_identifiers (store_id, product_id, identifier_type);

-- The legacy SKU/barcode columns and the relation table coexist during this
-- rollout. Enforce one namespace for every scannable value so a POS scan can
-- never resolve to a different SKU depending on which representation arrived
-- in the local cache first.
create or replace function private.prevent_identifier_legacy_scan_collision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate_value text;
begin
  if not new.is_active or not new.is_scannable then
    return new;
  end if;
  candidate_value := lower(regexp_replace(btrim(new.identifier_value), '[[:space:]]+', '', 'g'));
  if exists (
    select 1
    from public.products as product
    where product.store_id = new.store_id
      and product.id <> new.product_id
      and (
        lower(regexp_replace(btrim(coalesce(product.barcode, '')), '[[:space:]]+', '', 'g')) = candidate_value
        or lower(regexp_replace(btrim(coalesce(product.sku, '')), '[[:space:]]+', '', 'g')) = candidate_value
      )
  ) then
    raise exception using errcode = '23505', message = 'retail-catalog:scan-identifier-conflicts-with-legacy-product';
  end if;
  return new;
end;
$$;

create or replace function private.prevent_legacy_identifier_scan_collision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  sku_value text := lower(regexp_replace(btrim(coalesce(new.sku, '')), '[[:space:]]+', '', 'g'));
  barcode_value text := lower(regexp_replace(btrim(coalesce(new.barcode, '')), '[[:space:]]+', '', 'g'));
begin
  if exists (
    select 1
    from public.product_identifiers as identifier
    where identifier.store_id = new.store_id
      and identifier.product_id <> new.id
      and identifier.is_active
      and identifier.is_scannable
      and identifier.normalized_value in (sku_value, barcode_value)
  ) then
    raise exception using errcode = '23505', message = 'retail-catalog:legacy-scan-conflicts-with-identifier';
  end if;
  return new;
end;
$$;

drop trigger if exists product_identifiers_prevent_legacy_scan_collision on public.product_identifiers;
create trigger product_identifiers_prevent_legacy_scan_collision
  before insert or update of identifier_value, is_scannable, is_active, product_id on public.product_identifiers
  for each row execute function private.prevent_identifier_legacy_scan_collision();

drop trigger if exists products_prevent_identifier_scan_collision on public.products;
create trigger products_prevent_identifier_scan_collision
  before insert or update of sku, barcode, store_id, id on public.products
  for each row execute function private.prevent_legacy_identifier_scan_collision();

-- Keep the existing products table sellable during the rollout, but make a
-- catalog family obligatory for every SKU created after this migration too.
-- It intentionally creates a one-variant family only; grouping two existing
-- SKUs remains an explicit catalogue action and is never inferred by name.
create or replace function private.create_default_product_family()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.product_families (
  id, store_id, external_id, name, brand, category_id, is_active, created_at, updated_at
) values (
    new.id,
    new.store_id,
    null,
    new.name,
    new.brand,
    new.category_id,
    new.is_active,
    new.created_at,
    new.updated_at
  ) on conflict (store_id, id) do nothing;

  insert into public.product_family_variants (
    store_id, product_id, family_id, display_name, display_order, created_at, updated_at
  ) values (
    new.store_id,
    new.id,
    new.id,
    new.variant,
    0,
    new.created_at,
    new.updated_at
  ) on conflict (store_id, product_id) do nothing;
  return new;
end;
$$;

drop trigger if exists products_create_default_catalog_family on public.products;
create trigger products_create_default_catalog_family
  after insert on public.products
  for each row execute function private.create_default_product_family();

-- Product deletion already cascades its SKU relation. Remove only the safe
-- default family or an import-created family after its last SKU disappears;
-- a deliberately created, still-empty family remains untouched.
create or replace function private.remove_empty_product_catalog_family()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.product_families as family
  where family.store_id = old.store_id
    and (family.id = old.id or family.external_id like 'migration-family-%')
    and not exists (
      select 1
      from public.product_family_variants as variant
      where variant.store_id = family.store_id
        and variant.family_id = family.id
    );
  return old;
end;
$$;

drop trigger if exists products_remove_empty_catalog_family on public.products;
create trigger products_remove_empty_catalog_family
  after delete on public.products
  for each row execute function private.remove_empty_product_catalog_family();

-- Durable second half of an import activation. `products` first remains
-- compatible with the current POS; this function then associates those exact
-- SKUs with explicit families, option values and scan identifiers. Retries are
-- idempotent and no grouping is inferred from free text by SQL itself.
create or replace function public.apply_retail_catalog_relations(
  target_store_id uuid,
  relations_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  families jsonb;
  activation_id uuid;
  family jsonb;
  variant jsonb;
  option_value jsonb;
  identifier jsonb;
  family_external_id text;
  family_name text;
  family_brand text;
  category_external_id text;
  category_id uuid;
  family_id uuid;
  product_external_id text;
  product_id uuid;
  current_family_id uuid;
  definition_id uuid;
  value_id uuid;
  option_name text;
  option_content text;
  identifier_type text;
  identifier_content text;
  identifier_scannable boolean;
  identifier_primary boolean;
  family_count integer := 0;
  variant_count integer := 0;
  identifier_count integer := 0;
  variant_position integer;
begin
  if not private.has_store_role(target_store_id, array['owner', 'manager']) then
    raise exception using errcode = '42501', message = 'retail-catalog:not-authorized';
  end if;
  if pg_catalog.jsonb_typeof(relations_payload) = 'object' then
    families := relations_payload -> 'families';
    activation_id := nullif(relations_payload ->> 'activationId', '')::uuid;
  else
    raise exception using errcode = '22023', message = 'retail-catalog:activation-payload-required';
  end if;
  if pg_catalog.jsonb_typeof(families) is distinct from 'array' then
    raise exception using errcode = '22023', message = 'retail-catalog:families-array-required';
  end if;
  if activation_id is null or not exists (
    select 1
    from private.migration_activations as activation
    where activation.id = activation_id
      and activation.store_id = target_store_id
      and activation.status in ('active', 'locked')
  ) then
    raise exception using errcode = '22023', message = 'retail-catalog:active-migration-required';
  end if;

  for family in select value from pg_catalog.jsonb_array_elements(families) loop
    if pg_catalog.jsonb_typeof(family) <> 'object' then
      raise exception using errcode = '22023', message = 'retail-catalog:family-object-required';
    end if;
    family_external_id := nullif(pg_catalog.btrim(family ->> 'externalId'), '');
    family_name := nullif(pg_catalog.btrim(family ->> 'name'), '');
    family_brand := nullif(pg_catalog.btrim(family ->> 'brand'), '');
    category_external_id := nullif(pg_catalog.btrim(family ->> 'categoryExternalId'), '');
    if family_external_id is null or family_name is null then
      raise exception using errcode = '22023', message = 'retail-catalog:family-identity-required';
    end if;

    category_id := null;
    if category_external_id is not null then
      select category.id into category_id
      from public.categories as category
      where category.store_id = target_store_id
        and category.external_id = category_external_id;
      if category_id is null then
        raise exception using errcode = '22023', message = 'retail-catalog:family-category-not-found';
      end if;
    end if;

    insert into public.product_families (
      store_id, external_id, name, brand, category_id, is_active
    ) values (
      target_store_id, family_external_id, family_name, family_brand, category_id, true
    ) on conflict (store_id, external_id) do update
      set name = excluded.name,
          brand = excluded.brand,
          category_id = excluded.category_id,
          is_active = true,
          updated_at = clock_timestamp()
    returning id into family_id;
    family_count := family_count + 1;

    if pg_catalog.jsonb_typeof(family -> 'variants') is distinct from 'array' then
      raise exception using errcode = '22023', message = 'retail-catalog:variants-array-required';
    end if;
    for variant, variant_position in
      select value, ordinality::integer
      from pg_catalog.jsonb_array_elements(family -> 'variants') with ordinality
    loop
      product_external_id := nullif(pg_catalog.btrim(variant ->> 'productExternalId'), '');
      if product_external_id is null then
        raise exception using errcode = '22023', message = 'retail-catalog:variant-product-required';
      end if;
      select product.id into product_id
      from public.products as product
      where product.store_id = target_store_id
        and product.external_id = product_external_id;
      if product_id is null then
        raise exception using errcode = '22023', message = 'retail-catalog:variant-product-not-found';
      end if;
      -- `apply_migration_activation` is creation-only. Its inverse receipt is
      -- the server-side proof that this exact external SKU was inserted by
      -- this exact activation; without it an ID collision could reparent a
      -- pre-existing merchant product on a later relation retry.
      if not exists (
        select 1
        from private.migration_inverse_changes as inverse_change
        where inverse_change.migration_id = activation_id
          and inverse_change.entity_type = 'product'
          and inverse_change.action_type = 'delete-created'
          and inverse_change.entity_id = product_external_id
      ) then
        raise exception using errcode = '22023', message = 'retail-catalog:product-not-created-by-activation';
      end if;

      -- A retry must be able to replace the exact option tuple it previously
      -- wrote. Deleting it first also makes an explicit move out of the
      -- default one-SKU family valid under the composite foreign key below.
      select existing_variant.family_id into current_family_id
      from public.product_family_variants as existing_variant
      where existing_variant.store_id = target_store_id
        and existing_variant.product_id = product_id;
      if current_family_id is not null then
        delete from public.product_variant_option_values as existing_option
        where existing_option.store_id = target_store_id
          and existing_option.product_id = product_id;
      end if;

      insert into public.product_family_variants (
        store_id, product_id, family_id, display_name, display_order, option_signature
      ) values (
        target_store_id,
        product_id,
        family_id,
        nullif(pg_catalog.btrim(variant ->> 'displayName'), ''),
        variant_position - 1,
        ''
      ) on conflict (store_id, product_id) do update
        set family_id = excluded.family_id,
            display_name = excluded.display_name,
            display_order = excluded.display_order,
            option_signature = '',
            updated_at = clock_timestamp();
      variant_count := variant_count + 1;

      -- A default family is created by the products trigger. It is safe to
      -- remove once this SKU has been attached to an explicit import family.
      delete from public.product_families as default_family
      where default_family.store_id = target_store_id
        and default_family.id = product_id
        and default_family.id <> family_id
        and not exists (
          select 1 from public.product_family_variants as existing_variant
          where existing_variant.store_id = target_store_id
            and existing_variant.family_id = default_family.id
        );

      if pg_catalog.jsonb_typeof(variant -> 'options') is not null
         and pg_catalog.jsonb_typeof(variant -> 'options') <> 'array' then
        raise exception using errcode = '22023', message = 'retail-catalog:options-array-required';
      end if;
      for option_value in
        select value from pg_catalog.jsonb_array_elements(coalesce(variant -> 'options', '[]'::jsonb))
      loop
        option_name := nullif(pg_catalog.btrim(option_value ->> 'name'), '');
        option_content := nullif(pg_catalog.btrim(option_value ->> 'value'), '');
        if option_name is null or option_content is null then
          raise exception using errcode = '22023', message = 'retail-catalog:option-name-and-value-required';
        end if;
        insert into public.product_family_option_definitions (
          store_id, family_id, name, is_active
        ) values (
          target_store_id, family_id, option_name, true
        ) on conflict (store_id, family_id, normalized_name) do update
          set is_active = true,
              updated_at = clock_timestamp()
        returning id into definition_id;
        insert into public.product_family_option_values (
          store_id, family_id, definition_id, value, is_active
        ) values (
          target_store_id, family_id, definition_id, option_content, true
        ) on conflict (store_id, definition_id, normalized_value) do update
          set is_active = true,
              updated_at = clock_timestamp()
        returning id into value_id;
        insert into public.product_variant_option_values (
          store_id, product_id, family_id, definition_id, value_id
        ) values (
          target_store_id, product_id, family_id, definition_id, value_id
        ) on conflict (store_id, product_id, definition_id) do update
          set value_id = excluded.value_id;
      end loop;

      if pg_catalog.jsonb_typeof(variant -> 'identifiers') is not null
         and pg_catalog.jsonb_typeof(variant -> 'identifiers') <> 'array' then
        raise exception using errcode = '22023', message = 'retail-catalog:identifiers-array-required';
      end if;
      -- Primary is a per-SKU designation. Clear an older import primary before
      -- writing the reviewed source primary, but preserve all non-primary
      -- identifiers for traceability and scan continuity.
      if exists (
        select 1
        from pg_catalog.jsonb_array_elements(coalesce(variant -> 'identifiers', '[]'::jsonb)) as incoming(value)
        where coalesce((incoming.value ->> 'isPrimary')::boolean, false)
      ) then
        update public.product_identifiers as existing_identifier
        set is_primary = false,
            updated_at = clock_timestamp()
        where existing_identifier.store_id = target_store_id
          and existing_identifier.product_id = product_id
          and existing_identifier.is_active
          and existing_identifier.is_primary;
      end if;
      for identifier in
        select value from pg_catalog.jsonb_array_elements(coalesce(variant -> 'identifiers', '[]'::jsonb))
      loop
        identifier_type := nullif(pg_catalog.btrim(identifier ->> 'identifierType'), '');
        identifier_content := nullif(pg_catalog.btrim(identifier ->> 'identifierValue'), '');
        identifier_scannable := coalesce((identifier ->> 'isScannable')::boolean, false);
        identifier_primary := coalesce((identifier ->> 'isPrimary')::boolean, false);
        if identifier_type not in ('internal-sku', 'ean', 'upc', 'gtin', 'supplier-code', 'alternate')
           or identifier_content is null then
          raise exception using errcode = '22023', message = 'retail-catalog:invalid-identifier';
        end if;
        insert into public.product_identifiers (
          store_id, product_id, identifier_type, identifier_value,
          is_scannable, is_primary, is_active
        ) values (
          target_store_id, product_id, identifier_type, identifier_content,
          identifier_scannable, identifier_primary, true
        ) on conflict (store_id, product_id, identifier_type, normalized_value) where is_active do update
          set is_scannable = excluded.is_scannable,
              is_primary = excluded.is_primary,
              updated_at = clock_timestamp();
        identifier_count := identifier_count + 1;
      end loop;
    end loop;
  end loop;

  return pg_catalog.jsonb_build_object(
    'families_applied', family_count,
    'variants_applied', variant_count,
    'identifiers_applied', identifier_count
  );
end;
$$;

revoke all on function public.apply_retail_catalog_relations(uuid, jsonb) from public, anon;
grant execute on function public.apply_retail_catalog_relations(uuid, jsonb) to authenticated;

-- Category relations are deliberately applied after the creation-only
-- activation inserted the category rows. This keeps parent external IDs stable
-- without turning the activation RPC into an order-dependent nested insert.
create or replace function public.apply_migration_category_relations(
  target_store_id uuid,
  relations_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  activation_id uuid;
  categories jsonb;
  category_relation jsonb;
  category_external_id text;
  parent_external_id text;
  resolved_category_id uuid;
  resolved_parent_id uuid;
  applied_count integer := 0;
begin
  if not private.has_store_role(target_store_id, array['owner', 'manager']) then
    raise exception using errcode = '42501', message = 'migration-category:not-authorized';
  end if;
  if pg_catalog.jsonb_typeof(relations_payload) <> 'object' then
    raise exception using errcode = '22023', message = 'migration-category:activation-payload-required';
  end if;
  activation_id := nullif(relations_payload ->> 'activationId', '')::uuid;
  categories := relations_payload -> 'categories';
  if pg_catalog.jsonb_typeof(categories) is distinct from 'array' then
    raise exception using errcode = '22023', message = 'migration-category:categories-array-required';
  end if;
  if activation_id is null or not exists (
    select 1
    from private.migration_activations as activation
    where activation.id = activation_id
      and activation.store_id = target_store_id
      and activation.status in ('active', 'locked')
  ) then
    raise exception using errcode = '22023', message = 'migration-category:active-migration-required';
  end if;

  for category_relation in
    select value from pg_catalog.jsonb_array_elements(categories)
  loop
    if pg_catalog.jsonb_typeof(category_relation) <> 'object' then
      raise exception using errcode = '22023', message = 'migration-category:category-object-required';
    end if;
    category_external_id := nullif(pg_catalog.btrim(category_relation ->> 'id'), '');
    parent_external_id := nullif(pg_catalog.btrim(category_relation ->> 'parentId'), '');
    if category_external_id is null then
      raise exception using errcode = '22023', message = 'migration-category:category-id-required';
    end if;
    if not exists (
      select 1
      from private.migration_inverse_changes as inverse_change
      where inverse_change.migration_id = activation_id
        and inverse_change.entity_type = 'category'
        and inverse_change.action_type = 'delete-created'
        and inverse_change.entity_id = category_external_id
    ) then
      raise exception using errcode = '22023', message = 'migration-category:category-not-created-by-activation';
    end if;
    select category.id into resolved_category_id
    from public.categories as category
    where category.store_id = target_store_id
      and category.external_id = category_external_id;
    if resolved_category_id is null then
      raise exception using errcode = '22023', message = 'migration-category:category-not-found';
    end if;
    resolved_parent_id := null;
    if parent_external_id is not null then
      select category.id into resolved_parent_id
      from public.categories as category
      where category.store_id = target_store_id
        and category.external_id = parent_external_id;
      if resolved_parent_id is null then
        raise exception using errcode = '22023', message = 'migration-category:parent-not-found';
      end if;
    end if;
    update public.categories
    set parent_id = resolved_parent_id
    where store_id = target_store_id and id = resolved_category_id;
    applied_count := applied_count + 1;
  end loop;
  return pg_catalog.jsonb_build_object('categories_applied', applied_count);
end;
$$;

revoke all on function public.apply_migration_category_relations(uuid, jsonb) from public, anon;
grant execute on function public.apply_migration_category_relations(uuid, jsonb) to authenticated;

-- The public webshop may use the authoritative family ID for variant grouping.
-- Older catalog rows receive a default one-SKU family in this same migration,
-- so the response remains backwards compatible while removing name heuristics
-- for all relational catalog data.
create or replace function public.get_public_webshop(store_identifier text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target_store_id uuid;
  shop_settings jsonb;
  catalog jsonb;
begin
  select settings.store_id, settings.settings
    into target_store_id, shop_settings
  from public.webshop_settings as settings
  where settings.is_enabled
    and (
      lower(settings.store_id::text) = lower(btrim(store_identifier))
      or lower(coalesce(settings.subdomain, '')) = lower(btrim(store_identifier))
      or lower(coalesce(settings.custom_domain, '')) = lower(regexp_replace(btrim(store_identifier), '^https?://', '', 'i'))
      or lower(regexp_replace(coalesce(settings.custom_domain, ''), '^www\\.', '', 'i')) = lower(regexp_replace(btrim(store_identifier), '^(https?://)?www\\.', '', 'i'))
    )
  limit 1;

  if target_store_id is null and auth.uid() is not null then
    select membership.store_id, settings.settings
      into target_store_id, shop_settings
    from public.store_memberships as membership
    join public.webshop_settings as settings on settings.store_id = membership.store_id
    where membership.user_id = auth.uid()
      and membership.status = 'active'
      and settings.is_enabled
    limit 1;
  end if;

  if target_store_id is null then
    raise exception 'Deze webshop is niet beschikbaar.' using errcode = 'P0001';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', coalesce(product.external_id, product.id::text),
      'name', product.name,
      'category', product.category_name,
      'subCategory', product.subcategory,
      'sku', product.sku,
      'barcode', product.barcode,
      'priceCents', product.price_cents,
      'vatRate', product.vat_rate,
      'brand', product.brand,
      'variant', product.variant,
      'familyId', family_variant.family_id::text,
      'stockQty', product.stock_qty,
      'color', product.color,
      'productType', product.product_type,
      'isActive', product.is_active
    ) order by product.name, product.variant nulls first, product.id
  ), '[]'::jsonb)
  into catalog
  from public.products as product
  left join public.product_family_variants as family_variant
    on family_variant.store_id = product.store_id
   and family_variant.product_id = product.id
  where product.store_id = target_store_id
    and product.is_active;

  return jsonb_build_object(
    'storeId', target_store_id,
    'settings', shop_settings,
    'products', catalog
  );
end;
$$;

revoke all on function public.get_public_webshop(text) from public;
grant execute on function public.get_public_webshop(text) to anon, authenticated;

create or replace function private.refresh_product_variant_option_signature(
  target_store_id uuid,
  target_product_id uuid,
  target_family_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_signature text;
begin
  select coalesce(
    string_agg(option_value.definition_id::text || ':' || option_value.value_id::text, '|' order by option_value.definition_id),
    ''
  ) into next_signature
  from public.product_variant_option_values as option_value
  where option_value.store_id = target_store_id
    and option_value.product_id = target_product_id
    and option_value.family_id = target_family_id;

  update public.product_family_variants
  set option_signature = next_signature,
      updated_at = clock_timestamp()
  where store_id = target_store_id
    and product_id = target_product_id
    and family_id = target_family_id;
end;
$$;

create or replace function private.refresh_product_variant_option_signature_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform private.refresh_product_variant_option_signature(
      old.store_id, old.product_id, old.family_id
    );
    return null;
  end if;
  if tg_op = 'UPDATE'
     and (old.store_id, old.product_id, old.family_id)
         is distinct from (new.store_id, new.product_id, new.family_id) then
    perform private.refresh_product_variant_option_signature(
      old.store_id, old.product_id, old.family_id
    );
  end if;
  perform private.refresh_product_variant_option_signature(
    new.store_id, new.product_id, new.family_id
  );
  return null;
end;
$$;

drop trigger if exists product_variant_option_values_refresh_signature on public.product_variant_option_values;
create trigger product_variant_option_values_refresh_signature
  after insert or update or delete on public.product_variant_option_values
  for each row execute function private.refresh_product_variant_option_signature_trigger();

do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'product_families', 'product_family_variants',
    'product_family_option_definitions', 'product_family_option_values',
    'product_identifiers'
  ]
  loop
    execute format(
      'drop trigger if exists %I_set_updated_at on public.%I', target_table, target_table
    );
    execute format(
      'create trigger %I_set_updated_at before update on public.%I for each row execute function private.set_updated_at()',
      target_table, target_table
    );
  end loop;
end;
$$;

alter table public.product_families enable row level security;
alter table public.product_family_variants enable row level security;
alter table public.product_family_option_definitions enable row level security;
alter table public.product_family_option_values enable row level security;
alter table public.product_variant_option_values enable row level security;
alter table public.product_identifiers enable row level security;

-- The baseline migration revokes default table privileges for newly-created
-- tables. RLS is not a substitute for table privileges, so grant only the
-- operations the policies below deliberately constrain to authenticated users.
grant select, insert, update, delete on public.product_families,
  public.product_family_variants,
  public.product_family_option_definitions,
  public.product_family_option_values,
  public.product_variant_option_values,
  public.product_identifiers to authenticated;

do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'product_families', 'product_family_variants',
    'product_family_option_definitions', 'product_family_option_values',
    'product_variant_option_values', 'product_identifiers'
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
end;
$$;

-- The POS cache refreshes a complete family/option/identifier tuple after a
-- relation event. Register every public relation once; this is guarded because
-- Supabase rejects a duplicate publication member.
do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'product_families', 'product_family_variants',
    'product_family_option_definitions', 'product_family_option_values',
    'product_variant_option_values', 'product_identifiers'
  ]
  loop
    if not exists (
      select 1
      from pg_catalog.pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = target_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', target_table);
    end if;
  end loop;
end;
$$;

-- Every existing SKU becomes a safe one-variant family. We deliberately do
-- not infer multi-SKU families from similar names, brand or variant text.
insert into public.product_families (
  id, store_id, external_id, name, brand, category_id, is_active, created_at, updated_at
)
select
  product.id,
  product.store_id,
  null,
  product.name,
  product.brand,
  product.category_id,
  product.is_active,
  product.created_at,
  product.updated_at
from public.products as product
on conflict (store_id, id) do nothing;

insert into public.product_family_variants (
  store_id, product_id, family_id, display_name, display_order, created_at, updated_at
)
select
  product.store_id,
  product.id,
  product.id,
  product.variant,
  0,
  product.created_at,
  product.updated_at
from public.products as product
on conflict (store_id, product_id) do nothing;

commit;
