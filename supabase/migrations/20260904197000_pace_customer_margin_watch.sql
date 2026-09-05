begin;

-- A bounded owner/manager-only watchlist. It deliberately returns no contact
-- data, notes or transaction payloads: Pace receives only the facts required
-- to explain a customer-retention or margin signal for the current tenant.
create or replace function public.get_pace_customer_margin_watch(target_store_id uuid)
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

  select membership.role, store.is_demo
    into actor_role, include_demo
  from public.store_memberships membership
  join public.stores store on store.id = membership.store_id
  where membership.store_id = target_store_id
    and membership.user_id = actor_id
    and membership.status = 'active';

  if coalesce(actor_role, '') not in ('owner', 'manager') then
    raise exception using errcode = '42501', message = 'pace-ai:role-restricted:Customer Radar en Margin Watch vereisen manager- of eigenaarstoegang.';
  end if;

  with
  windows as (
    select
      pg_catalog.statement_timestamp() as now_at,
      pg_catalog.statement_timestamp() - interval '30 days' as current_start,
      pg_catalog.statement_timestamp() - interval '60 days' as previous_start,
      pg_catalog.statement_timestamp() - interval '90 days' as quality_start,
      pg_catalog.statement_timestamp() - interval '365 days' as lapsed_floor
  ),
  recent_sales as (
    select txn.id, txn.customer_id, txn.occurred_at, txn.total_cents, txn.discount_cents
    from public.transactions txn
    cross join windows
    where txn.store_id = target_store_id
      and txn.is_finalized
      and txn.kind = 'sale'
      and txn.occurred_at >= windows.quality_start
      and (include_demo or not coalesce(txn.is_demo, false))
  ),
  customer_sales as (
    select
      customer.id,
      customer.name,
      pg_catalog.count(txn.id)::integer as visits,
      pg_catalog.max(txn.occurred_at) as last_visit_at,
      pg_catalog.min(txn.occurred_at) as first_visit_at,
      coalesce(pg_catalog.sum(txn.total_cents), 0)::bigint as total_spend_cents,
      coalesce(pg_catalog.sum(txn.total_cents) filter (where txn.occurred_at >= windows.current_start), 0)::bigint as spend_current_30_cents,
      coalesce(pg_catalog.sum(txn.total_cents) filter (where txn.occurred_at >= windows.previous_start and txn.occurred_at < windows.current_start), 0)::bigint as spend_previous_30_cents,
      pg_catalog.count(txn.id) filter (where txn.occurred_at >= windows.current_start)::integer as visits_current_30
    from public.customers customer
    join public.transactions txn
      on txn.store_id = customer.store_id
     and txn.customer_id = customer.id
     and txn.is_finalized
     and txn.kind = 'sale'
     and (include_demo or not coalesce(txn.is_demo, false))
    cross join windows
    where customer.store_id = target_store_id
      and customer.is_active
    group by customer.id, customer.name
  ),
  customer_quality as (
    select
      pg_catalog.count(*)::integer as sale_count,
      pg_catalog.count(*) filter (where customer_id is not null)::integer as identified_sale_count,
      coalesce(pg_catalog.sum(total_cents), 0)::bigint as sales_cents,
      coalesce(pg_catalog.sum(total_cents) filter (where customer_id is not null), 0)::bigint as identified_sales_cents
    from recent_sales
  ),
  sale_lines as (
    select
      line.product_id,
      line.product_name,
      line.sku,
      line.quantity,
      line.unit_cost_cents,
      pg_catalog.round(line.line_total_cents * 100.0 / nullif(100.0 + line.vat_rate, 0))::bigint as net_revenue_cents
    from public.transaction_lines line
    join public.transactions txn
      on txn.store_id = line.store_id
     and txn.id = line.transaction_id
    cross join windows
    where line.store_id = target_store_id
      and txn.is_finalized
      and txn.kind = 'sale'
      and txn.occurred_at >= windows.current_start
      and (include_demo or not coalesce(txn.is_demo, false))
  ),
  margin_quality as (
    select
      pg_catalog.count(*)::integer as line_count,
      pg_catalog.count(*) filter (where unit_cost_cents is not null)::integer as costed_line_count,
      coalesce(pg_catalog.sum(net_revenue_cents), 0)::bigint as net_revenue_cents,
      coalesce(pg_catalog.sum(net_revenue_cents) filter (where unit_cost_cents is not null), 0)::bigint as costed_net_revenue_cents
    from sale_lines
  ),
  low_margin_products as (
    select
      product_id,
      pg_catalog.max(product_name) as name,
      pg_catalog.max(sku) as sku,
      pg_catalog.sum(quantity)::integer as units,
      pg_catalog.sum(net_revenue_cents)::bigint as net_revenue_cents,
      pg_catalog.sum(unit_cost_cents * quantity)::bigint as cost_cents,
      pg_catalog.round(100 * (pg_catalog.sum(net_revenue_cents) - pg_catalog.sum(unit_cost_cents * quantity)) / nullif(pg_catalog.sum(net_revenue_cents), 0), 1) as gross_margin_percent
    from sale_lines
    where unit_cost_cents is not null
      and product_id is not null
    group by product_id
    having pg_catalog.count(*) = pg_catalog.count(unit_cost_cents)
      and pg_catalog.sum(quantity) >= 2
      and pg_catalog.sum(net_revenue_cents) >= 5000
      and pg_catalog.round(100 * (pg_catalog.sum(net_revenue_cents) - pg_catalog.sum(unit_cost_cents * quantity)) / nullif(pg_catalog.sum(net_revenue_cents), 0), 1) <= 20
  ),
  discount_summary as (
    select
      coalesce(pg_catalog.sum(txn.discount_cents), 0)::bigint as discount_cents,
      coalesce(pg_catalog.sum(txn.total_cents), 0)::bigint as gross_sales_cents
    from public.transactions txn
    cross join windows
    where txn.store_id = target_store_id
      and txn.is_finalized
      and txn.kind = 'sale'
      and txn.occurred_at >= windows.current_start
      and (include_demo or not coalesce(txn.is_demo, false))
  ),
  refund_summary as (
    select coalesce(pg_catalog.sum(pg_catalog.abs(txn.total_cents)), 0)::bigint as refund_cents
    from public.transactions txn
    cross join windows
    where txn.store_id = target_store_id
      and txn.is_finalized
      and txn.kind = 'refund'
      and txn.occurred_at >= windows.current_start
      and (include_demo or not coalesce(txn.is_demo, false))
  ),
  customer_signals as (
    select
      'lapsed_loyal'::text as kind,
      row.id,
      row.name,
      'Vaste klant al minstens 60 dagen niet gezien'::text as title,
      pg_catalog.format('%s bezoeken, laatste aankoop %s dagen geleden.', row.visits, pg_catalog.floor(extract(epoch from (windows.now_at - row.last_visit_at)) / 86400)::integer) as detail,
      row.last_visit_at,
      row.visits,
      row.total_spend_cents,
      pg_catalog.floor(extract(epoch from (windows.now_at - row.last_visit_at)) / 86400)::integer as days_since_visit,
      'Welke vaste klanten zijn recent afgehaakt?'::text as next_question,
      1 as priority
    from customer_sales row
    cross join windows
    where row.visits >= 3
      and row.last_visit_at < windows.now_at - interval '60 days'
      and row.last_visit_at >= windows.lapsed_floor
    union all
    select
      'new_returning', row.id, row.name,
      'Nieuwe klant kwam al terug'::text,
      pg_catalog.format('%s aankopen sinds de eerste aankoop in de voorbije 30 dagen.', row.visits_current_30),
      row.last_visit_at, row.visits, row.total_spend_cents,
      pg_catalog.floor(extract(epoch from (windows.now_at - row.last_visit_at)) / 86400)::integer,
      'Welke nieuwe klanten kwamen deze maand al terug?'::text,
      2
    from customer_sales row
    cross join windows
    where row.first_visit_at >= windows.current_start
      and row.visits_current_30 >= 2
  ),
  margin_signals as (
    select
      'low_margin_product'::text as kind,
      row.product_id::text as id,
      row.name,
      'Product met lage brutomarge'::text as title,
      pg_catalog.format('%s stuks verkocht met %s%% brutomarge op €%s netto-omzet.', row.units, row.gross_margin_percent, pg_catalog.to_char(row.net_revenue_cents / 100.0, 'FM999999990D00')) as detail,
      row.net_revenue_cents as amount_cents,
      row.gross_margin_percent as ratio_percent,
      'Welke producten verkopen goed maar hebben een lage marge?'::text as next_question,
      1 as priority
    from low_margin_products row
    cross join margin_quality quality
    where quality.net_revenue_cents > 0
      and quality.costed_net_revenue_cents * 100 >= quality.net_revenue_cents * 80
    union all
    select
      'discount_pressure', 'discounts', 'Kortingen'::text,
      'Kortingen drukken merkbaar op de omzet'::text,
      pg_catalog.format('€%s korting in de voorbije 30 dagen (%s%% van de bruto-omzet).', pg_catalog.to_char(discount.discount_cents / 100.0, 'FM999999990D00'), pg_catalog.round(100 * discount.discount_cents / nullif(discount.gross_sales_cents, 0), 1)),
      discount.discount_cents,
      pg_catalog.round(100 * discount.discount_cents / nullif(discount.gross_sales_cents, 0), 1),
      'Waar geven we te veel korting weg?'::text,
      2
    from discount_summary discount
    where discount.discount_cents >= 5000
      and discount.gross_sales_cents > 0
      and discount.discount_cents * 100 >= discount.gross_sales_cents * 3
    union all
    select
      'refund_pressure', 'refunds', 'Refunds'::text,
      'Refunds vragen een financiële review'::text,
      pg_catalog.format('€%s refunds in de voorbije 30 dagen (%s%% van de bruto-omzet).', pg_catalog.to_char(refund.refund_cents / 100.0, 'FM999999990D00'), pg_catalog.round(100 * refund.refund_cents / nullif(discount.gross_sales_cents, 0), 1)),
      refund.refund_cents,
      pg_catalog.round(100 * refund.refund_cents / nullif(discount.gross_sales_cents, 0), 1),
      'Welke refunds vragen onderzoek?'::text,
      2
    from refund_summary refund
    cross join discount_summary discount
    where refund.refund_cents >= 2000
      and discount.gross_sales_cents > 0
      and refund.refund_cents * 100 >= discount.gross_sales_cents * 5
  )
  select pg_catalog.jsonb_build_object(
    'version', 1,
    'generatedAt', pg_catalog.statement_timestamp(),
    'basis', 'finalized tenant sales only; customer signals use identified sales and margin signals use net sales excluding VAT with historical line cost where available',
    'period', pg_catalog.jsonb_build_object('preset', 'last_30_days'),
    'dataQuality', pg_catalog.jsonb_build_object(
      'customerSales90Days', customer_quality.sale_count,
      'identifiedCustomerSales90Days', customer_quality.identified_sale_count,
      'customerAttributionPercent', case when customer_quality.sale_count = 0 then null else pg_catalog.round(100.0 * customer_quality.identified_sale_count / customer_quality.sale_count, 1) end,
      'marginLines30Days', margin_quality.line_count,
      'costedMarginLines30Days', margin_quality.costed_line_count,
      'costCoveragePercent', case when margin_quality.net_revenue_cents = 0 then null else pg_catalog.round(100.0 * margin_quality.costed_net_revenue_cents / margin_quality.net_revenue_cents, 1) end,
      'marginReady', margin_quality.net_revenue_cents > 0 and margin_quality.costed_net_revenue_cents * 100 >= margin_quality.net_revenue_cents * 80
    ),
    'customerSignals', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'kind', kind, 'id', id, 'name', name, 'title', title, 'detail', detail,
        'lastVisitAt', last_visit_at, 'visits', visits, 'totalSpendCents', total_spend_cents,
        'daysSinceVisit', days_since_visit, 'nextQuestion', next_question, 'priority', priority
      ) order by priority, total_spend_cents desc, name)
      from (select * from customer_signals order by priority, total_spend_cents desc, name limit 6) bounded
    ), '[]'::jsonb),
    'marginSignals', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'kind', kind, 'id', id, 'name', name, 'title', title, 'detail', detail,
        'amountCents', amount_cents, 'ratioPercent', ratio_percent, 'nextQuestion', next_question, 'priority', priority
      ) order by priority, amount_cents desc, name)
      from (select * from margin_signals order by priority, amount_cents desc, name limit 6) bounded
    ), '[]'::jsonb)
  ) into result
  from customer_quality, margin_quality;

  return result;
end;
$$;

revoke all on function public.get_pace_customer_margin_watch(uuid) from public, anon;
grant execute on function public.get_pace_customer_margin_watch(uuid) to authenticated;

alter table public.pace_evidence_items
  drop constraint if exists pace_evidence_items_source_name_check;
alter table public.pace_evidence_items
  add constraint pace_evidence_items_source_name_check check (source_name in (
    'tenant.context', 'inventory.action', 'inventory.low_stock', 'inventory.query', 'owner.briefing', 'customer.margin_watch', 'analytics.query', 'records.lookup',
    'sales.vat_breakdown', 'sales.tender_breakdown', 'gift_cards.summary', 'workforce.leave_summary',
    'inventory.location_stock', 'product.knowledge', 'ui.context'
  ));

commit;
