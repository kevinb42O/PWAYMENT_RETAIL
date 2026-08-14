begin;

-- The platform control plane is deliberately private. Store RLS remains the
-- customer boundary; cross-store data is exposed only by reviewed RPCs below.
create table if not exists private.platform_memberships (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('superadmin', 'operations', 'support', 'billing', 'read_only')),
  scopes text[] not null default '{}',
  status text not null default 'active' check (status in ('active', 'suspended')),
  mfa_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists private.store_installations (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  installation_id uuid not null,
  app_version text,
  platform_family text,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (store_id, installation_id)
);

create index if not exists store_installations_store_seen_idx
  on private.store_installations (store_id, last_seen_at desc);

create table if not exists private.store_health_events (
  id uuid primary key default gen_random_uuid(),
  client_event_id uuid not null,
  store_id uuid not null references public.stores(id) on delete cascade,
  installation_id uuid,
  event_type text not null check (event_type in (
    'app.started', 'app.heartbeat', 'sync.completed', 'sync.retrying',
    'sync.failed_permanent', 'rpc.failed', 'checkout.completed',
    'z_report.completed', 'webshop_order.failed', 'device.capability_failed'
  )),
  severity text not null default 'info' check (severity in ('info', 'warning', 'error', 'critical')),
  app_version text,
  operation text,
  error_code text,
  error_fingerprint text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (client_event_id)
);

create index if not exists store_health_events_store_occurred_idx
  on private.store_health_events (store_id, occurred_at desc);
create index if not exists store_health_events_signature_idx
  on private.store_health_events (error_fingerprint, occurred_at desc)
  where error_fingerprint is not null;

create table if not exists private.platform_incidents (
  id uuid primary key default gen_random_uuid(),
  fingerprint text not null,
  title text not null,
  severity text not null check (severity in ('p1', 'p2', 'p3', 'p4')),
  status text not null default 'new' check (status in ('new', 'acknowledged', 'investigating', 'mitigated', 'resolved', 'false_positive')),
  operation text,
  affected_store_count integer not null default 0 check (affected_store_count >= 0),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  owner_user_id uuid references auth.users(id),
  resolution_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (fingerprint, status)
);

create index if not exists platform_incidents_open_idx
  on private.platform_incidents (severity, last_seen_at desc)
  where status not in ('resolved', 'false_positive');

create or replace function private.upsert_platform_incident_from_health_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  incident_fingerprint text;
  incident_severity text;
  incident_title text;
begin
  if new.severity not in ('error', 'critical') then return new; end if;
  incident_fingerprint := coalesce(
    nullif(new.error_fingerprint, ''),
    concat_ws(':', new.event_type, coalesce(new.operation, 'unknown'), coalesce(new.error_code, 'unknown'))
  );
  incident_severity := case
    when new.severity = 'critical' and new.operation in ('checkout_sale', 'finalize_daily_report') then 'p1'
    when new.event_type = 'sync.failed_permanent' or new.operation in ('checkout_sale', 'finalize_daily_report') then 'p2'
    else 'p3'
  end;
  incident_title := case
    when new.operation = 'checkout_sale' then 'Checkout ondervindt fouten'
    when new.operation = 'finalize_daily_report' then 'Dagafsluiting ondervindt fouten'
    when new.event_type = 'sync.failed_permanent' then 'Synchronisatie heeft een permanente fout'
    else 'Operationele applicatiefout'
  end;
  insert into private.platform_incidents (
    fingerprint, title, severity, status, operation, affected_store_count,
    first_seen_at, last_seen_at
  ) values (
    incident_fingerprint, incident_title, incident_severity, 'new', new.operation,
    (select count(distinct store_id) from private.store_health_events where coalesce(error_fingerprint, concat_ws(':', event_type, coalesce(operation, 'unknown'), coalesce(error_code, 'unknown'))) = incident_fingerprint and occurred_at >= now() - interval '24 hours'),
    new.occurred_at, new.occurred_at
  ) on conflict (fingerprint, status) do update set
    severity = case when excluded.severity = 'p1' or severity = 'p1' then 'p1' when excluded.severity = 'p2' or severity = 'p2' then 'p2' else 'p3' end,
    title = excluded.title,
    operation = excluded.operation,
    affected_store_count = excluded.affected_store_count,
    last_seen_at = excluded.last_seen_at;
  return new;
end;
$$;

drop trigger if exists store_health_event_creates_incident on private.store_health_events;
create trigger store_health_event_creates_incident
  after insert on private.store_health_events
  for each row execute function private.upsert_platform_incident_from_health_event();

