begin;

-- Pace needs a bounded, decision-ready projection for slow-stock questions.
-- This deliberately exposes no supplier terms or unrestricted transaction rows:
-- only active on-hand products, their inactivity/margin metrics and aggregated
-- recent bundle candidates leave the database function.
create or replace function public.get_pace_inventory_action_context(
  target_store_id uuid,
  user_query text default ''
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  normalized_query text := pg_catalog.lower(pg_catalog.left(coalesce(user_query, ''), 240));
  include_demo boolean;
  wants_clothing boolean;
  wants_shoes boolean;
  result jsonb;
begin
  if actor_id is null or not private.is_store_member(target_store_id) then
    raise exception using errcode = '42501', message = 'pace-ai:forbidden:Geen toegang tot deze winkel.';
  end if;

  select store.is_demo into include_demo
  from public.stores store
  where store.id = target_store_id;

  wants_clothing := normalized_query ~ '(kledij|kleding|textiel|fashion|apparel)';
  wants_shoes := normalized_query ~ '(schoen|schoenen|footwear)';

  with product_activity as (
    select
      product.id,
      product.name,
      product.sku,
      coalesce(category.name, product.category_name) as category_name,
      product.variant,
      product.stock_qty,
      product.price_cents,
      product.cost_price_cents,
      product.vat_rate,
      product.created_at,
      last_sale.occurred_at as last_sold_at,
      coalesce(last_sale.occurred_at, first_stock.occurred_at, product.created_at) as inactivity_anchor
    from public.products product
    left join public.categories category
      on category.store_id = product.store_id
     and category.id = product.category_id
    left join lateral (
      select pg_catalog.max(txn.occurred_at) as occurred_at
      from public.transaction_lines line
      join public.transactions txn
        on txn.store_id = line.store_id
       and txn.id = line.transaction_id
      where line.store_id = target_store_id
        and line.product_id = product.id
        and txn.kind = 'sale'
        and txn.is_finalized
        and (include_demo or not coalesce(txn.is_demo, false))
    ) last_sale on true
    left join lateral (
      select pg_catalog.min(movement.occurred_at) as occurred_at
      from public.stock_movements movement
      where movement.store_id = target_store_id
        and movement.product_id = product.id
        and movement.quantity_delta > 0
        and (include_demo or not movement.is_demo)
    ) first_stock on true
    where product.store_id = target_store_id
      and product.is_active
      and (include_demo or not product.is_demo)
      and product.stock_qty > 0
      and (
        (not wants_clothing and not wants_shoes)
        or (wants_clothing and pg_catalog.lower(pg_catalog.concat_ws(' ', category.name, product.category_name)) ~ '(kledij|kleding|textiel|fashion|apparel)')
        or (wants_shoes and pg_catalog.lower(pg_catalog.concat_ws(' ', category.name, product.category_name)) ~ '(schoen|footwear)')
      )
  ),
  aged as (
    select
      activity.*,
      pg_catalog.greatest(0, pg_catalog.floor(extract(epoch from (pg_catalog.statement_timestamp() - activity.inactivity_anchor)) / 86400))::integer as days_without_sale,
      case
        when activity.cost_price_cents is null then null
        else pg_catalog.round(activity.price_cents * 100.0 / (100.0 + activity.vat_rate))::bigint - activity.cost_price_cents
      end as unit_gross_profit_cents,
      case
        when activity.cost_price_cents is null or activity.price_cents <= 0 then null
        else pg_catalog.round(
          100 * (
            (activity.price_cents * 100.0 / (100.0 + activity.vat_rate)) - activity.cost_price_cents
          ) / nullif(activity.price_cents * 100.0 / (100.0 + activity.vat_rate), 0),
          1
        )
      end as gross_margin_percent,
      case
        when activity.cost_price_cents is null or activity.price_cents <= 0 then null
        else pg_catalog.greatest(0, pg_catalog.least(100, pg_catalog.floor(
          100 * (1 - activity.cost_price_cents / nullif(0.75 * activity.price_cents * 100.0 / (100.0 + activity.vat_rate), 0))
        )))::integer
      end as max_discount_percent_at_25_margin
    from product_activity activity
    where activity.inactivity_anchor <= pg_catalog.statement_timestamp() - interval '60 days'
  ),
  popular_partners as (
    select
      product.id,
      product.name,
      product.sku,
      coalesce(category.name, product.category_name) as category_name,
      product.variant,
      product.stock_qty,
      product.price_cents,
      product.cost_price_cents,
      product.vat_rate,
      pg_catalog.sum(line.quantity)::bigint as units_sold_30_days
    from public.transaction_lines line
    join public.transactions txn
      on txn.store_id = line.store_id
     and txn.id = line.transaction_id
    join public.products product
      on product.store_id = line.store_id
     and product.id = line.product_id
    left join public.categories category
      on category.store_id = product.store_id
     and category.id = product.category_id
    where line.store_id = target_store_id
      and txn.kind = 'sale'
      and txn.is_finalized
      and txn.occurred_at >= pg_catalog.statement_timestamp() - interval '30 days'
      and (include_demo or not coalesce(txn.is_demo, false))
      and product.is_active
      and (include_demo or not product.is_demo)
      and product.stock_qty > 0
      and not exists (select 1 from aged aged_product where aged_product.id = product.id)
    group by product.id, category.name
    order by units_sold_30_days desc, product.name
    limit 12
  )
  select pg_catalog.jsonb_build_object(
    'basis', 'daysWithoutSale; for never-sold products, days since first stock receipt or catalog creation',
    'thresholdDays', 60,
    'requestedCategories', case
      when wants_clothing and wants_shoes then '["Kledij", "Schoenen"]'::jsonb
      when wants_clothing then '["Kledij"]'::jsonb
      when wants_shoes then '["Schoenen"]'::jsonb
      else '[]'::jsonb
    end,
    'agedProducts', coalesce((
      select pg_catalog.jsonb_agg(payload order by days_without_sale desc, name)
      from (
        select
          aged.name,
          aged.days_without_sale,
          pg_catalog.jsonb_build_object(
            'id', aged.id,
            'name', aged.name,
            'sku', aged.sku,
            'category', aged.category_name,
            'variant', aged.variant,
            'stockQty', aged.stock_qty,
            'daysWithoutSale', aged.days_without_sale,
            'lastSoldAt', aged.last_sold_at,
            'priceCents', aged.price_cents,
            'costPriceCents', aged.cost_price_cents,
            'stockCostValueCents', case when aged.cost_price_cents is null then null else aged.stock_qty * aged.cost_price_cents end,
            'unitGrossProfitCents', aged.unit_gross_profit_cents,
            'grossMarginPercent', aged.gross_margin_percent,
            'maxDiscountPercentAt25Margin', aged.max_discount_percent_at_25_margin
          ) as payload
        from aged
        order by aged.days_without_sale desc, aged.stock_qty desc, aged.name
        limit 25
      ) bounded
    ), '[]'::jsonb),
    'bundlePartners', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', partner.id,
        'name', partner.name,
        'sku', partner.sku,
        'category', partner.category_name,
        'variant', partner.variant,
        'stockQty', partner.stock_qty,
        'unitsSold30Days', partner.units_sold_30_days,
        'priceCents', partner.price_cents,
        'costPriceCents', partner.cost_price_cents,
        'grossMarginPercent', case
          when partner.cost_price_cents is null or partner.price_cents <= 0 then null
          else pg_catalog.round(100 * ((partner.price_cents * 100.0 / (100.0 + partner.vat_rate)) - partner.cost_price_cents) / nullif(partner.price_cents * 100.0 / (100.0 + partner.vat_rate), 0), 1)
        end
      ) order by partner.units_sold_30_days desc, partner.name)
      from popular_partners partner
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

revoke all on function public.get_pace_inventory_action_context(uuid, text) from public, anon;
grant execute on function public.get_pace_inventory_action_context(uuid, text) to authenticated;

comment on function public.get_pace_inventory_action_context(uuid, text) is
  'Returns bounded, tenant-authorized slow-stock and margin context for advisory Pace bundle answers.';

commit;
