do $verify_inventory_operations$
declare definition text;
begin
  if to_regprocedure('public.record_inventory_operation(uuid,jsonb)') is null
     or to_regprocedure('public.record_inventory_batch(uuid,jsonb)') is null
     or to_regprocedure('public.get_inventory_operation_profiles(uuid)') is null then
    raise exception 'inventory verification: required RPC missing';
  end if;
  if to_regclass('public.inventory_operations') is null
     or to_regclass('public.inventory_operation_batches') is null then
    raise exception 'inventory verification: evidence tables missing';
  end if;
  if not exists (
    select 1 from public.billing_plan_features
    where feature_key = 'inventory.operations' and enabled
    group by feature_key having count(*) = (select count(*) from public.billing_plans)
  ) then
    raise exception 'inventory verification: operations entitlement is not enabled for every plan';
  end if;
  select pg_catalog.pg_get_functiondef('public.record_inventory_batch(uuid,jsonb)'::regprocedure) into definition;
  if pg_catalog.strpos(pg_catalog.lower(definition), 'for update') = 0
     or pg_catalog.strpos(definition, 'record_inventory_operation') = 0 then
    raise exception 'inventory verification: batch no longer locks and delegates through reviewed contracts';
  end if;
  select pg_catalog.pg_get_functiondef('public.record_inventory_operation(uuid,jsonb)'::regprocedure) into definition;
  if pg_catalog.strpos(definition, 'pg_advisory_xact_lock') = 0
     or pg_catalog.strpos(pg_catalog.lower(definition), 'for update') = 0
     or pg_catalog.strpos(definition, 'inventory_workspace_runtime_enabled') = 0
     or pg_catalog.strpos(definition, 'operation_mode = ''count''') = 0
     or pg_catalog.strpos(definition, 'assert_simple_inventory_product') = 0 then
    raise exception 'inventory verification: single operation safety controls missing';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_trigger
    where tgrelid = 'public.products'::regclass
      and tgname = 'products_guard_specialized_inventory_projection'
      and not tgisinternal
  ) then
    raise exception 'inventory verification: specialized stock projection guard missing';
  end if;
end;
$verify_inventory_operations$;
