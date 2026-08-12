-- Make the Z-report a server-authoritative financial close. The browser only
-- supplies physical cash-count inputs and an optimistic snapshot of IDs; all
-- financial totals, numbering, timestamps and the hash chain are derived from
-- locked PostgreSQL ledger rows inside this transaction.
create or replace function public.finalize_daily_report(
  target_store_id uuid,
  payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_actor_name text;
  v_register_external_id text := coalesce(nullif(payload ->> 'register_id', ''), 'retail-register-1');
  v_register_id uuid;
  v_shift_id uuid;
  v_report_id uuid;
  v_report_number bigint;
  v_previous_hash text;
  v_report_hash text;
  v_report_at timestamptz := clock_timestamp();
  v_actual_transactions text[];
  v_supplied_transactions text[];
  v_actual_events text[];
  v_supplied_events text[];
  v_opening_float_cents bigint;
  v_counted_cash_cents bigint;
  v_expected_cash_cents bigint;
  v_cash_difference_cents bigint;
  v_cash_difference_reason text := nullif(btrim(payload #>> '{report,cashDifferenceReason}'), '');
  v_total_revenue_cents bigint := 0;
  v_total_cost_cents bigint := 0;
  v_total_vat_12_cents bigint := 0;
  v_total_vat_21_cents bigint := 0;
  v_total_excl_vat_12_cents bigint := 0;
  v_total_excl_vat_21_cents bigint := 0;
  v_total_discount_cents bigint := 0;
  v_cash_cents bigint := 0;
  v_pin_cents bigint := 0;
  v_gift_card_cents bigint := 0;
  v_liability_added_cents bigint := 0;
  v_liability_cash_cents bigint := 0;
  v_liability_pin_cents bigint := 0;
  v_liability_gift_card_cents bigint := 0;
  v_report_totals jsonb;
  v_hash_basis text;
begin
  if v_actor_id is null or not private.has_store_role(target_store_id, array['owner', 'manager']) then
    raise exception using errcode = '42501', message = 'report:forbidden:Alleen een manager of eigenaar kan een Z-rapport sluiten.';
  end if;
  if pg_catalog.jsonb_typeof(payload) is distinct from 'object'
     or pg_catalog.jsonb_typeof(payload -> 'report') is distinct from 'object'
     or pg_catalog.jsonb_typeof(payload -> 'transaction_request_ids') is distinct from 'array'
     or pg_catalog.jsonb_typeof(payload -> 'gift_card_event_ids') is distinct from 'array' then
    raise exception using errcode = 'P0001', message = 'report:invalid-request:Ongeldige Z-rapportaanvraag.';
  end if;

  begin
    v_opening_float_cents := coalesce(nullif(payload #>> '{report,openingFloatCents}', '')::bigint, 0);
    v_counted_cash_cents := nullif(payload #>> '{report,countedCashCents}', '')::bigint;
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception using errcode = 'P0001', message = 'report:invalid-cash:Ongeldig kasbedrag.';
  end;
  if v_opening_float_cents < 0 or v_counted_cash_cents is null or v_counted_cash_cents < 0 then
    raise exception using errcode = 'P0001', message = 'report:invalid-cash:Startbedrag en geteld kasbedrag moeten geldig zijn.';
  end if;
  if v_cash_difference_reason is not null and char_length(v_cash_difference_reason) > 500 then
    raise exception using errcode = 'P0001', message = 'report:invalid-cash:De verklaring van het kasverschil is te lang.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(target_store_id::text || ':daily-report', 0)
  );

  select register.id
    into v_register_id
  from public.registers as register
  where register.store_id = target_store_id
    and (register.external_id = v_register_external_id or register.id::text = v_register_external_id);
  if v_register_id is null then
    raise exception using errcode = 'P0001', message = 'report:register-not-found:Kassa bestaat niet.';
  end if;

  -- Row locks prevent checkout/refund/gift-card mutations from changing the
  -- selected ledger while totals and report links are being committed.
  perform 1
  from public.transactions as transaction
  where transaction.store_id = target_store_id
    and transaction.register_id = v_register_id
    and not transaction.is_finalized
    and transaction.source <> 'demo'
  for update;

  perform 1
  from public.gift_card_events as event
  where event.store_id = target_store_id
    and event.daily_report_id is null
    and event.source <> 'demo'
    and event.event_type in ('issue', 'recharge')
  for update;

  select coalesce(array_agg(transaction.client_request_id order by transaction.client_request_id), array[]::text[])
    into v_actual_transactions
  from public.transactions as transaction
  where transaction.store_id = target_store_id
    and transaction.register_id = v_register_id
    and not transaction.is_finalized
    and transaction.source <> 'demo';

  select coalesce(array_agg(row.value order by row.value), array[]::text[])
    into v_supplied_transactions
  from pg_catalog.jsonb_array_elements_text(payload -> 'transaction_request_ids') as row(value);

  select coalesce(array_agg(coalesce(event.external_id, event.id::text) order by coalesce(event.external_id, event.id::text)), array[]::text[])
    into v_actual_events
  from public.gift_card_events as event
  where event.store_id = target_store_id
    and event.daily_report_id is null
    and event.source <> 'demo'
    and event.event_type in ('issue', 'recharge');

  select coalesce(array_agg(row.value order by row.value), array[]::text[])
    into v_supplied_events
  from pg_catalog.jsonb_array_elements_text(payload -> 'gift_card_event_ids') as row(value);

  if v_actual_transactions is distinct from v_supplied_transactions
     or v_actual_events is distinct from v_supplied_events then
    raise exception using errcode = 'P0001', message = 'report:stale-data:De rapportgegevens zijn gewijzigd. Vernieuw en probeer opnieuw.';
  end if;
  if cardinality(v_actual_transactions) = 0 and cardinality(v_actual_events) = 0 then
    return null;
  end if;

  -- Every selected transaction must have an exact, non-empty tender ledger.
  if exists (
    select 1
    from public.transactions as transaction
    left join lateral (
      select count(*) as tender_count, coalesce(sum(tender.amount_cents), 0) as tender_total
      from public.transaction_tenders as tender
      where tender.store_id = transaction.store_id
        and tender.transaction_id = transaction.id
    ) as tender_check on true
    where transaction.store_id = target_store_id
      and transaction.client_request_id = any(v_actual_transactions)
      and (tender_check.tender_count = 0 or tender_check.tender_total <> transaction.total_cents)
  ) then
    raise exception using errcode = 'P0001', message = 'report:integrity-error:Een verkoop heeft geen sluitende betaalmiddelen.';
  end if;

  -- Reconstruct VAT-exclusive buckets using the same cent-allocation rules as
  -- checkout/refund. Transaction VAT itself was already calculated server-side.
  with selected_transactions as (
    select transaction.*,
           case when transaction.kind = 'refund' then -1::bigint else 1::bigint end as direction
    from public.transactions as transaction
    where transaction.store_id = target_store_id
      and transaction.client_request_id = any(v_actual_transactions)
  ), line_rollup as (
    select transaction.id,
           transaction.total_cents,
           transaction.vat_12_cents,
           transaction.vat_21_cents,
           transaction.discount_cents,
           transaction.direction,
           coalesce(sum(line.line_total_cents) filter (where line.vat_rate = 12), 0)::bigint as subtotal_12,
           coalesce(sum(line.line_total_cents) filter (where line.vat_rate = 21), 0)::bigint as subtotal_21,
           coalesce(sum(coalesce(line.unit_cost_cents, 0) * line.quantity), 0)::bigint * transaction.direction as cost_cents
    from selected_transactions as transaction
    join public.transaction_lines as line
      on line.store_id = transaction.store_id
     and line.transaction_id = transaction.id
    group by transaction.id, transaction.total_cents, transaction.vat_12_cents,
             transaction.vat_21_cents, transaction.discount_cents, transaction.direction
  ), base_allocations as (
    select line_rollup.*,
           abs(line_rollup.discount_cents) as absolute_discount,
           line_rollup.subtotal_12 + line_rollup.subtotal_21 as subtotal_all,
           case when line_rollup.subtotal_12 + line_rollup.subtotal_21 > 0
                then (abs(line_rollup.discount_cents) * line_rollup.subtotal_12)
                     / (line_rollup.subtotal_12 + line_rollup.subtotal_21)
                else 0 end as base_discount_12,
           case when line_rollup.subtotal_12 + line_rollup.subtotal_21 > 0
                then (abs(line_rollup.discount_cents) * line_rollup.subtotal_21)
                     / (line_rollup.subtotal_12 + line_rollup.subtotal_21)
                else 0 end as base_discount_21
    from line_rollup
  ), allocations as (
    select base_allocations.*,
           base_allocations.base_discount_12 +
             case when base_allocations.base_discount_12 + base_allocations.base_discount_21 < base_allocations.absolute_discount
                        and (base_allocations.absolute_discount * base_allocations.subtotal_12) % greatest(base_allocations.subtotal_all, 1)
                          >= (base_allocations.absolute_discount * base_allocations.subtotal_21) % greatest(base_allocations.subtotal_all, 1)
                  then 1 else 0 end as discount_12,
           base_allocations.base_discount_21 +
             case when base_allocations.base_discount_12 + base_allocations.base_discount_21 < base_allocations.absolute_discount
                        and (base_allocations.absolute_discount * base_allocations.subtotal_12) % greatest(base_allocations.subtotal_all, 1)
                          < (base_allocations.absolute_discount * base_allocations.subtotal_21) % greatest(base_allocations.subtotal_all, 1)
                  then 1 else 0 end as discount_21
    from base_allocations
  )
  select coalesce(sum(allocation.total_cents), 0),
         coalesce(sum(allocation.cost_cents), 0),
         coalesce(sum(allocation.vat_12_cents), 0),
         coalesce(sum(allocation.vat_21_cents), 0),
         coalesce(sum(allocation.direction * (allocation.subtotal_12 - allocation.discount_12) - allocation.vat_12_cents), 0),
         coalesce(sum(allocation.direction * (allocation.subtotal_21 - allocation.discount_21) - allocation.vat_21_cents), 0),
         coalesce(sum(allocation.discount_cents), 0)
    into v_total_revenue_cents, v_total_cost_cents,
         v_total_vat_12_cents, v_total_vat_21_cents,
         v_total_excl_vat_12_cents, v_total_excl_vat_21_cents,
         v_total_discount_cents
  from allocations as allocation;

  select coalesce(sum(tender.amount_cents) filter (where tender.method = 'Cash'), 0),
         coalesce(sum(tender.amount_cents) filter (where tender.method = 'PIN'), 0),
         coalesce(sum(tender.amount_cents) filter (where tender.method = 'Cadeaubon'), 0)
    into v_cash_cents, v_pin_cents, v_gift_card_cents
  from public.transaction_tenders as tender
  join public.transactions as transaction
    on transaction.store_id = tender.store_id
   and transaction.id = tender.transaction_id
  where transaction.store_id = target_store_id
    and transaction.client_request_id = any(v_actual_transactions);

  -- Paid gift-card issues/recharges are liabilities, not product revenue.
  if exists (
    select 1
    from public.gift_card_events as event
    left join lateral (
      select count(*) as tender_count,
             coalesce(sum((tender.value ->> 'amountCents')::bigint), 0) as tender_total,
             bool_and(tender.value ->> 'method' in ('Cash', 'PIN', 'Cadeaubon')) as valid_methods
      from pg_catalog.jsonb_array_elements(event.payment_tenders) as tender(value)
    ) as tender_check on true
    where event.store_id = target_store_id
      and coalesce(event.external_id, event.id::text) = any(v_actual_events)
      and (tender_check.tender_count = 0
           or tender_check.tender_total <> event.amount_cents
           or not coalesce(tender_check.valid_methods, false))
  ) then
    raise exception using errcode = 'P0001', message = 'report:integrity-error:Een cadeaubonbetaling sluit niet aan op de uitgegeven waarde.';
  end if;

  select coalesce(sum(event.amount_cents), 0)
    into v_liability_added_cents
  from public.gift_card_events as event
  where event.store_id = target_store_id
    and coalesce(event.external_id, event.id::text) = any(v_actual_events);

  select coalesce(sum((tender.value ->> 'amountCents')::bigint) filter (where tender.value ->> 'method' = 'Cash'), 0),
         coalesce(sum((tender.value ->> 'amountCents')::bigint) filter (where tender.value ->> 'method' = 'PIN'), 0),
         coalesce(sum((tender.value ->> 'amountCents')::bigint) filter (where tender.value ->> 'method' = 'Cadeaubon'), 0)
    into v_liability_cash_cents, v_liability_pin_cents,
         v_liability_gift_card_cents
  from public.gift_card_events as event
  cross join lateral pg_catalog.jsonb_array_elements(event.payment_tenders) as tender(value)
  where event.store_id = target_store_id
    and coalesce(event.external_id, event.id::text) = any(v_actual_events);

  v_expected_cash_cents := v_opening_float_cents + v_cash_cents + v_liability_cash_cents;
  v_cash_difference_cents := v_counted_cash_cents - v_expected_cash_cents;
  if v_cash_difference_cents <> 0 and (v_cash_difference_reason is null or char_length(v_cash_difference_reason) < 3) then
    raise exception using errcode = 'P0001', message = 'report:cash-reason-required:Verklaar het kasverschil voordat je afsluit.';
  end if;

  select daily_report.hash
    into v_previous_hash
  from public.daily_reports as daily_report
  where daily_report.store_id = target_store_id
  order by daily_report.report_number desc
  limit 1;

  select coalesce(max(daily_report.report_number), 0) + 1
    into v_report_number
  from public.daily_reports as daily_report
  where daily_report.store_id = target_store_id;

  select coalesce(profile.display_name, split_part(auth_user.email, '@', 1), 'Gebruiker')
    into v_actor_name
  from auth.users as auth_user
  left join public.profiles as profile on profile.id = auth_user.id
  where auth_user.id = v_actor_id;

  select register_shift.id
    into v_shift_id
  from public.register_shifts as register_shift
  where register_shift.store_id = target_store_id
    and register_shift.register_id = v_register_id
    and register_shift.status = 'open'
  order by register_shift.opened_at desc
  limit 1
  for update;

  v_report_totals := pg_catalog.jsonb_build_object(
    'reportNumber', v_report_number,
    'timestamp', extract(epoch from v_report_at) * 1000,
    'totalRevenueCents', v_total_revenue_cents,
    'totalCostCents', v_total_cost_cents,
    'grossProfitCents', v_total_revenue_cents - v_total_cost_cents,
    'totalVat12Cents', v_total_vat_12_cents,
    'totalVat21Cents', v_total_vat_21_cents,
    'totalExclVat12Cents', v_total_excl_vat_12_cents,
    'totalExclVat21Cents', v_total_excl_vat_21_cents,
    'totalDiscountCents', v_total_discount_cents,
    'paymentTotalsCents', pg_catalog.jsonb_build_object(
      'Cash', v_cash_cents,
      'PIN', v_pin_cents,
      'Cadeaubon', v_gift_card_cents
    ),
    'giftCardLiabilityAddedCents', v_liability_added_cents,
    'giftCardLiabilityPaymentTotalsCents', pg_catalog.jsonb_build_object(
      'Cash', v_liability_cash_cents,
      'PIN', v_liability_pin_cents,
      'Cadeaubon', v_liability_gift_card_cents
    ),
    'giftCardEventIds', to_jsonb(v_actual_events),
    'prevHash', v_previous_hash,
    'closedByUserId', v_actor_id,
    'closedByUserName', v_actor_name,
    'registerId', v_register_external_id,
    'openingFloatCents', v_opening_float_cents,
    'countedCashCents', v_counted_cash_cents,
    'expectedCashCents', v_expected_cash_cents,
    'cashDifferenceCents', v_cash_difference_cents,
    'cashDifferenceReason', v_cash_difference_reason,
    'hashPayloadVersion', 3
  );

  v_hash_basis := pg_catalog.jsonb_build_object(
    'version', 3,
    'storeId', target_store_id,
    'report', v_report_totals,
    'previousHash', v_previous_hash,
    'transactionRequestIds', to_jsonb(v_actual_transactions),
    'giftCardEventIds', to_jsonb(v_actual_events)
  )::text;
  v_report_hash := encode(extensions.digest(v_hash_basis, 'sha256'), 'hex');
  v_report_totals := v_report_totals || pg_catalog.jsonb_build_object('serverHashPayload', v_hash_basis);

  insert into public.daily_reports (
    store_id, report_number, occurred_at, totals, hash, previous_hash,
    closed_by_user_id, closed_by_user_name, register_id, shift_id,
    opening_float_cents, counted_cash_cents, expected_cash_cents,
    cash_difference_cents, cash_difference_reason, hash_payload_version
  ) values (
    target_store_id, v_report_number, v_report_at, v_report_totals,
    v_report_hash, v_previous_hash, v_actor_id, v_actor_name,
    v_register_id, v_shift_id, v_opening_float_cents, v_counted_cash_cents,
    v_expected_cash_cents, v_cash_difference_cents,
    v_cash_difference_reason, 3
  ) returning id into v_report_id;

  insert into public.daily_report_transactions (store_id, daily_report_id, transaction_id)
  select target_store_id, v_report_id, transaction.id
  from public.transactions as transaction
  where transaction.store_id = target_store_id
    and transaction.client_request_id = any(v_actual_transactions);

  update public.transactions as transaction
  set is_finalized = true
  where transaction.store_id = target_store_id
    and transaction.client_request_id = any(v_actual_transactions);

  update public.gift_card_events as event
  set daily_report_id = v_report_id
  where event.store_id = target_store_id
    and coalesce(event.external_id, event.id::text) = any(v_actual_events);

  if v_shift_id is not null then
    update public.register_shifts as register_shift
    set opening_float_cents = v_opening_float_cents,
        status = 'closed',
        closed_at = v_report_at,
        closed_by_user_id = v_actor_id,
        closed_by_user_name = v_actor_name,
        counted_cash_cents = v_counted_cash_cents,
        expected_cash_cents = v_expected_cash_cents,
        cash_difference_cents = v_cash_difference_cents,
        cash_difference_reason = v_cash_difference_reason
    where register_shift.id = v_shift_id
      and register_shift.store_id = target_store_id;
  end if;

  insert into public.audit_entries (
    store_id, user_id, user_name, action, detail, source
  ) values (
    target_store_id, v_actor_id, v_actor_name, 'zreport.finalize',
    pg_catalog.jsonb_build_object(
      'dailyReportId', v_report_id,
      'reportNumber', v_report_number,
      'transactionCount', cardinality(v_actual_transactions),
      'giftCardEventCount', cardinality(v_actual_events),
      'calculationAuthority', 'server'
    ),
    'app'
  );

  return pg_catalog.jsonb_build_object(
    'daily_report_id', v_report_id,
    'report_number', v_report_number,
    'hash', v_report_hash,
    'calculation_authority', 'server'
  );
end;
$$;

revoke all on function public.finalize_daily_report(uuid, jsonb) from public, anon;
grant execute on function public.finalize_daily_report(uuid, jsonb) to authenticated;