create table if not exists private.platform_audit_entries (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id),
  action text not null,
  target_store_id uuid references public.stores(id) on delete set null,
  target_incident_id uuid references private.platform_incidents(id) on delete set null,
  reason text,
  detail jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index if not exists platform_audit_occurred_idx
  on private.platform_audit_entries (occurred_at desc);

create table if not exists private.support_access_grants (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  operator_user_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (char_length(btrim(reason)) between 12 and 500),
  access_scope text not null default 'read_only' check (access_scope in ('read_only', 'operational')),
  customer_consent boolean not null,
  starts_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  revoked_by_user_id uuid references auth.users(id),
  created_at timestamptz not null default now(),
  check (expires_at is null or expires_at <= starts_at + interval '60 minutes')
);

create index if not exists support_access_active_idx
  on private.support_access_grants (store_id, operator_user_id, expires_at)
  where revoked_at is null;

create or replace function private.set_platform_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists platform_memberships_updated_at on private.platform_memberships;
create trigger platform_memberships_updated_at before update on private.platform_memberships
  for each row execute function private.set_platform_updated_at();
drop trigger if exists platform_incidents_updated_at on private.platform_incidents;
create trigger platform_incidents_updated_at before update on private.platform_incidents
  for each row execute function private.set_platform_updated_at();

create or replace function private.platform_scope_allowed(required_scope text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.platform_memberships membership
    where membership.user_id = (select auth.uid())
      and membership.status = 'active'
      and (
        membership.role = 'superadmin'
        or required_scope = any (membership.scopes)
      )
  );
$$;

create or replace function private.active_support_grant(target_store_id uuid, required_scope text default 'read_only')
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.support_access_grants grant_row
    where grant_row.store_id = target_store_id
      and grant_row.operator_user_id = (select auth.uid())
      and grant_row.starts_at <= now()
      and grant_row.expires_at > now()
      and grant_row.revoked_at is null
      and (grant_row.access_scope = 'operational' or required_scope = 'read_only')
  );
$$;

revoke all on function private.platform_scope_allowed(text) from public, anon, authenticated;
revoke all on function private.active_support_grant(uuid, text) from public, anon, authenticated;
grant execute on function private.platform_scope_allowed(text) to authenticated;
grant execute on function private.active_support_grant(uuid, text) to authenticated;

create or replace function public.get_platform_session()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  membership private.platform_memberships%rowtype;
begin
  select * into membership
  from private.platform_memberships
  where user_id = (select auth.uid()) and status = 'active';
  if not found then
    raise exception 'PLATFORM_ACCESS_DENIED' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'user_id', membership.user_id,
    'role', membership.role,
    'scopes', membership.scopes,
    'mfa_verified_at', membership.mfa_verified_at
  );
end;
$$;

