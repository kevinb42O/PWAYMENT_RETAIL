begin;

-- Merchant module preferences are the normal availability control. Platform
-- releases remain an explicit override and can still act as a targeted kill
-- switch, but no release must no longer mean a hidden global denial.
create or replace function private.inventory_workspace_runtime_enabled(target_store_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select release.enabled
    from private.platform_feature_releases release
    where release.feature_key = 'inventory_workspace'
      and release.status = 'live'
      and (release.target_mode = 'all' or target_store_id = any(release.target_store_ids))
    order by release.launched_at desc
    limit 1
  ), true)
$$;

revoke all on function private.inventory_workspace_runtime_enabled(uuid) from public, anon, authenticated;

do $verify_inventory_workspace_default$
declare
  definition text;
begin
  select pg_catalog.pg_get_functiondef(procedure.oid)
    into definition
  from pg_catalog.pg_proc procedure
  join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'private'
    and procedure.proname = 'inventory_workspace_runtime_enabled'
    and pg_catalog.pg_get_function_identity_arguments(procedure.oid) = 'target_store_id uuid';

  if definition is null or pg_catalog.strpos(definition, '), true)') = 0 then
    raise exception 'inventory workspace runtime default verification failed';
  end if;
end;
$verify_inventory_workspace_default$;

commit;
