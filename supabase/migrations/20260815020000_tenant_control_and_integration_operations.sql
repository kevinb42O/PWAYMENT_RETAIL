begin;

-- Server-side, tenant-scoped operational history.  Payloads and credentials
-- deliberately do not live here: this table is for explainable operations.
create table if not exists private.integration_runs (
  id uuid primary key default gen_random_uuid(),
  client_run_id uuid unique,
  store_id uuid not null references public.stores(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  operation text not null check (operation in ('import', 'connection_test', 'sync', 'webhook')),
  source_name text not null,
  source_format text,
  status text not null check (status in ('running', 'completed', 'completed_with_errors', 'failed', 'cancelled')),
  row_count integer not null default 0 check (row_count >= 0),
  created_count integer not null default 0 check (created_count >= 0),
  updated_count integer not null default 0 check (updated_count >= 0),
  skipped_count integer not null default 0 check (skipped_count >= 0),
  error_count integer not null default 0 check (error_count >= 0),
  error_code text,
  error_fingerprint text,
  mapping_summary jsonb not null default '{}'::jsonb check (jsonb_typeof(mapping_summary) = 'object'),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'running' and completed_at is null) or status <> 'running')
);

create index if not exists integration_runs_store_started_idx
  on private.integration_runs (store_id, started_at desc);
create index if not exists integration_runs_status_started_idx
  on private.integration_runs (status, started_at desc);

alter table private.integration_runs enable row level security;

drop trigger if exists integration_runs_updated_at on private.integration_runs;
create trigger integration_runs_updated_at before update on private.integration_runs
  for each row execute function private.set_updated_at();

create or replace function public.record_integration_run(
  target_store_id uuid,
  run_id uuid,
  run_operation text,
  run_source_name text,
  run_source_format text,
  run_status text,
  run_row_count integer default 0,
  run_created_count integer default 0,
  run_updated_count integer default 0,
  run_skipped_count integer default 0,
  run_error_count integer default 0,
  run_error_code text default null,
  run_error_fingerprint text default null,
  run_mapping_summary jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  if (select auth.uid()) is null
     or not private.has_store_role(target_store_id, array['owner', 'manager']) then
    raise exception using errcode = '42501', message = 'integration:forbidden:Geen toegang tot deze winkel.';
  end if;
  if run_operation not in ('import', 'connection_test', 'sync', 'webhook')
     or run_status not in ('running', 'completed', 'completed_with_errors', 'failed', 'cancelled')
     or nullif(btrim(run_source_name), '') is null
     or coalesce(run_row_count, 0) < 0 or coalesce(run_created_count, 0) < 0
     or coalesce(run_updated_count, 0) < 0 or coalesce(run_skipped_count, 0) < 0
     or coalesce(run_error_count, 0) < 0
     or jsonb_typeof(coalesce(run_mapping_summary, '{}'::jsonb)) <> 'object' then
    raise exception using errcode = '22023', message = 'integration:invalid:Ongeldige operationele gegevens.';
  end if;
  insert into private.integration_runs (
    client_run_id, store_id, actor_user_id, operation, source_name, source_format,
    status, row_count, created_count, updated_count, skipped_count, error_count,
    error_code, error_fingerprint, mapping_summary, started_at, completed_at
  ) values (
    run_id, target_store_id, (select auth.uid()), run_operation, left(btrim(run_source_name), 255),
    nullif(left(btrim(coalesce(run_source_format, '')), 40), ''), run_status,
    run_row_count, run_created_count, run_updated_count, run_skipped_count, run_error_count,
    nullif(left(btrim(coalesce(run_error_code, '')), 120), ''),
    nullif(left(btrim(coalesce(run_error_fingerprint, '')), 160), ''),
    run_mapping_summary, now(), case when run_status = 'running' then null else now() end
  ) on conflict (client_run_id) do update set
    status = excluded.status, row_count = excluded.row_count, created_count = excluded.created_count,
    updated_count = excluded.updated_count, skipped_count = excluded.skipped_count,
    error_count = excluded.error_count, error_code = excluded.error_code,
    error_fingerprint = excluded.error_fingerprint, mapping_summary = excluded.mapping_summary,
    completed_at = case when excluded.status = 'running' then null else now() end
  returning jsonb_build_object('id', id, 'status', status, 'completed_at', completed_at) into result;
  return result;
end;
$$;

create or replace function public.platform_list_integration_runs(target_store_id uuid, page_limit integer default 100)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_platform_scope('integrations.read');
  return jsonb_build_object('items', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', run.id, 'operation', run.operation, 'source_name', run.source_name,
      'source_format', run.source_format, 'status', run.status, 'row_count', run.row_count,
      'created_count', run.created_count, 'updated_count', run.updated_count,
      'skipped_count', run.skipped_count, 'error_count', run.error_count,
      'error_code', run.error_code, 'error_fingerprint', run.error_fingerprint,
      'mapping_summary', run.mapping_summary, 'started_at', run.started_at,
      'completed_at', run.completed_at, 'actor_name', profile.display_name,
      'actor_email', account.email
    ) order by run.started_at desc)
    from (
      select * from private.integration_runs
      where store_id = target_store_id
      order by started_at desc
      limit greatest(1, least(coalesce(page_limit, 100), 200))
    ) run
    left join auth.users account on account.id = run.actor_user_id
    left join public.profiles profile on profile.id = run.actor_user_id
  ), '[]'::jsonb));
