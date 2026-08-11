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
  actor_id uuid := (select auth.uid());
  actor_name text;
  register_external_id text := coalesce(nullif(payload ->> 'register_id', ''), 'retail-register-1');
  target_register_id uuid;
  target_shift_id uuid;
  report_id uuid;
  report_number bigint;
  previous_hash text;
  report_hash text := nullif(payload #>> '{report,hash}', '');
  report_at timestamptz := clock_timestamp();
  actual_transactions text[];
  supplied_transactions text[];
  actual_events text[];
  supplied_events text[];
  transaction_request_id text;
  event_external_id text;
begin
  if actor_id is null or not private.has_store_role(target_store_id, array['owner', 'manager']) then
    raise exception using errcode = '42501', message = 'report:forbidden:Alleen een manager of eigenaar kan een Z-rapport sluiten.';
  end if;
  if report_hash is null or report_hash !~ '^[0-9a-f]{64}$'
     or pg_catalog.jsonb_typeof(payload -> 'report') is distinct from 'object'
     or pg_catalog.jsonb_typeof(payload -> 'transaction_request_ids') is distinct from 'array'
     or pg_catalog.jsonb_typeof(payload -> 'gift_card_event_ids') is distinct from 'array' then
    raise exception using errcode = 'P0001', message = 'report:invalid-request:Ongeldig Z-rapport.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(target_store_id::text || ':daily-report', 0)
  );
  select existing_report.id, existing_report.report_number
  into report_id, report_number
  from public.daily_reports existing_report
  where existing_report.store_id = target_store_id
    and existing_report.hash = report_hash;
  if report_id is not null then
    return pg_catalog.jsonb_build_object(
      'daily_report_id', report_id,
      'report_number', report_number,
      'duplicate', true
    );
  end if;
  select id into target_register_id from public.registers
  where store_id = target_store_id
    and (external_id = register_external_id or id::text = register_external_id);
  if target_register_id is null then
    raise exception using errcode = 'P0001', message = 'report:register-not-found:Kassa bestaat niet.';
  end if;

  select coalesce(array_agg(t.client_request_id order by t.client_request_id), array[]::text[])
  into actual_transactions
  from public.transactions t
  where t.store_id = target_store_id
    and t.register_id = target_register_id
    and not t.is_finalized
    and t.source <> 'demo';
  select coalesce(array_agg(value order by value), array[]::text[])
  into supplied_transactions
  from pg_catalog.jsonb_array_elements_text(payload -> 'transaction_request_ids') rows(value);

  select coalesce(array_agg(coalesce(e.external_id, e.id::text) order by coalesce(e.external_id, e.id::text)), array[]::text[])
  into actual_events
  from public.gift_card_events e
  where e.store_id = target_store_id
    and e.daily_report_id is null
    and e.source <> 'demo'
    and e.event_type in ('issue', 'recharge');
  select coalesce(array_agg(value order by value), array[]::text[])
  into supplied_events
  from pg_catalog.jsonb_array_elements_text(payload -> 'gift_card_event_ids') rows(value);

  if actual_transactions is distinct from supplied_transactions
     or actual_events is distinct from supplied_events then
    raise exception using errcode = 'P0001', message = 'report:stale-data:De rapportgegevens zijn gewijzigd. Vernieuw en probeer opnieuw.';
  end if;
  if cardinality(actual_transactions) = 0 and cardinality(actual_events) = 0 then
    return null;
  end if;

  select previous_report.hash into previous_hash
  from public.daily_reports previous_report
  where previous_report.store_id = target_store_id
  order by previous_report.report_number desc limit 1;
  report_number := coalesce((
    select max(r.report_number) from public.daily_reports r
    where r.store_id = target_store_id
  ), 0) + 1;
  if coalesce(payload #>> '{report,prevHash}', '') <> coalesce(previous_hash, '')
     or (payload #>> '{report,reportNumber}')::bigint <> report_number then
    raise exception using errcode = 'P0001', message = 'report:stale-data:Rapportnummer of hashketen is verouderd. Vernieuw en probeer opnieuw.';
  end if;

  select coalesce(p.display_name, split_part(u.email, '@', 1), 'Gebruiker')
  into actor_name from auth.users u
  left join public.profiles p on p.id = u.id where u.id = actor_id;
  select id into target_shift_id from public.register_shifts
  where store_id = target_store_id and register_id = target_register_id and status = 'open'
  order by opened_at desc limit 1 for update;

  insert into public.daily_reports (
    store_id, report_number, occurred_at, totals, hash, previous_hash,
    closed_by_user_id, closed_by_user_name, register_id, shift_id,
    opening_float_cents, counted_cash_cents, expected_cash_cents,
    cash_difference_cents, cash_difference_reason, hash_payload_version
  ) values (
    target_store_id, report_number,
    coalesce(nullif(payload #>> '{report,timestamp}', '')::timestamptz, report_at),
    payload -> 'report', report_hash, previous_hash, actor_id, actor_name,
    target_register_id, target_shift_id,
    nullif(payload #>> '{report,openingFloatCents}', '')::bigint,
    nullif(payload #>> '{report,countedCashCents}', '')::bigint,
    nullif(payload #>> '{report,expectedCashCents}', '')::bigint,
    nullif(payload #>> '{report,cashDifferenceCents}', '')::bigint,
    nullif(payload #>> '{report,cashDifferenceReason}', ''),
    coalesce(nullif(payload #>> '{report,hashPayloadVersion}', '')::integer, 2)
  ) returning id into report_id;

  foreach transaction_request_id in array actual_transactions loop
    insert into public.daily_report_transactions (store_id, daily_report_id, transaction_id)
    select target_store_id, report_id, id from public.transactions
    where store_id = target_store_id and client_request_id = transaction_request_id;
  end loop;
  update public.transactions set is_finalized = true
  where store_id = target_store_id and client_request_id = any(actual_transactions);

  foreach event_external_id in array actual_events loop
    update public.gift_card_events set daily_report_id = report_id
    where store_id = target_store_id
      and coalesce(external_id, id::text) = event_external_id;
  end loop;

  if target_shift_id is not null then
    update public.register_shifts set
      opening_float_cents = coalesce(nullif(payload #>> '{report,openingFloatCents}', '')::bigint, opening_float_cents),
      status = 'closed', closed_at = report_at, closed_by_user_id = actor_id,
      closed_by_user_name = actor_name,
      counted_cash_cents = nullif(payload #>> '{report,countedCashCents}', '')::bigint,
      expected_cash_cents = nullif(payload #>> '{report,expectedCashCents}', '')::bigint,
      cash_difference_cents = nullif(payload #>> '{report,cashDifferenceCents}', '')::bigint,
      cash_difference_reason = nullif(payload #>> '{report,cashDifferenceReason}', '')
    where id = target_shift_id and store_id = target_store_id;
  end if;
  insert into public.audit_entries (
    store_id, user_id, user_name, action, detail, source
  ) values (
    target_store_id, actor_id, actor_name, 'zreport.finalize',
    pg_catalog.jsonb_build_object(
      'dailyReportId', report_id, 'reportNumber', report_number,
      'transactionCount', cardinality(actual_transactions)
    ), 'app'
  );
  return pg_catalog.jsonb_build_object(
    'daily_report_id', report_id, 'report_number', report_number
  );
end;
$$;

revoke all on function public.finalize_daily_report(uuid, jsonb) from public, anon;
grant execute on function public.finalize_daily_report(uuid, jsonb) to authenticated;

create unique index daily_reports_store_hash_unique
  on public.daily_reports (store_id, hash);
