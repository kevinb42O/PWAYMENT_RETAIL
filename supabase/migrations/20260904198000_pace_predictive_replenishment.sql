begin;

-- Predictive, read-only replenishment context. Merchant-configured minimum
-- stock remains the safety floor; demand and lead time can raise that target,
-- never silently lower it. No supplier or financial action is performed here.
create or replace function public.get_pace_predictive_replenishment_context(target_store_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  actor_role text;
  include_demo boolean;
  result jsonb;
begin
  if actor_id is null or not private.is_store_member(target_store_id) then
    raise exception using errcode = '42501', message = 'pace-ai:forbidden:Geen toegang tot deze winkel.';
  end if;
  select membership.role, store.is_demo into actor_role, include_demo
  from public.store_memberships membership
  join public.stores store on store.id = membership.store_id
  where membership.store_id = target_store_id and membership.user_id = actor_id and membership.status = 'active';
  if coalesce(actor_role, '') not in ('owner', 'manager') then
    raise exception using errcode = '42501', message = 'pace-ai:role-restricted:Voorspellende bestelvoorstellen vereisen manager- of eigenaarstoegang.';
  end if;

  with
  windows as (
    select pg_catalog.statement_timestamp() as now_at,
      pg_catalog.statement_timestamp() - interval '30 days' as recent_start,
      pg_catalog.statement_timestamp() - interval '90 days' as history_start,
      pg_catalog.statement_timestamp() - interval '395 days' as seasonal_start,
      pg_catalog.statement_timestamp() - interval '365 days' as seasonal_end
  ),
  sales as (
    select line.product_id,
      coalesce(pg_catalog.sum(line.quantity) filter (where txn.occurred_at >= windows.recent_start), 0)::integer as units_30_days,
      coalesce(pg_catalog.sum(line.quantity) filter (where txn.occurred_at >= windows.history_start), 0)::integer as units_90_days,
      coalesce(pg_catalog.sum(line.quantity) filter (where txn.occurred_at >= windows.seasonal_start and txn.occurred_at < windows.seasonal_end), 0)::integer as seasonal_units_30_days
    from public.transaction_lines line
    join public.transactions txn on txn.store_id = line.store_id and txn.id = line.transaction_id
    cross join windows
    where line.store_id = target_store_id and line.product_id is not null
      and txn.is_finalized and txn.kind = 'sale' and txn.occurred_at >= windows.seasonal_start
      and (include_demo or not coalesce(txn.is_demo, false))
    group by line.product_id
  ),
  supplier_lead_times as (
    select pg_catalog.lower(pg_catalog.btrim(order_row.supplier)) as supplier_key,
      pg_catalog.count(*)::integer as receipt_sample_count,
      pg_catalog.round(percentile_cont(0.5) within group (order by extract(epoch from (order_row.received_at - order_row.ordered_at)) / 86400.0))::integer as median_lead_days
    from public.purchase_orders order_row
    where order_row.store_id = target_store_id
      and order_row.ordered_at is not null and order_row.received_at is not null
      and order_row.received_at >= order_row.ordered_at
      and order_row.received_at <= pg_catalog.statement_timestamp()
      and (include_demo or not order_row.is_demo)
    group by pg_catalog.lower(pg_catalog.btrim(order_row.supplier))
  ),
  open_orders as (
    select line.product_id, pg_catalog.sum(line.ordered_qty - line.received_qty)::integer as open_order_qty
    from public.purchase_order_lines line
    join public.purchase_orders order_row on order_row.store_id = line.store_id and order_row.id = line.purchase_order_id
    where line.store_id = target_store_id and line.product_id is not null
      and order_row.status in ('draft', 'ordered', 'partially-received')
    group by line.product_id
  ),
  forecast as (
    select product.id, product.name, product.sku, product.variant, product.supplier, product.stock_qty, product.min_stock_qty,
      coalesce(sales.units_30_days, 0) as units_30_days,
      coalesce(sales.units_90_days, 0) as units_90_days,
      coalesce(sales.seasonal_units_30_days, 0) as seasonal_units_30_days,
      coalesce(open_orders.open_order_qty, 0) as open_order_qty,
      lead.receipt_sample_count,
      case when lead.median_lead_days between 1 and 90 then lead.median_lead_days else null end as lead_time_days,
      case when coalesce(sales.units_90_days, 0) > 0 then sales.units_90_days / 90.0 else 0 end as base_daily_demand
    from public.products product
    left join sales on sales.product_id = product.id
    left join open_orders on open_orders.product_id = product.id
    left join supplier_lead_times lead on lead.supplier_key = pg_catalog.lower(pg_catalog.btrim(product.supplier))
    where product.store_id = target_store_id and product.is_active and product.stock_qty is not null
      and product.min_stock_qty is not null and nullif(pg_catalog.btrim(product.supplier), '') is not null
      and (include_demo or not product.is_demo)
  ),
  scored as (
    select forecast.*,
      case when base_daily_demand <= 0 then 1.0
        when seasonal_units_30_days >= 2 then pg_catalog.greatest(0.5, pg_catalog.least(2.0, (seasonal_units_30_days / 30.0) / base_daily_demand))
        else 1.0 end as seasonal_multiplier,
      case when lead_time_days is null or base_daily_demand <= 0 then null
        else pg_catalog.greatest(0, pg_catalog.floor(stock_qty / (base_daily_demand * case when seasonal_units_30_days >= 2 then pg_catalog.greatest(0.5, pg_catalog.least(2.0, (seasonal_units_30_days / 30.0) / base_daily_demand)) else 1.0 end)))::integer end as days_of_cover
    from forecast
  ),
  recommendations as (
    select scored.*,
      pg_catalog.ceil(base_daily_demand * seasonal_multiplier * lead_time_days)::integer as lead_time_demand_qty,
      pg_catalog.greatest(min_stock_qty, pg_catalog.ceil(base_daily_demand * seasonal_multiplier * lead_time_days)::integer) as target_stock_qty,
      case when units_90_days >= 6 and coalesce(receipt_sample_count, 0) >= 3 then 'high'
        when units_30_days >= 2 and coalesce(receipt_sample_count, 0) >= 1 then 'medium'
        else 'low' end as confidence
    from scored
    where lead_time_days is not null and base_daily_demand > 0
  )
  select pg_catalog.jsonb_build_object(
    'version', 1,
    'generatedAt', pg_catalog.statement_timestamp(),
    'basis', 'finalized sales over 90 days, same calendar window one year ago when available, actual supplier receipt lead times, current on-hand stock and open purchase quantities',
    'dataQuality', pg_catalog.jsonb_build_object(
      'leadTimeSource', 'median actual days from ordered_at to received_at per supplier; only completed orders count',
      'seasonalitySource', 'same 30-day calendar window one year earlier, used only with at least two sold units',
      'minimumStockRule', 'merchant-configured minimum stock remains the safety floor'
    ),
    'rows', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', id, 'name', name, 'sku', sku, 'variant', variant, 'supplier', supplier,
        'stockQty', stock_qty, 'minStockQty', min_stock_qty, 'openOrderQty', open_order_qty,
        'units30Days', units_30_days, 'units90Days', units_90_days, 'seasonalUnits30Days', seasonal_units_30_days,
        'seasonalMultiplier', pg_catalog.round(seasonal_multiplier, 2), 'leadTimeDays', lead_time_days,
        'leadTimeSampleCount', receipt_sample_count, 'daysOfCover', days_of_cover,
        'targetStockQty', target_stock_qty, 'recommendedQty', pg_catalog.greatest(0, target_stock_qty - stock_qty - open_order_qty),
        'confidence', confidence,
        'risk', case when days_of_cover < lead_time_days then 'stockout_before_delivery' else 'replenish' end
      ) order by case when days_of_cover < lead_time_days then 0 else 1 end, confidence desc, (target_stock_qty - stock_qty - open_order_qty) desc, name)
      from (
        select * from recommendations
        where target_stock_qty - stock_qty - open_order_qty > 0
        order by case when days_of_cover < lead_time_days then 0 else 1 end, confidence desc, (target_stock_qty - stock_qty - open_order_qty) desc, name
        limit 12
      ) bounded
    ), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

revoke all on function public.get_pace_predictive_replenishment_context(uuid) from public, anon;
grant execute on function public.get_pace_predictive_replenishment_context(uuid) to authenticated;

alter table public.pace_evidence_items drop constraint if exists pace_evidence_items_source_name_check;
alter table public.pace_evidence_items add constraint pace_evidence_items_source_name_check check (source_name in (
  'tenant.context', 'inventory.action', 'inventory.low_stock', 'inventory.query', 'owner.briefing', 'customer.margin_watch', 'predictive.replenishment', 'analytics.query', 'records.lookup',
  'sales.vat_breakdown', 'sales.tender_breakdown', 'gift_cards.summary', 'workforce.leave_summary', 'inventory.location_stock', 'product.knowledge', 'ui.context'
));
commit;
