-- Immutable product-level snapshots and read-only server-side detail views for
-- historical Z reports. Existing report hashes are deliberately left intact:
-- this migration only derives detail from the already-linked ledger rows.

create table public.daily_report_product_lines (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  daily_report_id uuid not null,
  transaction_id uuid not null,
  transaction_line_id uuid not null,
  document_number text not null,
  occurred_at timestamptz not null,
  transaction_kind text not null check (transaction_kind in ('sale', 'refund')),
  cashier_name text,
  product_id uuid,
  product_external_id text,
  product_name text not null,
  variant text,
  sku text,
  category_name text,
  product_type text not null check (product_type in ('merchandise', 'service', 'gift-card')),
  vat_rate numeric(5,2) not null,
  quantity integer not null,
  signed_quantity integer not null,
  unit_price_cents bigint not null,
  gross_cents bigint not null,
  discount_cents bigint not null,
  net_revenue_cents bigint not null,
  vat_cents bigint not null,
  cost_cents bigint not null,
  gross_profit_cents bigint not null,
  created_at timestamptz not null default now(),
  unique (store_id, daily_report_id, transaction_line_id),
  foreign key (store_id, daily_report_id)
    references public.daily_reports(store_id, id) on delete cascade,
  foreign key (store_id, transaction_id)
    references public.transactions(store_id, id),
  foreign key (transaction_line_id)
    references public.transaction_lines(id)
);

create index daily_report_product_lines_report_idx
  on public.daily_report_product_lines (store_id, daily_report_id, occurred_at);
create index daily_report_product_lines_product_idx
  on public.daily_report_product_lines (store_id, daily_report_id, product_name);

alter table public.daily_report_product_lines enable row level security;
create policy daily_report_product_lines_member_select
  on public.daily_report_product_lines for select to authenticated
  using ((select private.is_store_member(store_id)));

