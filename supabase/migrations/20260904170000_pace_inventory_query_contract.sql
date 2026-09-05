begin;

-- Typed, bounded inventory read contract for Pace. Natural-language planning
-- never reaches SQL: the function accepts only an enum comparison, an integer
-- and a minimum-stock flag, and always scopes reads to the caller's tenant.
create or replace function public.get_pace_inventory_query_context(
  target_store_id uuid,
  query_spec jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  include_demo boolean;
  store_timezone text;
  requested_target text := coalesce(query_spec->>'target', '');
  requested_comparison text := coalesce(query_spec#>>'{stock,comparison}', '');
  requested_quantity_raw text := query_spec#>>'{stock,quantity}';
  requested_quantity integer;
  requested_minimum text := coalesce(query_spec->>'minimumStock', '');
  requested_limit integer := case when coalesce(query_spec->>'limit', '') ~ '^[0-9]{1,2}$'
    then least(25, greatest(1, (query_spec->>'limit')::integer)) else 25 end;
  result jsonb;
begin
  if actor_id is null or not private.is_store_member(target_store_id) then
    raise exception using errcode = '42501', message = 'pace-ai:forbidden:Geen toegang tot deze winkel.';
  end if;
  if coalesce(query_spec->>'version', '') <> '1' or requested_target <> 'products' then
    raise exception using errcode = '22023', message = 'pace-ai:invalid-inventory-query';
  end if;
  if requested_comparison <> '' and requested_comparison <> all(array['lt', 'lte', 'gt', 'gte', 'eq']) then
    raise exception using errcode = '22023', message = 'pace-ai:invalid-stock-comparison';
  end if;
  if requested_comparison <> '' then
    if requested_quantity_raw !~ '^[0-9]{1,4}$' then
      raise exception using errcode = '22023', message = 'pace-ai:invalid-stock-quantity';
    end if;
    requested_quantity := requested_quantity_raw::integer;
  end if;
  if requested_minimum <> '' and requested_minimum <> all(array['below', 'at_or_below']) then
    raise exception using errcode = '22023', message = 'pace-ai:invalid-minimum-stock-filter';
  end if;
  if requested_comparison = '' and requested_minimum = '' then
    raise exception using errcode = '22023', message = 'pace-ai:empty-inventory-query';
  end if;

  select store.is_demo, store.timezone into include_demo, store_timezone
  from public.store_memberships membership
  join public.stores store on store.id = membership.store_id
  where membership.store_id = target_store_id
    and membership.user_id = actor_id
    and membership.status = 'active';

  select pg_catalog.jsonb_build_object(
    'version', 1,
    'generatedAt', pg_catalog.statement_timestamp(),
    'timezone', store_timezone,
    'query', query_spec,
    'basis', 'current active product stock; all requested predicates are applied conjunctively',
    'rows', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', product.id,
        'name', product.name,
        'sku', product.sku,
        'variant', product.variant,
        'stockQty', product.stock_qty,
        'minStockQty', product.min_stock_qty
      ) order by
        case when requested_comparison in ('gt', 'gte') then product.stock_qty end desc,
        case when requested_comparison not in ('gt', 'gte') then product.stock_qty end asc,
        product.name, product.variant)
      from (
        select product.*
        from public.products product
        where product.store_id = target_store_id
          and product.is_active
          and product.stock_qty is not null
          and (include_demo or not product.is_demo)
          and (requested_comparison = '' or (
            (requested_comparison = 'lt' and product.stock_qty < requested_quantity)
            or (requested_comparison = 'lte' and product.stock_qty <= requested_quantity)
            or (requested_comparison = 'gt' and product.stock_qty > requested_quantity)
            or (requested_comparison = 'gte' and product.stock_qty >= requested_quantity)
            or (requested_comparison = 'eq' and product.stock_qty = requested_quantity)
          ))
          and (requested_minimum = '' or (
            product.min_stock_qty is not null and (
              (requested_minimum = 'below' and product.stock_qty < product.min_stock_qty)
              or (requested_minimum = 'at_or_below' and product.stock_qty <= product.min_stock_qty)
            )
          ))
        order by
          case when requested_comparison in ('gt', 'gte') then product.stock_qty end desc,
          case when requested_comparison not in ('gt', 'gte') then product.stock_qty end asc,
          product.name, product.variant
        limit requested_limit
      ) product
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

revoke all on function public.get_pace_inventory_query_context(uuid, jsonb) from public, anon;
grant execute on function public.get_pace_inventory_query_context(uuid, jsonb) to authenticated;

alter table public.pace_evidence_items
  drop constraint if exists pace_evidence_items_source_name_check;
alter table public.pace_evidence_items
  add constraint pace_evidence_items_source_name_check check (source_name in (
    'tenant.context', 'inventory.action', 'inventory.low_stock', 'inventory.query', 'analytics.query', 'records.lookup',
    'sales.vat_breakdown', 'sales.tender_breakdown', 'gift_cards.summary', 'workforce.leave_summary',
    'inventory.location_stock', 'product.knowledge', 'ui.context'
  ));

commit;
