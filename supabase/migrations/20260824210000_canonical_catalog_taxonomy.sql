-- One canonical catalog classification: products point at the most-specific
-- category. Root and leaf labels remain denormalized on products only for
-- backwards-compatible public catalog and historical SQL readers.

begin;

create or replace function private.validate_catalog_category_depth_and_vat()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  parent_record public.categories%rowtype;
begin
  -- Serialize category path validation per store. This lets us enforce sibling
  -- uniqueness without making a rollout fail on unrelated historical duplicates.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.store_id::text, 0));
  new.name := pg_catalog.btrim(new.name);
  if new.name = '' then
    raise exception using errcode = '22023', message = 'catalog-category:name-required:Geef de categorie een naam.';
  end if;
  if new.parent_id = new.id then
    raise exception using errcode = '23514', message = 'catalog-category:max-depth:Een categorie kan niet haar eigen bovenliggende categorie zijn.';
  end if;
  if new.parent_id is not null then
    select * into parent_record
    from public.categories as category
    where category.store_id = new.store_id and category.id = new.parent_id;
    if not found then
      raise exception using errcode = '23503', message = 'catalog-category:parent-not-found:De hoofdcategorie bestaat niet meer.';
    end if;
    if parent_record.parent_id is not null then
      raise exception using errcode = '23514', message = 'catalog-category:max-depth:Er worden maximaal hoofd- en subcategorieën ondersteund.';
    end if;
    new.vat_rate := parent_record.vat_rate;
  end if;
  if exists (
    select 1 from public.categories as sibling
    where sibling.store_id = new.store_id
      and sibling.parent_id is not distinct from new.parent_id
      and lower(pg_catalog.btrim(sibling.name)) = lower(new.name)
      and sibling.id is distinct from new.id
  ) then
    raise exception using errcode = '23505', message = 'catalog-category:duplicate:Deze categorie bestaat al op dit niveau.';
  end if;
  return new;
end;
$$;

drop trigger if exists categories_validate_depth_and_vat on public.categories;
create trigger categories_validate_depth_and_vat
  before insert or update of parent_id, name, vat_rate on public.categories
  for each row execute function private.validate_catalog_category_depth_and_vat();

create or replace function private.sync_category_product_labels()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  root_name text;
begin
  if new.parent_id is null then
    update public.products as product
    set category_name = new.name, updated_at = pg_catalog.clock_timestamp()
    where product.store_id = new.store_id and product.category_id in (
      select category.id from public.categories as category
      where category.store_id = new.store_id
        and (category.id = new.id or category.parent_id = new.id)
    );
  else
    select name into root_name from public.categories where id = new.parent_id and store_id = new.store_id;
    update public.products
    set category_name = root_name,
        subcategory = new.name,
        updated_at = pg_catalog.clock_timestamp()
    where store_id = new.store_id and category_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists categories_sync_product_labels on public.categories;
create trigger categories_sync_product_labels
  after insert or update of parent_id, name on public.categories
  for each row execute function private.sync_category_product_labels();