-- Allocate every cent of a transaction discount and VAT deterministically over
-- its lines. The largest-remainder method makes the product totals reconcile
-- exactly with the immutable transaction totals, including refunds.
create or replace function private.snapshot_daily_report_transaction(
  target_store_id uuid,
  target_daily_report_id uuid,
  target_transaction_id uuid
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.daily_report_product_lines (
    store_id, daily_report_id, transaction_id, transaction_line_id,
    document_number, occurred_at, transaction_kind, cashier_name,
    product_id, product_external_id, product_name, variant, sku, category_name,
    product_type, vat_rate, quantity, signed_quantity, unit_price_cents,
    gross_cents, discount_cents, net_revenue_cents, vat_cents, cost_cents,
    gross_profit_cents
  )
  with source_lines as (
    select line.*,
           transaction.document_number,
           transaction.occurred_at,
           transaction.kind as transaction_kind,
           transaction.user_name as cashier_name,
           abs(transaction.discount_cents)::bigint as transaction_discount_cents,
           abs(transaction.vat_12_cents)::bigint as transaction_vat_12_cents,
           abs(transaction.vat_21_cents)::bigint as transaction_vat_21_cents,
           case when transaction.kind = 'refund' then -1::bigint else 1::bigint end as direction,
           sum(line.line_total_cents) over (partition by transaction.id)::bigint as transaction_gross_cents
    from public.transactions as transaction
    join public.transaction_lines as line
      on line.store_id = transaction.store_id
     and line.transaction_id = transaction.id
    where transaction.store_id = target_store_id
      and transaction.id = target_transaction_id
  ), discount_base as (
    select source_lines.*,
           case when transaction_gross_cents > 0
                then (transaction_discount_cents * line_total_cents) / transaction_gross_cents
                else 0 end::bigint as base_discount_cents,
           case when transaction_gross_cents > 0
                then (transaction_discount_cents * line_total_cents) % transaction_gross_cents
                else 0 end::bigint as discount_remainder
    from source_lines
  ), discount_ranked as (
    select discount_base.*,
           transaction_discount_cents - sum(base_discount_cents) over () as discount_cents_left,
           row_number() over (order by discount_remainder desc, id) as discount_rank
    from discount_base
  ), discounted as (
    select discount_ranked.*,
           (base_discount_cents + case when discount_rank <= discount_cents_left then 1 else 0 end)::bigint
             as allocated_discount_cents
    from discount_ranked
  ), vat_base as (
    select discounted.*,
           (line_total_cents - allocated_discount_cents)::bigint as net_before_vat_cents,
           sum(line_total_cents - allocated_discount_cents) over (partition by vat_rate)::bigint as vat_weight_total,
           case when vat_rate = 12 then transaction_vat_12_cents
                when vat_rate = 21 then transaction_vat_21_cents
                else 0 end::bigint as target_vat_cents
    from discounted
  ), vat_floors as (
    select vat_base.*,
           case when vat_weight_total > 0
                then (target_vat_cents * net_before_vat_cents) / vat_weight_total
                else 0 end::bigint as base_vat_cents,
           case when vat_weight_total > 0
                then (target_vat_cents * net_before_vat_cents) % vat_weight_total
                else 0 end::bigint as vat_remainder
    from vat_base
  ), vat_ranked as (
    select vat_floors.*,
           target_vat_cents - sum(base_vat_cents) over (partition by vat_rate) as vat_cents_left,
           row_number() over (partition by vat_rate order by vat_remainder desc, id) as vat_rank
    from vat_floors
  ), final_lines as (
    select vat_ranked.*,
           (base_vat_cents + case when vat_rank <= vat_cents_left then 1 else 0 end)::bigint
             as allocated_vat_cents
    from vat_ranked
  )
  select target_store_id,
         target_daily_report_id,
         target_transaction_id,
         final_lines.id,
         final_lines.document_number,
         final_lines.occurred_at,
         final_lines.transaction_kind,
         final_lines.cashier_name,
         final_lines.product_id,
         final_lines.product_external_id,
         final_lines.product_name,
         nullif(final_lines.product_snapshot ->> 'variant', ''),
         final_lines.sku,
         nullif(final_lines.product_snapshot ->> 'category', ''),
         case when final_lines.product_snapshot ->> 'productType' in ('merchandise', 'service', 'gift-card')
              then final_lines.product_snapshot ->> 'productType'
              else 'merchandise' end,
         final_lines.vat_rate,
         final_lines.quantity,
         (final_lines.direction * final_lines.quantity)::integer,
         final_lines.unit_price_cents,
         final_lines.direction * final_lines.line_total_cents,
         final_lines.direction * final_lines.allocated_discount_cents,
         final_lines.direction * final_lines.net_before_vat_cents,
         final_lines.direction * final_lines.allocated_vat_cents,
         final_lines.direction * coalesce(final_lines.unit_cost_cents, 0) * final_lines.quantity,
         final_lines.direction * (
           final_lines.net_before_vat_cents - coalesce(final_lines.unit_cost_cents, 0) * final_lines.quantity
         )
  from final_lines
  on conflict (store_id, daily_report_id, transaction_line_id) do nothing;
$$;

revoke all on function private.snapshot_daily_report_transaction(uuid, uuid, uuid) from public;

create or replace function private.snapshot_daily_report_transaction_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.snapshot_daily_report_transaction(
    new.store_id, new.daily_report_id, new.transaction_id
  );
  return new;
end;
$$;

revoke all on function private.snapshot_daily_report_transaction_trigger() from public;

create trigger daily_report_transaction_snapshot
  after insert on public.daily_report_transactions
  for each row execute function private.snapshot_daily_report_transaction_trigger();

-- Backfill all historical reports, including the 87 demo reports. This is a
-- derived snapshot only; daily_reports and their hash chain remain untouched.
do $$
declare
  report_link record;
begin
  for report_link in
    select store_id, daily_report_id, transaction_id
    from public.daily_report_transactions
    order by store_id, daily_report_id, transaction_id
  loop
    perform private.snapshot_daily_report_transaction(
      report_link.store_id,
      report_link.daily_report_id,
      report_link.transaction_id
    );
  end loop;
end;
$$;

create or replace function public.get_daily_report_detail(
  target_store_id uuid,
  target_daily_report_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if not private.is_store_member(target_store_id) then
    raise exception using errcode = '42501', message = 'report:not-authorized';
  end if;

  if not exists (
    select 1 from public.daily_reports
    where store_id = target_store_id and id = target_daily_report_id
  ) then
    raise exception using errcode = 'P0002', message = 'report:not-found';
  end if;

  select pg_catalog.jsonb_build_object(
    'report', pg_catalog.jsonb_build_object(
      'id', report.id,
      'reportNumber', report.report_number,
      'timestamp', extract(epoch from report.occurred_at) * 1000,
      'registerName', coalesce(register.name, report.totals ->> 'registerId', 'Kassa'),
      'shiftNumber', shift.shift_number,
      'openedAt', case when shift.opened_at is null then null else extract(epoch from shift.opened_at) * 1000 end,
      'closedAt', case when shift.closed_at is null then extract(epoch from report.occurred_at) * 1000 else extract(epoch from shift.closed_at) * 1000 end,
      'closedByUserName', report.closed_by_user_name,
      'transactionCount', (select count(*) from public.daily_report_transactions link where link.store_id = report.store_id and link.daily_report_id = report.id),
      'totals', report.totals,
      'openingFloatCents', report.opening_float_cents,
      'countedCashCents', report.counted_cash_cents,
      'expectedCashCents', report.expected_cash_cents,
      'cashDifferenceCents', report.cash_difference_cents,
      'cashDifferenceReason', report.cash_difference_reason,
      'hash', report.hash,
      'previousHash', report.previous_hash,
      'hashPayloadVersion', report.hash_payload_version,
      'isDemo', report.is_demo,
      'calculationAuthority', case when report.hash_payload_version >= 3 then 'server' else 'legacy' end
    ),
    'products', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'key', product.product_key,
        'productName', product.product_name,
        'variant', product.variant,
        'sku', product.sku,
        'categoryName', product.category_name,
        'productType', product.product_type,
        'vatRate', product.vat_rate,
        'soldQuantity', product.sold_quantity,
        'returnedQuantity', product.returned_quantity,
        'netQuantity', product.net_quantity,
        'grossCents', product.gross_cents,
        'discountCents', product.discount_cents,
        'netRevenueCents', product.net_revenue_cents,
        'vatCents', product.vat_cents,
        'costCents', product.cost_cents,
        'grossProfitCents', product.gross_profit_cents
      ) order by product.net_revenue_cents desc, product.product_name)
      from (
        select coalesce(product_external_id, product_id::text, product_name) || ':' || coalesce(variant, '') || ':' || vat_rate::text as product_key,
               product_name, variant, sku, category_name, product_type, vat_rate,
               sum(quantity) filter (where transaction_kind = 'sale')::bigint as sold_quantity,
               sum(quantity) filter (where transaction_kind = 'refund')::bigint as returned_quantity,
               sum(signed_quantity)::bigint as net_quantity,
               sum(gross_cents)::bigint as gross_cents,
               sum(discount_cents)::bigint as discount_cents,
               sum(net_revenue_cents)::bigint as net_revenue_cents,
               sum(vat_cents)::bigint as vat_cents,
               sum(cost_cents)::bigint as cost_cents,
               sum(gross_profit_cents)::bigint as gross_profit_cents
        from public.daily_report_product_lines
        where store_id = report.store_id and daily_report_id = report.id
        group by product_key, product_name, variant, sku, category_name, product_type, vat_rate
      ) product
    ), '[]'::jsonb),
    'transactions', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', transaction.id,
        'documentNumber', transaction.document_number,
        'timestamp', extract(epoch from transaction.occurred_at) * 1000,
        'kind', transaction.kind,
        'cashierName', transaction.user_name,
        'subtotalCents', transaction.subtotal_cents,
        'discountCents', transaction.discount_cents,
        'totalCents', transaction.total_cents,
        'vat12Cents', transaction.vat_12_cents,
        'vat21Cents', transaction.vat_21_cents,
        'paymentMethod', transaction.payment_method,
        'correctionReason', transaction.correction_reason,
        'tenders', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('method', tender.method, 'amountCents', tender.amount_cents) order by tender.method) from public.transaction_tenders tender where tender.store_id = transaction.store_id and tender.transaction_id = transaction.id), '[]'::jsonb),
        'lines', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('productName', line.product_name, 'variant', line.variant, 'sku', line.sku, 'quantity', line.quantity, 'netRevenueCents', line.net_revenue_cents, 'vatRate', line.vat_rate) order by line.product_name) from public.daily_report_product_lines line where line.store_id = transaction.store_id and line.daily_report_id = report.id and line.transaction_id = transaction.id), '[]'::jsonb)
      ) order by transaction.occurred_at desc)
      from public.daily_report_transactions link
      join public.transactions transaction
        on transaction.store_id = link.store_id and transaction.id = link.transaction_id
      where link.store_id = report.store_id and link.daily_report_id = report.id
    ), '[]'::jsonb)
  ) into result
  from public.daily_reports report
  left join public.registers register
    on register.store_id = report.store_id and register.id = report.register_id
  left join public.register_shifts shift
    on shift.store_id = report.store_id and shift.id = report.shift_id
  where report.store_id = target_store_id and report.id = target_daily_report_id;

  return result;
