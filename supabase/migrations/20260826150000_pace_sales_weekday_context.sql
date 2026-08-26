begin;

create or replace function public.get_pace_sales_weekday_context(
  target_store_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  store_timezone text;
  include_demo boolean;
  result jsonb;
begin
  if actor_id is null or not private.is_store_member(target_store_id) then
    raise exception using errcode = '42501', message = 'pace-ai:forbidden:Geen toegang tot deze winkel.';
  end if;

  select store.timezone, store.is_demo
    into store_timezone, include_demo
  from public.stores store
  where store.id = target_store_id;

  with sales as (
    select
      txn.occurred_at,
      (txn.occurred_at at time zone store_timezone)::date as local_sale_date,
      extract(isodow from txn.occurred_at at time zone store_timezone)::integer as weekday_iso,
      txn.total_cents
    from public.transactions txn
    where txn.store_id = target_store_id
      and txn.kind = 'sale'
      and txn.is_finalized
      and (include_demo or not coalesce(txn.is_demo, false))
  ),
  weekdays as (
    select
      sale.weekday_iso,
      case sale.weekday_iso
        when 1 then 'maandag'
        when 2 then 'dinsdag'
        when 3 then 'woensdag'
        when 4 then 'donderdag'
        when 5 then 'vrijdag'
        when 6 then 'zaterdag'
        when 7 then 'zondag'
      end as weekday,
      pg_catalog.count(distinct sale.local_sale_date)::integer as trading_days,
      pg_catalog.count(*)::integer as transaction_count,
      pg_catalog.sum(sale.total_cents)::bigint as revenue_cents,
      pg_catalog.round(pg_catalog.sum(sale.total_cents)::numeric / nullif(pg_catalog.count(distinct sale.local_sale_date), 0))::bigint as average_revenue_per_trading_day_cents,
      pg_catalog.round(pg_catalog.avg(sale.total_cents))::bigint as average_transaction_cents
    from sales sale
    group by sale.weekday_iso
  )
  select pg_catalog.jsonb_build_object(
    'basis', 'all finalized sale transactions grouped in the store timezone; refunds excluded',
    'timezone', store_timezone,
    'firstSaleAt', (select pg_catalog.min(sale.occurred_at) from sales sale),
    'lastSaleAt', (select pg_catalog.max(sale.occurred_at) from sales sale),
    'transactionCount', (select pg_catalog.count(*) from sales sale),
    'bestByAverageRevenuePerTradingDay', coalesce((
      select pg_catalog.to_jsonb(best_row)
      from weekdays best_row
      order by best_row.average_revenue_per_trading_day_cents desc, best_row.revenue_cents desc
      limit 1
    ), '{}'::jsonb),
    'bestByTotalRevenue', coalesce((
      select pg_catalog.to_jsonb(best_row)
      from weekdays best_row
      order by best_row.revenue_cents desc, best_row.average_revenue_per_trading_day_cents desc
      limit 1
    ), '{}'::jsonb),
    'weekdays', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(day_row) order by day_row.weekday_iso)
      from weekdays day_row
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

revoke all on function public.get_pace_sales_weekday_context(uuid) from public, anon;
grant execute on function public.get_pace_sales_weekday_context(uuid) to authenticated;

comment on function public.get_pace_sales_weekday_context(uuid) is
  'Returns tenant-authorized all-time finalized sales aggregates by local weekday for Pace.';

commit;
