begin;

-- Append-only delivery record. GitHub is the source event; the platform keeps
-- the operational copy so development history remains visible in Admin.
create table if not exists private.development_updates (
  id uuid primary key default gen_random_uuid(),
  github_push_id text not null unique,
  repository_full_name text not null,
  branch_name text not null,
  before_sha text,
  after_sha text not null,
  compare_url text,
  pusher_name text,
  pusher_email text,
  headline text not null,
  commits jsonb not null default '[]'::jsonb check (jsonb_typeof(commits) = 'array'),
  pushed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check (length(github_push_id) between 1 and 120),
  check (length(repository_full_name) between 1 and 255),
  check (length(branch_name) between 1 and 255),
  check (length(after_sha) between 7 and 128),
  check (length(headline) between 1 and 2000)
);

create index if not exists development_updates_pushed_idx
  on private.development_updates (pushed_at desc);
create index if not exists development_updates_branch_idx
  on private.development_updates (branch_name, pushed_at desc);

alter table private.development_updates enable row level security;

create or replace function public.ingest_github_development_update(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  if auth.role() <> 'service_role' then
    raise exception 'DEVELOPMENT_LOG_INGEST_FORBIDDEN' using errcode = '42501';
  end if;
  if jsonb_typeof(payload) <> 'object'
     or nullif(btrim(payload ->> 'github_push_id'), '') is null
     or nullif(btrim(payload ->> 'repository_full_name'), '') is null
     or nullif(btrim(payload ->> 'branch_name'), '') is null
     or nullif(btrim(payload ->> 'after_sha'), '') is null
     or nullif(btrim(payload ->> 'headline'), '') is null
     or jsonb_typeof(coalesce(payload -> 'commits', '[]'::jsonb)) <> 'array'
     or octet_length(payload::text) > 524288 then
    raise exception 'DEVELOPMENT_LOG_PAYLOAD_INVALID' using errcode = '22023';
  end if;

  insert into private.development_updates (
    github_push_id, repository_full_name, branch_name, before_sha, after_sha,
    compare_url, pusher_name, pusher_email, headline, commits, pushed_at
  ) values (
    left(btrim(payload ->> 'github_push_id'), 120),
    left(btrim(payload ->> 'repository_full_name'), 255),
    left(btrim(payload ->> 'branch_name'), 255),
    nullif(left(btrim(coalesce(payload ->> 'before_sha', '')), 128), ''),
    left(btrim(payload ->> 'after_sha'), 128),
    nullif(left(btrim(coalesce(payload ->> 'compare_url', '')), 2048), ''),
    nullif(left(btrim(coalesce(payload ->> 'pusher_name', '')), 255), ''),
    nullif(left(btrim(coalesce(payload ->> 'pusher_email', '')), 320), ''),
    left(btrim(payload ->> 'headline'), 2000),
    payload -> 'commits',
    coalesce(nullif(payload ->> 'pushed_at', '')::timestamptz, now())
  ) on conflict (github_push_id) do update set
    branch_name = excluded.branch_name, before_sha = excluded.before_sha,
    after_sha = excluded.after_sha, compare_url = excluded.compare_url,
    pusher_name = excluded.pusher_name, pusher_email = excluded.pusher_email,
    headline = excluded.headline, commits = excluded.commits,
    pushed_at = excluded.pushed_at
  returning jsonb_build_object('id', id, 'github_push_id', github_push_id, 'pushed_at', pushed_at) into result;
  return result;
end;
$$;

create or replace function public.platform_list_development_updates(page_limit integer default 100)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_platform_scope('development.read');
  return jsonb_build_object('items', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', update_row.id, 'github_push_id', update_row.github_push_id,
      'repository_full_name', update_row.repository_full_name,
      'branch_name', update_row.branch_name, 'before_sha', update_row.before_sha,
      'after_sha', update_row.after_sha, 'compare_url', update_row.compare_url,
      'pusher_name', update_row.pusher_name, 'headline', update_row.headline,
      'commits', update_row.commits, 'pushed_at', update_row.pushed_at
    ) order by update_row.pushed_at desc)
    from (select * from private.development_updates order by pushed_at desc limit greatest(1, least(coalesce(page_limit, 100), 250))) update_row
  ), '[]'::jsonb));
end;
$$;

create or replace function public.platform_upsert_member(member_email text, member_role text, member_scopes text[], member_status text default 'active')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare target_user_id uuid; current_user_id uuid := (select auth.uid()); active_superadmins integer; result jsonb;
begin
  perform private.require_platform_scope('team.write', true);
  if member_role not in ('superadmin', 'operations', 'support', 'billing', 'read_only') or member_status not in ('active', 'suspended') then raise exception 'PLATFORM_MEMBER_INVALID' using errcode = '22023'; end if;
  if not (coalesce(member_scopes, '{}') <@ array['dashboard.read','stores.read','support.write','incidents.write','billing.read','billing.write','integrations.read','lifecycle.delete','development.read','team.read','team.write','releases.read','releases.write','releases.approve','audit.read']::text[]) then raise exception 'PLATFORM_SCOPE_INVALID' using errcode = '22023'; end if;
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

revoke all on function public.ingest_github_development_update(jsonb) from public, anon, authenticated;
revoke all on function public.platform_list_development_updates(integer) from public, anon;
grant execute on function public.ingest_github_development_update(jsonb) to service_role;
grant execute on function public.platform_list_development_updates(integer) to authenticated;

commit;
