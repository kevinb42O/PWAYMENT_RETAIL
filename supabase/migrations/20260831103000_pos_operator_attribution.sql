begin;

-- Preserve the authenticated account as the technical transport identity while
-- recording the human operator who performed each physical POS action.
alter table public.transactions
  add column operator_id uuid references public.pos_operators(id) on delete set null,
  add column operator_name text,
  add column operator_device_id uuid references public.pos_devices(id) on delete set null,
  add column operator_access_mode text check (operator_access_mode in ('session', 'offline-device', 'legacy-account')),
  add column discount_approved_by_operator_id uuid references public.pos_operators(id) on delete set null;

alter table public.pos_discount_approvals
  add column requester_operator_id uuid references public.pos_operators(id) on delete set null,
  add column approved_by_operator_id uuid references public.pos_operators(id) on delete set null,
  add column requester_device_id uuid references public.pos_devices(id) on delete set null;

alter table public.register_shifts
  add column opened_by_operator_id uuid references public.pos_operators(id) on delete set null,
  add column closed_by_operator_id uuid references public.pos_operators(id) on delete set null;

alter table public.daily_reports
  add column closed_by_operator_id uuid references public.pos_operators(id) on delete set null,
  add column closed_by_device_id uuid references public.pos_devices(id) on delete set null;

alter table public.void_entries
  add column by_operator_id uuid references public.pos_operators(id) on delete set null,
  add column by_device_id uuid references public.pos_devices(id) on delete set null;

alter table public.audit_entries
  add column operator_id uuid references public.pos_operators(id) on delete set null,
  add column operator_name text,
  add column operator_device_id uuid references public.pos_devices(id) on delete set null;

alter table public.gift_card_events
  add column operator_id uuid references public.pos_operators(id) on delete set null,
  add column operator_name text,
  add column operator_device_id uuid references public.pos_devices(id) on delete set null;

create index transactions_store_operator_time_idx
  on public.transactions(store_id, operator_id, occurred_at desc);
create index audit_entries_store_operator_time_idx
  on public.audit_entries(store_id, operator_id, occurred_at desc);

