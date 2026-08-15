begin;

-- Governance is kept in the private control plane. The browser only reaches
-- these records through the narrowly scoped RPCs below.
create table if not exists private.platform_feature_releases (
  id uuid primary key default gen_random_uuid(),
  feature_key text not null check (feature_key ~ '^[a-z][a-z0-9_]{2,63}$'),
  title text not null check (char_length(btrim(title)) between 3 and 120),
  description text not null check (char_length(btrim(description)) between 12 and 1000),
  enabled boolean not null,
  risk_level text not null default 'medium' check (risk_level in ('low', 'medium', 'high')),
  target_mode text not null default 'selected' check (target_mode in ('all', 'selected')),
  target_store_ids uuid[] not null default '{}',
  status text not null default 'draft' check (status in ('draft', 'in_review', 'approved', 'live', 'rolled_back')),
  requested_by_user_id uuid not null references auth.users(id),
  reviewed_by_user_id uuid references auth.users(id),
  approved_at timestamptz,
  launched_by_user_id uuid references auth.users(id),
  launched_at timestamptz,
  rolled_back_by_user_id uuid references auth.users(id),
  rolled_back_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((target_mode = 'all' and cardinality(target_store_ids) = 0) or target_mode = 'selected')
);

create index if not exists platform_feature_releases_status_idx
  on private.platform_feature_releases (status, updated_at desc);
create index if not exists platform_feature_releases_feature_idx
  on private.platform_feature_releases (feature_key, status, launched_at desc);

drop trigger if exists platform_feature_releases_updated_at on private.platform_feature_releases;
create trigger platform_feature_releases_updated_at
  before update on private.platform_feature_releases
  for each row execute function private.set_platform_updated_at();

create or replace function private.platform_mfa_verified()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((auth.jwt() ->> 'aal') = 'aal2', false);
$$;

create or replace function private.require_platform_scope(required_scope text, require_mfa boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.platform_scope_allowed(required_scope)) then
    raise exception 'PLATFORM_ACCESS_DENIED' using errcode = '42501';
  end if;
  if require_mfa and not (select private.platform_mfa_verified()) then
    raise exception 'PLATFORM_MFA_REQUIRED' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.platform_list_members()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_platform_scope('team.read');
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'user_id', membership.user_id,
      'email', account.email,
      'display_name', profile.display_name,
      'role', membership.role,
      'scopes', membership.scopes,
      'status', membership.status,
      'created_at', membership.created_at,
      'updated_at', membership.updated_at
    ) order by membership.status, lower(coalesce(profile.display_name, account.email)))
    from private.platform_memberships membership
    join auth.users account on account.id = membership.user_id
    left join public.profiles profile on profile.id = membership.user_id
  ), '[]'::jsonb);
end;
$$;