create or replace function public.record_platform_health_event(payload jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_store_id uuid;
  event_id uuid;
  install_id uuid;
  kind text;
  event_severity text;
  safe_metadata jsonb;
begin
  target_store_id := nullif(payload ->> 'store_id', '')::uuid;
  event_id := nullif(payload ->> 'client_event_id', '')::uuid;
  install_id := nullif(payload ->> 'installation_id', '')::uuid;
  kind := payload ->> 'event_type';
  event_severity := coalesce(payload ->> 'severity', 'info');
  if target_store_id is null or event_id is null or kind is null then
    raise exception 'Invalid health event' using errcode = '22023';
  end if;
  if install_id is null then
    raise exception 'Invalid installation id' using errcode = '22023';
  end if;
  if not (select private.is_store_member(target_store_id)) then
    raise exception 'STORE_ACCESS_DENIED' using errcode = '42501';
  end if;
  -- Only explicitly selected operational facts are retained. Arbitrary client
  -- payloads, customer data and raw errors can never enter the control plane.
  safe_metadata := jsonb_strip_nulls(jsonb_build_object(
    'queue_depth', case when (payload #>> '{metadata,queue_depth}') ~ '^\\d{1,7}$' then (payload #>> '{metadata,queue_depth}')::integer else null end,
    'oldest_queue_age_seconds', case when (payload #>> '{metadata,oldest_queue_age_seconds}') ~ '^\\d{1,9}$' then (payload #>> '{metadata,oldest_queue_age_seconds}')::integer else null end,
    'attempts', case when (payload #>> '{metadata,attempts}') ~ '^\\d{1,5}$' then (payload #>> '{metadata,attempts}')::integer else null end,
    'online', case when payload #>> '{metadata,online}' in ('true', 'false') then (payload #>> '{metadata,online}')::boolean else null end
  ));
  insert into private.store_installations (store_id, installation_id, app_version, platform_family, last_seen_at)
  values (target_store_id, install_id, left(nullif(payload ->> 'app_version', ''), 80), left(nullif(payload ->> 'platform_family', ''), 80), now())
  on conflict (store_id, installation_id) do update set
    app_version = excluded.app_version,
    platform_family = excluded.platform_family,
    last_seen_at = excluded.last_seen_at;
  insert into private.store_health_events (
    client_event_id, store_id, installation_id, event_type, severity, app_version,
    operation, error_code, error_fingerprint, metadata, occurred_at
  ) values (
    event_id, target_store_id, install_id, kind, event_severity,
    left(nullif(payload ->> 'app_version', ''), 80),
    left(nullif(payload ->> 'operation', ''), 120),
    left(nullif(payload ->> 'error_code', ''), 80),
    left(nullif(payload ->> 'error_fingerprint', ''), 128), safe_metadata,
    coalesce(nullif(payload ->> 'occurred_at', '')::timestamptz, now())
  ) on conflict (client_event_id) do nothing;
end;
$$;

create or replace function public.platform_get_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select private.platform_scope_allowed('dashboard.read')) then
    raise exception 'PLATFORM_ACCESS_DENIED' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'metrics', jsonb_build_object(
      'active_stores_24h', (select count(distinct store_id) from private.store_health_events where occurred_at >= now() - interval '24 hours'),
      'critical_incidents', (select count(*) from private.platform_incidents where status not in ('resolved', 'false_positive') and severity in ('p1', 'p2')),
      'sync_at_risk', (select count(*) from (select store_id, max(occurred_at) filter (where event_type = 'sync.completed') as last_sync, max(occurred_at) filter (where event_type in ('sync.retrying', 'sync.failed_permanent')) as last_failure from private.store_health_events group by store_id) health where last_failure > coalesce(last_sync, '-infinity'::timestamptz) and last_failure >= now() - interval '30 minutes'),
      'financial_failures_24h', (select count(*) from private.store_health_events where event_type = 'rpc.failed' and operation in ('checkout_sale', 'refund_sale', 'finalize_daily_report') and occurred_at >= now() - interval '24 hours'),
      'subscriptions', (select jsonb_build_object('trialing', count(*) filter (where status = 'trialing'), 'active', count(*) filter (where status = 'active'), 'past_due', count(*) filter (where status = 'past_due')) from public.store_subscriptions)
    ),
    'incidents', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'title', title, 'severity', severity, 'status', status, 'affected_store_count', affected_store_count, 'last_seen_at', last_seen_at) order by case severity when 'p1' then 1 when 'p2' then 2 when 'p3' then 3 else 4 end, last_seen_at desc) from private.platform_incidents where status not in ('resolved', 'false_positive') limit 8), '[]'::jsonb)
  );
end;
$$;

create or replace function public.platform_list_stores(search_term text default null, health_filter text default null, page_limit integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  safe_limit integer := greatest(1, least(coalesce(page_limit, 50), 100));
begin
  if not (select private.platform_scope_allowed('stores.read')) then
    raise exception 'PLATFORM_ACCESS_DENIED' using errcode = '42501';
  end if;
  return coalesce((
    with health as (
      select store_id,
        max(occurred_at) filter (where event_type in ('app.started', 'app.heartbeat', 'checkout.completed', 'sync.completed')) as last_active_at,
        max(occurred_at) filter (where event_type = 'sync.completed') as last_sync_at,
        max(occurred_at) filter (where event_type in ('sync.retrying', 'sync.failed_permanent')) as last_sync_issue_at
      from private.store_health_events group by store_id
    ), rows as (
      select s.id, s.name, s.is_demo, s.created_at, subscription.plan_code, subscription.status as subscription_status,
        health.last_active_at, health.last_sync_at,
        case when health.last_sync_issue_at > coalesce(health.last_sync_at, '-infinity'::timestamptz) and health.last_sync_issue_at >= now() - interval '30 minutes' then 'at_risk'
             when health.last_active_at is null then 'unknown'
             when health.last_active_at < now() - interval '30 days' then 'inactive'
             else 'healthy' end as health_status,
        (select count(*) from private.store_health_events event where event.store_id = s.id and event.severity in ('error', 'critical') and event.occurred_at >= now() - interval '24 hours') as open_incidents
      from public.stores s
      left join public.store_subscriptions subscription on subscription.store_id = s.id
      left join health on health.store_id = s.id
      where (search_term is null or s.name ilike '%' || left(search_term, 120) || '%')
    )
    select jsonb_build_object('items', coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'is_demo', is_demo, 'created_at', created_at, 'plan_code', plan_code, 'subscription_status', subscription_status, 'last_active_at', last_active_at, 'last_sync_at', last_sync_at, 'health_status', health_status, 'open_incidents', open_incidents) order by created_at desc), '[]'::jsonb))
    from (select * from rows where health_filter is null or health_status = health_filter order by created_at desc limit safe_limit) paged
  ), jsonb_build_object('items', '[]'::jsonb));
