begin;

-- An exact stock threshold is intentionally a separate, bounded read model.
-- It avoids treating a predicate such as “minder dan drie” as a ranking.
create or replace function public.get_pace_low_stock_context(
  target_store_id uuid,
  maximum_stock_exclusive integer
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
  threshold integer := maximum_stock_exclusive;
  result jsonb;
begin
  if actor_id is null or not private.is_store_member(target_store_id) then
    raise exception using errcode = '42501', message = 'pace-ai:forbidden:Geen toegang tot deze winkel.';
  end if;
  if threshold is null or threshold < 0 or threshold > 10000 then
    raise exception using errcode = '22023', message = 'pace-ai:invalid-stock-threshold';
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
    'thresholdExclusive', threshold,
    'basis', 'current active product stock; only products with a tracked stock quantity strictly below the requested threshold',
    'rows', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', product.id,
        'name', product.name,
        'sku', product.sku,
        'variant', product.variant,
        'stockQty', product.stock_qty,
        'minStockQty', product.min_stock_qty
      ) order by product.stock_qty asc, product.name, product.variant)
      from (
        select product.*
        from public.products product
        where product.store_id = target_store_id
          and product.is_active
          and product.stock_qty is not null
          and product.stock_qty < threshold
          and (include_demo or not product.is_demo)
        order by product.stock_qty asc, product.name, product.variant
        limit 25
      ) product
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

revoke all on function public.get_pace_low_stock_context(uuid, integer) from public, anon;
grant execute on function public.get_pace_low_stock_context(uuid, integer) to authenticated;

alter table public.pace_evidence_items
  drop constraint if exists pace_evidence_items_source_name_check;
alter table public.pace_evidence_items
  add constraint pace_evidence_items_source_name_check check (source_name in (
    'tenant.context', 'inventory.action', 'inventory.low_stock', 'analytics.query', 'records.lookup',
    'sales.vat_breakdown', 'sales.tender_breakdown', 'gift_cards.summary', 'workforce.leave_summary',
    'inventory.location_stock', 'product.knowledge', 'ui.context'
  ));

commit;