create or replace function public.platform_upsert_member(
  member_email text,
  member_role text,
  member_scopes text[],
  member_status text default 'active'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_user_id uuid;
  current_user_id uuid := (select auth.uid());
  active_superadmins integer;
  result jsonb;
begin
  perform private.require_platform_scope('team.write', true);
  if member_role not in ('superadmin', 'operations', 'support', 'billing', 'read_only')
    or member_status not in ('active', 'suspended') then
    raise exception 'PLATFORM_MEMBER_INVALID' using errcode = '22023';
  end if;
  if not (coalesce(member_scopes, '{}') <@ array[
    'dashboard.read', 'stores.read', 'support.write', 'incidents.write',
    'billing.read', 'team.read', 'team.write', 'releases.read',
    'releases.write', 'releases.approve', 'audit.read'
  ]::text[]) then
    raise exception 'PLATFORM_SCOPE_INVALID' using errcode = '22023';
  end if;
  select id into target_user_id from auth.users where lower(email) = lower(btrim(member_email));
  if target_user_id is null then
    raise exception 'PLATFORM_ACCOUNT_NOT_FOUND' using errcode = 'P0002', hint = 'De gebruiker moet eerst een PWAYMENT-account hebben.';
  end if;
  if target_user_id = current_user_id then
    raise exception 'PLATFORM_SELF_SERVICE_FORBIDDEN' using errcode = '42501';
  end if;
  select count(*) into active_superadmins
  from private.platform_memberships
  where role = 'superadmin' and status = 'active' and user_id = target_user_id;
  if active_superadmins > 0 and (member_role <> 'superadmin' or member_status <> 'active')
    and (select count(*) from private.platform_memberships where role = 'superadmin' and status = 'active') <= 1 then
    raise exception 'PLATFORM_LAST_SUPERADMIN_FORBIDDEN' using errcode = '22023';
  end if;
  insert into private.platform_memberships (user_id, role, scopes, status)
  values (target_user_id, member_role, array(select distinct unnest(coalesce(member_scopes, '{}')) order by 1), member_status)
  on conflict (user_id) do update set
    role = excluded.role,
    scopes = excluded.scopes,
    status = excluded.status
  returning jsonb_build_object('user_id', user_id, 'role', role, 'scopes', scopes, 'status', status) into strict result;
  insert into private.platform_audit_entries (actor_user_id, action, detail)
  values (current_user_id, 'platform_member.upserted', jsonb_build_object('target_user_id', target_user_id, 'role', member_role, 'scopes', member_scopes, 'status', member_status));
  return result;
end;
$$;

create or replace function public.platform_list_releases()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_platform_scope('releases.read');
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', release.id, 'feature_key', release.feature_key, 'title', release.title,
      'description', release.description, 'enabled', release.enabled,
      'risk_level', release.risk_level, 'target_mode', release.target_mode,
      'target_store_ids', release.target_store_ids, 'status', release.status,
      'requested_by_user_id', release.requested_by_user_id,
      'reviewed_by_user_id', release.reviewed_by_user_id, 'approved_at', release.approved_at,
      'launched_by_user_id', release.launched_by_user_id, 'launched_at', release.launched_at,
      'rolled_back_at', release.rolled_back_at, 'created_at', release.created_at,
      'updated_at', release.updated_at
    ) order by case release.status when 'live' then 1 when 'in_review' then 2 when 'approved' then 3 else 4 end, release.updated_at desc)
    from private.platform_feature_releases release
  ), '[]'::jsonb);
end;
$$;

create or replace function public.platform_create_release(
  release_feature_key text,
  release_title text,
  release_description text,
  release_enabled boolean,
  release_risk_level text,
  release_target_mode text,
  release_target_store_ids uuid[] default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare new_release private.platform_feature_releases%rowtype;
begin
  perform private.require_platform_scope('releases.write', true);
  if release_risk_level not in ('low', 'medium', 'high') or release_target_mode not in ('all', 'selected') then
    raise exception 'PLATFORM_RELEASE_INVALID' using errcode = '22023';
  end if;
  if release_target_mode = 'selected' and cardinality(coalesce(release_target_store_ids, '{}')) = 0 then
    raise exception 'PLATFORM_RELEASE_TARGET_REQUIRED' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(coalesce(release_target_store_ids, '{}')) as target(store_id) where not exists (select 1 from public.stores where id = target.store_id)) then
    raise exception 'PLATFORM_RELEASE_TARGET_UNKNOWN' using errcode = '22023';
  end if;
  insert into private.platform_feature_releases (feature_key, title, description, enabled, risk_level, target_mode, target_store_ids, requested_by_user_id)
  values (lower(btrim(release_feature_key)), btrim(release_title), btrim(release_description), release_enabled, release_risk_level, release_target_mode, case when release_target_mode = 'all' then '{}'::uuid[] else array(select distinct unnest(release_target_store_ids)) end, (select auth.uid()))
  returning * into new_release;
  insert into private.platform_audit_entries (actor_user_id, action, detail)
  values ((select auth.uid()), 'feature_release.created', jsonb_build_object('release_id', new_release.id, 'feature_key', new_release.feature_key, 'enabled', new_release.enabled, 'risk_level', new_release.risk_level, 'target_mode', new_release.target_mode, 'target_store_count', cardinality(new_release.target_store_ids)));
  return jsonb_build_object('id', new_release.id, 'status', new_release.status);
end;
$$;

