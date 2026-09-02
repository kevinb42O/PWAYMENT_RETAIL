begin;

-- The category validation trigger runs before PostgreSQL evaluates an INSERT
-- conflict target. An INSERT ... ON CONFLICT therefore still looked like a
-- second sibling to that trigger. Update a resolved category directly; only
-- a genuinely new category goes through INSERT and sibling validation.
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
  requested_icon text := nullif(pg_catalog.btrim(category_payload ->> 'icon'), '');
  icon_was_supplied boolean := category_payload ? 'icon';
  requested_vat numeric := coalesce((category_payload ->> 'vatRate')::numeric, 21);
  requested_active boolean := coalesce((category_payload ->> 'isActive')::boolean, true);
  resolved_parent public.categories%rowtype;
  resolved_parent_id uuid := null;
  existing_category public.categories%rowtype;
  existing_category_id uuid := null;
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
  if requested_icon is not null and char_length(requested_icon) > 80 then
    raise exception using errcode = '22023', message = 'catalog-category:invalid-icon:Het icoon is ongeldig.';
  end if;

  if parent_external_identifier is not null then
    select * into resolved_parent from public.categories as category
    where category.store_id = target_store_id
      and category.external_id = parent_external_identifier
      and category.parent_id is null;
    if not found then
      raise exception using errcode = '23503', message = 'catalog-category:parent-not-found:De hoofdcategorie bestaat niet meer.';
    end if;
    resolved_parent_id := resolved_parent.id;
    requested_vat := resolved_parent.vat_rate;
  end if;

  select * into existing_category from public.categories as category
  where category.store_id = target_store_id and category.external_id = external_identifier
  for update;
  if found then
    existing_category_id := existing_category.id;
  else
    select * into existing_category from public.categories as category
    where category.store_id = target_store_id
      and category.parent_id is not distinct from resolved_parent_id
      and lower(pg_catalog.btrim(category.name)) = lower(category_name)
    for update;
    if found then
      existing_category_id := existing_category.id;
      external_identifier := existing_category.external_id;
    end if;
  end if;

  if parent_external_identifier is null
     and not private.can_activate_category(target_store_id, coalesce(existing_category_id, gen_random_uuid()), requested_active) then
    raise exception using errcode = '42501', message = 'catalog-category:root-limit:Het maximum aantal hoofdcategorieën voor dit plan is bereikt.';
  end if;

  if existing_category_id is not null then
    update public.categories as category
    set parent_id = resolved_parent_id,
        name = category_name,
        icon = case when icon_was_supplied then requested_icon else category.icon end,
        vat_rate = requested_vat,
        sort_order = (category_payload ->> 'sortOrder')::integer,
        is_active = requested_active,
        updated_at = pg_catalog.clock_timestamp()
    where category.store_id = target_store_id and category.id = existing_category_id
    returning * into saved_category;
  else
    insert into public.categories (
      store_id, external_id, parent_id, name, icon, vat_rate, sort_order, is_active, is_demo
    ) values (
      target_store_id, external_identifier, resolved_parent_id, category_name, requested_icon, requested_vat,
      (category_payload ->> 'sortOrder')::integer, requested_active, false
    )
    returning * into saved_category;
  end if;

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
    'icon', saved_category.icon,
    'vatRate', saved_category.vat_rate,
    'sortOrder', saved_category.sort_order,
    'isActive', saved_category.is_active
  );
end;
$$;

revoke all on function public.upsert_catalog_category(uuid, jsonb) from public, anon;
grant execute on function public.upsert_catalog_category(uuid, jsonb) to authenticated;

commit;
