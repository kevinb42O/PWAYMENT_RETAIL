-- Manual catalogue mutations are one transaction: products, identifiers,
-- family relations and opening balances either all commit or all roll back.
begin;

create table if not exists private.manual_catalog_mutations (
  store_id uuid not null references public.stores(id) on delete cascade,
  request_id text not null,
  request_payload jsonb not null,
  result jsonb not null,
  actor_user_id uuid references auth.users(id),
  completed_at timestamptz not null default clock_timestamp(),
  primary key (store_id, request_id),
  check (char_length(btrim(request_id)) between 1 and 240)
);
alter table private.manual_catalog_mutations enable row level security;
revoke all on table private.manual_catalog_mutations from public, anon, authenticated;

create or replace function public.upsert_manual_catalog_batch(
  target_store_id uuid,
  batch_payload jsonb
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  request_key text := nullif(btrim(batch_payload ->> 'requestId'), '');
  prior private.manual_catalog_mutations%rowtype;
  item jsonb;
  product_external_id text;
  row_product public.products%rowtype;
  was_existing boolean;
  expected_existing boolean;
  category_db_id uuid;
  category_label text;
  price_value bigint;
  cost_value bigint;
  vat_value numeric;
  stock_value integer;
  min_stock_value integer;
  active_value boolean;
  identifier jsonb;
  primary_count integer;
  family jsonb := batch_payload -> 'family';
  family_db_id uuid;
  variant jsonb;
  variant_position integer;
  option_row jsonb;
  option_definition_id uuid;
  option_value_id uuid;
  reference_option_names text[];
  current_option_names text[];
  archive_id text;
  product_total integer := 0;
  variant_total integer := 0;
  opening_total integer := 0;
  response jsonb;
begin
  if actor_id is null or not private.has_store_role(target_store_id, array['owner','manager']) then
    raise exception using errcode = '42501', message = 'retail-catalog:not-authorized:Alleen een manager of eigenaar kan de catalogus aanpassen.';
  end if;
  if jsonb_typeof(batch_payload) is distinct from 'object' or request_key is null or char_length(request_key) > 240 then
    raise exception using errcode = '22023', message = 'retail-catalog:invalid-request:De catalogusopdracht mist een geldige referentie.';
  end if;
  if jsonb_typeof(batch_payload -> 'products') is distinct from 'array'
     or jsonb_array_length(batch_payload -> 'products') not between 1 and 200
     or jsonb_typeof(batch_payload -> 'existingProductExternalIds') is distinct from 'array' then
    raise exception using errcode = '22023', message = 'retail-catalog:invalid-products:Voeg per opdracht maximaal 100 actieve en 100 gearchiveerde varianten toe.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_store_id::text || ':catalog:' || request_key, 0));
  select * into prior from private.manual_catalog_mutations
  where store_id = target_store_id and request_id = request_key;
  if found then
    if prior.request_payload is distinct from batch_payload then
      raise exception using errcode = '22023', message = 'retail-catalog:idempotency-conflict:Deze referentie werd al met andere gegevens gebruikt.';
    end if;
    return prior.result;
  end if;
  if exists (
    select 1 from jsonb_array_elements(batch_payload -> 'products') candidate
    group by lower(btrim(candidate ->> 'id')) having count(*) > 1
  ) then
    raise exception using errcode = '22023', message = 'retail-catalog:duplicate-product:Hetzelfde product staat meer dan één keer in de opdracht.';
  end if;

  for item in select value from jsonb_array_elements(batch_payload -> 'products') loop
    product_external_id := nullif(btrim(item ->> 'id'), '');
    if product_external_id is null or char_length(product_external_id) > 320
       or nullif(btrim(item ->> 'name'), '') is null
       or nullif(btrim(item ->> 'category'), '') is null then
      raise exception using errcode = '22023', message = 'retail-catalog:product-identity:Naam, product-ID en categorie zijn verplicht.';
    end if;
    begin
      price_value := (item ->> 'priceCents')::bigint;
      cost_value := case when item ? 'costPriceCents' and item ->> 'costPriceCents' is not null then (item ->> 'costPriceCents')::bigint end;
      vat_value := (item ->> 'vatRate')::numeric;
      stock_value := case when item ? 'stockQty' and item ->> 'stockQty' is not null then (item ->> 'stockQty')::integer end;
      min_stock_value := case when item ? 'minStockQty' and item ->> 'minStockQty' is not null then (item ->> 'minStockQty')::integer end;
      active_value := coalesce((item ->> 'isActive')::boolean, true);
    exception when invalid_text_representation or numeric_value_out_of_range then
      raise exception using errcode = '22023', message = 'retail-catalog:invalid-number:Controleer prijs, btw en voorraad.';
    end;
    if price_value is null or price_value <= 0 or coalesce(cost_value, 0) < 0
       or vat_value is null or vat_value not in (0,6,12,21)
       or coalesce(stock_value, 0) < 0 or coalesce(min_stock_value, 0) < 0 then
      raise exception using errcode = '22023', message = 'retail-catalog:invalid-values:Prijs, btw of voorraad is ongeldig.';
    end if;
    if coalesce(nullif(item ->> 'productType',''), 'merchandise') <> 'merchandise' then
      raise exception using errcode = '22023', message = 'retail-catalog:special-product:Gebruik de gespecialiseerde workflow voor diensten en cadeaubonnen.';
    end if;
    select category.id, category.name into category_db_id, category_label
    from public.categories as category
    where category.store_id = target_store_id and category.external_id = item ->> 'category';
    if category_db_id is null then
      raise exception using errcode = '22023', message = 'retail-catalog:category-not-found:De gekozen categorie bestaat niet meer.';
    end if;

    select * into row_product from public.products as product
    where product.store_id = target_store_id and product.external_id = product_external_id for update;
    was_existing := found;
    expected_existing := exists (
      select 1 from jsonb_array_elements_text(batch_payload -> 'existingProductExternalIds') expected
      where expected = product_external_id
    );
    if was_existing <> expected_existing then
      raise exception using errcode = '40001', message = case when was_existing
        then 'retail-catalog:create-conflict:Dit product werd ondertussen op een ander toestel aangemaakt. Vernieuw de catalogus.'
        else 'retail-catalog:update-conflict:Dit product bestaat niet meer op de server. Vernieuw de catalogus.' end;
    end if;

    if was_existing then
      update public.products set
        category_id = category_db_id, category_name = category_label,
        name = btrim(item ->> 'name'), subcategory = nullif(btrim(item ->> 'subCategory'), ''),
        sku = nullif(btrim(item ->> 'sku'), ''), barcode = nullif(btrim(item ->> 'barcode'), ''),
        price_cents = price_value, cost_price_cents = cost_value, vat_rate = vat_value,
        brand = nullif(btrim(item ->> 'brand'), ''), supplier = nullif(btrim(item ->> 'supplier'), ''),
        supplier_code = nullif(btrim(item ->> 'supplierCode'), ''), variant = nullif(btrim(item ->> 'variant'), ''),
        price_tiers = coalesce(item -> 'priceTiers', '{}'::jsonb), custom_fields = coalesce(item -> 'customFields', '{}'::jsonb),
        min_stock_qty = min_stock_value, color = nullif(btrim(item ->> 'color'), ''),
        is_active = active_value, updated_at = clock_timestamp()
      where store_id = target_store_id and id = row_product.id returning * into row_product;
    else
      insert into public.products (
        store_id, external_id, category_id, category_name, name, subcategory, sku, barcode,
        price_cents, cost_price_cents, vat_rate, brand, supplier, supplier_code, variant,
        price_tiers, custom_fields, stock_qty, min_stock_qty, color, product_type, is_active, is_demo
      ) values (
        target_store_id, product_external_id, category_db_id, category_label, btrim(item ->> 'name'), nullif(btrim(item ->> 'subCategory'), ''),
        nullif(btrim(item ->> 'sku'), ''), nullif(btrim(item ->> 'barcode'), ''), price_value, cost_value, vat_value,
        nullif(btrim(item ->> 'brand'), ''), nullif(btrim(item ->> 'supplier'), ''), nullif(btrim(item ->> 'supplierCode'), ''),
        nullif(btrim(item ->> 'variant'), ''), coalesce(item -> 'priceTiers', '{}'::jsonb), coalesce(item -> 'customFields', '{}'::jsonb),
        case when stock_value is null then null else 0 end, min_stock_value, nullif(btrim(item ->> 'color'), ''),
        'merchandise', active_value, false
      ) returning * into row_product;
    end if;

    if jsonb_typeof(coalesce(item -> 'identifiers', '[]'::jsonb)) <> 'array' then
      raise exception using errcode = '22023', message = 'retail-catalog:invalid-identifiers:De productcodes hebben een ongeldig formaat.';
    end if;
    update public.product_identifiers set is_active = false, is_primary = false, updated_at = clock_timestamp()
    where store_id = target_store_id and product_id = row_product.id and is_active;
    primary_count := 0;
    for identifier in select value from jsonb_array_elements(coalesce(item -> 'identifiers', '[]'::jsonb)) loop
      if identifier ->> 'type' not in ('internal-sku','ean','upc','gtin','supplier-code','alternate')
         or nullif(btrim(identifier ->> 'value'), '') is null then
        raise exception using errcode = '22023', message = 'retail-catalog:invalid-identifier:Controleer SKU, barcode en leverancierscode.';
      end if;
      primary_count := primary_count + case when coalesce((identifier ->> 'isPrimary')::boolean, false) then 1 else 0 end;
      if primary_count > 1 then
        raise exception using errcode = '22023', message = 'retail-catalog:multiple-primary:Kies maximaal één primaire productcode.';
      end if;
      insert into public.product_identifiers (
        store_id, product_id, identifier_type, identifier_value, is_scannable, is_primary, is_active
      ) values (
        target_store_id, row_product.id, identifier ->> 'type', btrim(identifier ->> 'value'),
        coalesce((identifier ->> 'isScannable')::boolean, false), coalesce((identifier ->> 'isPrimary')::boolean, false), true
      ) on conflict (store_id, product_id, identifier_type, normalized_value) where is_active
        do update set is_scannable = excluded.is_scannable, is_primary = excluded.is_primary, updated_at = clock_timestamp();
    end loop;
    if not was_existing and stock_value is not null then
      perform public.record_inventory_adjustment(target_store_id, jsonb_build_object(
        'client_request_id', request_key || ':' || product_external_id || ':opening', 'product_id', product_external_id,
        'expected_stock_qty', 0, 'counted_stock_qty', stock_value, 'reason', 'opening-balance',
        'note', 'Openingsvoorraad bij catalogusaanmaak'));
      opening_total := opening_total + 1;
    end if;
    product_total := product_total + 1;
  end loop;

  if family is not null then
    if jsonb_typeof(family) <> 'object' or jsonb_typeof(family -> 'variants') <> 'array'
       or jsonb_array_length(family -> 'variants') not between 1 and 100 then
      raise exception using errcode = '22023', message = 'retail-catalog:invalid-family:De productfamilie moet 1 tot 100 varianten bevatten.';
    end if;
    if jsonb_typeof(coalesce(family -> 'archiveProductExternalIds', '[]'::jsonb)) <> 'array' then
      raise exception using errcode = '22023', message = 'retail-catalog:invalid-archive:De lijst met gearchiveerde varianten is ongeldig.';
    end if;
    if exists (
      select 1 from jsonb_array_elements(family -> 'variants') as incoming_variant(value)
      group by lower(btrim(incoming_variant.value ->> 'productExternalId')) having count(*) > 1
    ) then
      raise exception using errcode = '22023', message = 'retail-catalog:duplicate-variant-product:Dezelfde variant staat meer dan één keer in de familie.';
    end if;
    if exists (
      select 1
      from jsonb_array_elements(family -> 'variants') as incoming_variant(value)
      join jsonb_array_elements_text(coalesce(family -> 'archiveProductExternalIds', '[]'::jsonb)) as archived(external_id)
        on archived.external_id = incoming_variant.value ->> 'productExternalId'
    ) then
      raise exception using errcode = '22023', message = 'retail-catalog:variant-archive-conflict:Een actieve variant kan niet tegelijk worden gearchiveerd.';
    end if;
    begin family_db_id := nullif(btrim(family ->> 'familyId'), '')::uuid;
    exception when invalid_text_representation then
      raise exception using errcode = '22023', message = 'retail-catalog:invalid-family-id:De familiereferentie is ongeldig.'; end;
    select category.id into category_db_id from public.categories as category
    where category.store_id = target_store_id and category.external_id = family ->> 'categoryExternalId';
    if family_db_id is null or nullif(btrim(family ->> 'name'), '') is null or category_db_id is null then
      raise exception using errcode = '22023', message = 'retail-catalog:family-identity:Familienaam en categorie zijn verplicht.';
    end if;
    insert into public.product_families (id, store_id, name, brand, category_id, is_active)
    values (family_db_id, target_store_id, btrim(family ->> 'name'), nullif(btrim(family ->> 'brand'), ''), category_db_id, true)
    on conflict (store_id, id) do update set name = excluded.name, brand = excluded.brand,
      category_id = excluded.category_id, is_active = true, updated_at = clock_timestamp();

    for variant, variant_position in
      select value, ordinality::integer from jsonb_array_elements(family -> 'variants') with ordinality
    loop
      product_external_id := nullif(btrim(variant ->> 'productExternalId'), '');
      select * into row_product from public.products as product
      where product.store_id = target_store_id and product.external_id = product_external_id;
      if not found or not exists (
        select 1 from jsonb_array_elements(batch_payload -> 'products') product_item
        where product_item ->> 'id' = product_external_id
          and coalesce((product_item ->> 'isActive')::boolean, true)
      ) then raise exception using errcode = '22023', message = 'retail-catalog:variant-product:Een variant ontbreekt in de productopdracht.'; end if;
      if jsonb_typeof(variant -> 'options') <> 'array' or jsonb_array_length(variant -> 'options') = 0 then
        raise exception using errcode = '22023', message = 'retail-catalog:variant-options:Elke variant heeft minstens één optie nodig.';
      end if;
      select array_agg(lower(btrim(option_item ->> 'name')) order by lower(btrim(option_item ->> 'name')))
      into current_option_names from jsonb_array_elements(variant -> 'options') option_item;
      if array_length(current_option_names, 1) <> (
        select count(distinct lower(btrim(option_item ->> 'name'))) from jsonb_array_elements(variant -> 'options') option_item
      ) then raise exception using errcode = '22023', message = 'retail-catalog:duplicate-option:Een variantgroep komt dubbel voor.'; end if;
      if reference_option_names is null then reference_option_names := current_option_names;
      elsif reference_option_names is distinct from current_option_names then
        raise exception using errcode = '22023', message = 'retail-catalog:inconsistent-options:Alle varianten moeten dezelfde variantgroepen gebruiken.';
      end if;

      delete from public.product_variant_option_values where store_id = target_store_id and product_id = row_product.id;
      insert into public.product_family_variants (store_id, product_id, family_id, display_name, display_order, option_signature)
      values (target_store_id, row_product.id, family_db_id, nullif(btrim(variant ->> 'displayName'), ''), variant_position - 1, '')
      on conflict (store_id, product_id) do update set family_id = excluded.family_id, display_name = excluded.display_name,
        display_order = excluded.display_order, option_signature = '', updated_at = clock_timestamp();
      delete from public.product_families default_family where default_family.store_id = target_store_id
        and default_family.id = row_product.id and default_family.id <> family_db_id
        and not exists (select 1 from public.product_family_variants existing_variant
          where existing_variant.store_id = target_store_id and existing_variant.family_id = default_family.id);

      for option_row in select value from jsonb_array_elements(variant -> 'options') loop
        if nullif(btrim(option_row ->> 'name'), '') is null or nullif(btrim(option_row ->> 'value'), '') is null then
          raise exception using errcode = '22023', message = 'retail-catalog:option-value:Variantgroep en waarde zijn verplicht.';
        end if;
        insert into public.product_family_option_definitions (store_id, family_id, name, is_active)
        values (target_store_id, family_db_id, btrim(option_row ->> 'name'), true)
        on conflict (store_id, family_id, normalized_name) do update set name = excluded.name, is_active = true, updated_at = clock_timestamp()
        returning id into option_definition_id;
        insert into public.product_family_option_values (store_id, family_id, definition_id, value, is_active)
        values (target_store_id, family_db_id, option_definition_id, btrim(option_row ->> 'value'), true)
        on conflict (store_id, definition_id, normalized_value) do update set value = excluded.value, is_active = true, updated_at = clock_timestamp()
        returning id into option_value_id;
        insert into public.product_variant_option_values (store_id, product_id, family_id, definition_id, value_id)
        values (target_store_id, row_product.id, family_db_id, option_definition_id, option_value_id)
        on conflict (store_id, product_id, definition_id) do update set value_id = excluded.value_id;
      end loop;
      variant_total := variant_total + 1;
    end loop;

    for archive_id in select value from jsonb_array_elements_text(coalesce(family -> 'archiveProductExternalIds', '[]'::jsonb)) loop
      if not exists (
        select 1 from jsonb_array_elements(batch_payload -> 'products') as archived_product(value)
        where archived_product.value ->> 'id' = archive_id
          and not coalesce((archived_product.value ->> 'isActive')::boolean, true)
      ) then
        raise exception using errcode = '22023', message = 'retail-catalog:archive-product-payload:Elke gearchiveerde variant moet inactief in dezelfde productopdracht staan.';
      end if;
      update public.products product set is_active = false, updated_at = clock_timestamp()
      from public.product_family_variants relation where product.store_id = target_store_id
        and product.external_id = archive_id and relation.store_id = product.store_id
        and relation.product_id = product.id and relation.family_id = family_db_id;
      if not found then raise exception using errcode = '22023', message = 'retail-catalog:archive-not-in-family:Een variant hoort niet bij deze familie.'; end if;
    end loop;
  end if;

  response := jsonb_build_object('request_id', request_key, 'products_upserted', product_total,
    'variants_upserted', variant_total, 'opening_balances_recorded', opening_total, 'family_id', family_db_id);
  insert into private.manual_catalog_mutations (store_id, request_id, request_payload, result, actor_user_id)
  values (target_store_id, request_key, batch_payload, response, actor_id);
  return response;
end;
$$;
revoke all on function public.upsert_manual_catalog_batch(uuid, jsonb) from public, anon;
grant execute on function public.upsert_manual_catalog_batch(uuid, jsonb) to authenticated;

commit;
