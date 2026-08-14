-- Make leave submission executable in PostgreSQL by keeping the employee
-- variable distinct from employee_id columns used throughout the function.
create or replace function public.submit_leave_request(target_store_id uuid, payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare actor_id uuid := (select auth.uid());
declare target_employee_id uuid;
declare leave_type public.leave_types%rowtype;
declare request_id uuid;
declare client_id text := nullif(btrim(payload ->> 'clientRequestId'), '');
declare start_on date;
declare end_on date;
declare total integer;
declare year_record record;
declare account_record public.leave_accounts%rowtype;
declare available integer;
declare coverage jsonb;
begin
  if actor_id is null or not private.is_store_member(target_store_id) then
    raise exception using errcode = '42501', message = 'leave:forbidden:Geen toegang tot deze winkel.';
  end if;
  perform private.ensure_workforce_defaults(target_store_id);
  if client_id is null then
    raise exception using errcode = 'P0001', message = 'leave:invalid:Een aanvraag-ID ontbreekt.';
  end if;
  select id into request_id from public.leave_requests
  where store_id = target_store_id and client_request_id = client_id;
  if request_id is not null then return private.leave_request_json(request_id); end if;
  begin
    start_on := (payload ->> 'startDate')::date;
    end_on := (payload ->> 'endDate')::date;
  exception when others then
    raise exception using errcode = 'P0001', message = 'leave:invalid:Controleer de gekozen datums.';
  end;
  if end_on < start_on or end_on - start_on > 365 then
    raise exception using errcode = 'P0001', message = 'leave:invalid:De periode is ongeldig of langer dan één jaar.';
  end if;
  select employee.id into target_employee_id
  from public.workforce_employees employee
  where employee.store_id = target_store_id
    and employee.user_id = actor_id
    and employee.employment_status = 'active';
  if target_employee_id is null then
    raise exception using errcode = 'P0001', message = 'leave:no-employee:Je gebruikersaccount is niet aan een actieve medewerker gekoppeld.';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(target_store_id::text || ':' || target_employee_id::text, 0)
  );
  select request.id into request_id
  from public.leave_requests request
  where request.store_id = target_store_id and request.client_request_id = client_id;
  if request_id is not null then return private.leave_request_json(request_id); end if;
  select candidate.* into leave_type
  from public.leave_types candidate
  where candidate.store_id = target_store_id
    and candidate.id = (payload ->> 'leaveTypeId')::uuid
    and candidate.is_active;
  if leave_type.id is null then
    raise exception using errcode = 'P0001', message = 'leave:invalid-type:Dit verloftype is niet beschikbaar.';
  end if;
  if start_on < current_date + leave_type.minimum_notice_days then
    raise exception using errcode = 'P0001', message = 'leave:notice:Deze aanvraag voldoet niet aan de minimumtermijn.';
  end if;
  if exists (
    select 1 from public.leave_requests request
    where request.store_id = target_store_id
      and request.employee_id = target_employee_id
      and request.status in ('pending', 'approved')
      and daterange(request.start_date, request.end_date, '[]') && daterange(start_on, end_on, '[]')
  ) then
    raise exception using errcode = 'P0001', message = 'leave:overlap:Er bestaat al een aanvraag in deze periode.';
  end if;
  select sum(private.workforce_minutes_for_day(target_store_id, target_employee_id, day::date))::integer
  into total from generate_series(start_on, end_on, interval '1 day') day;
  if coalesce(total, 0) <= 0 then
    raise exception using errcode = 'P0001', message = 'leave:no-workdays:Deze periode bevat geen geplande werkuren.';
  end if;
  coverage := private.evaluate_leave_coverage(target_store_id, target_employee_id, start_on, end_on, null);
  insert into public.leave_requests (
    store_id, employee_id, leave_type_id, client_request_id, start_date, end_date,
    total_minutes, employee_note, coverage_risk, coverage_snapshot
  ) values (
    target_store_id, target_employee_id, leave_type.id, client_id, start_on, end_on, total,
    nullif(btrim(payload ->> 'note'), ''), coverage ->> 'risk', coverage
  ) returning id into request_id;

  for year_record in
    select extract(year from day)::integer as segment_year,
           sum(private.workforce_minutes_for_day(target_store_id, target_employee_id, day::date))::integer as minutes
    from generate_series(start_on, end_on, interval '1 day') day
    group by extract(year from day)::integer
  loop
    if year_record.minutes <= 0 then continue; end if;
    if leave_type.requires_balance then
      select account.* into account_record
      from public.leave_accounts account
      where account.store_id = target_store_id
        and account.employee_id = target_employee_id
        and account.leave_type_id = leave_type.id
        and account.balance_year = year_record.segment_year
      for update;
      if account_record.id is null then
        raise exception using errcode = 'P0001', message = 'leave:no-balance:Voor dit jaar is nog geen verlofsaldo ingesteld.';
      end if;
      select coalesce(sum(entry.amount_minutes), 0)::integer into available
      from public.leave_ledger_entries entry
      where entry.store_id = target_store_id and entry.leave_account_id = account_record.id;
      if not leave_type.allows_negative_balance and available < year_record.minutes then
        raise exception using errcode = 'P0001', message = 'leave:insufficient-balance:Onvoldoende beschikbaar verlofsaldo.';
      end if;
    else
      account_record.id := null;
    end if;
    insert into public.leave_request_segments (
      store_id, request_id, leave_account_id, segment_year, minutes
    ) values (target_store_id, request_id, account_record.id, year_record.segment_year, year_record.minutes);
    if account_record.id is not null then
      insert into public.leave_ledger_entries (
        store_id, leave_account_id, request_id, entry_kind, amount_minutes, reason, actor_user_id
      ) values (
        target_store_id, account_record.id, request_id, 'reservation', -year_record.minutes,
        'Saldo gereserveerd voor verlofaanvraag.', actor_id
      );
    end if;
  end loop;
  insert into public.leave_request_events (
    store_id, request_id, event_type, to_status, actor_user_id, metadata
  ) values (target_store_id, request_id, 'submitted', 'pending', actor_id, coverage);
  perform public.append_audit(target_store_id, 'leave.submitted', jsonb_build_object(
    'requestId', request_id, 'startDate', start_on, 'endDate', end_on, 'minutes', total
  ));
  return private.leave_request_json(request_id);
end;
$$;

revoke all on function public.submit_leave_request(uuid, jsonb) from public, anon;
grant execute on function public.submit_leave_request(uuid, jsonb) to authenticated;