-- Online actions use the in-memory session token; offline actions use the
-- encrypted server grant recovered by the entered PIN. Captured ids alone are
-- never authentication. The account-owner fallback exists only for historic
-- pre-migration outbox rows that carry no operator fields at all.
create or replace function private.resolve_pos_action_actor(
  target_store_id uuid,
  action_payload jsonb,
  allowed_roles text[] default array['owner','manager','cashier']::text[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  raw_token text := nullif(action_payload ->> 'operator_session_token', '');
  raw_offline_token text := nullif(action_payload ->> 'operator_offline_grant_token', '');
  submitted_operator_id uuid;
  submitted_device_id uuid;
  operator_row public.pos_operators%rowtype;
  device_row public.pos_devices%rowtype;
  session_row private.pos_operator_sessions%rowtype;
  grant_row private.pos_offline_grants%rowtype;
  access_mode text;
begin
  if (select auth.uid()) is null or not private.is_store_member(target_store_id) then
    raise exception using errcode = '42501', message = 'pos-access:forbidden:Geen toegang tot deze winkel.';
  end if;
  begin
    submitted_operator_id := nullif(action_payload ->> 'operator_id', '')::uuid;
    submitted_device_id := nullif(action_payload ->> 'operator_device_id', '')::uuid;
  exception when invalid_text_representation then
    raise exception using errcode = '22023', message = 'pos-access:invalid-attribution:Ongeldige kassatoeschrijving.';
  end;

  if raw_token is not null then
    operator_row := private.resolve_pos_session(target_store_id, raw_token, allowed_roles, false);
    select * into strict session_row
      from private.pos_operator_sessions session
      where session.store_id = target_store_id
        and session.account_user_id = (select auth.uid())
        and session.token_hash = extensions.encode(extensions.digest(raw_token, 'sha256'), 'hex');
    if submitted_operator_id is not null and submitted_operator_id <> operator_row.id then
      raise exception using errcode = '42501', message = 'pos-access:operator-mismatch:Vergrendel en meld opnieuw aan.';
    end if;
    submitted_device_id := session_row.device_id;
    access_mode := 'session';
  elsif raw_offline_token is not null then
    select * into grant_row from private.pos_offline_grants grant_record
    where grant_record.store_id = target_store_id
      and grant_record.account_user_id = (select auth.uid())
      and grant_record.token_hash = extensions.encode(extensions.digest(raw_offline_token, 'sha256'), 'hex')
      and grant_record.revoked_at is null
      and grant_record.expires_at > now()
    for update;
    select * into operator_row from public.pos_operators operator
    where operator.store_id = target_store_id and operator.id = grant_row.operator_id
      and operator.status = 'active' and operator.offline_access_enabled
      and operator.access_version = grant_row.access_version;
    select * into device_row from public.pos_devices device
    where device.store_id = target_store_id and device.id = grant_row.device_id and device.status = 'active';
    if grant_row.id is null or operator_row.id is null or device_row.id is null
       or (submitted_operator_id is not null and submitted_operator_id <> operator_row.id)
       or not (operator_row.role = any(allowed_roles)) then
      raise exception using errcode = '42501', message = 'pos-access:offline-grant-invalid:De offline toegang is verlopen.';
    end if;
    submitted_device_id := grant_row.device_id;
    update private.pos_offline_grants set last_used_at = now() where id = grant_row.id;
    access_mode := 'offline-device';
  else
    if submitted_operator_id is not null and submitted_device_id is not null then
      -- A durable outbox row may outlive its in-memory operator token. Never
      -- trust its captured ids as authentication: keep it pending until the
      -- same operator unlocks again and can supply a session/offline grant.
      raise exception using errcode = '42501', message = 'pos-access:session-required:Meld dezelfde medewerker opnieuw aan om de wachtrij veilig te synchroniseren.';
    else
      select * into operator_row from public.pos_operators operator
      where operator.store_id = target_store_id
        and operator.account_user_id = (select auth.uid())
        and operator.status = 'active';
      if operator_row.id is null or operator_row.role <> all(allowed_roles) then
        raise exception using errcode = '42501', message = 'pos-access:session-required:Vergrendel en meld opnieuw aan.';
      end if;
      select * into device_row from public.pos_devices device
      where device.store_id = target_store_id
        and device.paired_by_user_id = (select auth.uid())
        and device.status = 'active'
      order by device.last_seen_at desc limit 1;
      submitted_device_id := device_row.id;
      access_mode := 'legacy-account';
    end if;
  end if;

  if not (operator_row.role = any(allowed_roles)) then
    raise exception using errcode = '42501', message = 'pos-access:forbidden:Onvoldoende rechten.';
  end if;
  update public.pos_devices set last_seen_at = now(), updated_at = now()
    where store_id = target_store_id and id = submitted_device_id;
  return pg_catalog.jsonb_build_object(
    'operatorId', operator_row.id,
    'operatorName', operator_row.display_name,
    'role', operator_row.role,
    'deviceId', submitted_device_id,
    'accessMode', access_mode
  );
end;
$$;

do $$
begin
  if to_regprocedure('public.checkout_sale_operator_v1(uuid,jsonb)') is null then
    alter function public.checkout_sale(uuid, jsonb) rename to checkout_sale_operator_v1;
  end if;
  if to_regprocedure('public.checkout_gift_card_sale_operator_v1(uuid,jsonb)') is null then
    alter function public.checkout_gift_card_sale(uuid, jsonb) rename to checkout_gift_card_sale_operator_v1;
  end if;
  if to_regprocedure('public.refund_sale_operator_v1(uuid,jsonb)') is null then
    alter function public.refund_sale(uuid, jsonb) rename to refund_sale_operator_v1;
  end if;
  if to_regprocedure('public.finalize_daily_report_operator_v1(uuid,jsonb)') is null then
    alter function public.finalize_daily_report(uuid, jsonb) rename to finalize_daily_report_operator_v1;
  end if;
  if to_regprocedure('public.record_void_operator_v1(uuid,jsonb)') is null then
    alter function public.record_void(uuid, jsonb) rename to record_void_operator_v1;
  end if;
  if to_regprocedure('public.append_audit_operator_v1(uuid,text,jsonb)') is null then
    alter function public.append_audit(uuid, text, jsonb) rename to append_audit_operator_v1;
  end if;
  if to_regprocedure('public.approve_pos_discount_account_v1(uuid,jsonb)') is null then
    alter function public.approve_pos_discount(uuid, jsonb) rename to approve_pos_discount_account_v1;
  end if;
end;
$$;

revoke all on function public.checkout_sale_operator_v1(uuid,jsonb) from public, anon, authenticated;
revoke all on function public.checkout_sale_payment_v1(uuid,jsonb) from public, anon, authenticated;
revoke all on function public.checkout_gift_card_sale_operator_v1(uuid,jsonb) from public, anon, authenticated;
revoke all on function public.refund_sale_operator_v1(uuid,jsonb) from public, anon, authenticated;
revoke all on function public.finalize_daily_report_operator_v1(uuid,jsonb) from public, anon, authenticated;
revoke all on function public.record_void_operator_v1(uuid,jsonb) from public, anon, authenticated;
revoke all on function public.append_audit_operator_v1(uuid,text,jsonb) from public, anon, authenticated;
revoke all on function public.approve_pos_discount_account_v1(uuid,jsonb) from public, anon, authenticated;
revoke all on function public.set_pos_manager_approval_pin(uuid,jsonb) from public, anon, authenticated;

-- A cashier now asks an active POS owner/manager to enter that operator's
-- normal personal PIN. The technical auth account is only transport identity;
-- it can no longer silently self-authorise a cashier discount.
create or replace function public.approve_pos_discount(target_store_id uuid, payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor jsonb;
  submitted_pin text := nullif(btrim(payload ->> 'approvalPin'), '');
  requested_reason text := nullif(btrim(payload ->> 'reason'), '');
  requested_cart_id integer;
  requested_discount_cents bigint;
  requester_operator_id uuid;
  requester_device_id uuid;
  credential_row private.pos_operator_credentials%rowtype;
  approving_operator public.pos_operators%rowtype;
  attempt_row private.pos_approval_attempts%rowtype;
  next_failures integer;
  lookup_digest text;
  approval_id uuid;
begin
  if nullif(payload ->> 'operator_session_token', '') is null then
    return jsonb_build_object('ok', false, 'errorCode', 'online-session-required');
  end if;
  actor := private.resolve_pos_action_actor(target_store_id, coalesce(payload, '{}'::jsonb));
  requester_operator_id := (actor ->> 'operatorId')::uuid;
  requester_device_id := nullif(actor ->> 'deviceId', '')::uuid;
  if requester_device_id is null then
    return jsonb_build_object('ok', false, 'errorCode', 'online-session-required');
  end if;
  if submitted_pin is null or submitted_pin !~ '^[0-9]{6}$' then
    return jsonb_build_object('ok', false, 'errorCode', 'invalid-pin');
  end if;
  begin
    requested_cart_id := coalesce((payload ->> 'cartId')::integer, 1);
    requested_discount_cents := (payload ->> 'discountCents')::bigint;
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception using errcode = '22023', message = 'pos-approval:invalid-request:Ongeldige korting.';
  end;
  if requested_cart_id < 1
     or requested_discount_cents is null
     or requested_discount_cents <= 0
     or requested_discount_cents > 100000000
     or requested_reason is null
     or length(requested_reason) > 500 then
    raise exception using errcode = '22023', message = 'pos-approval:invalid-request:Ongeldige kortingsgoedkeuring.';
  end if;

  insert into private.pos_approval_attempts(device_id, store_id)
    values (requester_device_id, target_store_id)
    on conflict (device_id) do nothing;
  select * into strict attempt_row from private.pos_approval_attempts attempt
    where attempt.device_id = requester_device_id for update;
  if attempt_row.locked_until is not null and attempt_row.locked_until > now() then
    return jsonb_build_object('ok', false, 'errorCode', 'pin-locked', 'retryAt', attempt_row.locked_until);
  end if;

  lookup_digest := private.pos_pin_digest(target_store_id, submitted_pin);
  select credential.* into credential_row
  from private.pos_operator_credentials credential
  join public.pos_operators operator on operator.id = credential.operator_id
  where credential.store_id = target_store_id
    and credential.pin_lookup_digest = lookup_digest
    and operator.store_id = target_store_id
    and operator.role in ('owner', 'manager')
    and operator.status = 'active'
    and not operator.must_change_pin
    and (credential.reset_expires_at is null or credential.reset_expires_at > now())
    and (credential.locked_until is null or credential.locked_until <= now())
  for update of credential;
  if credential_row.operator_id is null
     or credential_row.pin_hash <> extensions.crypt(submitted_pin, credential_row.pin_hash) then
    if credential_row.operator_id is null then
      perform extensions.crypt(submitted_pin, extensions.gen_salt('bf', 12));
    end if;
    next_failures := coalesce(attempt_row.failed_attempts, 0) + 1;
    update private.pos_approval_attempts set
      failed_attempts = next_failures,
      locked_until = case when next_failures >= 5 then now() + interval '15 minutes' else null end,
      last_failed_at = now(), updated_at = now()
    where device_id = requester_device_id;
    insert into public.pos_access_events(
      store_id, device_id, operator_id, account_user_id, event_type, success
    ) values (
      target_store_id, requester_device_id, requester_operator_id, auth.uid(),
      'pos.discount_approval_failed', false
    );
    return jsonb_build_object(
      'ok', false,
      'errorCode', case when next_failures >= 5 then 'pin-locked' else 'invalid-pin' end
    );
  end if;

  select * into strict approving_operator from public.pos_operators
    where id = credential_row.operator_id and store_id = target_store_id;
  update private.pos_approval_attempts set
    failed_attempts = 0, locked_until = null, updated_at = now()
  where device_id = requester_device_id;
  insert into public.pos_discount_approvals(
    store_id, requester_user_id, approved_by_user_id,
    requester_operator_id, approved_by_operator_id, requester_device_id,
    cart_id, discount_cents, reason, expires_at
  ) values (
    target_store_id, auth.uid(), coalesce(approving_operator.account_user_id, auth.uid()),
    requester_operator_id, approving_operator.id, requester_device_id,
    requested_cart_id, requested_discount_cents, requested_reason, now() + interval '5 minutes'
  ) returning id into approval_id;
  insert into public.pos_access_events(
    store_id, device_id, operator_id, actor_operator_id, account_user_id, event_type,
    detail
  ) values (
    target_store_id, requester_device_id, requester_operator_id, approving_operator.id,
    auth.uid(), 'pos.discount_approved',
    jsonb_build_object('approvalId', approval_id, 'discountCents', requested_discount_cents)
  );
  return jsonb_build_object(
    'ok', true,
    'approvalId', approval_id,
    'approvedByUserId', approving_operator.id,
    'approvedByOperatorId', approving_operator.id,
    'expiresAt', (select approval.expires_at from public.pos_discount_approvals approval where approval.id = approval_id)
  );
end;
$$;

create or replace function public.checkout_sale(target_store_id uuid, payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor jsonb;
  clean_payload jsonb;
  result jsonb;
  transaction_id uuid;
  requested_discount_cents bigint;
  approval_id uuid;
  approval_record public.pos_discount_approvals%rowtype;
  approver_operator_id uuid;
begin
  actor := private.resolve_pos_action_actor(target_store_id, coalesce(payload, '{}'::jsonb));
  begin
    requested_discount_cents := coalesce((payload ->> 'discount_cents')::bigint, 0);
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception using errcode = '22023', message = 'checkout:invalid-request:Ongeldige korting.';
  end;
  if requested_discount_cents > 0 then
    if actor ->> 'role' = 'cashier' then
      begin
        approval_id := nullif(payload ->> 'discount_approval_id', '')::uuid;
      exception when invalid_text_representation then
        raise exception using errcode = '42501', message = 'checkout:discount-approval-required:Een geldige managergoedkeuring is vereist.';
      end;
      select * into approval_record from public.pos_discount_approvals approval
      where approval.id = approval_id for update;
      if approval_record.id is null
         or approval_record.store_id <> target_store_id
         or approval_record.requester_operator_id <> (actor ->> 'operatorId')::uuid
         or approval_record.requester_device_id is distinct from nullif(actor ->> 'deviceId', '')::uuid
         or approval_record.approved_by_operator_id is null
         or approval_record.consumed_at is not null
         or approval_record.expires_at <= now()
         or approval_record.cart_id <> coalesce((payload ->> 'cart_id')::integer, 1)
         or approval_record.discount_cents <> requested_discount_cents
         or approval_record.reason <> coalesce(nullif(btrim(payload ->> 'discount_reason'), ''), '') then
        raise exception using errcode = '42501', message = 'checkout:discount-approval-required:De managergoedkeuring is verlopen, gebruikt of hoort niet bij deze korting.';
      end if;
      approver_operator_id := approval_record.approved_by_operator_id;
      update public.pos_discount_approvals set consumed_at = now() where id = approval_record.id;
    else
      approver_operator_id := (actor ->> 'operatorId')::uuid;
    end if;
  end if;
  clean_payload := payload
    - 'operator_session_token' - 'operator_offline_grant_token'
    - 'operator_id' - 'operator_device_id'
    - 'discount_approval_id' - 'discount_approved_by_user_id';
  if approver_operator_id is not null then
    clean_payload := clean_payload || jsonb_build_object('discount_approved_by_user_id', auth.uid());
  end if;
  -- Call the complete pre-approval checkout implementation after enforcing
  -- operator-native approval above. The account-role wrapper is intentionally
  -- bypassed because auth.uid() is only the transport account on a register.
  result := public.checkout_sale_payment_v1(target_store_id, clean_payload);
  transaction_id := nullif(result ->> 'transaction_id', '')::uuid;
  update public.transactions set
    operator_id = (actor ->> 'operatorId')::uuid,
    operator_name = actor ->> 'operatorName',
    operator_device_id = nullif(actor ->> 'deviceId', '')::uuid,
    operator_access_mode = actor ->> 'accessMode',
    discount_approved_by_operator_id = approver_operator_id
  where store_id = target_store_id and id = transaction_id;
  if approval_id is not null then
    update public.pos_discount_approvals set consumed_by_transaction_id = transaction_id
      where id = approval_id;
  end if;
  update public.register_shifts shift set
    opened_by_operator_id = coalesce(shift.opened_by_operator_id, (actor ->> 'operatorId')::uuid)
  from public.transactions transaction
  where transaction.store_id = target_store_id and transaction.id = transaction_id
    and shift.store_id = transaction.store_id and shift.id = transaction.shift_id;
  return result;
end $$;

create or replace function public.checkout_gift_card_sale(target_store_id uuid, payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor jsonb; result jsonb; target_transaction_id uuid;
begin
  actor := private.resolve_pos_action_actor(target_store_id, coalesce(payload, '{}'::jsonb));
  result := public.checkout_gift_card_sale_operator_v1(
    target_store_id, payload - 'operator_session_token' - 'operator_offline_grant_token' - 'operator_id' - 'operator_device_id'
  );
  target_transaction_id := nullif(result ->> 'transaction_id', '')::uuid;
  update public.transactions set
    operator_id = (actor ->> 'operatorId')::uuid,
    operator_name = actor ->> 'operatorName',
    operator_device_id = nullif(actor ->> 'deviceId', '')::uuid,
    operator_access_mode = actor ->> 'accessMode'
  where store_id = target_store_id and id = target_transaction_id;
  update public.gift_card_events set
    operator_id = (actor ->> 'operatorId')::uuid,
    operator_name = actor ->> 'operatorName',
    operator_device_id = nullif(actor ->> 'deviceId', '')::uuid
  where store_id = target_store_id and transaction_id = target_transaction_id;
  return result;
end $$;

create or replace function public.refund_sale(target_store_id uuid, payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor jsonb; result jsonb; refund_id uuid;
begin
  actor := private.resolve_pos_action_actor(target_store_id, coalesce(payload, '{}'::jsonb));
  result := public.refund_sale_operator_v1(
    target_store_id, payload - 'operator_session_token' - 'operator_offline_grant_token' - 'operator_id' - 'operator_device_id'
  );
  refund_id := nullif(result ->> 'transaction_id', '')::uuid;
  update public.transactions set
    operator_id = (actor ->> 'operatorId')::uuid,
    operator_name = actor ->> 'operatorName',
    operator_device_id = nullif(actor ->> 'deviceId', '')::uuid,
    operator_access_mode = actor ->> 'accessMode'
  where store_id = target_store_id and id = refund_id;
  return result;
end $$;

create or replace function public.finalize_daily_report(target_store_id uuid, payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor jsonb; result jsonb; target_report_id uuid;
begin
  actor := private.resolve_pos_action_actor(
    target_store_id, coalesce(payload, '{}'::jsonb), array['owner','manager']::text[]
  );
  result := public.finalize_daily_report_operator_v1(
    target_store_id, payload - 'operator_session_token' - 'operator_offline_grant_token' - 'operator_id' - 'operator_device_id'
  );
  if result is null then return null; end if;
  target_report_id := nullif(result ->> 'daily_report_id', '')::uuid;
  update public.daily_reports set
    closed_by_operator_id = (actor ->> 'operatorId')::uuid,
    closed_by_device_id = nullif(actor ->> 'deviceId', '')::uuid
  where store_id = target_store_id and id = target_report_id;
  update public.register_shifts shift set closed_by_operator_id = (actor ->> 'operatorId')::uuid
  from public.daily_reports report
  where report.store_id = target_store_id and report.id = target_report_id
    and shift.store_id = report.store_id and shift.id = report.shift_id;
  return result;
end $$;

create or replace function public.record_void(target_store_id uuid, payload jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare actor jsonb; result_id uuid;
begin
  actor := private.resolve_pos_action_actor(target_store_id, coalesce(payload, '{}'::jsonb));
  result_id := public.record_void_operator_v1(
    target_store_id, payload - 'operator_session_token' - 'operator_offline_grant_token' - 'operator_id' - 'operator_device_id'
  );
  update public.void_entries set
    by_operator_id = (actor ->> 'operatorId')::uuid,
    by_device_id = nullif(actor ->> 'deviceId', '')::uuid
  where store_id = target_store_id and id = result_id;
  return result_id;
end $$;

create or replace function public.append_audit(
  target_store_id uuid, event_action text, event_detail jsonb default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare actor jsonb; clean_detail jsonb; audit_id uuid;
begin
  clean_detail := coalesce(event_detail, '{}'::jsonb);
  if clean_detail ? 'operator_id' or clean_detail ? 'operator_session_token'
     or clean_detail ? 'operator_offline_grant_token' then
    actor := private.resolve_pos_action_actor(target_store_id, clean_detail);
    clean_detail := clean_detail - 'operator_session_token' - 'operator_offline_grant_token' - 'operator_id' - 'operator_device_id';
  end if;
  audit_id := public.append_audit_operator_v1(
    target_store_id, event_action, case when event_detail is null then null else clean_detail end
  );
  if actor is not null then
    update public.audit_entries set
      operator_id = (actor ->> 'operatorId')::uuid,
      operator_name = actor ->> 'operatorName',
      operator_device_id = nullif(actor ->> 'deviceId', '')::uuid
    where store_id = target_store_id and id = audit_id;
  end if;
  return audit_id;
end $$;

revoke all on function private.resolve_pos_action_actor(uuid,jsonb,text[]) from public, anon, authenticated;
revoke all on function public.approve_pos_discount(uuid,jsonb) from public, anon;
revoke all on function public.checkout_sale(uuid,jsonb) from public, anon;
revoke all on function public.checkout_gift_card_sale(uuid,jsonb) from public, anon;
revoke all on function public.refund_sale(uuid,jsonb) from public, anon;
revoke all on function public.finalize_daily_report(uuid,jsonb) from public, anon;
revoke all on function public.record_void(uuid,jsonb) from public, anon;
revoke all on function public.append_audit(uuid,text,jsonb) from public, anon;
grant execute on function public.checkout_sale(uuid,jsonb) to authenticated;
grant execute on function public.approve_pos_discount(uuid,jsonb) to authenticated;
grant execute on function public.checkout_gift_card_sale(uuid,jsonb) to authenticated;
grant execute on function public.refund_sale(uuid,jsonb) to authenticated;
grant execute on function public.finalize_daily_report(uuid,jsonb) to authenticated;
grant execute on function public.record_void(uuid,jsonb) to authenticated;
grant execute on function public.append_audit(uuid,text,jsonb) to authenticated;

commit;
