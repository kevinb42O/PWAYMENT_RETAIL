begin;

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
      or lower(regexp_replace(coalesce(settings.custom_domain, ''), '^www\.', '', 'i')) = lower(regexp_replace(btrim(store_identifier), '^(https?://)?www\.', '', 'i'))
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
      'stockQty', product.stock_qty,
      'color', product.color,
      'productType', product.product_type,
      'isActive', product.is_active
    ) order by product.name, product.variant nulls first, product.id
  ), '[]'::jsonb)
  into catalog
  from public.products as product
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

commit;
