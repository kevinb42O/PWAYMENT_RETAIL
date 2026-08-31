begin;

-- Daily POS identity is deliberately separate from auth.users. The authenticated
-- account remains the tenant/device transport; every POS action can additionally
-- carry a short-lived operator session issued only after PIN verification.
create table public.pos_operators (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  workforce_employee_id uuid,
  account_user_id uuid references auth.users(id) on delete set null,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 160),
  role text not null check (role in ('owner', 'manager', 'cashier')),
  status text not null default 'active' check (status in ('active', 'suspended', 'inactive')),
  job_title text,
  employee_number text,
  allowed_register_ids uuid[] not null default '{}'::uuid[],
  offline_access_enabled boolean not null default true,
  must_change_pin boolean not null default false,
  access_version bigint not null default 1 check (access_version > 0),
  last_login_at timestamptz,
  last_login_device_id uuid,
  created_by_user_id uuid references auth.users(id) on delete set null,
  updated_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, id),
  check (job_title is null or char_length(btrim(job_title)) between 1 and 120),
  check (employee_number is null or char_length(btrim(employee_number)) between 1 and 80),
  foreign key (store_id, workforce_employee_id)
    references public.workforce_employees(store_id, id) on delete set null
);

create unique index pos_operators_store_workforce_unique
  on public.pos_operators(store_id, workforce_employee_id)
  where workforce_employee_id is not null;
create unique index pos_operators_store_account_unique
  on public.pos_operators(store_id, account_user_id)
  where account_user_id is not null;

create index pos_operators_store_status_idx
  on public.pos_operators(store_id, status, display_name);

create table public.pos_devices (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  register_id uuid,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  status text not null default 'active' check (status in ('active', 'revoked', 'retired')),
  installation_id uuid not null,
  offline_grace_hours integer not null default 24 check (offline_grace_hours between 0 and 72),
  paired_by_user_id uuid not null references auth.users(id) on delete restrict,
  paired_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, id),
  unique (store_id, installation_id),
  foreign key (store_id, register_id) references public.registers(store_id, id)
);

create index pos_devices_store_status_idx on public.pos_devices(store_id, status);

-- Credential material is never exposed through PostgREST. bcrypt is available
-- in the existing pgcrypto extension and is combined with a private per-store
-- lookup secret. A later Edge-runtime migration can transparently upgrade the
-- versioned hash to Argon2id without changing the public contract.
create table private.pos_pin_secrets (
  store_id uuid primary key references public.stores(id) on delete cascade,
  lookup_secret bytea not null default extensions.gen_random_bytes(32),
  version smallint not null default 1,
  created_at timestamptz not null default now(),
  rotated_at timestamptz
);

create table private.pos_operator_credentials (
  operator_id uuid primary key references public.pos_operators(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  pin_hash text not null,
  pin_lookup_digest text not null,
  algorithm text not null default 'bcrypt-12',
  secret_version smallint not null default 1,
  failed_attempts integer not null default 0 check (failed_attempts between 0 and 1000000),
  locked_until timestamptz,
  pin_changed_at timestamptz not null default now(),
  reset_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, pin_lookup_digest),
  foreign key (store_id, operator_id) references public.pos_operators(store_id, id) on delete cascade
);