end;
$$;

create or replace function public.platform_update_store_subscription(
  target_store_id uuid,
  target_plan text,
  target_status text,
  change_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare previous public.store_subscriptions%rowtype;
declare result jsonb;
begin
  perform private.require_platform_scope('billing.write', true);
  if target_plan not in ('basic', 'pro', 'enterprise')
     or target_status not in ('trialing', 'active', 'past_due', 'canceled', 'expired')
     or length(btrim(coalesce(change_reason, ''))) < 8 then
    raise exception using errcode = '22023', message = 'SUBSCRIPTION_CHANGE_INVALID';
  end if;
  select * into previous from public.store_subscriptions where store_id = target_store_id for update;
  if previous.store_id is null then raise exception 'STORE_SUBSCRIPTION_NOT_FOUND' using errcode = 'P0002'; end if;
  update public.store_subscriptions set
    plan_code = target_plan, status = target_status,
    activation_source = 'manual', version = version + 1,
    trial_started_at = case when target_status = 'trialing' then coalesce(trial_started_at, now()) else trial_started_at end,
    trial_ends_at = case when target_status = 'trialing' then greatest(coalesce(trial_ends_at, now() + interval '30 days'), now() + interval '1 minute') else trial_ends_at end
  where store_id = target_store_id
  returning jsonb_build_object('plan_code', plan_code, 'status', status, 'version', version, 'test_mode', test_mode) into result;
  insert into public.subscription_events (store_id, event_type, previous_plan_code, new_plan_code, previous_status, new_status, actor_user_id, source, metadata)
  values (target_store_id, 'platform_plan_changed', previous.plan_code, target_plan, previous.status, target_status, (select auth.uid()), 'platform_admin', jsonb_build_object('reason', left(btrim(change_reason), 1000)));
  insert into private.platform_audit_entries (actor_user_id, action, target_store_id, reason, detail)
  values ((select auth.uid()), 'subscription.updated', target_store_id, left(btrim(change_reason), 1000), jsonb_build_object('previous_plan', previous.plan_code, 'next_plan', target_plan, 'previous_status', previous.status, 'next_status', target_status));
  return result;
end;
$$;

create or replace function public.platform_delete_store(target_store_id uuid, expected_store_name text, deletion_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare store_name text;
declare orphan_user_ids uuid[];
declare deleted_users integer := 0;
begin
  perform private.require_platform_scope('lifecycle.delete', true);
  if length(btrim(coalesce(deletion_reason, ''))) < 8 then raise exception 'STORE_DELETE_REASON_REQUIRED' using errcode = '22023'; end if;
  select name into store_name from public.stores where id = target_store_id for update;
  if store_name is null then raise exception 'STORE_NOT_FOUND' using errcode = 'P0002'; end if;
  if store_name <> btrim(coalesce(expected_store_name, '')) then raise exception 'STORE_DELETE_CONFIRMATION_MISMATCH' using errcode = '22023'; end if;
  select coalesce(array_agg(member.user_id), '{}'::uuid[]) into orphan_user_ids
  from public.store_memberships member
  where member.store_id = target_store_id
    and not exists (select 1 from public.store_memberships other_member where other_member.user_id = member.user_id and other_member.store_id <> target_store_id)
    and not exists (select 1 from private.platform_memberships platform_member where platform_member.user_id = member.user_id);
  delete from public.stores where id = target_store_id;
  if cardinality(orphan_user_ids) > 0 then
    delete from auth.users where id = any(orphan_user_ids);
    get diagnostics deleted_users = row_count;
  end if;
  insert into private.platform_audit_entries (actor_user_id, action, reason, detail)
  values ((select auth.uid()), 'store.deleted', left(btrim(deletion_reason), 1000), jsonb_build_object('store_id', target_store_id, 'store_name', store_name, 'deleted_orphan_users', deleted_users));
  return jsonb_build_object('deleted_store_id', target_store_id, 'deleted_store_name', store_name, 'deleted_orphan_users', deleted_users);
end;
$$;

-- Extend the existing team role editor with the scopes introduced above.
create or replace function public.platform_upsert_member(member_email text, member_role text, member_scopes text[], member_status text default 'active')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare target_user_id uuid; current_user_id uuid := (select auth.uid()); active_superadmins integer; result jsonb;
begin
  perform private.require_platform_scope('team.write', true);
  if member_role not in ('superadmin', 'operations', 'support', 'billing', 'read_only') or member_status not in ('active', 'suspended') then raise exception 'PLATFORM_MEMBER_INVALID' using errcode = '22023'; end if;
  if not (coalesce(member_scopes, '{}') <@ array['dashboard.read','stores.read','support.write','incidents.write','billing.read','billing.write','integrations.read','lifecycle.delete','team.read','team.write','releases.read','releases.write','releases.approve','audit.read']::text[]) then raise exception 'PLATFORM_SCOPE_INVALID' using errcode = '22023'; end if;
  select id into target_user_id from auth.users where lower(email) = lower(btrim(member_email));
  if target_user_id is null then raise exception 'PLATFORM_ACCOUNT_NOT_FOUND' using errcode = 'P0002'; end if;
  if target_user_id = current_user_id then raise exception 'PLATFORM_SELF_SERVICE_FORBIDDEN' using errcode = '42501'; end if;
  select count(*) into active_superadmins from private.platform_memberships where role = 'superadmin' and status = 'active' and user_id = target_user_id;
  if active_superadmins > 0 and (member_role <> 'superadmin' or member_status <> 'active') and (select count(*) from private.platform_memberships where role = 'superadmin' and status = 'active') <= 1 then raise exception 'PLATFORM_LAST_SUPERADMIN_FORBIDDEN' using errcode = '22023'; end if;
  insert into private.platform_memberships (user_id, role, scopes, status) values (target_user_id, member_role, array(select distinct unnest(coalesce(member_scopes, '{}')) order by 1), member_status)
  on conflict (user_id) do update set role = excluded.role, scopes = excluded.scopes, status = excluded.status
  returning jsonb_build_object('user_id', user_id, 'role', role, 'scopes', scopes, 'status', status) into strict result;
  insert into private.platform_audit_entries (actor_user_id, action, detail) values (current_user_id, 'platform_member.upserted', jsonb_build_object('target_user_id', target_user_id, 'role', member_role, 'scopes', member_scopes, 'status', member_status));
  return result;
end;
$$;

revoke all on function public.record_integration_run(uuid, uuid, text, text, text, text, integer, integer, integer, integer, integer, text, text, jsonb) from public, anon;
revoke all on function public.platform_list_integration_runs(uuid, integer) from public, anon;
revoke all on function public.platform_update_store_subscription(uuid, text, text, text) from public, anon;
revoke all on function public.platform_delete_store(uuid, text, text) from public, anon;
grant execute on function public.record_integration_run(uuid, uuid, text, text, text, text, integer, integer, integer, integer, integer, text, text, jsonb) to authenticated;
grant execute on function public.platform_list_integration_runs(uuid, integer) to authenticated;
grant execute on function public.platform_update_store_subscription(uuid, text, text, text) to authenticated;
grant execute on function public.platform_delete_store(uuid, text, text) to authenticated;

commit;
