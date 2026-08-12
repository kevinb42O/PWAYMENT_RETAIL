-- The original Kevin demo seed contains historical finalized transactions but
-- predates the Z-report and register-shift fixtures. Backfill a presentation-
-- ready, internally reconciled 90-day close history without touching today's
-- live sales or the currently open register shift.
begin;

do $backfill$
declare
  demo_user_id uuid;
  demo_user_name text;
  demo_store_id uuid;
  demo_register_id uuid;
  demo_anchor_day date;
  demo_report_count bigint;
  existing_report_number bigint;
  report_day date;
  report_id uuid;
  shift_id uuid;
  report_at timestamptz;
  opened_at timestamptz;
  report_number bigint;
  shift_number bigint;
  transaction_count bigint;
  revenue_cents bigint;
  cost_cents bigint;
  vat_12_cents bigint;
  vat_21_cents bigint;
  discount_cents bigint;
  cash_cents bigint;
  card_cents bigint;
  gift_card_cents bigint;
  opening_float_cents bigint := 15000;
  expected_cash_cents bigint;
  counted_cash_cents bigint;
  cash_difference_cents bigint;
  cash_difference_reason text;
  report_totals jsonb;
  previous_hash text;
  report_hash text;
begin
  select auth_user.id,
         coalesce(profile.display_name, split_part(auth_user.email, '@', 1), 'Kevin')
    into strict demo_user_id, demo_user_name
  from auth.users as auth_user
  left join public.profiles as profile on profile.id = auth_user.id
  where lower(auth_user.email) = lower('kevin@webaanzee.be');

  select membership.store_id
    into strict demo_store_id
  from public.store_memberships as membership
  join public.stores as store on store.id = membership.store_id
  where membership.user_id = demo_user_id
    and membership.role = 'owner'
    and membership.status = 'active'
    and store.is_demo = true;

  if exists (
    select 1
    from private.demo_seed_runs
    where store_id = demo_store_id
      and seed_name = 'pwayment-retail-demo-z-reports'
      and seed_version = 1
  ) then
    return;
  end if;

  select register.id
    into strict demo_register_id
  from public.registers as register
  where register.store_id = demo_store_id
    and register.external_id = 'retail-register-1';

  select max((transaction.occurred_at at time zone 'Europe/Brussels')::date)
    into demo_anchor_day
  from public.transactions as transaction
  where transaction.store_id = demo_store_id
    and transaction.source = 'demo';

  if demo_anchor_day is null then
    raise exception 'Kevin demo Z-report backfill requires demo transactions.';
  end if;

  select count(distinct (transaction.occurred_at at time zone 'Europe/Brussels')::date)
    into demo_report_count
  from public.transactions as transaction
  where transaction.store_id = demo_store_id
    and transaction.source = 'demo'
    and (transaction.occurred_at at time zone 'Europe/Brussels')::date >= demo_anchor_day - 90
    and (transaction.occurred_at at time zone 'Europe/Brussels')::date < demo_anchor_day;

  if demo_report_count = 0 then
    raise exception 'Kevin demo Z-report backfill found no completed demo days.';
  end if;

  select coalesce(max(daily_report.report_number), 0)
    into existing_report_number
  from public.daily_reports as daily_report
  where daily_report.store_id = demo_store_id;

  -- Keep chronological shift numbering coherent: move any current/live shifts
  -- after the historical demo shifts. Transaction foreign keys use UUIDs and
  -- therefore remain unchanged.
  update public.register_shifts as current_shift
  set shift_number = current_shift.shift_number + demo_report_count
  where current_shift.store_id = demo_store_id
    and current_shift.register_id = demo_register_id
    and not current_shift.is_demo;

  report_number := existing_report_number;
  shift_number := existing_report_number;
  select daily_report.hash
    into previous_hash
  from public.daily_reports as daily_report
  where daily_report.store_id = demo_store_id
  order by daily_report.report_number desc
  limit 1;

  for report_day in
    select distinct (transaction.occurred_at at time zone 'Europe/Brussels')::date
    from public.transactions as transaction
    where transaction.store_id = demo_store_id
      and transaction.source = 'demo'
      and (transaction.occurred_at at time zone 'Europe/Brussels')::date >= demo_anchor_day - 90
      and (transaction.occurred_at at time zone 'Europe/Brussels')::date < demo_anchor_day
    order by 1
  loop
    report_number := report_number + 1;
    shift_number := shift_number + 1;
    report_id := md5(demo_store_id::text || ':' || report_day::text || ':daily-report')::uuid;
    shift_id := md5(demo_store_id::text || ':' || report_day::text || ':register-shift')::uuid;
    opened_at := (report_day + time '08:30') at time zone 'Europe/Brussels';

    select count(*),
           coalesce(sum(transaction.total_cents), 0),
           coalesce(sum(transaction.vat_12_cents), 0),
           coalesce(sum(transaction.vat_21_cents), 0),
           coalesce(sum(transaction.discount_cents), 0),
           greatest(
             max(transaction.occurred_at) + interval '30 minutes',
             (report_day + time '18:30') at time zone 'Europe/Brussels'
           )
      into transaction_count, revenue_cents, vat_12_cents, vat_21_cents,
           discount_cents, report_at
    from public.transactions as transaction
    where transaction.store_id = demo_store_id
      and transaction.source = 'demo'
      and (transaction.occurred_at at time zone 'Europe/Brussels')::date = report_day;

    select coalesce(sum(coalesce(line.unit_cost_cents, 0) * line.quantity), 0)
      into cost_cents
    from public.transaction_lines as line
    join public.transactions as transaction
      on transaction.store_id = line.store_id
     and transaction.id = line.transaction_id
    where transaction.store_id = demo_store_id
      and transaction.source = 'demo'
      and (transaction.occurred_at at time zone 'Europe/Brussels')::date = report_day;

    select coalesce(sum(tender.amount_cents) filter (where tender.method = 'Cash'), 0),
           coalesce(sum(tender.amount_cents) filter (where tender.method = 'PIN'), 0),
           coalesce(sum(tender.amount_cents) filter (where tender.method = 'Cadeaubon'), 0)
      into cash_cents, card_cents, gift_card_cents
    from public.transaction_tenders as tender
    join public.transactions as transaction
      on transaction.store_id = tender.store_id
     and transaction.id = tender.transaction_id
    where transaction.store_id = demo_store_id
      and transaction.source = 'demo'
      and (transaction.occurred_at at time zone 'Europe/Brussels')::date = report_day;

    expected_cash_cents := opening_float_cents + cash_cents;
    cash_difference_cents := case
      when report_number % 37 = 0 then 200
      when report_number % 29 = 0 then -500
      else 0
    end;
    counted_cash_cents := expected_cash_cents + cash_difference_cents;
    cash_difference_reason := case
      when cash_difference_cents = 200 then 'Kascontrole: telcorrectie van €2,00 geregistreerd.'
      when cash_difference_cents = -500 then 'Kascontrole: tekort van €5,00 geregistreerd.'
      else null
    end;

    report_totals := jsonb_build_object(
      'reportNumber', report_number,
      'timestamp', extract(epoch from report_at) * 1000,
      'totalRevenueCents', revenue_cents,
      'totalCostCents', cost_cents,
      'grossProfitCents', revenue_cents - cost_cents,
      'totalVat12Cents', vat_12_cents,
      'totalVat21Cents', vat_21_cents,
      'totalExclVat12Cents', 0,
      'totalExclVat21Cents', revenue_cents - vat_12_cents - vat_21_cents,
      'totalDiscountCents', discount_cents,
      'paymentTotalsCents', jsonb_build_object(
        'Cash', cash_cents,
        'PIN', card_cents,
        'Cadeaubon', gift_card_cents
      ),
      'giftCardLiabilityAddedCents', 0,
      'giftCardLiabilityPaymentTotalsCents', jsonb_build_object(
        'Cash', 0,
        'PIN', 0,
        'Cadeaubon', 0
      ),
      'giftCardEventIds', jsonb_build_array(),
      'prevHash', previous_hash,
      'closedByUserName', demo_user_name,
      'registerId', 'retail-register-1',
      'openingFloatCents', opening_float_cents,
      'countedCashCents', counted_cash_cents,
      'expectedCashCents', expected_cash_cents,
      'cashDifferenceCents', cash_difference_cents,
      'cashDifferenceReason', cash_difference_reason,
      'hashPayloadVersion', 1
    );

    -- The chain covers every financial total plus the ordered immutable set of
    -- transaction request IDs. previous_hash makes later reports dependent on
    -- all earlier closures.
    report_hash := encode(
      extensions.digest(
        jsonb_build_object(
          'version', 1,
          'report', report_totals,
          'previousHash', previous_hash,
          'transactionRequestIds', (
            select jsonb_agg(transaction.client_request_id order by transaction.client_request_id)
            from public.transactions as transaction
            where transaction.store_id = demo_store_id
              and transaction.source = 'demo'
              and (transaction.occurred_at at time zone 'Europe/Brussels')::date = report_day
          )
        )::text,
        'sha256'
      ),
      'hex'
    );

    insert into public.register_shifts (
      id, store_id, register_id, shift_number, opened_at,
      opened_by_user_id, opened_by_user_name, opening_float_cents,
      closed_at, closed_by_user_id, closed_by_user_name,
      counted_cash_cents, expected_cash_cents, cash_difference_cents,
      cash_difference_reason, status, is_demo
    ) values (
      shift_id, demo_store_id, demo_register_id, shift_number, opened_at,
      demo_user_id, demo_user_name, opening_float_cents,
      report_at, demo_user_id, demo_user_name,
      counted_cash_cents, expected_cash_cents, cash_difference_cents,
      cash_difference_reason, 'closed', true
    );

    insert into public.daily_reports (
      id, store_id, report_number, occurred_at, totals, hash, previous_hash,
      closed_by_user_id, closed_by_user_name, register_id, shift_id,
      opening_float_cents, counted_cash_cents, expected_cash_cents,
      cash_difference_cents, cash_difference_reason, hash_payload_version,
      is_demo
    ) values (
      report_id, demo_store_id, report_number, report_at, report_totals,
      report_hash, previous_hash, demo_user_id, demo_user_name,
      demo_register_id, shift_id, opening_float_cents, counted_cash_cents,
      expected_cash_cents, cash_difference_cents, cash_difference_reason, 1,
      true
    );

    insert into public.daily_report_transactions (
      store_id, daily_report_id, transaction_id
    )
    select demo_store_id, report_id, transaction.id
    from public.transactions as transaction
    where transaction.store_id = demo_store_id
      and transaction.source = 'demo'
      and (transaction.occurred_at at time zone 'Europe/Brussels')::date = report_day;

    insert into public.audit_entries (
      id, store_id, occurred_at, user_id, user_name, action, detail, source,
      is_demo
    ) values (
      md5(demo_store_id::text || ':' || report_day::text || ':z-report-audit')::uuid,
      demo_store_id, report_at, demo_user_id, demo_user_name,
      'zreport.finalize',
      jsonb_build_object(
        'dailyReportId', report_id,
        'reportNumber', report_number,
        'transactionCount', transaction_count,
        'demo', true
      ),
      'demo', true
    );

    previous_hash := report_hash;
  end loop;

  insert into private.demo_seed_runs (
    store_id, seed_name, seed_version, row_counts
  ) values (
    demo_store_id,
    'pwayment-retail-demo-z-reports',
    1,
    jsonb_build_object(
      'daily_reports', demo_report_count,
      'register_shifts', demo_report_count,
      'report_window_days', 90
    )
  );
end;
$backfill$;

commit;