-- Invalid PINs normally have no credential row. A device-scoped counter closes
-- that brute-force path without revealing whether a PIN exists.
create table private.pos_device_login_state (
  device_id uuid primary key references public.pos_devices(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  failed_attempts integer not null default 0 check (failed_attempts between 0 and 1000000),
  locked_until timestamptz,
  last_failed_at timestamptz,
  updated_at timestamptz not null default now(),
  foreign key (store_id, device_id) references public.pos_devices(store_id, id) on delete cascade
);

-- Pairing happens before a device id exists. Keep a separate durable throttle
-- so an authenticated account session cannot brute-force an owner PIN while
-- attempting to register or recover an installation.
create table private.pos_pairing_login_state (
  store_id uuid not null references public.stores(id) on delete cascade,
  installation_id uuid not null,
  failed_attempts integer not null default 0 check (failed_attempts between 0 and 1000000),
  locked_until timestamptz,
  last_failed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (store_id, installation_id)
);

-- Manager approval attempts are isolated from normal login counters. A failed
-- approval must never make every employee unable to unlock the register.
create table private.pos_approval_attempts (
  device_id uuid primary key references public.pos_devices(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  failed_attempts integer not null default 0 check (failed_attempts between 0 and 1000000),
  locked_until timestamptz,
  last_failed_at timestamptz,
  updated_at timestamptz not null default now(),
  foreign key (store_id, device_id) references public.pos_devices(store_id, id) on delete cascade
);

create table private.pos_operator_sessions (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  device_id uuid not null,
  operator_id uuid not null,
  account_user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique,
  role_snapshot text not null check (role_snapshot in ('owner', 'manager', 'cashier')),
  access_version bigint not null,
  created_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  expires_at timestamptz not null,
  step_up_verified_at timestamptz,
  revoked_at timestamptz,
  revoke_reason text,
  foreign key (store_id, device_id) references public.pos_devices(store_id, id) on delete cascade,
  foreign key (store_id, operator_id) references public.pos_operators(store_id, id) on delete cascade
);

create table private.pos_offline_grants (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  device_id uuid not null,
  operator_id uuid not null,
  account_user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique,
  access_version bigint not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_used_at timestamptz,
  revoked_at timestamptz,
  revoke_reason text,
  foreign key (store_id, device_id) references public.pos_devices(store_id, id) on delete cascade,
  foreign key (store_id, operator_id) references public.pos_operators(store_id, id) on delete cascade
);

create index pos_offline_grants_active_idx
  on private.pos_offline_grants(store_id, device_id, operator_id, expires_at)
  where revoked_at is null;

create index pos_operator_sessions_active_idx
  on private.pos_operator_sessions(store_id, device_id, expires_at)
  where revoked_at is null;

create table public.pos_access_events (
  id bigint generated always as identity primary key,
  store_id uuid not null references public.stores(id) on delete cascade,
  device_id uuid,
  operator_id uuid,
  actor_operator_id uuid,
  account_user_id uuid references auth.users(id) on delete set null,
  event_type text not null check (event_type ~ '^[a-z0-9_.-]+$'),
  success boolean not null default true,
  detail jsonb not null default '{}'::jsonb check (jsonb_typeof(detail) = 'object'),
  occurred_at timestamptz not null default now(),
  foreign key (device_id) references public.pos_devices(id) on delete set null,
  foreign key (operator_id) references public.pos_operators(id) on delete set null,
  foreign key (actor_operator_id) references public.pos_operators(id) on delete set null
);

create index pos_access_events_store_time_idx
  on public.pos_access_events(store_id, occurred_at desc);

alter table public.pos_operators enable row level security;
alter table public.pos_devices enable row level security;
alter table public.pos_access_events enable row level security;

revoke all on public.pos_operators, public.pos_devices, public.pos_access_events
  from public, anon, authenticated;
revoke all on private.pos_pin_secrets, private.pos_operator_credentials,
  private.pos_device_login_state, private.pos_pairing_login_state,
  private.pos_approval_attempts, private.pos_operator_sessions, private.pos_offline_grants
  from public, anon, authenticated;

create or replace function private.pos_pin_digest(target_store_id uuid, submitted_pin text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare secret_row private.pos_pin_secrets%rowtype;
begin
  insert into private.pos_pin_secrets(store_id) values (target_store_id)
    on conflict (store_id) do nothing;
  select * into strict secret_row from private.pos_pin_secrets where store_id = target_store_id;
  return extensions.encode(
    extensions.hmac(
      pg_catalog.convert_to(target_store_id::text || ':' || submitted_pin, 'UTF8'),
      secret_row.lookup_secret,
      'sha256'
    ),
    'hex'
  );
end;
$$;

create or replace function private.assert_safe_pos_pin(submitted_pin text)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if submitted_pin is null or submitted_pin !~ '^[0-9]{6}$' then
    raise exception using errcode = '22023', message = 'pos-access:invalid-pin:De PIN moet exact 6 cijfers bevatten.';
  end if;
  if submitted_pin in ('000000','111111','222222','333333','444444','555555','666666','777777','888888','999999',
                       '123456','654321','012345','543210','121212','112233','123123') then
    raise exception using errcode = '22023', message = 'pos-access:weak-pin:Kies een minder voorspelbare PIN.';
  end if;
end;
$$;

create or replace function private.set_pos_operator_pin(
  target_store_id uuid,
  target_operator_id uuid,
  submitted_pin text,
  force_change boolean default false,
  reset_valid_until timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare lookup_digest text;
begin
  perform private.assert_safe_pos_pin(submitted_pin);
  lookup_digest := private.pos_pin_digest(target_store_id, submitted_pin);
  if exists (
    select 1 from private.pos_operator_credentials credential
    where credential.store_id = target_store_id
      and credential.pin_lookup_digest = lookup_digest
      and credential.operator_id <> target_operator_id
  ) then
    raise exception using errcode = '23505', message = 'pos-access:pin-in-use:Deze PIN is al in gebruik binnen de winkel.';
  end if;
  insert into private.pos_operator_credentials(
    operator_id, store_id, pin_hash, pin_lookup_digest, reset_expires_at
  ) values (
    target_operator_id,
    target_store_id,
    extensions.crypt(submitted_pin, extensions.gen_salt('bf', 12)),
    lookup_digest,
    reset_valid_until
  )
  on conflict (operator_id) do update set
    pin_hash = excluded.pin_hash,
    pin_lookup_digest = excluded.pin_lookup_digest,
    algorithm = 'bcrypt-12',
    secret_version = 1,
    failed_attempts = 0,
    locked_until = null,
    pin_changed_at = now(),
    reset_expires_at = excluded.reset_expires_at,
    updated_at = now();
  update public.pos_operators set
    must_change_pin = force_change,
    access_version = access_version + 1,
    updated_at = now()
  where store_id = target_store_id and id = target_operator_id;
  update private.pos_operator_sessions set
    revoked_at = now(), revoke_reason = 'credential-changed'
  where store_id = target_store_id and operator_id = target_operator_id and revoked_at is null;
  update private.pos_offline_grants set
    revoked_at = now(), revoke_reason = 'credential-changed'
  where store_id = target_store_id and operator_id = target_operator_id and revoked_at is null;
end;
$$;

create or replace function private.resolve_pos_session(
  target_store_id uuid,
  session_token text,
  allowed_roles text[] default array['owner','manager','cashier']::text[],
  require_recent_step_up boolean default false
)
returns public.pos_operators
language plpgsql
security definer
set search_path = ''
as $$
declare session_row private.pos_operator_sessions%rowtype;
declare operator_row public.pos_operators%rowtype;
begin
  if (select auth.uid()) is null or session_token is null or char_length(session_token) < 32 then
    raise exception using errcode = '42501', message = 'pos-access:session-required:Vergrendel en meld opnieuw aan.';
  end if;
  select * into session_row from private.pos_operator_sessions session
  where session.store_id = target_store_id
    and session.account_user_id = (select auth.uid())
    and session.token_hash = extensions.encode(extensions.digest(session_token, 'sha256'), 'hex')
    and session.revoked_at is null
    and session.expires_at > now()
  for update;
  if session_row.id is null then
    raise exception using errcode = '42501', message = 'pos-access:session-invalid:De kassasessie is verlopen.';
  end if;
  select * into operator_row from public.pos_operators operator
  where operator.store_id = target_store_id and operator.id = session_row.operator_id;
  if operator_row.id is null or operator_row.status <> 'active'
     or operator_row.access_version <> session_row.access_version
     or not (operator_row.role = any(allowed_roles)) then
    raise exception using errcode = '42501', message = 'pos-access:forbidden:Onvoldoende rechten.';
  end if;
  if require_recent_step_up and (
    session_row.step_up_verified_at is null
    or session_row.step_up_verified_at < now() - interval '5 minutes'
  ) then
    raise exception using errcode = '42501', message = 'pos-access:step-up-required:Bevestig opnieuw met uw owner-PIN.';
  end if;
  update private.pos_operator_sessions set last_activity_at = now() where id = session_row.id;
  return operator_row;
end;
$$;

create or replace function public.bootstrap_pos_access(target_store_id uuid, target_installation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare device_row public.pos_devices%rowtype;
declare operator_count integer;
declare owner_configured boolean;
begin
  if not private.is_store_member(target_store_id) then
    raise exception using errcode = '42501', message = 'pos-access:forbidden:Geen toegang tot deze winkel.';
  end if;
  select * into device_row from public.pos_devices device
    where device.store_id = target_store_id and device.installation_id = target_installation_id;
  if device_row.id is not null and device_row.status = 'active' then
    update public.pos_devices set last_seen_at = now(), updated_at = now() where id = device_row.id;
    device_row.last_seen_at := now();
  end if;
  select count(*)::integer, bool_or(operator.role = 'owner')
    into operator_count, owner_configured
    from public.pos_operators operator
    join private.pos_operator_credentials credential on credential.operator_id = operator.id
    where operator.store_id = target_store_id and operator.status = 'active';
  return jsonb_build_object(
    'configured', operator_count > 0 and coalesce(owner_configured, false),
    'operatorCount', operator_count,
    'device', case when device_row.id is null then null else jsonb_build_object(
      'id', device_row.id, 'name', device_row.name, 'status', device_row.status,
      'registerId', device_row.register_id, 'offlineGraceHours', device_row.offline_grace_hours
    ) end
  );
end;
$$;

create or replace function public.setup_owner_pos_access(
  target_store_id uuid,
  target_installation_id uuid,
  device_name text,
  submitted_pin text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare actor_id uuid := (select auth.uid());
declare actor_name text;
declare operator_row public.pos_operators%rowtype;
declare device_row public.pos_devices%rowtype;
declare credential_row private.pos_operator_credentials%rowtype;
declare configured_owner_count integer;
declare pairing_failures integer;
declare pairing_locked_until timestamptz;
declare lookup_digest text;
begin
  if actor_id is null or not private.has_store_role(target_store_id, array['owner']) then
    raise exception using errcode = '42501', message = 'pos-access:owner-required:Alleen de eigenaar kan kassatoegang activeren.';
  end if;
  if device_name is null or char_length(btrim(device_name)) not between 1 and 120 then
    raise exception using errcode = '22023', message = 'pos-access:invalid-device-name:Geef deze kassa een herkenbare naam.';
  end if;
  perform private.assert_safe_pos_pin(submitted_pin);

  select count(*)::integer into configured_owner_count
  from public.pos_operators operator
  join private.pos_operator_credentials credential on credential.operator_id = operator.id
  where operator.store_id = target_store_id
    and operator.role = 'owner'
    and operator.status = 'active';

  if configured_owner_count = 0 then
    -- First-store bootstrap: the authenticated tenant owner becomes the first
    -- POS owner. This branch can never overwrite an existing owner PIN.
    select profile.display_name into actor_name from public.profiles profile where profile.id = actor_id;
    insert into public.pos_operators(
      store_id, account_user_id, display_name, role, status, created_by_user_id, updated_by_user_id
    ) values (
      target_store_id, actor_id, coalesce(nullif(btrim(actor_name), ''), 'Eigenaar'), 'owner', 'active', actor_id, actor_id
    ) on conflict (store_id, account_user_id) do update set
      display_name = excluded.display_name, role = 'owner', status = 'active',
      updated_by_user_id = actor_id, updated_at = now()
    returning * into operator_row;
    perform private.set_pos_operator_pin(target_store_id, operator_row.id, submitted_pin, false, null);
  else
    -- Every later device pairing or recovery additionally requires an active
    -- owner's existing PIN. The account password alone is insufficient.
    insert into private.pos_pairing_login_state(store_id, installation_id)
      values (target_store_id, target_installation_id)
      on conflict (store_id, installation_id) do nothing;
    select state.failed_attempts, state.locked_until
      into pairing_failures, pairing_locked_until
      from private.pos_pairing_login_state state
      where state.store_id = target_store_id and state.installation_id = target_installation_id
      for update;
    if pairing_locked_until is not null and pairing_locked_until > now() then
      return jsonb_build_object('ok', false, 'errorCode', 'pin-locked', 'retryAt', pairing_locked_until);
    end if;
    lookup_digest := private.pos_pin_digest(target_store_id, submitted_pin);
    select credential.* into credential_row
    from private.pos_operator_credentials credential
    join public.pos_operators operator on operator.id = credential.operator_id
    where credential.store_id = target_store_id
      and credential.pin_lookup_digest = lookup_digest
      and operator.store_id = target_store_id
      and operator.role = 'owner'
      and operator.status = 'active'
      and (credential.reset_expires_at is null or credential.reset_expires_at > now())
    for update of credential;
    if credential_row.operator_id is null
       or credential_row.pin_hash <> extensions.crypt(submitted_pin, credential_row.pin_hash) then
      if credential_row.operator_id is null then
        perform extensions.crypt(submitted_pin, extensions.gen_salt('bf', 12));
      end if;
      pairing_failures := coalesce(pairing_failures, 0) + 1;
      pairing_locked_until := case
        when pairing_failures >= 10 then now() + interval '15 minutes'
        when pairing_failures >= 5 then now() + interval '30 seconds'
        else null end;
      update private.pos_pairing_login_state set
        failed_attempts = pairing_failures,
        locked_until = pairing_locked_until,
        last_failed_at = now(), updated_at = now()
      where store_id = target_store_id and installation_id = target_installation_id;
      insert into public.pos_access_events(store_id, account_user_id, event_type, success)
        values (target_store_id, actor_id, 'pos.device_pairing_failed', false);
      return jsonb_build_object(
        'ok', false,
        'errorCode', case when pairing_failures >= 5 then 'pin-locked' else 'invalid-pin' end,
        'retryAt', pairing_locked_until
      );
    end if;
    select * into strict operator_row from public.pos_operators where id = credential_row.operator_id;
    update private.pos_pairing_login_state set
      failed_attempts = 0, locked_until = null, updated_at = now()
    where store_id = target_store_id and installation_id = target_installation_id;
  end if;
  insert into public.pos_devices(store_id, name, installation_id, paired_by_user_id)
    values (target_store_id, btrim(device_name), target_installation_id, actor_id)
    on conflict (store_id, installation_id) do update set
      name = excluded.name, status = 'active', revoked_at = null,
      revoked_by_user_id = null, last_seen_at = now(), updated_at = now()
    returning * into device_row;
  insert into public.pos_access_events(store_id, device_id, operator_id, account_user_id, event_type, detail)
    values (target_store_id, device_row.id, operator_row.id, actor_id,
      case when configured_owner_count = 0 then 'pos.owner_configured' else 'pos.device_paired' end,
      jsonb_build_object('deviceName', device_row.name));
  return jsonb_build_object('ok', true, 'deviceId', device_row.id, 'operatorId', operator_row.id);
end;
$$;

create or replace function public.verify_pos_operator_pin(
  target_store_id uuid,
  target_device_id uuid,
  submitted_pin text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare actor_id uuid := (select auth.uid());
declare device_row public.pos_devices%rowtype;
declare credential_row private.pos_operator_credentials%rowtype;
declare operator_row public.pos_operators%rowtype;
declare lookup_digest text;
declare failures integer;
declare device_failures integer;
declare device_locked_until timestamptz;
declare raw_token text;
declare raw_offline_token text;
declare offline_expires_at timestamptz;
declare session_id uuid;
begin
  if actor_id is null or not private.is_store_member(target_store_id) then
    raise exception using errcode = '42501', message = 'pos-access:forbidden:Geen toegang tot deze winkel.';
  end if;
  if submitted_pin is null or submitted_pin !~ '^[0-9]{6}$' then
    return jsonb_build_object('ok', false, 'errorCode', 'invalid-pin');
  end if;
  select * into device_row from public.pos_devices device
    where device.store_id = target_store_id and device.id = target_device_id and device.status = 'active'
    for update;
  if device_row.id is null then
    return jsonb_build_object('ok', false, 'errorCode', 'device-revoked');
  end if;
  insert into private.pos_device_login_state(device_id, store_id)
    values (device_row.id, target_store_id)
    on conflict (device_id) do nothing;
  select state.failed_attempts, state.locked_until
    into device_failures, device_locked_until
    from private.pos_device_login_state state
    where state.device_id = device_row.id
    for update;
  if device_locked_until is not null and device_locked_until > now() then
    insert into public.pos_access_events(store_id, device_id, account_user_id, event_type, success, detail)
      values (target_store_id, device_row.id, actor_id, 'pos.login_throttled', false,
        jsonb_build_object('retryAt', device_locked_until));
    return jsonb_build_object('ok', false, 'errorCode', 'pin-locked', 'retryAt', device_locked_until);
  end if;
  lookup_digest := private.pos_pin_digest(target_store_id, submitted_pin);
  select * into credential_row from private.pos_operator_credentials credential
    where credential.store_id = target_store_id and credential.pin_lookup_digest = lookup_digest
    for update;
  if credential_row.operator_id is null then
    -- Match the real bcrypt cost so response time does not reveal whether a
    -- submitted PIN exists in this store.
    perform extensions.crypt(submitted_pin, extensions.gen_salt('bf', 12));
    device_failures := coalesce(device_failures, 0) + 1;
    update private.pos_device_login_state set
      failed_attempts = device_failures,
      locked_until = case
        when device_failures >= 20 then now() + interval '15 minutes'
        when device_failures >= 10 then now() + interval '2 minutes'
        when device_failures >= 5 then now() + interval '30 seconds'
        else null end,
      last_failed_at = now(), updated_at = now()
    where device_id = device_row.id;
    insert into public.pos_access_events(store_id, device_id, account_user_id, event_type, success)
      values (target_store_id, device_row.id, actor_id, 'pos.login_failed', false);
    return jsonb_build_object(
      'ok', false,
      'errorCode', case when device_failures >= 5 then 'pin-locked' else 'invalid-pin' end,
      'retryAt', case
        when device_failures >= 20 then now() + interval '15 minutes'
        when device_failures >= 10 then now() + interval '2 minutes'
        when device_failures >= 5 then now() + interval '30 seconds'
        else null end
    );
  end if;
  select * into operator_row from public.pos_operators operator
    where operator.store_id = target_store_id and operator.id = credential_row.operator_id;
  if operator_row.status <> 'active' then
    return jsonb_build_object('ok', false, 'errorCode', 'operator-inactive');
  end if;
  if credential_row.locked_until is not null and credential_row.locked_until > now() then
    return jsonb_build_object('ok', false, 'errorCode', 'pin-locked', 'retryAt', credential_row.locked_until);
  end if;
  if credential_row.reset_expires_at is not null and credential_row.reset_expires_at < now() then
    return jsonb_build_object('ok', false, 'errorCode', 'reset-expired');
  end if;
  if credential_row.pin_hash <> extensions.crypt(submitted_pin, credential_row.pin_hash) then
    failures := credential_row.failed_attempts + 1;
    update private.pos_operator_credentials set
      failed_attempts = failures,
      locked_until = case
        when failures >= 10 then now() + interval '15 minutes'
        when failures >= 5 then now() + interval '30 seconds'
        else null end,
      updated_at = now()
    where operator_id = credential_row.operator_id;
    insert into public.pos_access_events(store_id, device_id, operator_id, account_user_id, event_type, success,
      detail) values (target_store_id, device_row.id, operator_row.id, actor_id, 'pos.login_failed', false,
      jsonb_build_object('locked', failures >= 5));
    return jsonb_build_object('ok', false, 'errorCode', case when failures >= 5 then 'pin-locked' else 'invalid-pin' end);
  end if;
  raw_token := extensions.encode(extensions.gen_random_bytes(32), 'hex');
  insert into private.pos_operator_sessions(
    store_id, device_id, operator_id, account_user_id, token_hash, role_snapshot,
    access_version, expires_at
  ) values (
    target_store_id, device_row.id, operator_row.id, actor_id,
    extensions.encode(extensions.digest(raw_token, 'sha256'), 'hex'), operator_row.role,
    operator_row.access_version, now() + interval '12 hours'
  ) returning id into session_id;
  update private.pos_operator_credentials set failed_attempts = 0, locked_until = null, updated_at = now()
    where operator_id = operator_row.id;
  update private.pos_device_login_state set failed_attempts = 0, locked_until = null, updated_at = now()
    where device_id = device_row.id;
  update public.pos_operators set last_login_at = now(), last_login_device_id = device_row.id, updated_at = now()
    where id = operator_row.id;
  update public.pos_devices set last_seen_at = now(), updated_at = now() where id = device_row.id;
  if operator_row.offline_access_enabled and device_row.offline_grace_hours > 0 then
    raw_offline_token := extensions.encode(extensions.gen_random_bytes(32), 'hex');
    offline_expires_at := now() + pg_catalog.make_interval(hours => device_row.offline_grace_hours);
    update private.pos_offline_grants set revoked_at = now(), revoke_reason = 'grant-refreshed'
      where store_id = target_store_id and device_id = device_row.id
        and operator_id = operator_row.id and revoked_at is null;
    insert into private.pos_offline_grants(
      store_id, device_id, operator_id, account_user_id, token_hash, access_version, expires_at
    ) values (
      target_store_id, device_row.id, operator_row.id, actor_id,
      extensions.encode(extensions.digest(raw_offline_token, 'sha256'), 'hex'),
      operator_row.access_version, offline_expires_at
    );
  end if;
  insert into public.pos_access_events(store_id, device_id, operator_id, account_user_id, event_type)
    values (target_store_id, device_row.id, operator_row.id, actor_id, 'pos.login_succeeded');
  return jsonb_build_object(
    'ok', true, 'sessionId', session_id, 'sessionToken', raw_token,
    'expiresAt', now() + interval '12 hours',
    'offlineGrant', case when raw_offline_token is null then null else jsonb_build_object(
      'token', raw_offline_token, 'expiresAt', offline_expires_at
    ) end,
    'operator', jsonb_build_object(
      'id', operator_row.id, 'displayName', operator_row.display_name,
      'role', operator_row.role, 'jobTitle', operator_row.job_title,
      'mustChangePin', operator_row.must_change_pin
    )
  );
end;
$$;

create or replace function public.step_up_pos_owner(
  target_store_id uuid,
  session_token text,
  submitted_pin text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare operator_row public.pos_operators%rowtype;
declare credential_row private.pos_operator_credentials%rowtype;
declare failures integer;
begin
  operator_row := private.resolve_pos_session(target_store_id, session_token, array['owner'], false);
  select * into strict credential_row from private.pos_operator_credentials where operator_id = operator_row.id for update;
  if credential_row.locked_until is not null and credential_row.locked_until > now() then
    return jsonb_build_object('ok', false, 'errorCode', 'pin-locked', 'retryAt', credential_row.locked_until);
  end if;
  if submitted_pin is null or submitted_pin !~ '^[0-9]{6}$'
     or credential_row.pin_hash <> extensions.crypt(submitted_pin, credential_row.pin_hash) then
    failures := credential_row.failed_attempts + 1;
    update private.pos_operator_credentials set
      failed_attempts = failures,
      locked_until = case
        when failures >= 10 then now() + interval '15 minutes'
        when failures >= 5 then now() + interval '30 seconds'
        else null end,
      updated_at = now()
    where operator_id = operator_row.id;
    insert into public.pos_access_events(store_id, operator_id, actor_operator_id, account_user_id, event_type,
      success, detail) values (target_store_id, operator_row.id, operator_row.id, auth.uid(),
      'pos.owner_step_up_failed', false, jsonb_build_object('locked', failures >= 5));
    return jsonb_build_object('ok', false,
      'errorCode', case when failures >= 5 then 'pin-locked' else 'invalid-pin' end);
  end if;
  update private.pos_operator_credentials set failed_attempts = 0, locked_until = null, updated_at = now()
    where operator_id = operator_row.id;
  update private.pos_operator_sessions set step_up_verified_at = now()
    where store_id = target_store_id
      and token_hash = extensions.encode(extensions.digest(session_token, 'sha256'), 'hex');
  insert into public.pos_access_events(store_id, device_id, operator_id, actor_operator_id, account_user_id, event_type)
    select target_store_id, session.device_id, operator_row.id, operator_row.id, auth.uid(), 'pos.owner_step_up'
    from private.pos_operator_sessions session
    where session.token_hash = extensions.encode(extensions.digest(session_token, 'sha256'), 'hex');
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.end_pos_operator_session(
  target_store_id uuid,
  session_token text,
  reason text default 'user-lock'
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare session_row private.pos_operator_sessions%rowtype;
begin
  select * into session_row from private.pos_operator_sessions session
    where session.store_id = target_store_id
      and session.account_user_id = (select auth.uid())
      and session.token_hash = extensions.encode(extensions.digest(session_token, 'sha256'), 'hex')
    for update;
  if session_row.id is null then return false; end if;
  update private.pos_operator_sessions set revoked_at = now(), revoke_reason = left(coalesce(reason, 'user-lock'), 80)
    where id = session_row.id and revoked_at is null;
  insert into public.pos_access_events(store_id, device_id, operator_id, actor_operator_id, account_user_id, event_type,
    detail) values (target_store_id, session_row.device_id, session_row.operator_id, session_row.operator_id,
    auth.uid(), 'pos.session_ended', jsonb_build_object('reason', left(coalesce(reason, 'user-lock'), 80)));
  return true;
end;
$$;

create or replace function public.list_pos_access_admin(target_store_id uuid, session_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare owner_row public.pos_operators%rowtype;
begin
  owner_row := private.resolve_pos_session(target_store_id, session_token, array['owner'], false);
  return jsonb_build_object(
    'operators', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', operator.id, 'displayName', operator.display_name, 'role', operator.role,
        'status', operator.status, 'jobTitle', operator.job_title,
        'employeeNumber', operator.employee_number,
        'workforceEmployeeId', operator.workforce_employee_id,
        'offlineAccessEnabled', operator.offline_access_enabled,
        'mustChangePin', operator.must_change_pin,
        'pinConfigured', credential.operator_id is not null,
        'lockedUntil', credential.locked_until,
        'lastLoginAt', operator.last_login_at,
        'lastLoginDeviceId', operator.last_login_device_id
      ) order by operator.display_name)
      from public.pos_operators operator
      left join private.pos_operator_credentials credential on credential.operator_id = operator.id
      where operator.store_id = target_store_id
    ), '[]'::jsonb),
    'devices', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', device.id, 'name', device.name, 'status', device.status,
        'registerId', device.register_id, 'offlineGraceHours', device.offline_grace_hours,
        'lastSeenAt', device.last_seen_at, 'pairedAt', device.paired_at
      ) order by device.name) from public.pos_devices device where device.store_id = target_store_id
    ), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', event.id, 'eventType', event.event_type, 'success', event.success,
        'operatorId', event.operator_id, 'actorOperatorId', event.actor_operator_id,
        'deviceId', event.device_id, 'detail', event.detail, 'occurredAt', event.occurred_at
      ) order by event.occurred_at desc)
      from (select * from public.pos_access_events candidate
            where candidate.store_id = target_store_id order by candidate.occurred_at desc limit 100) event
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.save_pos_operator(
  target_store_id uuid,
  session_token text,
  payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare owner_row public.pos_operators%rowtype;
declare target_row public.pos_operators%rowtype;
declare requested_id uuid;
declare requested_role text := payload ->> 'role';
declare requested_status text := coalesce(payload ->> 'status', 'active');
declare requested_pin text := nullif(payload ->> 'pin', '');
declare workforce_id uuid;
begin
  owner_row := private.resolve_pos_session(target_store_id, session_token, array['owner'], false);
  if requested_role not in ('owner','manager','cashier') or requested_status not in ('active','suspended','inactive') then
    raise exception using errcode = '22023', message = 'pos-access:invalid-role:Ongeldige rol of status.';
  end if;
  if nullif(payload ->> 'id', '') is not null then requested_id := (payload ->> 'id')::uuid; end if;
  if nullif(payload ->> 'workforceEmployeeId', '') is not null then workforce_id := (payload ->> 'workforceEmployeeId')::uuid; end if;
  if requested_id is not null then
    select * into target_row from public.pos_operators operator
      where operator.store_id = target_store_id and operator.id = requested_id for update;
    if target_row.id is null then raise exception using errcode = 'P0002', message = 'pos-access:not-found:Medewerker niet gevonden.'; end if;
    if target_row.role = 'owner' and (requested_role <> 'owner' or requested_status <> 'active') and
       (select count(*) from public.pos_operators candidate where candidate.store_id = target_store_id
          and candidate.role = 'owner' and candidate.status = 'active') <= 1 then
      raise exception using errcode = '23514', message = 'pos-access:last-owner:De laatste actieve eigenaar kan niet worden gedeactiveerd.';
    end if;
    update public.pos_operators set
      display_name = btrim(payload ->> 'displayName'), role = requested_role, status = requested_status,
      job_title = nullif(btrim(payload ->> 'jobTitle'), ''),
      employee_number = nullif(btrim(payload ->> 'employeeNumber'), ''),
      workforce_employee_id = coalesce(workforce_id, workforce_employee_id),
      offline_access_enabled = coalesce((payload ->> 'offlineAccessEnabled')::boolean, offline_access_enabled),
      access_version = access_version + 1, updated_by_user_id = auth.uid(), updated_at = now()
    where id = target_row.id returning * into target_row;
  else
    insert into public.pos_operators(
      store_id, workforce_employee_id, display_name, role, status, job_title, employee_number,
      offline_access_enabled, created_by_user_id, updated_by_user_id
    ) values (
      target_store_id, workforce_id, btrim(payload ->> 'displayName'), requested_role, requested_status,
      nullif(btrim(payload ->> 'jobTitle'), ''), nullif(btrim(payload ->> 'employeeNumber'), ''),
      coalesce((payload ->> 'offlineAccessEnabled')::boolean, true), auth.uid(), auth.uid()
    ) returning * into target_row;
  end if;
  if requested_pin is not null then
    perform private.set_pos_operator_pin(target_store_id, target_row.id, requested_pin, false, null);
  elsif requested_id is null then
    raise exception using errcode = '22023', message = 'pos-access:pin-required:Stel een persoonlijke PIN in.';
  end if;
  insert into public.pos_access_events(store_id, operator_id, actor_operator_id, account_user_id, event_type, detail)
    values (target_store_id, target_row.id, owner_row.id, auth.uid(), 'pos.operator_saved',
      jsonb_build_object('role', target_row.role, 'status', target_row.status));
  return jsonb_build_object('ok', true, 'operatorId', target_row.id);
end;
$$;

create or replace function public.reset_pos_operator_pin(
  target_store_id uuid,
  session_token text,
  target_operator_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare owner_row public.pos_operators%rowtype;
declare target_row public.pos_operators%rowtype;
declare temporary_pin text;
declare attempt integer := 0;
declare random_bytes bytea;
declare random_value integer;
begin
  owner_row := private.resolve_pos_session(target_store_id, session_token, array['owner'], true);
  select * into target_row from public.pos_operators operator
    where operator.store_id = target_store_id and operator.id = target_operator_id for update;
  if target_row.id is null then raise exception using errcode = 'P0002', message = 'pos-access:not-found:Medewerker niet gevonden.'; end if;
  loop
    attempt := attempt + 1;
    -- Use pgcrypto entropy and rejection sampling. PostgreSQL random() is not
    -- suitable for a one-time credential.
    loop
      random_bytes := extensions.gen_random_bytes(3);
      random_value := get_byte(random_bytes, 0) * 65536
        + get_byte(random_bytes, 1) * 256
        + get_byte(random_bytes, 2);
      exit when random_value < 16000000;
    end loop;
    temporary_pin := lpad((random_value % 1000000)::text, 6, '0');
    begin
      perform private.assert_safe_pos_pin(temporary_pin);
      if not exists (select 1 from private.pos_operator_credentials credential
        where credential.store_id = target_store_id
          and credential.pin_lookup_digest = private.pos_pin_digest(target_store_id, temporary_pin)) then exit; end if;
    exception when others then null;
    end;
    if attempt > 100 then raise exception 'pos-access:reset-failed'; end if;
  end loop;
  perform private.set_pos_operator_pin(target_store_id, target_row.id, temporary_pin, true, now() + interval '24 hours');
  insert into public.pos_access_events(store_id, operator_id, actor_operator_id, account_user_id, event_type)
    values (target_store_id, target_row.id, owner_row.id, auth.uid(), 'pos.pin_reset_issued');
  return jsonb_build_object('ok', true, 'temporaryPin', temporary_pin, 'expiresAt', now() + interval '24 hours');
end;
$$;

create or replace function public.change_own_pos_pin(
  target_store_id uuid,
  session_token text,
  new_pin text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare operator_row public.pos_operators%rowtype;
begin
  operator_row := private.resolve_pos_session(target_store_id, session_token);
  perform private.set_pos_operator_pin(target_store_id, operator_row.id, new_pin, false, null);
  insert into public.pos_access_events(store_id, operator_id, actor_operator_id, account_user_id, event_type)
    values (target_store_id, operator_row.id, operator_row.id, auth.uid(), 'pos.pin_changed');
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.update_pos_device(
  target_store_id uuid,
  session_token text,
  target_device_id uuid,
  payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare owner_row public.pos_operators%rowtype;
declare current_session private.pos_operator_sessions%rowtype;
declare target_row public.pos_devices%rowtype;
declare requested_status text;
declare requested_grace integer;
declare grace_changed boolean;
begin
  owner_row := private.resolve_pos_session(target_store_id, session_token, array['owner'], false);
  select * into strict current_session from private.pos_operator_sessions session
    where session.store_id = target_store_id
      and session.token_hash = extensions.encode(extensions.digest(session_token, 'sha256'), 'hex');
  select * into target_row from public.pos_devices device
    where device.store_id = target_store_id and device.id = target_device_id for update;
  if target_row.id is null then
    raise exception using errcode = 'P0002', message = 'pos-access:device-not-found:Kassa niet gevonden.';
  end if;
  requested_status := coalesce(nullif(payload ->> 'status', ''), target_row.status);
  requested_grace := coalesce(nullif(payload ->> 'offlineGraceHours', '')::integer, target_row.offline_grace_hours);
  grace_changed := requested_grace <> target_row.offline_grace_hours;
  if requested_status not in ('active','revoked','retired') or requested_grace not between 0 and 72 then
    raise exception using errcode = '22023', message = 'pos-access:invalid-device:Ongeldige toestelinstellingen.';
  end if;
  if requested_status <> target_row.status then
    if current_session.step_up_verified_at is null
       or current_session.step_up_verified_at < now() - interval '5 minutes' then
      raise exception using errcode = '42501', message = 'pos-access:step-up-required:Bevestig opnieuw met uw owner-PIN.';
    end if;
    if target_row.id = current_session.device_id then
      raise exception using errcode = '23514', message = 'pos-access:current-device:De actieve kassa kan zichzelf niet intrekken.';
    end if;
  end if;
  update public.pos_devices set
    name = coalesce(nullif(btrim(payload ->> 'name'), ''), name),
    status = requested_status,
    offline_grace_hours = requested_grace,
    revoked_at = case when requested_status = 'revoked' then now() else null end,
    revoked_by_user_id = case when requested_status = 'revoked' then auth.uid() else null end,
    updated_at = now()
  where id = target_row.id returning * into target_row;
  if requested_status <> 'active' then
    update private.pos_operator_sessions set revoked_at = now(), revoke_reason = 'device-' || requested_status
      where store_id = target_store_id and device_id = target_row.id and revoked_at is null;
    update private.pos_offline_grants set revoked_at = now(), revoke_reason = 'device-' || requested_status
      where store_id = target_store_id and device_id = target_row.id and revoked_at is null;
  end if;
  if grace_changed then
    update private.pos_offline_grants set revoked_at = now(), revoke_reason = 'offline-policy-changed'
      where store_id = target_store_id and device_id = target_row.id and revoked_at is null;
  end if;
  insert into public.pos_access_events(store_id, device_id, actor_operator_id, account_user_id, event_type, detail)
    values (target_store_id, target_row.id, owner_row.id, auth.uid(), 'pos.device_updated',
      jsonb_build_object('name', target_row.name, 'status', target_row.status,
        'offlineGraceHours', target_row.offline_grace_hours));
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function private.pos_pin_digest(uuid,text) from public, anon, authenticated;
revoke all on function private.assert_safe_pos_pin(text) from public, anon, authenticated;
revoke all on function private.set_pos_operator_pin(uuid,uuid,text,boolean,timestamptz) from public, anon, authenticated;
revoke all on function private.resolve_pos_session(uuid,text,text[],boolean) from public, anon, authenticated;

revoke all on function public.bootstrap_pos_access(uuid,uuid) from public, anon;
revoke all on function public.setup_owner_pos_access(uuid,uuid,text,text) from public, anon;
revoke all on function public.verify_pos_operator_pin(uuid,uuid,text) from public, anon;
revoke all on function public.step_up_pos_owner(uuid,text,text) from public, anon;
revoke all on function public.end_pos_operator_session(uuid,text,text) from public, anon;
revoke all on function public.list_pos_access_admin(uuid,text) from public, anon;
revoke all on function public.save_pos_operator(uuid,text,jsonb) from public, anon;
revoke all on function public.reset_pos_operator_pin(uuid,text,uuid) from public, anon;
revoke all on function public.change_own_pos_pin(uuid,text,text) from public, anon;
revoke all on function public.update_pos_device(uuid,text,uuid,jsonb) from public, anon;

grant execute on function public.bootstrap_pos_access(uuid,uuid) to authenticated;
grant execute on function public.setup_owner_pos_access(uuid,uuid,text,text) to authenticated;
grant execute on function public.verify_pos_operator_pin(uuid,uuid,text) to authenticated;
grant execute on function public.step_up_pos_owner(uuid,text,text) to authenticated;
grant execute on function public.end_pos_operator_session(uuid,text,text) to authenticated;
grant execute on function public.list_pos_access_admin(uuid,text) to authenticated;
grant execute on function public.save_pos_operator(uuid,text,jsonb) to authenticated;
grant execute on function public.reset_pos_operator_pin(uuid,text,uuid) to authenticated;
grant execute on function public.change_own_pos_pin(uuid,text,text) to authenticated;
grant execute on function public.update_pos_device(uuid,text,uuid,jsonb) to authenticated;

commit;
