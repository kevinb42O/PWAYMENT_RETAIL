-- A leave decision is a sensitive management action. The active account must
-- be a store owner and must re-confirm with a separate, per-owner PIN. The PIN
-- hash is never returned to the browser and is checked in the same transaction
-- that changes the leave request.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.workforce_leave_approval_pins (
  store_id uuid not null references public.stores(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  pin_hash text not null,
  failed_attempts smallint not null default 0 check (failed_attempts between 0 and 5),
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (store_id, user_id)
);

alter table public.workforce_leave_approval_pins enable row level security;
revoke all on public.workforce_leave_approval_pins from public, anon, authenticated;

create trigger workforce_leave_approval_pins_set_updated_at
  before update on public.workforce_leave_approval_pins
  for each row execute function private.set_updated_at();

create or replace function public.set_leave_approval_pin(target_store_id uuid, payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare actor_id uuid := (select auth.uid());
declare submitted_pin text := payload ->> 'pin';
begin
  perform private.assert_workforce_entitlement(target_store_id);
  if actor_id is null or not private.has_store_role(target_store_id, array['owner']) then
    raise exception using errcode = '42501', message = 'leave:forbidden:Alleen de zaakvoerder kan een goedkeurings-PIN beheren.';
  end if;
  if submitted_pin is null or submitted_pin !~ '^[0-9]{6}$' then
    raise exception using errcode = 'P0001', message = 'leave:pin:De goedkeurings-PIN moet uit exact 6 cijfers bestaan.';
  end if;

  insert into public.workforce_leave_approval_pins (store_id, user_id, pin_hash, failed_attempts, locked_until)
  values (target_store_id, actor_id, extensions.crypt(submitted_pin, extensions.gen_salt('bf', 12)), 0, null)
  on conflict (store_id, user_id) do update
    set pin_hash = excluded.pin_hash, failed_attempts = 0, locked_until = null;

  perform public.append_audit(target_store_id, 'leave.approval_pin_set', jsonb_build_object('ownerUserId', actor_id));
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.verify_leave_approval_pin(target_store_id uuid, payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare actor_id uuid := (select auth.uid());
declare approval_record public.workforce_leave_approval_pins%rowtype;
declare submitted_pin text := payload ->> 'approvalPin';
declare next_failures smallint;
begin
  perform private.assert_workforce_entitlement(target_store_id);
  if actor_id is null or not private.has_store_role(target_store_id, array['owner']) then
    raise exception using errcode = '42501', message = 'leave:forbidden:Alleen de zaakvoerder kan verlofgoedkeuring openen.';
  end if;
  if submitted_pin is null or submitted_pin !~ '^[0-9]{6}$' then
    return jsonb_build_object('ok', false, 'errorCode', 'invalid-pin');
  end if;
  select * into approval_record from public.workforce_leave_approval_pins
    where store_id = target_store_id and user_id = actor_id for update;
  if approval_record.user_id is null then
    return jsonb_build_object('ok', false, 'errorCode', 'pin-not-configured');
  end if;
  if approval_record.locked_until is not null and approval_record.locked_until > now() then
    return jsonb_build_object('ok', false, 'errorCode', 'pin-locked');
  end if;
  if approval_record.pin_hash <> extensions.crypt(submitted_pin, approval_record.pin_hash) then
    next_failures := approval_record.failed_attempts + 1;
    update public.workforce_leave_approval_pins
      set failed_attempts = case when next_failures >= 5 then 0 else next_failures end,
          locked_until = case when next_failures >= 5 then now() + interval '15 minutes' else null end
      where store_id = target_store_id and user_id = actor_id;
    perform public.append_audit(target_store_id, 'leave.approval_pin_failed', jsonb_build_object('ownerUserId', actor_id));
    return jsonb_build_object('ok', false, 'errorCode', case when next_failures >= 5 then 'pin-locked' else 'invalid-pin' end);
  end if;
  update public.workforce_leave_approval_pins set failed_attempts = 0, locked_until = null
    where store_id = target_store_id and user_id = actor_id;
  perform public.append_audit(target_store_id, 'leave.approval_access_granted', jsonb_build_object('ownerUserId', actor_id));
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.decide_leave_request(target_store_id uuid, payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare actor_id uuid := (select auth.uid());
declare request_record public.leave_requests%rowtype;
declare employee_user_id uuid;
declare approval_record public.workforce_leave_approval_pins%rowtype;
declare submitted_pin text := payload ->> 'approvalPin';
declare decision text := payload ->> 'decision';
declare note text := nullif(btrim(payload ->> 'note'), '');
declare coverage jsonb;
declare segment record;
declare next_failures smallint;
begin
  perform private.assert_workforce_entitlement(target_store_id);
  if actor_id is null or not private.has_store_role(target_store_id, array['owner']) then
    raise exception using errcode = '42501', message = 'leave:forbidden:Alleen de zaakvoerder kan verlof definitief beslissen.';
  end if;
  if submitted_pin is null or submitted_pin !~ '^[0-9]{6}$' then
    return jsonb_build_object('ok', false, 'errorCode', 'invalid-pin');
  end if;
  select * into approval_record from public.workforce_leave_approval_pins
    where store_id = target_store_id and user_id = actor_id for update;
  if approval_record.user_id is null then
    return jsonb_build_object('ok', false, 'errorCode', 'pin-not-configured');
  end if;
  if approval_record.locked_until is not null and approval_record.locked_until > now() then
    return jsonb_build_object('ok', false, 'errorCode', 'pin-locked');
  end if;
  if approval_record.pin_hash <> extensions.crypt(submitted_pin, approval_record.pin_hash) then
    next_failures := approval_record.failed_attempts + 1;
    update public.workforce_leave_approval_pins
      set failed_attempts = case when next_failures >= 5 then 0 else next_failures end,
          locked_until = case when next_failures >= 5 then now() + interval '15 minutes' else null end
      where store_id = target_store_id and user_id = actor_id;
    perform public.append_audit(target_store_id, 'leave.approval_pin_failed', jsonb_build_object('ownerUserId', actor_id));
    return jsonb_build_object('ok', false, 'errorCode', case when next_failures >= 5 then 'pin-locked' else 'invalid-pin' end);
  end if;
  update public.workforce_leave_approval_pins
    set failed_attempts = 0, locked_until = null
    where store_id = target_store_id and user_id = actor_id;

  if decision not in ('approved', 'rejected') then
    raise exception using errcode = 'P0001', message = 'leave:invalid-decision:Ongeldige beslissing.';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(target_store_id::text || ':workforce-coverage', 0)
  );
  select * into request_record from public.leave_requests
    where store_id = target_store_id and id = (payload ->> 'requestId')::uuid for update;
  if request_record.id is null or request_record.status <> 'pending' then
    raise exception using errcode = 'P0001', message = 'leave:not-pending:Deze aanvraag is al verwerkt.';
  end if;
  select user_id into employee_user_id from public.workforce_employees
    where store_id = target_store_id and id = request_record.employee_id;
  if employee_user_id = actor_id then
    raise exception using errcode = '42501', message = 'leave:self-approval:Je kunt je eigen verlofaanvraag niet goedkeuren.';
  end if;
  if decision = 'rejected' and note is null then
    raise exception using errcode = 'P0001', message = 'leave:reason-required:Geef een reden voor de afwijzing.';
  end if;
  coverage := private.evaluate_leave_coverage(
    target_store_id, request_record.employee_id, request_record.start_date, request_record.end_date, request_record.id
  );
  if decision = 'approved' and coverage ->> 'risk' = 'red' and note is null then
    raise exception using errcode = 'P0001', message = 'leave:override-required:De dekking is rood. Motiveer waarom je toch goedkeurt.';
  end if;

  for segment in select * from public.leave_request_segments
                 where store_id = target_store_id and request_id = request_record.id loop
    if segment.leave_account_id is not null then
      insert into public.leave_ledger_entries (store_id, leave_account_id, request_id, entry_kind, amount_minutes, reason, actor_user_id)
      values (target_store_id, segment.leave_account_id, request_record.id, 'reservation_release', segment.minutes,
        case when decision = 'approved' then 'Reservatie omgezet naar opgenomen verlof.' else 'Reservatie vrijgegeven na afwijzing.' end, actor_id);
      if decision = 'approved' then
        insert into public.leave_ledger_entries (store_id, leave_account_id, request_id, entry_kind, amount_minutes, reason, actor_user_id)
        values (target_store_id, segment.leave_account_id, request_record.id, 'consumption', -segment.minutes, 'Goedgekeurd verlof.', actor_id);
      end if;
    end if;
  end loop;
  update public.leave_requests set status = decision, decision_note = note, decided_by_user_id = actor_id,
    decided_at = now(), coverage_risk = coverage ->> 'risk', coverage_snapshot = coverage
    where id = request_record.id;
  insert into public.leave_request_events (store_id, request_id, event_type, from_status, to_status, actor_user_id, note, metadata)
    values (target_store_id, request_record.id, decision, 'pending', decision, actor_id, note, coverage);
  perform public.append_audit(target_store_id, 'leave.' || decision, jsonb_build_object(
    'requestId', request_record.id, 'coverageRisk', coverage ->> 'risk', 'note', note, 'confirmedWithPin', true
  ));
  return private.leave_request_json(request_record.id);
end;
$$;

-- Keep the existing sizeable bootstrap payload untouched and wrap it with the
-- one owner-only flag this feature needs.
alter function public.get_workforce_bootstrap(uuid) rename to get_workforce_bootstrap_legacy_payload;

create function public.get_workforce_bootstrap(target_store_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare actor_id uuid := (select auth.uid());
declare approval_pin_configured boolean;
declare payload jsonb;
begin
  payload := public.get_workforce_bootstrap_legacy_payload(target_store_id);
  approval_pin_configured := private.has_store_role(target_store_id, array['owner']) and exists (
    select 1 from public.workforce_leave_approval_pins pin
    where pin.store_id = target_store_id and pin.user_id = actor_id
  );
  return jsonb_set(payload, '{approvalPinConfigured}', to_jsonb(approval_pin_configured));
end;
$$;

revoke all on function public.get_workforce_bootstrap_legacy_payload(uuid) from public, anon, authenticated;
revoke all on function public.get_workforce_bootstrap(uuid) from public, anon;
revoke all on function public.set_leave_approval_pin(uuid, jsonb) from public, anon;
revoke all on function public.verify_leave_approval_pin(uuid, jsonb) from public, anon;
revoke all on function public.decide_leave_request(uuid, jsonb) from public, anon;
grant execute on function public.get_workforce_bootstrap(uuid) to authenticated;
grant execute on function public.set_leave_approval_pin(uuid, jsonb) to authenticated;
grant execute on function public.verify_leave_approval_pin(uuid, jsonb) to authenticated;
grant execute on function public.decide_leave_request(uuid, jsonb) to authenticated;