end;
$$;

create or replace function public.platform_get_store_detail(target_store_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if not (select private.platform_scope_allowed('stores.read')) then
    raise exception 'PLATFORM_ACCESS_DENIED' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'store', jsonb_build_object('id', store_row.id, 'name', store_row.name, 'created_at', store_row.created_at, 'is_demo', store_row.is_demo, 'country_code', store_row.country_code, 'locale', store_row.locale, 'timezone', store_row.timezone),
    'subscription', coalesce((select jsonb_build_object('plan_code', plan_code, 'status', status, 'trial_ends_at', trial_ends_at, 'current_period_ends_at', current_period_ends_at) from public.store_subscriptions where store_id = store_row.id), '{}'::jsonb),
    'activity', jsonb_build_object(
      'last_active_at', (select max(occurred_at) from private.store_health_events where store_id = store_row.id and event_type in ('app.started', 'app.heartbeat', 'checkout.completed', 'sync.completed')),
      'last_sync_at', (select max(occurred_at) from private.store_health_events where store_id = store_row.id and event_type = 'sync.completed'),
      'sales_30d', (select count(*) from public.transactions where store_id = store_row.id and kind = 'sale' and occurred_at >= now() - interval '30 days'),
      'z_reports_30d', (select count(*) from public.daily_reports where store_id = store_row.id and occurred_at >= now() - interval '30 days'),
      'webshop_orders_30d', (select count(*) from public.webshop_orders where store_id = store_row.id and created_at >= now() - interval '30 days'),
      'active_members', (select count(*) from public.store_memberships where store_id = store_row.id and status = 'active')
    ),
    'devices', coalesce((select jsonb_agg(jsonb_build_object('installation_id', installation_id, 'app_version', app_version, 'platform_family', platform_family, 'last_seen_at', last_seen_at) order by last_seen_at desc) from private.store_installations where store_id = store_row.id), '[]'::jsonb),
    'recent_health_events', coalesce((select jsonb_agg(jsonb_build_object('event_type', event_type, 'severity', severity, 'operation', operation, 'error_code', error_code, 'error_fingerprint', error_fingerprint, 'occurred_at', occurred_at, 'metadata', metadata) order by occurred_at desc) from (select * from private.store_health_events where store_id = store_row.id order by occurred_at desc limit 20) events), '[]'::jsonb),
    'support_access', (select private.active_support_grant(store_row.id)),
    'active_support_grant', coalesce((select jsonb_build_object('id', id, 'access_scope', access_scope, 'expires_at', expires_at) from private.support_access_grants where store_id = store_row.id and operator_user_id = (select auth.uid()) and starts_at <= now() and expires_at > now() and revoked_at is null order by expires_at desc limit 1), '{}'::jsonb)
  ) into result from public.stores store_row where store_row.id = target_store_id;
  if result is null then raise exception 'STORE_NOT_FOUND' using errcode = 'P0002'; end if;
  return result;
end;
$$;

create or replace function public.platform_get_support_snapshot(target_store_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if not (select private.platform_scope_allowed('stores.read')) then
    raise exception 'PLATFORM_ACCESS_DENIED' using errcode = '42501';
  end if;
  if not (select private.active_support_grant(target_store_id, 'read_only')) then
    raise exception 'SUPPORT_ACCESS_REQUIRED' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'store_contact', jsonb_strip_nulls(jsonb_build_object(
      'legal_name', store_row.legal_name,
      'email', store_row.email,
      'phone', store_row.phone,
      'website', store_row.website,
      'city', store_row.city
    )),
    'active_members', coalesce((
      select jsonb_agg(jsonb_build_object('display_name', profile.display_name, 'role', membership.role) order by membership.role, profile.display_name)
      from public.store_memberships membership
      join public.profiles profile on profile.id = membership.user_id
      where membership.store_id = store_row.id and membership.status = 'active'
    ), '[]'::jsonb),
    'recent_audit', coalesce((
      select jsonb_agg(jsonb_build_object('occurred_at', occurred_at, 'action', action, 'user_name', user_name, 'source', source) order by occurred_at desc)
      from (select occurred_at, action, user_name, source from public.audit_entries where store_id = store_row.id order by occurred_at desc limit 10) audit_row
    ), '[]'::jsonb)
  ) into result
  from public.stores store_row where store_row.id = target_store_id;
  if result is null then raise exception 'STORE_NOT_FOUND' using errcode = 'P0002'; end if;
  insert into private.platform_audit_entries (actor_user_id, action, target_store_id, detail)
  values ((select auth.uid()), 'support_snapshot.viewed', target_store_id, jsonb_build_object('scope', 'read_only'));
  return result;