end;
$$;

revoke all on function public.get_daily_report_detail(uuid, uuid) from public, anon;
grant execute on function public.get_daily_report_detail(uuid, uuid) to authenticated;

create or replace function public.get_daily_report_day_summaries(
  target_store_id uuid,
  business_timezone text default 'Europe/Brussels'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if not private.is_store_member(target_store_id) then
    raise exception using errcode = '42501', message = 'report:not-authorized';
  end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = business_timezone) then
    raise exception using errcode = '22023', message = 'report:invalid-timezone';
  end if;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'date', summary.business_date,
    'reportCount', summary.report_count,
    'firstReportNumber', summary.first_report_number,
    'lastReportNumber', summary.last_report_number,
    'transactionCount', summary.transaction_count,
    'totalRevenueCents', summary.total_revenue_cents,
    'totalCostCents', summary.total_cost_cents,
    'grossProfitCents', summary.gross_profit_cents,
    'totalVat12Cents', summary.total_vat_12_cents,
    'totalVat21Cents', summary.total_vat_21_cents,
    'cashCents', summary.cash_cents,
    'pinCents', summary.pin_cents,
    'giftCardCents', summary.gift_card_cents,
    'cashDifferenceCents', summary.cash_difference_cents
  ) order by summary.business_date desc), '[]'::jsonb)
  into result
  from (
    select (report.occurred_at at time zone business_timezone)::date as business_date,
           count(*)::bigint as report_count,
           min(report.report_number)::bigint as first_report_number,
           max(report.report_number)::bigint as last_report_number,
           sum((select count(*) from public.daily_report_transactions link where link.store_id = report.store_id and link.daily_report_id = report.id))::bigint as transaction_count,
           sum(coalesce((report.totals ->> 'totalRevenueCents')::bigint, 0))::bigint as total_revenue_cents,
           sum(coalesce((report.totals ->> 'totalCostCents')::bigint, 0))::bigint as total_cost_cents,
           sum(coalesce((report.totals ->> 'grossProfitCents')::bigint, 0))::bigint as gross_profit_cents,
           sum(coalesce((report.totals ->> 'totalVat12Cents')::bigint, 0))::bigint as total_vat_12_cents,
           sum(coalesce((report.totals ->> 'totalVat21Cents')::bigint, 0))::bigint as total_vat_21_cents,
           sum(coalesce((report.totals -> 'paymentTotalsCents' ->> 'Cash')::bigint, 0))::bigint as cash_cents,
           sum(coalesce((report.totals -> 'paymentTotalsCents' ->> 'PIN')::bigint, 0))::bigint as pin_cents,
           sum(coalesce((report.totals -> 'paymentTotalsCents' ->> 'Cadeaubon')::bigint, 0))::bigint as gift_card_cents,
           sum(coalesce(report.cash_difference_cents, 0))::bigint as cash_difference_cents
    from public.daily_reports report
    where report.store_id = target_store_id
    group by business_date
  ) summary;
  return result;
end;
$$;

revoke all on function public.get_daily_report_day_summaries(uuid, text) from public, anon;
grant execute on function public.get_daily_report_day_summaries(uuid, text) to authenticated;
