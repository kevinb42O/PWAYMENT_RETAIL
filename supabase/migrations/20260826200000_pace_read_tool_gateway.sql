begin;

-- A deliberately small, static read-tool gateway for Gemini-planned PACE
-- questions. The model selects only a tool name and bounded arguments; it can
-- never provide SQL, table names or a tenant identity. Every branch verifies
-- the caller's active store membership and applies role-aware projections.
create or replace function public.get_pace_read_tool_context(
  target_store_id uuid,
  tool_call jsonb
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
  include_demo boolean;
  store_timezone text;
  local_today date;
  tool_name text := coalesce(tool_call->>'name', '');
  requested_period text := coalesce(tool_call#>>'{period,preset}', 'last_30_days');
  custom_start text := tool_call#>>'{period,start}';
  custom_end text := tool_call#>>'{period,end}';
  requested_search text := pg_catalog.lower(pg_catalog.left(coalesce(tool_call->>'search', ''), 160));
  requested_status text := pg_catalog.lower(pg_catalog.left(coalesce(tool_call->>'status', ''), 80));
  requested_limit integer := case when coalesce(tool_call->>'limit', '') ~ '^[0-9]{1,3}$'
    then least(25, greatest(1, (tool_call->>'limit')::integer)) else 12 end;
  range_start timestamptz;
  range_end timestamptz;
  requested_balance_year integer;
  result jsonb;
begin
  if actor_id is null or not private.is_store_member(target_store_id) then
    raise exception using errcode = '42501', message = 'pace-ai:forbidden:Geen toegang tot deze winkel.';
  end if;

  select membership.role, store.is_demo, store.timezone
    into actor_role, include_demo, store_timezone
  from public.store_memberships membership
  join public.stores store on store.id = membership.store_id
  where membership.store_id = target_store_id
    and membership.user_id = actor_id
    and membership.status = 'active';

  if tool_name <> all(array[
    'sales.vat_breakdown', 'sales.tender_breakdown', 'gift_cards.summary',
    'workforce.leave_summary', 'inventory.location_stock'
  ]) then
    raise exception using errcode = '22023', message = 'pace-ai:invalid-read-tool';
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
    when 'this_month' then range_start := pg_catalog.date_trunc('month', local_today::timestamp) at time zone store_timezone; range_end := (pg_catalog.date_trunc('month', local_today::timestamp) + interval '1 month') at time zone store_timezone;
    when 'last_month' then range_start := (pg_catalog.date_trunc('month', local_today::timestamp) - interval '1 month') at time zone store_timezone; range_end := pg_catalog.date_trunc('month', local_today::timestamp) at time zone store_timezone;
    when 'this_year' then range_start := pg_catalog.date_trunc('year', local_today::timestamp) at time zone store_timezone; range_end := (pg_catalog.date_trunc('year', local_today::timestamp) + interval '1 year') at time zone store_timezone;
    when 'last_year' then range_start := (pg_catalog.date_trunc('year', local_today::timestamp) - interval '1 year') at time zone store_timezone; range_end := pg_catalog.date_trunc('year', local_today::timestamp) at time zone store_timezone;
    when 'custom' then
      if custom_start !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$' or custom_end !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$' then
        raise exception using errcode = '22023', message = 'pace-ai:invalid-period';
      end if;
      range_start := custom_start::date::timestamp at time zone store_timezone;
      range_end := custom_end::date::timestamp at time zone store_timezone;
      if range_end <= range_start then raise exception using errcode = '22023', message = 'pace-ai:invalid-period'; end if;
    else
      raise exception using errcode = '22023', message = 'pace-ai:invalid-period';
  end case;

  if tool_name = 'sales.vat_breakdown' then
    with eligible as (
      select txn.id, txn.vat_snapshot_version, txn.vat_breakdown,
        txn.vat_0_cents, txn.vat_6_cents, txn.vat_12_cents, txn.vat_21_cents
      from public.transactions txn
      where txn.store_id = target_store_id and txn.is_finalized
        and txn.kind in ('sale', 'refund') and (include_demo or not coalesce(txn.is_demo, false))
        and (range_start is null or txn.occurred_at >= range_start)
        and (range_end is null or txn.occurred_at < range_end)
    ), rates as (
      select line.rate,
        pg_catalog.sum(line.gross_cents)::bigint as gross_cents,
        pg_catalog.sum(line.excl_cents)::bigint as excl_cents,
        pg_catalog.sum(line.vat_cents)::bigint as vat_cents
      from eligible txn
      cross join lateral (
        select (value->>'rate')::integer rate, (value->>'grossCents')::bigint gross_cents,
          (value->>'exclCents')::bigint excl_cents, (value->>'vatCents')::bigint vat_cents
        from pg_catalog.jsonb_array_elements(txn.vat_breakdown)
      ) line
      group by line.rate
    )
    select pg_catalog.jsonb_build_object(
      'version', 1, 'tool', tool_name, 'generatedAt', pg_catalog.statement_timestamp(), 'timezone', store_timezone,
      'period', pg_catalog.jsonb_build_object('preset', requested_period, 'start', range_start, 'endExclusive', range_end),
      'basis', 'immutable finalized transaction VAT snapshots; refunds remain signed negative corrections',
      'dataQuality', pg_catalog.jsonb_build_object(
        'transactionCount', (select pg_catalog.count(*) from eligible),
        'snapshotTransactionCount', (select pg_catalog.count(*) from eligible where vat_snapshot_version = 1)
      ),
      'rows', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'rate', rate, 'grossCents', gross_cents, 'exclCents', excl_cents, 'vatCents', vat_cents
      ) order by rate) from rates), '[]'::jsonb)
    ) into result;

  elsif tool_name = 'sales.tender_breakdown' then
    with tender_facts as (
      select tender.method,
        case when txn.kind = 'refund' then -pg_catalog.abs(tender.amount_cents) else tender.amount_cents end::bigint as signed_amount,
        txn.id
      from public.transaction_tenders tender
      join public.transactions txn on txn.store_id = tender.store_id and txn.id = tender.transaction_id
      where tender.store_id = target_store_id and txn.is_finalized and txn.kind in ('sale', 'refund')
        and (include_demo or not coalesce(txn.is_demo, false))
        and (range_start is null or txn.occurred_at >= range_start)
        and (range_end is null or txn.occurred_at < range_end)
    ), grouped as (
      select method, pg_catalog.sum(signed_amount)::bigint amount_cents,
        pg_catalog.count(distinct id)::integer transaction_count
      from tender_facts group by method
    )
    select pg_catalog.jsonb_build_object(
      'version', 1, 'tool', tool_name, 'generatedAt', pg_catalog.statement_timestamp(), 'timezone', store_timezone,
      'period', pg_catalog.jsonb_build_object('preset', requested_period, 'start', range_start, 'endExclusive', range_end),
      'basis', 'finalized transaction tender lines; split payments contribute once to each used method and refunds are negative',
      'rows', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'method', method, 'amountCents', amount_cents, 'transactionCount', transaction_count
      ) order by amount_cents desc, method) from grouped), '[]'::jsonb)
    ) into result;

  elsif tool_name = 'gift_cards.summary' then
    with cards as (
      select card.id, card.code, card.balance_cents, card.initial_cents, card.is_active, card.issued_at, card.expires_at
      from public.gift_cards card
      where card.store_id = target_store_id and (include_demo or not card.is_demo)
        and (requested_status <> 'active' or card.is_active)
        and (requested_status <> 'inactive' or not card.is_active)
        and (requested_status not in ('expiring', 'expired') or card.expires_at is not null)
        and (requested_status <> 'expiring' or ((range_start is null or card.expires_at >= range_start) and (range_end is null or card.expires_at < range_end)))
        and (requested_status <> 'expired' or card.expires_at < pg_catalog.statement_timestamp())
        and (requested_search = '' or pg_catalog.lower(card.code) like '%' || requested_search || '%')
    ), events as (
      select event.event_type, pg_catalog.count(*)::integer event_count, pg_catalog.sum(event.amount_cents)::bigint amount_cents
      from public.gift_card_events event
      where event.store_id = target_store_id and (include_demo or event.source <> 'demo')
        and (range_start is null or event.occurred_at >= range_start) and (range_end is null or event.occurred_at < range_end)
      group by event.event_type
    )
    select pg_catalog.jsonb_build_object(
      'version', 1, 'tool', tool_name, 'generatedAt', pg_catalog.statement_timestamp(), 'timezone', store_timezone,
      'period', pg_catalog.jsonb_build_object('preset', requested_period, 'start', range_start, 'endExclusive', range_end),
      'basis', 'current gift-card lifecycle and append-only events; bearer codes are masked',
      'summary', pg_catalog.jsonb_build_object(
        'cardCount', (select pg_catalog.count(*) from cards),
        'activeCount', (select pg_catalog.count(*) from cards where is_active),
        'balanceCents', coalesce((select pg_catalog.sum(balance_cents) from cards), 0)
      ),
      'eventsByType', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'eventType', event_type, 'count', event_count, 'amountCents', amount_cents
      ) order by event_count desc, event_type) from events), '[]'::jsonb),
      'rows', coalesce((select pg_catalog.jsonb_agg(payload order by expires_at nulls last, issued_at desc) from (
        select expires_at, issued_at, pg_catalog.jsonb_build_object(
          'id', id, 'maskedCode', '•••• ' || pg_catalog.right(code, 4), 'balanceCents', balance_cents,
          'initialCents', initial_cents, 'active', is_active, 'issuedAt', issued_at, 'expiresAt', expires_at
        ) payload from cards order by expires_at nulls last, issued_at desc limit requested_limit
      ) bounded), '[]'::jsonb)
    ) into result;

  elsif tool_name = 'workforce.leave_summary' then
    requested_balance_year := coalesce(extract(year from range_start)::integer, extract(year from local_today)::integer);
    with allowed_employees as (
      select employee.id, employee.display_name
      from public.workforce_employees employee
      where employee.store_id = target_store_id and employee.employment_status = 'active'
        and (actor_role in ('owner', 'manager') or employee.user_id = actor_id)
        and (requested_search = '' or pg_catalog.lower(employee.display_name) like '%' || requested_search || '%')
    ), balances as (
      select employee.id, employee.display_name, leave_type.name as leave_type,
        account.entitlement_status, account.opening_minutes,
        account.opening_minutes + coalesce(pg_catalog.sum(ledger.amount_minutes), 0)::integer as available_minutes
      from allowed_employees employee
      join public.leave_accounts account on account.store_id = target_store_id and account.employee_id = employee.id and account.balance_year = requested_balance_year
      join public.leave_types leave_type on leave_type.store_id = account.store_id and leave_type.id = account.leave_type_id
      left join public.leave_ledger_entries ledger on ledger.store_id = account.store_id and ledger.leave_account_id = account.id
      group by employee.id, employee.display_name, leave_type.name, account.id
    ), requests as (
      select request.employee_id, request.status, pg_catalog.count(*)::integer request_count,
        pg_catalog.sum(request.total_minutes)::integer total_minutes
      from public.leave_requests request
      join allowed_employees employee on employee.id = request.employee_id
      where request.store_id = target_store_id
        and (range_start is null or request.end_date >= (range_start at time zone store_timezone)::date)
        and (range_end is null or request.start_date < (range_end at time zone store_timezone)::date)
        and (requested_status = '' or pg_catalog.lower(request.status) = requested_status)
      group by request.employee_id, request.status
    )
    select pg_catalog.jsonb_build_object(
      'version', 1, 'tool', tool_name, 'generatedAt', pg_catalog.statement_timestamp(), 'timezone', store_timezone,
      'period', pg_catalog.jsonb_build_object('preset', requested_period, 'start', range_start, 'endExclusive', range_end, 'balanceYear', requested_balance_year),
      'basis', 'leave-account opening entitlement plus append-only ledger movements; cashiers can see only their linked employee record',
      'rows', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'employeeId', balance.id, 'employeeName', balance.display_name, 'leaveType', balance.leave_type,
        'entitlementStatus', balance.entitlement_status, 'openingMinutes', balance.opening_minutes,
        'availableMinutes', balance.available_minutes,
        'requests', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'status', request.status, 'count', request.request_count, 'totalMinutes', request.total_minutes
        ) order by request.status) from requests request where request.employee_id = balance.id), '[]'::jsonb)
      ) order by balance.display_name, balance.leave_type) from (select * from balances limit requested_limit) balance), '[]'::jsonb)
    ) into result;

  else
    with stock as (
      select location.id as location_id, location.code as location_code, location.name as location_name,
        location.location_type, location.is_sellable, product.id as product_id, product.name as product_name,
        product.sku, balance.on_hand_qty, balance.reserved_qty, balance.available_qty,
        case when actor_role in ('owner', 'manager') then product.cost_price_cents else null end as cost_price_cents
      from public.inventory_stock_balances balance
      join public.inventory_locations location on location.store_id = balance.store_id and location.id = balance.location_id
      join public.products product on product.store_id = balance.store_id and product.id = balance.product_id
      where balance.store_id = target_store_id and location.is_active and product.is_active and (include_demo or not product.is_demo)
        and (requested_search = '' or pg_catalog.lower(pg_catalog.concat_ws(' ', location.code, location.name, product.name, product.sku)) like '%' || requested_search || '%')
    )
    select pg_catalog.jsonb_build_object(
      'version', 1, 'tool', tool_name, 'generatedAt', pg_catalog.statement_timestamp(), 'timezone', store_timezone,
      'period', pg_catalog.jsonb_build_object('preset', 'current_stock'),
      'basis', 'current relational inventory balances by active location; empty results can mean the store still uses legacy simple product stock',
      'rows', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'locationId', location_id, 'locationCode', location_code, 'locationName', location_name,
        'locationType', location_type, 'sellable', is_sellable, 'productId', product_id,
        'productName', product_name, 'sku', sku, 'onHandQty', on_hand_qty,
        'reservedQty', reserved_qty, 'availableQty', available_qty,
        'stockCostValueCents', case when cost_price_cents is null then null else pg_catalog.round(on_hand_qty * cost_price_cents) end
      ) order by location_name, product_name) from (select * from stock order by location_name, product_name limit requested_limit) bounded), '[]'::jsonb)
    ) into result;
  end if;

  return result || pg_catalog.jsonb_build_object('call', tool_call);
end;
$$;

revoke all on function public.get_pace_read_tool_context(uuid, jsonb) from public, anon;
grant execute on function public.get_pace_read_tool_context(uuid, jsonb) to authenticated;

comment on function public.get_pace_read_tool_context(uuid, jsonb) is
  'Executes one enum-selected, bounded and role-aware PACE read tool under the caller tenant membership.';

commit;
