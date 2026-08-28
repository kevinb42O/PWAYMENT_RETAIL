begin;

-- Inventory operations are a basic retail capability. Forecasting and creating
-- new purchase orders retain their existing, separate commercial gates.
insert into public.billing_features (feature_key, name, category, value_type)
values ('inventory.operations', 'Voorraadoperaties', 'inventory', 'boolean')
on conflict (feature_key) do update set
  name = excluded.name,
  category = excluded.category,
  value_type = excluded.value_type;

insert into public.billing_plan_features (plan_code, feature_key, enabled, limit_value)
select code, 'inventory.operations', true, null
from public.billing_plans
on conflict (plan_code, feature_key) do update set enabled = true, limit_value = null;

-- Keep accepting complete V2 signup payloads from an old client during the
-- rolling deployment. V3 additionally requires the inventory preference.
create or replace function private.is_valid_store_configuration_v2(candidate jsonb)
returns boolean
language plpgsql
stable
set search_path = ''
as $$
declare
  capability text;
  parsed_completed_at timestamptz;
  configuration_version text := candidate ->> 'version';
begin
  if pg_catalog.jsonb_typeof(candidate) is distinct from 'object'
     or configuration_version not in ('2', '3')
     or private.is_valid_retail_profile_code(candidate ->> 'industry') is not true
     or candidate ->> 'salesModel' not in ('physical', 'omnichannel', 'online-first', 'service-led')
     or candidate ->> 'teamSize' not in ('solo', 'small', 'medium', 'large')
     or candidate ->> 'catalogSource' not in ('none', 'spreadsheet', 'pos', 'ecommerce', 'erp', 'supplier')
     or candidate ->> 'importTiming' not in ('now', 'later')
     or candidate ->> 'pricingModel' not in ('single', 'customer-groups', 'retail-b2b', 'contract')
     or candidate ->> 'defaultVat' not in ('mixed', '0', '6', '12', '21')
     or candidate ->> 'serviceContactPreference' not in ('both', 'email', 'phone')
     or pg_catalog.jsonb_typeof(candidate -> 'firstRunCompleted') is distinct from 'boolean'
     or pg_catalog.jsonb_typeof(candidate -> 'modules') is distinct from 'object'
     or pg_catalog.jsonb_typeof(candidate #> '{modules,catalog}') is distinct from 'boolean'
     or (configuration_version = '3' and pg_catalog.jsonb_typeof(candidate #> '{modules,inventory}') is distinct from 'boolean')
     or pg_catalog.jsonb_typeof(candidate #> '{modules,customers}') is distinct from 'boolean'
     or pg_catalog.jsonb_typeof(candidate #> '{modules,service}') is distinct from 'boolean'
     or pg_catalog.jsonb_typeof(candidate #> '{modules,workforce}') is distinct from 'boolean'
     or pg_catalog.jsonb_typeof(candidate #> '{modules,webshop}') is distinct from 'boolean'
     or pg_catalog.jsonb_typeof(candidate #> '{modules,insights}') is distinct from 'boolean'
     or pg_catalog.jsonb_typeof(candidate -> 'capabilities') is distinct from 'object'
     or nullif(candidate ->> 'completedAt', '') is null then
    return false;
  end if;
  begin
    parsed_completed_at := (candidate ->> 'completedAt')::timestamptz;
  exception when invalid_datetime_format or datetime_field_overflow then
    return false;
  end;
  if parsed_completed_at is null then return false; end if;
  foreach capability in array array[
    'variant-matrix', 'multiple-identifiers', 'stock-locations',
    'serial-numbers', 'lot-traceability', 'measurable-quantities',
    'packaging', 'customer-pricing', 'webshop-variants'
  ] loop
    if candidate #>> array['capabilities', capability] not in (
      'unknown', 'not-needed', 'required', 'enabled', 'blocked'
    ) then return false; end if;
  end loop;
  return true;
end;
$$;

-- Existing stores had inventory before it became a separate workspace.
update public.stores
set onboarding_config = pg_catalog.jsonb_set(
  pg_catalog.jsonb_set(onboarding_config, '{version}', '3'::jsonb, true),
  '{modules,inventory}', 'true'::jsonb, true
)
where pg_catalog.jsonb_typeof(onboarding_config) = 'object'
  and onboarding_config <> '{}'::jsonb
  and (onboarding_config ->> 'version') in ('1', '2')
  and onboarding_config #> '{modules,inventory}' is null;

insert into public.store_module_settings (store_id, module_key, enabled, sort_order, visible_roles)
select store.id, 'inventory',
       coalesce(store.onboarding_config #>> '{modules,inventory}' = 'true', true),
       45, array['owner', 'manager']::text[]
from public.stores store
on conflict (store_id, module_key) do update
set enabled = excluded.enabled,
    visible_roles = excluded.visible_roles;

-- Extend the canonical owner save with a transactionally synchronized legacy
-- navigation row. The frontend continues to read onboarding_config only.
create or replace function public.save_store_retail_profile(
  target_store_id uuid,
  profile_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  requested_profile text;
  completed_at_value timestamptz;
begin
  if actor_id is null or not private.has_store_role(target_store_id, array['owner']) then
    raise exception using errcode = '42501', message = 'retail-profile:forbidden:Alleen de eigenaar kan het winkelprofiel wijzigen.';
  end if;
  if not private.is_valid_store_configuration_v2(profile_payload)
     or profile_payload ->> 'version' is distinct from '3' then
    raise exception using errcode = '22023', message = 'retail-profile:invalid:De volledige retailconfiguratie is ongeldig of onvolledig.';
  end if;
  requested_profile := pg_catalog.btrim(profile_payload ->> 'industry');
  completed_at_value := (profile_payload ->> 'completedAt')::timestamptz;
  update public.stores
  set industry_code = requested_profile,
      onboarding_config = profile_payload,
      onboarding_completed_at = completed_at_value
  where id = target_store_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'retail-profile:not-found:De winkel bestaat niet.';
  end if;
  insert into public.store_retail_profiles (
    store_id, profile_code, profile_version, selected_by_user_id, selected_at, updated_at
  ) values (
    target_store_id, requested_profile, 1, actor_id, clock_timestamp(), clock_timestamp()
  ) on conflict (store_id) do update set
    profile_code = excluded.profile_code,
    selected_by_user_id = excluded.selected_by_user_id,
    selected_at = excluded.selected_at,
    updated_at = excluded.updated_at;
  perform private.sync_store_capability_assessments(target_store_id, profile_payload, 'settings', actor_id);
  insert into public.store_module_settings (store_id, module_key, enabled, sort_order, visible_roles)
  values (
    target_store_id, 'inventory', (profile_payload #>> '{modules,inventory}')::boolean,
    45, array['owner', 'manager']::text[]
  ) on conflict (store_id, module_key) do update set
    enabled = excluded.enabled,
    visible_roles = excluded.visible_roles,
    updated_at = clock_timestamp();
  return pg_catalog.jsonb_build_object(
    'store_id', target_store_id,
    'profile_code', requested_profile,
    'profile_version', 1
  );
end;
$$;
revoke all on function public.save_store_retail_profile(uuid, jsonb) from public, anon;
grant execute on function public.save_store_retail_profile(uuid, jsonb) to authenticated;

create or replace function private.assert_simple_inventory_product(
  target_store_id uuid,
  target_product_id uuid
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare profile public.product_inventory_profiles%rowtype;
begin
  select * into profile from public.product_inventory_profiles
  where store_id = target_store_id and product_id = target_product_id;
  if found and profile.stock_mode <> 'simple' then
    raise exception using errcode = 'P0001', message =
      'inventory-operation:specialized-mode:Dit product gebruikt locaties, loten of serienummers en kan niet als eenvoudige totaalvoorraad worden geboekt.';
  end if;
end;
$$;
revoke all on function private.assert_simple_inventory_product(uuid, uuid) from public, anon, authenticated;

create table public.inventory_operations (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  client_request_id text not null check (char_length(pg_catalog.btrim(client_request_id)) between 8 and 200),
  product_id uuid not null,
  product_name text not null,
  operation_mode text not null check (operation_mode in ('delivery', 'count', 'correction')),
  expected_stock_qty integer not null check (expected_stock_qty >= 0),
  quantity_delta integer not null,
  quantity_after integer not null check (quantity_after >= 0),
  reason text,
  note text check (note is null or char_length(note) <= 500),
  occurred_at timestamptz not null default clock_timestamp(),
  user_id uuid references auth.users(id),
  user_name text,
  unique (store_id, client_request_id),
  foreign key (store_id, product_id) references public.products(store_id, id)
);
create index inventory_operations_store_product_occurred_idx
  on public.inventory_operations (store_id, product_id, occurred_at desc);
alter table public.inventory_operations enable row level security;
create policy inventory_operations_member_select on public.inventory_operations
  for select to authenticated using ((select private.is_store_member(store_id)));
grant select on public.inventory_operations to authenticated;

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
  ), false)
$$;
revoke all on function private.inventory_workspace_runtime_enabled(uuid) from public, anon, authenticated;

create or replace function public.record_inventory_operation(target_store_id uuid, payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  actor_name text;
  request_id text := nullif(pg_catalog.btrim(payload ->> 'client_request_id'), '');
  product_external_id text := nullif(pg_catalog.btrim(payload ->> 'product_id'), '');
  operation_mode text := nullif(pg_catalog.btrim(payload ->> 'mode'), '');
  operation_reason text := nullif(pg_catalog.btrim(payload ->> 'reason'), '');
  operation_note text := nullif(pg_catalog.btrim(payload ->> 'note'), '');
  expected_qty integer;
  requested_qty integer;
  quantity_delta integer;
  quantity_after integer;
  product_record public.products%rowtype;
  existing_operation public.inventory_operations%rowtype;
begin
  if actor_id is null or not private.has_store_role(target_store_id, array['owner', 'manager']) then
    raise exception using errcode = '42501', message = 'inventory-operation:forbidden:Alleen een manager of eigenaar kan voorraad boeken.';
  end if;
  if not private.has_entitlement(target_store_id, 'inventory.operations') then
    raise exception using errcode = 'P0001', message = 'inventory-operation:plan-required:Voorraadoperaties zijn niet actief in dit abonnement.';
  end if;
  if not private.inventory_workspace_runtime_enabled(target_store_id) then
    raise exception using errcode = 'P0001', message = 'inventory-operation:disabled:De nieuwe voorraadwerkruimte is tijdelijk uitgeschakeld.';
  end if;
  if request_id is null or product_external_id is null or operation_mode not in ('delivery', 'count', 'correction') then
    raise exception using errcode = 'P0001', message = 'inventory-operation:invalid-request:Vul product, bewerking en unieke referentie correct in.';
  end if;
  if operation_mode = 'correction'
     and (operation_reason not in ('damage', 'loss', 'found', 'other')
       or (operation_reason = 'other' and operation_note is null)) then
    raise exception using errcode = 'P0001', message = 'inventory-operation:invalid-reason:Kies en licht een geldige correctiereden toe.';
  end if;
  if operation_note is not null and char_length(operation_note) > 500 then
    raise exception using errcode = 'P0001', message = 'inventory-operation:invalid-note:De notitie is te lang.';
  end if;
  begin
    expected_qty := (payload ->> 'expected_stock_qty')::integer;
    requested_qty := (payload ->> 'quantity')::integer;
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception using errcode = 'P0001', message = 'inventory-operation:invalid-quantity:Het aantal is ongeldig.';
  end;
  if expected_qty < 0
     or (operation_mode = 'count' and requested_qty < 0)
     or (operation_mode = 'delivery' and requested_qty < 1)
     or (operation_mode = 'correction' and requested_qty = 0) then
    raise exception using errcode = 'P0001', message = 'inventory-operation:invalid-quantity:Het aantal is ongeldig.';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(target_store_id::text || ':inventory-operation:' || request_id, 0)
  );
  select * into existing_operation from public.inventory_operations
  where store_id = target_store_id and client_request_id = request_id;
  if found then
    return pg_catalog.jsonb_build_object(
      'operation_id', existing_operation.id,
      'product_id', existing_operation.product_id,
      'quantity_before', existing_operation.expected_stock_qty,
      'quantity_delta', existing_operation.quantity_delta,
      'quantity_after', existing_operation.quantity_after,
      'duplicate', true
    );
  end if;
  select * into product_record from public.products
  where store_id = target_store_id
    and (external_id = product_external_id or id::text = product_external_id)
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'inventory-operation:product-not-found:Dit product bestaat niet meer.';
  end if;
  if product_record.stock_qty is null then
    raise exception using errcode = 'P0001', message = 'inventory-operation:stock-not-tracked:Voor dit product wordt geen voorraad bijgehouden.';
  end if;
  perform private.assert_simple_inventory_product(target_store_id, product_record.id);
  if product_record.stock_qty <> expected_qty then
    raise exception using errcode = 'P0001', message = 'inventory-operation:stock-changed:De voorraad veranderde ondertussen. Controleer de nieuwe stand.';
  end if;
  quantity_after := case when operation_mode = 'count'
    then requested_qty else product_record.stock_qty + requested_qty end;
  quantity_delta := quantity_after - product_record.stock_qty;
  if quantity_after < 0 then
    raise exception using errcode = 'P0001', message = 'inventory-operation:negative-stock:Deze correctie zou de voorraad onder nul brengen.';
  end if;
  select coalesce(profile.display_name, pg_catalog.split_part(account.email, '@', 1), 'Gebruiker')
  into actor_name
  from auth.users account left join public.profiles profile on profile.id = account.id
  where account.id = actor_id;
  update public.products set stock_qty = quantity_after, updated_at = clock_timestamp()
  where store_id = target_store_id and id = product_record.id;
  insert into public.inventory_operations (
    store_id, client_request_id, product_id, product_name, operation_mode,
    expected_stock_qty, quantity_delta, quantity_after, reason, note, user_id, user_name
  ) values (
    target_store_id, request_id, product_record.id, product_record.name, operation_mode,
    expected_qty, quantity_delta, quantity_after, operation_reason, operation_note, actor_id, actor_name
  ) returning * into existing_operation;
  if quantity_delta <> 0 then
    insert into public.stock_movements (
      store_id, product_id, product_name, quantity_delta, reason, occurred_at,
      user_id, user_name, client_request_id, quantity_before, quantity_after,
      adjustment_reason, note
    ) values (
      target_store_id, product_record.id, product_record.name, quantity_delta,
      case when operation_mode = 'delivery' then 'purchase-receipt' else 'manual-adjustment' end,
      existing_operation.occurred_at, actor_id, actor_name, request_id,
      expected_qty, quantity_after,
      case when operation_mode = 'count' then 'cycle-count' else operation_reason end,
      operation_note
    );
  end if;
  insert into public.audit_entries (store_id, occurred_at, user_id, user_name, action, detail, source)
  values (
    target_store_id, existing_operation.occurred_at, actor_id, actor_name,
    'inventory.operation',
    pg_catalog.jsonb_build_object(
      'operationId', existing_operation.id, 'clientRequestId', request_id,
      'productId', product_record.id, 'productName', product_record.name,
      'mode', operation_mode, 'quantityBefore', expected_qty,
      'quantityDelta', quantity_delta, 'quantityAfter', quantity_after,
      'reason', operation_reason, 'note', operation_note
    ), 'app'
  );
  return pg_catalog.jsonb_build_object(
    'operation_id', existing_operation.id, 'product_id', product_record.id,
    'quantity_before', expected_qty, 'quantity_delta', quantity_delta,
    'quantity_after', quantity_after, 'duplicate', false
  );
end;
$$;
revoke all on function public.record_inventory_operation(uuid, jsonb) from public, anon;
grant execute on function public.record_inventory_operation(uuid, jsonb) to authenticated;

commit;