create or replace function private.can_activate_category(
  target_store_id uuid,
  target_category_id uuid,
  target_is_active boolean
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not target_is_active
    or private.entitlement_limit(target_store_id, 'catalog.categories') is null
    or exists (
      select 1 from public.categories
      where store_id = target_store_id and id = target_category_id and is_active
    )
    or (
      select count(*) from public.categories
      where store_id = target_store_id and is_active and parent_id is null
    ) < private.entitlement_limit(target_store_id, 'catalog.categories');
$$;

drop policy if exists categories_management_insert on public.categories;
drop policy if exists categories_management_update on public.categories;
create policy categories_management_insert
  on public.categories for insert to authenticated
  with check (
    (select private.has_store_role(store_id, array['owner', 'manager']))
    and (
      parent_id is not null
      or (select private.can_activate_category(store_id, id, is_active))
    )
  );
create policy categories_management_update
  on public.categories for update to authenticated
  using ((select private.has_store_role(store_id, array['owner', 'manager'])))
  with check (
    (select private.has_store_role(store_id, array['owner', 'manager']))
    and (
      parent_id is not null
      or (select private.can_activate_category(store_id, id, is_active))
    )
  );

-- Materialize every legacy root + subcategory label as a real child. Existing
-- leaf assignments remain untouched and are normalized in the next update.
do $$
declare
  path record;
  resolved_child_id uuid;
  resolved_external_id text;
begin
  for path in
    select product.store_id, product.category_id as root_id,
           pg_catalog.btrim(product.subcategory) as child_name,
           root.external_id as root_external_id, root.vat_rate, root.is_active
    from public.products as product
    join public.categories as root
      on root.store_id = product.store_id and root.id = product.category_id
    where nullif(pg_catalog.btrim(product.subcategory), '') is not null
      and root.parent_id is null
    group by product.store_id, product.category_id, pg_catalog.btrim(product.subcategory),
             root.external_id, root.vat_rate, root.is_active
  loop
    select category.id into resolved_child_id
    from public.categories as category
    where category.store_id = path.store_id
      and category.parent_id = path.root_id
      and lower(pg_catalog.btrim(category.name)) = lower(path.child_name);
    if resolved_child_id is null then
      resolved_external_id := coalesce(path.root_external_id, path.root_id::text)
        || '-sub-' || substr(md5(lower(path.child_name)), 1, 12);
      insert into public.categories (
        store_id, external_id, parent_id, name, vat_rate, is_active, is_demo
      ) values (
        path.store_id, resolved_external_id, path.root_id, path.child_name,
        path.vat_rate, path.is_active, false
      )
      on conflict (store_id, external_id) do update
        set parent_id = excluded.parent_id,
            name = excluded.name,
            vat_rate = excluded.vat_rate,
            is_active = excluded.is_active
      returning id into resolved_child_id;
    end if;
    update public.products
    set category_id = resolved_child_id,
        category_name = (select name from public.categories where id = path.root_id),
        subcategory = path.child_name,
        updated_at = pg_catalog.clock_timestamp()
    where store_id = path.store_id
      and category_id = path.root_id
      and lower(pg_catalog.btrim(subcategory)) = lower(path.child_name);
  end loop;
end;
$$;

-- Normalize rows that were already attached to a child by the migration hub.
update public.products as product
set category_name = root.name,
    subcategory = leaf.name,
    updated_at = pg_catalog.clock_timestamp()
from public.categories as leaf
join public.categories as root
  on root.store_id = leaf.store_id and root.id = leaf.parent_id
where product.store_id = leaf.store_id and product.category_id = leaf.id
  and (product.category_name is distinct from root.name or product.subcategory is distinct from leaf.name);

create or replace function private.normalize_product_category_labels()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  assigned public.categories%rowtype;
  parent_name text;
begin
  if new.category_id is null then return new; end if;
  select * into assigned from public.categories
  where store_id = new.store_id and id = new.category_id;
  if not found then return new; end if;
  if assigned.parent_id is null then
    new.category_name := assigned.name;
  else
    select name into parent_name from public.categories
    where store_id = new.store_id and id = assigned.parent_id;
    new.category_name := parent_name;
    new.subcategory := assigned.name;
  end if;
  return new;
end;
$$;

drop trigger if exists products_normalize_category_labels on public.products;
create trigger products_normalize_category_labels
  before insert or update of category_id, category_name, subcategory on public.products
  for each row execute function private.normalize_product_category_labels();

create or replace function public.upsert_catalog_category(
  target_store_id uuid,
  category_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  external_identifier text := nullif(pg_catalog.btrim(category_payload ->> 'id'), '');
  category_name text := nullif(pg_catalog.btrim(category_payload ->> 'name'), '');
  parent_external_identifier text := nullif(pg_catalog.btrim(category_payload ->> 'parentId'), '');
  requested_vat numeric := coalesce((category_payload ->> 'vatRate')::numeric, 21);
  requested_active boolean := coalesce((category_payload ->> 'isActive')::boolean, true);
  resolved_parent public.categories%rowtype;
  existing_category public.categories%rowtype;
  saved_category public.categories%rowtype;
begin
  if not private.has_store_role(target_store_id, array['owner', 'manager']) then
    raise exception using errcode = '42501', message = 'catalog-category:not-authorized:Alleen een eigenaar of manager kan categorieën beheren.';
  end if;
  if external_identifier is null or category_name is null then
    raise exception using errcode = '22023', message = 'catalog-category:invalid:ID en naam zijn verplicht.';
  end if;
  if requested_vat not in (0, 6, 12, 21) then
    raise exception using errcode = '22023', message = 'catalog-category:invalid-vat:Het BTW-tarief wordt niet ondersteund.';
  end if;
  if parent_external_identifier is not null then
    select * into resolved_parent from public.categories as category
    where category.store_id = target_store_id
      and category.external_id = parent_external_identifier
      and category.parent_id is null;
    if not found then
      raise exception using errcode = '23503', message = 'catalog-category:parent-not-found:De hoofdcategorie bestaat niet meer.';
    end if;
    requested_vat := resolved_parent.vat_rate;
  end if;
  select * into existing_category from public.categories as category
  where category.store_id = target_store_id and category.external_id = external_identifier
  for update;
  if parent_external_identifier is null
     and not private.can_activate_category(target_store_id, coalesce(existing_category.id, gen_random_uuid()), requested_active) then
    raise exception using errcode = '42501', message = 'catalog-category:root-limit:Het maximum aantal hoofdcategorieën voor dit plan is bereikt.';
  end if;
  insert into public.categories (
    store_id, external_id, parent_id, name, vat_rate, sort_order, is_active, is_demo
  ) values (
    target_store_id, external_identifier, resolved_parent.id, category_name, requested_vat,
    (category_payload ->> 'sortOrder')::integer, requested_active, false
  )
  on conflict (store_id, external_id) do update set
    parent_id = excluded.parent_id,
    name = excluded.name,
    vat_rate = excluded.vat_rate,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    updated_at = pg_catalog.clock_timestamp()
  returning * into saved_category;

  if saved_category.parent_id is null then
    update public.products as product
    set category_name = saved_category.name, updated_at = pg_catalog.clock_timestamp()
    where product.store_id = target_store_id and product.category_id in (
      select category.id from public.categories as category
      where category.store_id = target_store_id
        and (category.id = saved_category.id or category.parent_id = saved_category.id)
    );
    update public.categories
    set vat_rate = saved_category.vat_rate, updated_at = pg_catalog.clock_timestamp()
    where store_id = target_store_id and parent_id = saved_category.id;
  else
    update public.products
    set subcategory = saved_category.name, updated_at = pg_catalog.clock_timestamp()
    where store_id = target_store_id and category_id = saved_category.id;
  end if;

  return jsonb_build_object(
    'id', saved_category.external_id,
    'serverId', saved_category.id,
    'parentId', parent_external_identifier,
    'name', saved_category.name,
    'vatRate', saved_category.vat_rate,
    'sortOrder', saved_category.sort_order,
    'isActive', saved_category.is_active
  );
end;
$$;

create or replace function public.delete_catalog_category(
  target_store_id uuid,
  category_external_id text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_category public.categories%rowtype;
begin
  if not private.has_store_role(target_store_id, array['owner', 'manager']) then
    raise exception using errcode = '42501', message = 'catalog-category:not-authorized:Alleen een eigenaar of manager kan categorieën beheren.';
  end if;
  select * into target_category from public.categories as category
  where category.store_id = target_store_id and category.external_id = category_external_id
  for update;
  if not found then return; end if;
  if exists (select 1 from public.categories where store_id = target_store_id and parent_id = target_category.id) then
    raise exception using errcode = '23503', message = 'catalog-category:has-children:Verwijder eerst de subcategorieën.';
  end if;
  if exists (select 1 from public.products where store_id = target_store_id and category_id = target_category.id) then
    raise exception using errcode = '23503', message = 'catalog-category:in-use:Verplaats eerst de producten uit deze categorie.';
  end if;
  if exists (select 1 from public.product_families where store_id = target_store_id and category_id = target_category.id) then
    raise exception using errcode = '23503', message = 'catalog-category:family-in-use:Verplaats eerst de productfamilies uit deze categorie.';
  end if;
  delete from public.categories where store_id = target_store_id and id = target_category.id;
end;
$$;

revoke all on function public.upsert_catalog_category(uuid, jsonb) from public, anon;
revoke all on function public.delete_catalog_category(uuid, text) from public, anon;
grant execute on function public.upsert_catalog_category(uuid, jsonb) to authenticated;
grant execute on function public.delete_catalog_category(uuid, text) to authenticated;

commit;
