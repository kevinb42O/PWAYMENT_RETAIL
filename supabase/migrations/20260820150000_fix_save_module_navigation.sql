-- Fix the deployed module-navigation RPC: the previous implementation used
-- `module_key` for both a PL/pgSQL variable and a table column, making the
-- UPDATE predicate ambiguous at runtime.

create or replace function public.save_module_navigation(target_store_id uuid, payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare item jsonb;
declare selected_module_key text;
declare module_roles text[];
declare order_value integer;
declare enabled_value boolean;
begin
  if (select auth.uid()) is null or not private.has_store_role(target_store_id, array['owner']) then
    raise exception using errcode = '42501', message = 'modules:forbidden:Alleen de zaakvoerder kan modules beheren.';
  end if;
  if jsonb_typeof(payload) <> 'array' or jsonb_array_length(payload) = 0 then
    raise exception using errcode = 'P0001', message = 'modules:invalid:Ongeldige moduleconfiguratie.';
  end if;
  perform private.ensure_workforce_defaults(target_store_id);
  for item in select value from jsonb_array_elements(payload) loop
    selected_module_key := nullif(btrim(item ->> 'key'), '');
    if selected_module_key is null or selected_module_key not in ('pos', 'service', 'workforce', 'customers', 'integration-hub', 'insights', 'z-report', 'audit-log', 'webshop') then
      raise exception using errcode = 'P0001', message = 'modules:invalid:Onbekende module.';
    end if;
    begin
      order_value := (item ->> 'order')::integer;
      enabled_value := (item ->> 'enabled')::boolean;
      select coalesce(array_agg(value), array[]::text[]) into module_roles
      from jsonb_array_elements_text(item -> 'visibleRoles');
    exception when others then
      raise exception using errcode = 'P0001', message = 'modules:invalid:Ongeldige moduleconfiguratie.';
    end;
    if order_value not between 0 and 1000
       or cardinality(module_roles) = 0
       or not (module_roles <@ array['owner', 'manager', 'cashier']::text[]) then
      raise exception using errcode = 'P0001', message = 'modules:invalid:Ongeldige volgorde of roltoegang.';
    end if;
    if selected_module_key in ('pos', 'z-report', 'audit-log') then enabled_value := true; end if;
    if selected_module_key = 'pos' then module_roles := array['owner', 'manager', 'cashier']::text[]; end if;
    update public.store_module_settings as settings
    set enabled = enabled_value,
        sort_order = order_value,
        custom_label = nullif(btrim(item ->> 'customLabel'), ''),
        visible_roles = module_roles
    where settings.store_id = target_store_id
      and settings.module_key = selected_module_key;
  end loop;
  perform public.append_audit(target_store_id, 'modules.updated', jsonb_build_object('modules', payload));
  return public.get_module_navigation(target_store_id);
end;
$$;

revoke all on function public.save_module_navigation(uuid, jsonb) from public, anon;
grant execute on function public.save_module_navigation(uuid, jsonb) to authenticated;
