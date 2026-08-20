-- A cashier must never be able to self-assert a manager id in a checkout
-- payload.  Approvals live server-side, are short-lived and single-use, and
-- are consumed in the same transaction as the checkout they authorise.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.pos_manager_approval_pins (
  store_id uuid not null references public.stores(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  pin_hash text not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  primary key (store_id, user_id)
);

create table if not exists public.pos_discount_approval_attempts (
  store_id uuid not null references public.stores(id) on delete cascade,
  requester_user_id uuid not null references auth.users(id) on delete cascade,
  failed_attempts smallint not null default 0 check (failed_attempts between 0 and 5),
  locked_until timestamptz,
  updated_at timestamptz not null default clock_timestamp(),
  primary key (store_id, requester_user_id)
);

create table if not exists public.pos_discount_approvals (
  id uuid primary key default extensions.gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  requester_user_id uuid not null references auth.users(id) on delete restrict,
  approved_by_user_id uuid not null references auth.users(id) on delete restrict,
  cart_id integer not null check (cart_id >= 1),
  discount_cents bigint not null check (discount_cents > 0),
  reason text not null check (length(reason) between 1 and 500),
  approved_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  consumed_by_transaction_id uuid references public.transactions(id) on delete restrict,
  check (expires_at > approved_at)
);

create index if not exists pos_discount_approvals_store_expiry_idx
  on public.pos_discount_approvals (store_id, expires_at);

alter table public.pos_manager_approval_pins enable row level security;
alter table public.pos_discount_approval_attempts enable row level security;
alter table public.pos_discount_approvals enable row level security;
revoke all on public.pos_manager_approval_pins from public, anon, authenticated;
revoke all on public.pos_discount_approval_attempts from public, anon, authenticated;
revoke all on public.pos_discount_approvals from public, anon, authenticated;

create or replace function public.set_pos_manager_approval_pin(
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
  submitted_pin text := nullif(btrim(payload ->> 'pin'), '');
begin
  if actor_id is null or not private.has_store_role(target_store_id, array['owner', 'manager']) then
    raise exception using errcode = '42501', message = 'pos-approval:forbidden:Alleen een actieve eigenaar of manager kan zijn goedkeurings-PIN instellen.';
  end if;
  if submitted_pin is null or submitted_pin !~ '^[0-9]{6}$' then
    raise exception using errcode = 'P0001', message = 'pos-approval:invalid-pin:De goedkeurings-PIN moet uit exact 6 cijfers bestaan.';
  end if;

  insert into public.pos_manager_approval_pins (store_id, user_id, pin_hash, updated_at)
  values (
    target_store_id,
    actor_id,
    extensions.crypt(submitted_pin, extensions.gen_salt('bf', 12)),
    clock_timestamp()
  )
  on conflict (store_id, user_id) do update
    set pin_hash = excluded.pin_hash,
        updated_at = clock_timestamp();

  perform public.append_audit(
    target_store_id,
    'pos.discount_approval_pin_set',
    pg_catalog.jsonb_build_object('managerUserId', actor_id)
  );
  return pg_catalog.jsonb_build_object('ok', true);
end;
$$;

create or replace function public.approve_pos_discount(
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
  submitted_pin text := nullif(btrim(payload ->> 'approvalPin'), '');
  requested_reason text := nullif(btrim(payload ->> 'reason'), '');
  requested_cart_id integer;
  requested_discount_cents bigint;
  attempt_record public.pos_discount_approval_attempts%rowtype;
  pin_record record;
  approving_user_id uuid;
  approval_id uuid;
  next_failures smallint;
  pins_configured boolean;
begin
  if actor_id is null or not private.has_store_role(target_store_id, array['owner', 'manager', 'cashier']) then
    raise exception using errcode = '42501', message = 'pos-approval:forbidden:Geen toegang tot deze winkel.';
  end if;
  if submitted_pin is null or submitted_pin !~ '^[0-9]{6}$' then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'invalid-pin');
  end if;
  begin
    requested_cart_id := coalesce((payload ->> 'cartId')::integer, 1);
    requested_discount_cents := (payload ->> 'discountCents')::bigint;
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception using errcode = 'P0001', message = 'pos-approval:invalid-request:Ongeldige korting.';
  end;
  if requested_cart_id < 1
     or requested_discount_cents is null
     or requested_discount_cents <= 0
     or requested_discount_cents > 100000000
     or requested_reason is null
     or length(requested_reason) > 500 then
    raise exception using errcode = 'P0001', message = 'pos-approval:invalid-request:Ongeldige kortingsgoedkeuring.';
  end if;

  -- A per-requester lock makes brute force attempts durable across tabs and
  -- devices.  A manager PIN itself is never returned or exposed to clients.
  insert into public.pos_discount_approval_attempts (store_id, requester_user_id)
  values (target_store_id, actor_id)
  on conflict (store_id, requester_user_id) do nothing;
  select * into attempt_record
  from public.pos_discount_approval_attempts
  where store_id = target_store_id and requester_user_id = actor_id
  for update;
  if attempt_record.locked_until is not null and attempt_record.locked_until > clock_timestamp() then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'pin-locked');
  end if;

  select exists (
    select 1
    from public.pos_manager_approval_pins pin
    join public.store_memberships membership
      on membership.store_id = pin.store_id and membership.user_id = pin.user_id
    where pin.store_id = target_store_id
      and membership.status = 'active'
      and membership.role in ('owner', 'manager')
  ) into pins_configured;
  if not pins_configured then
    return pg_catalog.jsonb_build_object('ok', false, 'errorCode', 'pin-not-configured');
  end if;

  for pin_record in
    select pin.user_id, pin.pin_hash
    from public.pos_manager_approval_pins pin
    join public.store_memberships membership
      on membership.store_id = pin.store_id and membership.user_id = pin.user_id
    where pin.store_id = target_store_id
      and membership.status = 'active'
      and membership.role in ('owner', 'manager')
    order by pin.user_id
  loop
    if pin_record.pin_hash = extensions.crypt(submitted_pin, pin_record.pin_hash) then
      approving_user_id := pin_record.user_id;
      exit;
    end if;
  end loop;

  if approving_user_id is null then
    next_failures := attempt_record.failed_attempts + 1;
    update public.pos_discount_approval_attempts
      set failed_attempts = case when next_failures >= 5 then 0 else next_failures end,
          locked_until = case when next_failures >= 5 then clock_timestamp() + interval '15 minutes' else null end,
          updated_at = clock_timestamp()
      where store_id = target_store_id and requester_user_id = actor_id;
    perform public.append_audit(
      target_store_id,
      'pos.discount_approval_pin_failed',
      pg_catalog.jsonb_build_object('requesterUserId', actor_id)
    );
    return pg_catalog.jsonb_build_object(
      'ok', false,
      'errorCode', case when next_failures >= 5 then 'pin-locked' else 'invalid-pin' end
    );
  end if;

  update public.pos_discount_approval_attempts
    set failed_attempts = 0, locked_until = null, updated_at = clock_timestamp()
    where store_id = target_store_id and requester_user_id = actor_id;
  insert into public.pos_discount_approvals (
    store_id, requester_user_id, approved_by_user_id,
    cart_id, discount_cents, reason, expires_at
  ) values (
    target_store_id, actor_id, approving_user_id,
    requested_cart_id, requested_discount_cents, requested_reason,
    clock_timestamp() + interval '5 minutes'
  ) returning id into approval_id;
  perform public.append_audit(
    target_store_id,
    'pos.discount_approved',
    pg_catalog.jsonb_build_object(
      'approvalId', approval_id,
      'requesterUserId', actor_id,
      'approvedByUserId', approving_user_id,
      'discountCents', requested_discount_cents,
      'reason', requested_reason
    )
  );
  return pg_catalog.jsonb_build_object(
    'ok', true,
    'approvalId', approval_id,
    'approvedByUserId', approving_user_id,
    'expiresAt', (select expires_at from public.pos_discount_approvals where id = approval_id)
  );
end;
$$;

create or replace function private.consume_pos_discount_approval(
  target_store_id uuid,
  actor_id uuid,
  payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  approval_id uuid;
  requested_cart_id integer;
  requested_discount_cents bigint;
  requested_reason text := nullif(btrim(payload ->> 'discount_reason'), '');
  approval_record public.pos_discount_approvals%rowtype;
begin
  begin
    approval_id := (payload ->> 'discount_approval_id')::uuid;
    requested_cart_id := coalesce((payload ->> 'cart_id')::integer, 1);
    requested_discount_cents := coalesce((payload ->> 'discount_cents')::bigint, 0);
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception using errcode = 'P0001', message = 'checkout:discount-approval-required:Deze korting vereist een geldige managergoedkeuring.';
  end;
  if approval_id is null then
    raise exception using errcode = 'P0001', message = 'checkout:discount-approval-required:Deze korting vereist een managergoedkeuring.';
  end if;

  select * into approval_record
  from public.pos_discount_approvals
  where id = approval_id
  for update;
  if approval_record.id is null
     or approval_record.store_id <> target_store_id
     or approval_record.requester_user_id <> actor_id
     or approval_record.consumed_at is not null
     or approval_record.expires_at <= clock_timestamp()
     or approval_record.cart_id <> requested_cart_id
     or approval_record.discount_cents <> requested_discount_cents
     or approval_record.reason <> coalesce(requested_reason, '') then
    raise exception using errcode = 'P0001', message = 'checkout:discount-approval-required:De managergoedkeuring is verlopen, gebruikt of hoort niet bij deze korting.';
  end if;

  update public.pos_discount_approvals
    set consumed_at = clock_timestamp()
    where id = approval_record.id;
  return approval_record.approved_by_user_id;
end;
$$;

-- Keep cash-rounding/split-tender validation from the preceding migration in
-- place, then add the authorisation boundary around that complete checkout.
do $$
begin
  if exists (
    select 1 from pg_proc
    where proname = 'checkout_sale' and pronamespace = 'public'::regnamespace
  ) and not exists (
    select 1 from pg_proc
    where proname = 'checkout_sale_payment_v1' and pronamespace = 'public'::regnamespace
  ) then
    alter function public.checkout_sale(uuid, jsonb) rename to checkout_sale_payment_v1;
  end if;
end;
$$;

create or replace function public.checkout_sale(target_store_id uuid, payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  requested_discount_cents bigint;
  approver_id uuid;
  approval_id uuid;
  sanitized_payload jsonb := coalesce(payload, '{}'::jsonb);
  result jsonb;
  transaction_id uuid;
begin
  if actor_id is null or not private.has_store_role(target_store_id, array['owner', 'manager', 'cashier']) then
    raise exception using errcode = '42501', message = 'checkout:forbidden:Geen toegang tot deze winkel.';
  end if;
  begin
    requested_discount_cents := coalesce((sanitized_payload ->> 'discount_cents')::bigint, 0);
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception using errcode = 'P0001', message = 'checkout:invalid-request:Ongeldige korting.';
  end;
  if requested_discount_cents < 0 then
    raise exception using errcode = 'P0001', message = 'checkout:invalid-request:Ongeldige korting.';
  end if;

  if requested_discount_cents > 0 then
    if private.has_store_role(target_store_id, array['owner', 'manager']) then
      -- An authenticated active manager authorises their own reduction; the
      -- client cannot substitute a different approver id.
      approver_id := actor_id;
    else
      approver_id := private.consume_pos_discount_approval(
        target_store_id,
        actor_id,
        sanitized_payload
      );
      approval_id := (sanitized_payload ->> 'discount_approval_id')::uuid;
    end if;
  end if;

  sanitized_payload := sanitized_payload - 'discount_approved_by_user_id' - 'discount_approval_id';
  if approver_id is not null then
    sanitized_payload := sanitized_payload || pg_catalog.jsonb_build_object(
      'discount_approved_by_user_id', approver_id
    );
  end if;
  result := public.checkout_sale_payment_v1(target_store_id, sanitized_payload);
  transaction_id := nullif(result ->> 'transaction_id', '')::uuid;
  if approval_id is not null and transaction_id is not null then
    update public.pos_discount_approvals
      set consumed_by_transaction_id = transaction_id
      where id = approval_id;
  end if;
  return result;
end;
$$;

revoke all on function private.consume_pos_discount_approval(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.set_pos_manager_approval_pin(uuid, jsonb) from public, anon;
revoke all on function public.approve_pos_discount(uuid, jsonb) from public, anon;
revoke all on function public.checkout_sale(uuid, jsonb) from public, anon;
grant execute on function public.set_pos_manager_approval_pin(uuid, jsonb) to authenticated;
grant execute on function public.approve_pos_discount(uuid, jsonb) to authenticated;
grant execute on function public.checkout_sale(uuid, jsonb) to authenticated;