create or replace function public.platform_transition_release(target_release_id uuid, next_status text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare release_row private.platform_feature_releases%rowtype;
declare actor_id uuid := (select auth.uid());
begin
  select * into release_row from private.platform_feature_releases where id = target_release_id for update;
  if not found then raise exception 'PLATFORM_RELEASE_NOT_FOUND' using errcode = 'P0002'; end if;
  if next_status = 'in_review' and release_row.status = 'draft' then
    perform private.require_platform_scope('releases.write', true);
    if release_row.requested_by_user_id <> actor_id then raise exception 'PLATFORM_RELEASE_OWNER_REQUIRED' using errcode = '42501'; end if;
    update private.platform_feature_releases set status = 'in_review' where id = target_release_id;
  elsif next_status = 'approved' and release_row.status = 'in_review' then
    perform private.require_platform_scope('releases.approve', true);
    if release_row.requested_by_user_id = actor_id then raise exception 'PLATFORM_FOUR_EYES_REQUIRED' using errcode = '42501'; end if;
    update private.platform_feature_releases set status = 'approved', reviewed_by_user_id = actor_id, approved_at = now() where id = target_release_id;
  elsif next_status = 'live' and release_row.status = 'approved' then
    perform private.require_platform_scope('releases.write', true);
    if release_row.requested_by_user_id = actor_id then raise exception 'PLATFORM_FOUR_EYES_REQUIRED' using errcode = '42501'; end if;
    update private.platform_feature_releases set status = 'live', launched_by_user_id = actor_id, launched_at = now() where id = target_release_id;
  elsif next_status = 'rolled_back' and release_row.status = 'live' then
    perform private.require_platform_scope('releases.write', true);
    update private.platform_feature_releases set status = 'rolled_back', rolled_back_by_user_id = actor_id, rolled_back_at = now() where id = target_release_id;
  else
    raise exception 'PLATFORM_RELEASE_TRANSITION_INVALID' using errcode = '22023';
  end if;
  insert into private.platform_audit_entries (actor_user_id, action, detail)
  values (actor_id, 'feature_release.' || next_status, jsonb_build_object('release_id', target_release_id, 'feature_key', release_row.feature_key, 'previous_status', release_row.status));
  return jsonb_build_object('id', target_release_id, 'status', next_status);
end;
$$;

create or replace function public.get_store_platform_feature_flags(target_store_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select private.is_store_member(target_store_id)) then
    raise exception 'STORE_ACCESS_DENIED' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_object_agg(feature_key, enabled)
    from (
      select distinct on (release.feature_key) release.feature_key, release.enabled
      from private.platform_feature_releases release
      where release.status = 'live'
        and (release.target_mode = 'all' or target_store_id = any(release.target_store_ids))
      order by release.feature_key, release.launched_at desc
    ) effective_release
  ), '{}'::jsonb);
end;
$$;

create or replace function public.platform_list_audit_entries(search_term text default null, page_limit integer default 100)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare safe_limit integer := greatest(1, least(coalesce(page_limit, 100), 200));
begin
  perform private.require_platform_scope('audit.read');
  return jsonb_build_object('items', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', entry.id, 'action', entry.action, 'reason', entry.reason,
      'detail', entry.detail, 'occurred_at', entry.occurred_at,
      'actor_user_id', entry.actor_user_id,
      'actor_email', account.email, 'actor_name', profile.display_name,
      'target_store_id', entry.target_store_id, 'target_incident_id', entry.target_incident_id
    ) order by entry.occurred_at desc)
    from (
      select * from private.platform_audit_entries
      where search_term is null or action ilike '%' || btrim(search_term) || '%' or reason ilike '%' || btrim(search_term) || '%'
      order by occurred_at desc limit safe_limit
    ) entry
    left join auth.users account on account.id = entry.actor_user_id
    left join public.profiles profile on profile.id = entry.actor_user_id
  ), '[]'::jsonb));
end;
$$;

revoke all on function private.platform_mfa_verified() from public, anon, authenticated;
revoke all on function private.require_platform_scope(text, boolean) from public, anon, authenticated;
revoke all on function public.platform_list_members() from public, anon;
revoke all on function public.platform_upsert_member(text, text, text[], text) from public, anon;
revoke all on function public.platform_list_releases() from public, anon;
revoke all on function public.platform_create_release(text, text, text, boolean, text, text, uuid[]) from public, anon;
revoke all on function public.platform_transition_release(uuid, text) from public, anon;
revoke all on function public.get_store_platform_feature_flags(uuid) from public, anon;
revoke all on function public.platform_list_audit_entries(text, integer) from public, anon;
grant execute on function public.platform_list_members() to authenticated;
grant execute on function public.platform_upsert_member(text, text, text[], text) to authenticated;
grant execute on function public.platform_list_releases() to authenticated;
grant execute on function public.platform_create_release(text, text, text, boolean, text, text, uuid[]) to authenticated;
grant execute on function public.platform_transition_release(uuid, text) to authenticated;
grant execute on function public.get_store_platform_feature_flags(uuid) to authenticated;
grant execute on function public.platform_list_audit_entries(text, integer) to authenticated;
revoke all on all tables in schema private from public, anon, authenticated;

commit;
