begin;

-- One bounded analytics gateway for Pace. The model never supplies SQL: it can
-- only select from a validated metric/dimension vocabulary. Every branch uses
-- static SQL, tenant membership and role-aware field restrictions.
create or replace function public.get_pace_analytics_context(
  target_store_id uuid,
  query_plan jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  actor_role text;
  store_timezone text;
  include_demo boolean;
  requested_domain text := coalesce(query_plan->>'domain', '');
  requested_measure text := coalesce(query_plan->>'measure', '');
  requested_dimension text := coalesce(query_plan->>'dimension', 'total');
  requested_period text := coalesce(query_plan#>>'{period,preset}', 'last_30_days');
  requested_sort text := case when query_plan->>'sort' = 'asc' then 'asc' else 'desc' end;
  requested_limit integer := least(25, greatest(1, coalesce((query_plan->>'limit')::integer, 10)));
  requested_search text := pg_catalog.lower(pg_catalog.left(coalesce(query_plan#>>'{filters,search}', ''), 240));
  requested_status text := pg_catalog.lower(pg_catalog.left(coalesce(query_plan#>>'{filters,status}', ''), 80));
  local_today date;
  range_start timestamptz;
  range_end timestamptz;
  previous_start timestamptz;
  previous_end timestamptz;
  custom_start text := query_plan#>>'{period,start}';
  custom_end text := query_plan#>>'{period,end}';
  result jsonb;
begin
  if actor_id is null or not private.is_store_member(target_store_id) then
    raise exception using errcode = '42501', message = 'pace-ai:forbidden:Geen toegang tot deze winkel.';
  end if;

  select membership.role, store.timezone, store.is_demo
    into actor_role, store_timezone, include_demo
  from public.store_memberships membership
  join public.stores store on store.id = membership.store_id
  where membership.store_id = target_store_id
    and membership.user_id = actor_id
    and membership.status = 'active';

  if requested_domain <> all(array['sales', 'inventory', 'customers', 'workforce', 'operations']) then
    raise exception using errcode = '22023', message = 'pace-ai:invalid-domain';
  end if;

  if requested_measure <> all(array[
    'revenue', 'gross_profit', 'margin', 'transactions', 'units', 'average_ticket', 'discount', 'refunds',
    'stock_quantity', 'stock_cost_value', 'stock_retail_value', 'days_without_sale', 'days_of_cover',
    'customer_spend', 'customer_visits', 'customer_recency', 'scheduled_hours', 'sales_per_scheduled_hour',
    'status_count', 'cash_difference', 'void_value'
  ]) then
    raise exception using errcode = '22023', message = 'pace-ai:invalid-measure';
  end if;

  if requested_dimension <> all(array[
    'total', 'weekday', 'hour', 'day', 'week', 'month', 'year', 'product', 'category', 'brand', 'supplier',
    'employee', 'payment_method', 'source', 'customer', 'status', 'reason'
  ]) then
    raise exception using errcode = '22023', message = 'pace-ai:invalid-dimension';
  end if;

  -- Cashiers can receive operational sales totals, but not customer rankings,
  -- employee comparisons, cost/margin intelligence or subscription-like owner data.
  if actor_role = 'cashier' and (
    requested_domain in ('customers', 'workforce')
    or requested_measure in ('gross_profit', 'margin', 'stock_cost_value', 'customer_spend', 'customer_visits', 'customer_recency', 'sales_per_scheduled_hour')
    or requested_dimension in ('customer', 'employee')
  ) then
    raise exception using errcode = '42501', message = 'pace-ai:role-restricted:Deze analyse vereist manager- of eigenaarstoegang.';
  end if;

  local_today := (pg_catalog.statement_timestamp() at time zone store_timezone)::date;

  case requested_period
    when 'all_time' then range_start := null; range_end := null;
    when 'today' then range_start := local_today::timestamp at time zone store_timezone; range_end := (local_today + 1)::timestamp at time zone store_timezone;
    when 'yesterday' then range_start := (local_today - 1)::timestamp at time zone store_timezone; range_end := local_today::timestamp at time zone store_timezone;
    when 'last_7_days' then range_start := (local_today - 6)::timestamp at time zone store_timezone; range_end := (local_today + 1)::timestamp at time zone store_timezone;
    when 'last_30_days' then range_start := (local_today - 29)::timestamp at time zone store_timezone; range_end := (local_today + 1)::timestamp at time zone store_timezone;
    when 'last_60_days' then range_start := (local_today - 59)::timestamp at time zone store_timezone; range_end := (local_today + 1)::timestamp at time zone store_timezone;
    when 'last_90_days' then range_start := (local_today - 89)::timestamp at time zone store_timezone; range_end := (local_today + 1)::timestamp at time zone store_timezone;
    when 'this_week' then range_start := pg_catalog.date_trunc('week', local_today::timestamp) at time zone store_timezone; range_end := (local_today + 1)::timestamp at time zone store_timezone;
    when 'last_week' then range_start := (pg_catalog.date_trunc('week', local_today::timestamp) - interval '7 days') at time zone store_timezone; range_end := pg_catalog.date_trunc('week', local_today::timestamp) at time zone store_timezone;
    when 'this_month' then range_start := pg_catalog.date_trunc('month', local_today::timestamp) at time zone store_timezone; range_end := (local_today + 1)::timestamp at time zone store_timezone;
    when 'last_month' then range_start := (pg_catalog.date_trunc('month', local_today::timestamp) - interval '1 month') at time zone store_timezone; range_end := pg_catalog.date_trunc('month', local_today::timestamp) at time zone store_timezone;
    when 'this_year' then range_start := pg_catalog.date_trunc('year', local_today::timestamp) at time zone store_timezone; range_end := (local_today + 1)::timestamp at time zone store_timezone;
    when 'last_year' then range_start := (pg_catalog.date_trunc('year', local_today::timestamp) - interval '1 year') at time zone store_timezone; range_end := pg_catalog.date_trunc('year', local_today::timestamp) at time zone store_timezone;
    when 'custom' then
      if custom_start !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$' or custom_end !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$' then
        raise exception using errcode = '22023', message = 'pace-ai:invalid-period';
      end if;
      range_start := custom_start::date::timestamp at time zone store_timezone;
      range_end := custom_end::date::timestamp at time zone store_timezone;
    else
      raise exception using errcode = '22023', message = 'pace-ai:invalid-period';
  end case;

  if range_start is not null and range_end is not null then
    previous_end := range_start;
    previous_start := range_start - (range_end - range_start);
  end if;

  if requested_domain = 'sales' and requested_dimension in ('product', 'category', 'brand', 'supplier') then
    with line_facts as (
      select
        txn.id as transaction_id,
        txn.kind,
        txn.occurred_at,
        line.product_id,
        line.product_name,
        coalesce(product.category_name, 'Ongecategoriseerd') as category_name,
        coalesce(product.brand, 'Onbekend merk') as brand,
        coalesce(product.supplier, 'Leverancier ontbreekt') as supplier,
        line.quantity,
        line.line_total_cents,
        line.unit_cost_cents,
        txn.discount_cents
      from public.transaction_lines line
      join public.transactions txn on txn.store_id = line.store_id and txn.id = line.transaction_id
      left join public.products product on product.store_id = line.store_id and product.id = line.product_id
      where line.store_id = target_store_id
        and txn.is_finalized
        and txn.kind in ('sale', 'refund')
        and (include_demo or not coalesce(txn.is_demo, false))
        and (range_start is null or txn.occurred_at >= range_start)
        and (range_end is null or txn.occurred_at < range_end)
        and (
          not exists (
            select 1 from pg_catalog.regexp_split_to_table(requested_search, '[^a-z0-9]+') token
            where pg_catalog.char_length(token) >= 3 and token <> all(array['welke','beste','slechtste','hoogste','laagste','meeste','minste','omzet','marge','winst','verkoop','product','artikel','categorie','merk','leverancier','vorige','deze','laatste','maand','week','jaar','dagen','toon','geef','heeft','hebben'])
          )
          or exists (
            select 1 from pg_catalog.regexp_split_to_table(requested_search, '[^a-z0-9]+') token
            where pg_catalog.char_length(token) >= 3
              and token <> all(array['welke','beste','slechtste','hoogste','laagste','meeste','minste','omzet','marge','winst','verkoop','product','artikel','categorie','merk','leverancier','vorige','deze','laatste','maand','week','jaar','dagen','toon','geef','heeft','hebben'])
              and pg_catalog.lower(pg_catalog.concat_ws(' ', line.product_name, product.category_name, product.brand, product.supplier, product.sku, product.variant)) like '%' || token || '%'
          )
        )
    ), decorated as (
      select facts.*,
        case requested_dimension
          when 'product' then coalesce(facts.product_id::text, pg_catalog.lower(facts.product_name))
          when 'category' then pg_catalog.lower(facts.category_name)
          when 'brand' then pg_catalog.lower(facts.brand)
          else pg_catalog.lower(facts.supplier)
        end as row_key,
        case requested_dimension
          when 'product' then facts.product_name
          when 'category' then facts.category_name
          when 'brand' then facts.brand
          else facts.supplier
        end as row_label
      from line_facts facts
    ), grouped as (
      select row_key, row_label,
        pg_catalog.sum(case when kind = 'sale' then pg_catalog.abs(line_total_cents) else -pg_catalog.abs(line_total_cents) end)::bigint as revenue_cents,
        pg_catalog.count(distinct transaction_id) filter (where kind = 'sale')::integer as transaction_count,
        pg_catalog.count(distinct transaction_id) filter (where kind = 'refund')::integer as refund_count,
        pg_catalog.sum(case when kind = 'refund' then pg_catalog.abs(line_total_cents) else 0 end)::bigint as refund_cents,
        pg_catalog.sum(case when kind = 'sale' then quantity else -pg_catalog.abs(quantity) end)::numeric as units,
        pg_catalog.sum(case
          when unit_cost_cents is null then 0
          when kind = 'sale' then pg_catalog.abs(line_total_cents) - unit_cost_cents * pg_catalog.abs(quantity)
          else -(pg_catalog.abs(line_total_cents) - unit_cost_cents * pg_catalog.abs(quantity))
        end)::bigint as gross_profit_cents,
        pg_catalog.count(*) filter (where unit_cost_cents is null)::integer as missing_cost_lines,
        pg_catalog.count(*)::integer as line_count
      from decorated
      group by row_key, row_label
    ), scored as (
      select grouped.*,
        case requested_measure
          when 'gross_profit' then gross_profit_cents::numeric
          when 'margin' then 100.0 * gross_profit_cents / nullif(revenue_cents, 0)
          when 'transactions' then transaction_count::numeric
          when 'units' then units
          when 'average_ticket' then revenue_cents::numeric / nullif(transaction_count, 0)
          when 'refunds' then refund_cents::numeric
          else revenue_cents::numeric
        end as metric_value
      from grouped
    ), bounded as (
      select * from scored
      order by
        case when requested_sort = 'asc' then metric_value end asc nulls last,
        case when requested_sort = 'desc' then metric_value end desc nulls last,
        row_label
      limit requested_limit
    )
    select pg_catalog.jsonb_build_object(
      'version', 1,
      'generatedAt', pg_catalog.statement_timestamp(),
      'timezone', store_timezone,
      'query', query_plan,
      'period', pg_catalog.jsonb_build_object('preset', requested_period, 'start', range_start, 'endExclusive', range_end),
      'basis', 'finalized sale and refund lines; refunds are netted from revenue and gross profit',
      'dataQuality', pg_catalog.jsonb_build_object(
        'costCoveragePercent', coalesce((select pg_catalog.round(100.0 * (pg_catalog.sum(line_count) - pg_catalog.sum(missing_cost_lines)) / nullif(pg_catalog.sum(line_count), 0), 1) from grouped), 0),
        'missingCostLines', coalesce((select pg_catalog.sum(missing_cost_lines) from grouped), 0)
      ),
      'rows', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'key', row_key, 'label', row_label, 'metricValue', metric_value,
        'revenueCents', revenue_cents, 'grossProfitCents', gross_profit_cents,
        'marginPercent', case when missing_cost_lines = 0 then pg_catalog.round(100.0 * gross_profit_cents / nullif(revenue_cents, 0), 1) else null end,
        'transactionCount', transaction_count, 'refundCount', refund_count, 'refundCents', refund_cents,
        'units', units, 'missingCostLines', missing_cost_lines
      ) order by case when requested_sort = 'asc' then metric_value end asc nulls last, case when requested_sort = 'desc' then metric_value end desc nulls last) from bounded), '[]'::jsonb)
    ) into result;

  elsif requested_domain = 'sales' then
    with line_rollup as (
      select line.store_id, line.transaction_id,
        pg_catalog.sum(case when line.unit_cost_cents is null then 0 else line.unit_cost_cents * pg_catalog.abs(line.quantity) end)::bigint as cost_cents,
        pg_catalog.sum(pg_catalog.abs(line.quantity))::numeric as units,
        pg_catalog.count(*) filter (where line.unit_cost_cents is null)::integer as missing_cost_lines,
        pg_catalog.count(*)::integer as line_count
      from public.transaction_lines line
      where line.store_id = target_store_id
      group by line.store_id, line.transaction_id
    ), transaction_facts as (
      select txn.*,
        coalesce(lines.cost_cents, 0) as cost_cents,
        coalesce(lines.units, 0) as units,
        coalesce(lines.missing_cost_lines, 0) as missing_cost_lines,
        coalesce(lines.line_count, 0) as line_count,
        txn.occurred_at at time zone store_timezone as local_occurred_at
      from public.transactions txn
      left join line_rollup lines on lines.store_id = txn.store_id and lines.transaction_id = txn.id
      where txn.store_id = target_store_id
        and txn.is_finalized
        and txn.kind in ('sale', 'refund')
        and (include_demo or not coalesce(txn.is_demo, false))
        and (range_start is null or txn.occurred_at >= range_start)
        and (range_end is null or txn.occurred_at < range_end)
    ), decorated as (
      select facts.*,
        case requested_dimension
          when 'weekday' then extract(isodow from local_occurred_at)::integer::text
          when 'hour' then extract(hour from local_occurred_at)::integer::text
          when 'day' then local_occurred_at::date::text
          when 'week' then pg_catalog.to_char(local_occurred_at, 'IYYY-"W"IW')
          when 'month' then pg_catalog.to_char(local_occurred_at, 'YYYY-MM')
          when 'year' then pg_catalog.to_char(local_occurred_at, 'YYYY')
          when 'employee' then coalesce(user_id::text, 'name:' || pg_catalog.lower(coalesce(user_name, 'Onbekende medewerker')))
          when 'payment_method' then coalesce(payment_method, 'Onbekend')
          when 'source' then coalesce(source, 'Onbekend')
          else 'total'
        end as row_key,
        case requested_dimension
          when 'weekday' then case extract(isodow from local_occurred_at)::integer when 1 then 'maandag' when 2 then 'dinsdag' when 3 then 'woensdag' when 4 then 'donderdag' when 5 then 'vrijdag' when 6 then 'zaterdag' else 'zondag' end
          when 'hour' then pg_catalog.lpad(extract(hour from local_occurred_at)::integer::text, 2, '0') || ':00–' || pg_catalog.lpad(((extract(hour from local_occurred_at)::integer + 1) % 24)::text, 2, '0') || ':00'
          when 'day' then pg_catalog.to_char(local_occurred_at, 'YYYY-MM-DD')
          when 'week' then pg_catalog.to_char(local_occurred_at, 'IYYY-"W"IW')
          when 'month' then pg_catalog.to_char(local_occurred_at, 'YYYY-MM')
          when 'year' then pg_catalog.to_char(local_occurred_at, 'YYYY')
          when 'employee' then coalesce(user_name, 'Onbekende medewerker')
          when 'payment_method' then coalesce(payment_method, 'Onbekend')
          when 'source' then coalesce(source, 'Onbekend')
          else 'Totaal'
        end as row_label,
        local_occurred_at::date as trading_date
      from transaction_facts facts
    ), grouped as (
      select row_key, row_label,
        pg_catalog.sum(case when kind = 'sale' then total_cents else -pg_catalog.abs(total_cents) end)::bigint as revenue_cents,
        pg_catalog.sum(case when kind = 'sale' then total_cents - cost_cents else -(pg_catalog.abs(total_cents) - cost_cents) end)::bigint as gross_profit_cents,
        pg_catalog.count(*) filter (where kind = 'sale')::integer as transaction_count,
        pg_catalog.count(*) filter (where kind = 'refund')::integer as refund_count,
        pg_catalog.sum(case when kind = 'refund' then pg_catalog.abs(total_cents) else 0 end)::bigint as refund_cents,
        pg_catalog.sum(case when kind = 'sale' then discount_cents else 0 end)::bigint as discount_cents,
        pg_catalog.sum(case when kind = 'sale' then units else -units end)::numeric as units,
        pg_catalog.count(distinct trading_date) filter (where kind = 'sale')::integer as trading_days,
        pg_catalog.sum(missing_cost_lines)::integer as missing_cost_lines,
        pg_catalog.sum(line_count)::integer as line_count
      from decorated
      group by row_key, row_label
    ), scored as (
      select grouped.*,
        case requested_measure
          when 'gross_profit' then gross_profit_cents::numeric
          when 'margin' then 100.0 * gross_profit_cents / nullif(revenue_cents, 0)
          when 'transactions' then transaction_count::numeric
          when 'units' then units
          when 'average_ticket' then revenue_cents::numeric / nullif(transaction_count, 0)
          when 'discount' then discount_cents::numeric
          when 'refunds' then refund_cents::numeric
          else case when requested_dimension = 'weekday' then revenue_cents::numeric / nullif(trading_days, 0) else revenue_cents::numeric end
        end as metric_value
      from grouped
    ), bounded as (
      select * from scored
      order by case when requested_sort = 'asc' then metric_value end asc nulls last, case when requested_sort = 'desc' then metric_value end desc nulls last, row_label
      limit requested_limit
    )
    select pg_catalog.jsonb_build_object(
      'version', 1, 'generatedAt', pg_catalog.statement_timestamp(), 'timezone', store_timezone, 'query', query_plan,
      'period', pg_catalog.jsonb_build_object('preset', requested_period, 'start', range_start, 'endExclusive', range_end),
      'basis', case when requested_dimension = 'weekday' then 'finalized sales and refunds in the store timezone; weekday ranking uses average net revenue per active trading day' else 'finalized sales and refunds in the store timezone' end,
      'dataQuality', pg_catalog.jsonb_build_object(
        'costCoveragePercent', coalesce((select pg_catalog.round(100.0 * (pg_catalog.sum(line_count) - pg_catalog.sum(missing_cost_lines)) / nullif(pg_catalog.sum(line_count), 0), 1) from grouped), 0),
        'missingCostLines', coalesce((select pg_catalog.sum(missing_cost_lines) from grouped), 0)
      ),
      'rows', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'key', row_key, 'label', row_label, 'metricValue', metric_value,
        'revenueCents', revenue_cents, 'grossProfitCents', gross_profit_cents,
        'marginPercent', case when missing_cost_lines = 0 then pg_catalog.round(100.0 * gross_profit_cents / nullif(revenue_cents, 0), 1) else null end,
        'transactionCount', transaction_count, 'refundCount', refund_count, 'refundCents', refund_cents,
        'discountCents', discount_cents, 'units', units, 'tradingDays', trading_days,
        'averageTicketCents', pg_catalog.round(revenue_cents::numeric / nullif(transaction_count, 0))
      ) order by case when requested_sort = 'asc' then metric_value end asc nulls last, case when requested_sort = 'desc' then metric_value end desc nulls last) from bounded), '[]'::jsonb)
    ) into result;

  elsif requested_domain = 'inventory' then
    with inventory_facts as (
      select product.id, product.name, product.sku, product.variant,
        coalesce(product.category_name, 'Ongecategoriseerd') as category_name,
        coalesce(product.brand, 'Onbekend merk') as brand,
        coalesce(product.supplier, 'Leverancier ontbreekt') as supplier,
        coalesce(product.stock_qty, 0) as stock_qty,
        product.min_stock_qty, product.price_cents, product.cost_price_cents,
        last_sale.last_sold_at,
        coalesce(last_sale.units_30_days, 0) as units_30_days,
        coalesce(last_sale.units_90_days, 0) as units_90_days,
        greatest(0, pg_catalog.floor(extract(epoch from (pg_catalog.statement_timestamp() - coalesce(last_sale.last_sold_at, first_stock.first_received_at, product.created_at))) / 86400))::integer as days_without_sale
      from public.products product
      left join lateral (
        select pg_catalog.max(txn.occurred_at) filter (where txn.kind = 'sale') as last_sold_at,
          coalesce(pg_catalog.sum(line.quantity) filter (where txn.kind = 'sale' and txn.occurred_at >= pg_catalog.statement_timestamp() - interval '30 days'), 0)::numeric as units_30_days,
          coalesce(pg_catalog.sum(line.quantity) filter (where txn.kind = 'sale' and txn.occurred_at >= pg_catalog.statement_timestamp() - interval '90 days'), 0)::numeric as units_90_days
        from public.transaction_lines line
        join public.transactions txn on txn.store_id = line.store_id and txn.id = line.transaction_id
        where line.store_id = target_store_id and line.product_id = product.id and txn.is_finalized and (include_demo or not coalesce(txn.is_demo, false))
      ) last_sale on true
      left join lateral (
        select pg_catalog.min(movement.occurred_at) as first_received_at from public.stock_movements movement
        where movement.store_id = target_store_id and movement.product_id = product.id and movement.quantity_delta > 0 and (include_demo or not movement.is_demo)
      ) first_stock on true
      where product.store_id = target_store_id and product.is_active and (include_demo or not product.is_demo) and product.stock_qty is not null
        and (
          not exists (
            select 1 from pg_catalog.regexp_split_to_table(requested_search, '[^a-z0-9]+') token
            where pg_catalog.char_length(token) >= 3 and token <> all(array['welke','beste','slechtste','hoogste','laagste','meeste','minste','voorraad','stock','product','artikel','categorie','merk','leverancier','dagen','cover','toon','geef','heeft','hebben','raakt'])
          )
          or exists (
            select 1 from pg_catalog.regexp_split_to_table(requested_search, '[^a-z0-9]+') token
            where pg_catalog.char_length(token) >= 3
              and token <> all(array['welke','beste','slechtste','hoogste','laagste','meeste','minste','voorraad','stock','product','artikel','categorie','merk','leverancier','dagen','cover','toon','geef','heeft','hebben','raakt'])
              and pg_catalog.lower(pg_catalog.concat_ws(' ', product.name, product.sku, product.variant, product.category_name, product.brand, product.supplier)) like '%' || token || '%'
          )
        )
    ), decorated as (
      select facts.*,
        case requested_dimension when 'category' then pg_catalog.lower(category_name) when 'supplier' then pg_catalog.lower(supplier) when 'brand' then pg_catalog.lower(brand) else id::text end as row_key,
        case requested_dimension when 'category' then category_name when 'supplier' then supplier when 'brand' then brand else name end as row_label,
        case when units_30_days > 0 then pg_catalog.round(stock_qty / nullif(units_30_days / 30.0, 0), 1) else null end as days_of_cover
      from inventory_facts facts
    ), grouped as (
      select row_key, row_label,
        pg_catalog.sum(stock_qty)::numeric as stock_quantity,
        pg_catalog.sum(case when cost_price_cents is not null then stock_qty * cost_price_cents else 0 end)::bigint as stock_cost_value_cents,
        pg_catalog.sum(stock_qty * price_cents)::bigint as stock_retail_value_cents,
        pg_catalog.max(days_without_sale)::integer as days_without_sale,
        case when requested_dimension = 'product' then pg_catalog.max(days_of_cover) else pg_catalog.round(pg_catalog.sum(stock_qty) / nullif(pg_catalog.sum(units_30_days) / 30.0, 0), 1) end as days_of_cover,
        pg_catalog.sum(units_30_days)::numeric as units_sold_30_days,
        pg_catalog.sum(units_90_days)::numeric as units_sold_90_days,
        pg_catalog.count(*)::integer as product_count,
        pg_catalog.count(*) filter (where cost_price_cents is null)::integer as missing_cost_products,
        pg_catalog.min(last_sold_at) as oldest_last_sold_at
      from decorated group by row_key, row_label
    ), scored as (
      select grouped.*,
        case requested_measure when 'stock_cost_value' then stock_cost_value_cents::numeric when 'stock_retail_value' then stock_retail_value_cents::numeric when 'days_without_sale' then days_without_sale::numeric when 'days_of_cover' then days_of_cover else stock_quantity end as metric_value
      from grouped
    ), bounded as (
      select * from scored
      order by case when requested_sort = 'asc' then metric_value end asc nulls last, case when requested_sort = 'desc' then metric_value end desc nulls last, row_label
      limit requested_limit
    )
    select pg_catalog.jsonb_build_object(
      'version', 1, 'generatedAt', pg_catalog.statement_timestamp(), 'timezone', store_timezone, 'query', query_plan,
      'period', pg_catalog.jsonb_build_object('preset', 'current_stock_with_30_and_90_day_velocity'),
      'basis', 'current product stock combined with finalized sales velocity; daysWithoutSale is not physical FIFO age',
      'dataQuality', pg_catalog.jsonb_build_object('costCoveragePercent', coalesce((select pg_catalog.round(100.0 * (pg_catalog.sum(product_count) - pg_catalog.sum(missing_cost_products)) / nullif(pg_catalog.sum(product_count), 0), 1) from grouped), 0)),
      'rows', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'key', row_key, 'label', row_label, 'metricValue', metric_value, 'productCount', product_count,
        'stockQuantity', stock_quantity, 'stockCostValueCents', stock_cost_value_cents, 'stockRetailValueCents', stock_retail_value_cents,
        'daysWithoutSale', days_without_sale, 'daysOfCover', days_of_cover, 'unitsSold30Days', units_sold_30_days,
        'unitsSold90Days', units_sold_90_days, 'oldestLastSoldAt', oldest_last_sold_at, 'missingCostProducts', missing_cost_products
      ) order by case when requested_sort = 'asc' then metric_value end asc nulls last, case when requested_sort = 'desc' then metric_value end desc nulls last) from bounded), '[]'::jsonb)
    ) into result;

  elsif requested_domain = 'customers' then
    with customer_facts as (
      select customer.id, customer.name, customer.price_group,
        coalesce(pg_catalog.sum(case when txn.kind = 'sale' then txn.total_cents else -pg_catalog.abs(txn.total_cents) end), 0)::bigint as spend_cents,
        pg_catalog.count(txn.id) filter (where txn.kind = 'sale')::integer as visit_count,
        pg_catalog.max(txn.occurred_at) filter (where txn.kind = 'sale') as last_visit_at
      from public.customers customer
      left join public.transactions txn on txn.store_id = customer.store_id and txn.customer_id = customer.id and txn.is_finalized and txn.kind in ('sale', 'refund')
        and (include_demo or not coalesce(txn.is_demo, false))
        and (range_start is null or txn.occurred_at >= range_start)
        and (range_end is null or txn.occurred_at < range_end)
      where customer.store_id = target_store_id and customer.is_active and (include_demo or not customer.is_demo)
        and (
          not exists (
            select 1 from pg_catalog.regexp_split_to_table(requested_search, '[^a-z0-9]+') token
            where pg_catalog.char_length(token) >= 3 and token <> all(array['welke','beste','slechtste','hoogste','laagste','meeste','minste','klant','customer','bezoek','aankopen','omzet','besteed','laatste','vorige','deze','maand','week','jaar','toon','geef','heeft','hebben'])
          )
          or exists (
            select 1 from pg_catalog.regexp_split_to_table(requested_search, '[^a-z0-9]+') token
            where pg_catalog.char_length(token) >= 3
              and token <> all(array['welke','beste','slechtste','hoogste','laagste','meeste','minste','klant','customer','bezoek','aankopen','omzet','besteed','laatste','vorige','deze','maand','week','jaar','toon','geef','heeft','hebben'])
              and pg_catalog.lower(customer.name) like '%' || token || '%'
          )
        )
      group by customer.id
    ), scored as (
      select facts.*,
        case when last_visit_at is null then null else greatest(0, pg_catalog.floor(extract(epoch from (pg_catalog.statement_timestamp() - last_visit_at)) / 86400))::integer end as days_since_last_visit,
        case requested_measure when 'customer_visits' then visit_count::numeric when 'customer_recency' then pg_catalog.floor(extract(epoch from (pg_catalog.statement_timestamp() - last_visit_at)) / 86400)::numeric else spend_cents::numeric end as metric_value
      from customer_facts facts
    ), bounded as (
      select * from scored
      order by case when requested_sort = 'asc' then metric_value end asc nulls last, case when requested_sort = 'desc' then metric_value end desc nulls last, name
      limit requested_limit
    )
    select pg_catalog.jsonb_build_object(
      'version', 1, 'generatedAt', pg_catalog.statement_timestamp(), 'timezone', store_timezone, 'query', query_plan,
      'period', pg_catalog.jsonb_build_object('preset', requested_period, 'start', range_start, 'endExclusive', range_end),
      'basis', 'active recognized customers linked to finalized sales and refunds; anonymous sales excluded',
      'dataQuality', pg_catalog.jsonb_build_object(
        'recognizedSalesPercent', coalesce((select pg_catalog.round(100.0 * pg_catalog.count(*) filter (where customer_id is not null) / nullif(pg_catalog.count(*), 0), 1) from public.transactions where store_id = target_store_id and is_finalized and kind = 'sale' and (include_demo or not coalesce(is_demo, false))), 0)
      ),
      'rows', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'key', id, 'label', name, 'metricValue', metric_value, 'spendCents', spend_cents,
        'visitCount', visit_count, 'lastVisitAt', last_visit_at, 'daysSinceLastVisit', days_since_last_visit, 'priceGroup', price_group
      ) order by case when requested_sort = 'asc' then metric_value end asc nulls last, case when requested_sort = 'desc' then metric_value end desc nulls last) from bounded), '[]'::jsonb)
    ) into result;

  elsif requested_domain = 'workforce' then
    with employee_sales as (
      select employee.id, employee.display_name,
        coalesce(pg_catalog.sum(txn.total_cents) filter (where txn.kind = 'sale'), 0)::bigint as revenue_cents,
        pg_catalog.count(txn.id) filter (where txn.kind = 'sale')::integer as transaction_count
      from public.workforce_employees employee
      left join public.transactions txn on txn.store_id = employee.store_id and txn.user_id = employee.user_id and txn.is_finalized and txn.kind = 'sale'
        and (include_demo or not coalesce(txn.is_demo, false)) and (range_start is null or txn.occurred_at >= range_start) and (range_end is null or txn.occurred_at < range_end)
      where employee.store_id = target_store_id and employee.employment_status = 'active'
      group by employee.id
    ), employee_roster as (
      select shift.employee_id, pg_catalog.sum(greatest(0, extract(epoch from (shift.ends_at - shift.starts_at)) / 60 - shift.break_minutes))::numeric as scheduled_minutes
      from public.workforce_shifts shift
      where shift.store_id = target_store_id and (range_start is null or shift.ends_at >= range_start) and (range_end is null or shift.starts_at < range_end)
      group by shift.employee_id
    ), scored as (
      select sales.*, coalesce(roster.scheduled_minutes, 0) as scheduled_minutes,
        case requested_measure when 'scheduled_hours' then coalesce(roster.scheduled_minutes, 0) / 60.0 when 'sales_per_scheduled_hour' then sales.revenue_cents / nullif(coalesce(roster.scheduled_minutes, 0) / 60.0, 0) else sales.revenue_cents::numeric end as metric_value
      from employee_sales sales left join employee_roster roster on roster.employee_id = sales.id
    ), bounded as (
      select * from scored order by case when requested_sort = 'asc' then metric_value end asc nulls last, case when requested_sort = 'desc' then metric_value end desc nulls last, display_name limit requested_limit
    )
    select pg_catalog.jsonb_build_object(
      'version', 1, 'generatedAt', pg_catalog.statement_timestamp(), 'timezone', store_timezone, 'query', query_plan,
      'period', pg_catalog.jsonb_build_object('preset', requested_period, 'start', range_start, 'endExclusive', range_end),
      'basis', 'finalized sales linked by user account and scheduled roster time; this is not clocked attendance',
      'dataQuality', pg_catalog.jsonb_build_object('attendanceAvailable', false),
      'rows', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'key', id, 'label', display_name, 'metricValue', metric_value, 'revenueCents', revenue_cents,
        'transactionCount', transaction_count, 'scheduledMinutes', scheduled_minutes,
        'salesPerScheduledHourCents', pg_catalog.round(revenue_cents / nullif(scheduled_minutes / 60.0, 0))
      ) order by case when requested_sort = 'asc' then metric_value end asc nulls last, case when requested_sort = 'desc' then metric_value end desc nulls last) from bounded), '[]'::jsonb)
    ) into result;

  else
    if requested_measure = 'cash_difference' then
      select pg_catalog.jsonb_build_object(
        'version', 1, 'generatedAt', pg_catalog.statement_timestamp(), 'timezone', store_timezone, 'query', query_plan,
        'period', pg_catalog.jsonb_build_object('preset', requested_period, 'start', range_start, 'endExclusive', range_end),
        'basis', 'finalized daily reports with recorded cash reconciliation',
        'rows', coalesce((select pg_catalog.jsonb_agg(payload order by metric_value desc) from (
          select pg_catalog.abs(coalesce(report.cash_difference_cents, 0))::numeric as metric_value,
            pg_catalog.jsonb_build_object('key', report.id, 'label', 'Z-rapport ' || report.report_number, 'metricValue', pg_catalog.abs(coalesce(report.cash_difference_cents, 0)), 'cashDifferenceCents', report.cash_difference_cents, 'reason', report.cash_difference_reason, 'occurredAt', report.occurred_at, 'closedBy', report.closed_by_user_name) as payload
          from public.daily_reports report where report.store_id = target_store_id and (include_demo or not report.is_demo) and (range_start is null or report.occurred_at >= range_start) and (range_end is null or report.occurred_at < range_end)
          order by metric_value desc limit requested_limit
        ) rows), '[]'::jsonb)
      ) into result;
    elsif requested_measure = 'void_value' then
      select pg_catalog.jsonb_build_object(
        'version', 1, 'generatedAt', pg_catalog.statement_timestamp(), 'timezone', store_timezone, 'query', query_plan,
        'period', pg_catalog.jsonb_build_object('preset', requested_period, 'start', range_start, 'endExclusive', range_end),
        'basis', 'recorded void entries grouped by employee or reason',
        'rows', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('key', row_key, 'label', row_label, 'metricValue', amount_cents, 'amountCents', amount_cents, 'voidCount', void_count) order by amount_cents desc) from (
          select case when requested_dimension = 'reason' then reason else by_user_id::text end as row_key, case when requested_dimension = 'reason' then reason else by_user_name end as row_label, pg_catalog.sum(amount_cents)::bigint as amount_cents, pg_catalog.count(*)::integer as void_count
          from public.void_entries where store_id = target_store_id and (include_demo or not is_demo) and (range_start is null or occurred_at >= range_start) and (range_end is null or occurred_at < range_end)
          group by row_key, row_label order by amount_cents desc limit requested_limit
        ) rows), '[]'::jsonb)
      ) into result;
    else
      with statuses as (
        select 'Webshop'::text as operation, status, pg_catalog.count(*)::integer as status_count from public.webshop_orders where store_id = target_store_id and (include_demo or not coalesce(is_demo, false)) group by status
        union all
        select 'Herstellingen', status, pg_catalog.count(*)::integer from public.service_orders where store_id = target_store_id group by status
        union all
        select 'Inkooporders', status, pg_catalog.count(*)::integer from public.purchase_orders where store_id = target_store_id and (include_demo or not is_demo) group by status
      ), bounded as (
        select * from statuses where requested_status = '' or pg_catalog.lower(status) = requested_status order by status_count desc, operation, status limit requested_limit
      )
      select pg_catalog.jsonb_build_object(
        'version', 1, 'generatedAt', pg_catalog.statement_timestamp(), 'timezone', store_timezone, 'query', query_plan,
        'period', pg_catalog.jsonb_build_object('preset', 'current_status'),
        'basis', 'current webshop, service and purchase-order statuses',
        'rows', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('key', operation || ':' || status, 'label', operation || ' · ' || status, 'metricValue', status_count, 'operation', operation, 'status', status, 'count', status_count) order by status_count desc, operation, status) from bounded), '[]'::jsonb)
      ) into result;
    end if;
  end if;

  return result;
end;
$$;

revoke all on function public.get_pace_analytics_context(uuid, jsonb) from public, anon;
grant execute on function public.get_pace_analytics_context(uuid, jsonb) to authenticated;

comment on function public.get_pace_analytics_context(uuid, jsonb) is
  'Executes a bounded, role-aware Pace analytics plan using validated dimensions and metrics; never accepts SQL.';

commit;