end;
$$;

create or replace function public.platform_request_support_access(target_store_id uuid, access_reason text, consent_confirmed boolean, requested_scope text default 'read_only')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  grant_row private.support_access_grants%rowtype;
begin
  if not (select private.platform_scope_allowed('support.write')) then raise exception 'PLATFORM_ACCESS_DENIED' using errcode = '42501'; end if;
  if not consent_confirmed then raise exception 'CUSTOMER_CONSENT_REQUIRED' using errcode = '22023'; end if;
  if not exists (select 1 from public.stores where id = target_store_id) then raise exception 'STORE_NOT_FOUND' using errcode = 'P0002'; end if;
  insert into private.support_access_grants (store_id, operator_user_id, reason, access_scope, customer_consent, expires_at)
  values (target_store_id, (select auth.uid()), access_reason, requested_scope, true, now() + interval '60 minutes')
  returning * into grant_row;
  insert into private.platform_audit_entries (actor_user_id, action, target_store_id, reason, detail)
  values ((select auth.uid()), 'support_access.granted', target_store_id, access_reason, jsonb_build_object('grant_id', grant_row.id, 'scope', requested_scope, 'expires_at', grant_row.expires_at));
  return jsonb_build_object('id', grant_row.id, 'expires_at', grant_row.expires_at, 'access_scope', grant_row.access_scope);
end;
$$;

create or replace function public.platform_revoke_support_access(grant_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare grant_row private.support_access_grants%rowtype;
begin
  if not (select private.platform_scope_allowed('support.write')) then raise exception 'PLATFORM_ACCESS_DENIED' using errcode = '42501'; end if;
  update private.support_access_grants set revoked_at = now(), revoked_by_user_id = (select auth.uid()) where id = grant_id and operator_user_id = (select auth.uid()) and revoked_at is null returning * into grant_row;
  if not found then raise exception 'SUPPORT_GRANT_NOT_FOUND' using errcode = 'P0002'; end if;
  insert into private.platform_audit_entries (actor_user_id, action, target_store_id, reason, detail)
  values ((select auth.uid()), 'support_access.revoked', grant_row.store_id, grant_row.reason, jsonb_build_object('grant_id', grant_row.id));
end;
$$;

revoke all on function public.get_platform_session() from public, anon;
revoke all on function public.record_platform_health_event(jsonb) from public, anon;
revoke all on function public.platform_get_overview() from public, anon;
revoke all on function public.platform_list_stores(text, text, integer) from public, anon;
revoke all on function public.platform_get_store_detail(uuid) from public, anon;
revoke all on function public.platform_get_support_snapshot(uuid) from public, anon;
revoke all on function public.platform_request_support_access(uuid, text, boolean, text) from public, anon;
revoke all on function public.platform_revoke_support_access(uuid) from public, anon;
grant execute on function public.get_platform_session() to authenticated;
grant execute on function public.record_platform_health_event(jsonb) to authenticated;
grant execute on function public.platform_get_overview() to authenticated;
grant execute on function public.platform_list_stores(text, text, integer) to authenticated;
grant execute on function public.platform_get_store_detail(uuid) to authenticated;
grant execute on function public.platform_get_support_snapshot(uuid) to authenticated;
grant execute on function public.platform_request_support_access(uuid, text, boolean, text) to authenticated;
grant execute on function public.platform_revoke_support_access(uuid) to authenticated;

revoke all on all tables in schema private from public, anon, authenticated;

-- The existing production demo owner is the initial PWAYMENT operator. This is
-- intentionally an explicit identity binding, not an email-domain heuristic.
insert into private.platform_memberships (user_id, role, scopes)
select id, 'superadmin', array['dashboard.read', 'stores.read', 'support.write', 'incidents.write', 'billing.read', 'releases.read']
from auth.users
where lower(email) = 'kevin@webaanzee.be'
on conflict (user_id) do update set
  role = excluded.role,
  scopes = excluded.scopes,
  status = 'active';

commit;
