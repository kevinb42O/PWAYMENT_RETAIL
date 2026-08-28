begin;

create or replace function public.get_inventory_operation_profiles(target_store_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not private.is_store_member(target_store_id) then
    raise exception using errcode = '42501', message = 'inventory-operation:forbidden:Geen toegang tot deze winkel.';
  end if;
  return coalesce((
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'product_id', coalesce(product.external_id, product.id::text),
      'stock_mode', profile.stock_mode,
      'track_stock', profile.track_stock
    ) order by product.name, product.id)
    from public.product_inventory_profiles profile
    join public.products product
      on product.store_id = profile.store_id and product.id = profile.product_id
    where profile.store_id = target_store_id
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.get_inventory_operation_profiles(uuid) from public, anon;
grant execute on function public.get_inventory_operation_profiles(uuid) to authenticated;

-- Every simple operation must fail closed for a product whose detailed
-- location/lot/serial representation may not be flattened into stock_qty.
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

create or replace function private.guard_specialized_inventory_projection()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare mode_value text;
begin
  if new.stock_qty is not distinct from old.stock_qty then return new; end if;
  select stock_mode into mode_value from public.product_inventory_profiles
  where store_id = new.store_id and product_id = new.id;
  if mode_value is not null and mode_value <> 'simple' then
    raise exception using errcode = 'P0001', message =
      'inventory-operation:specialized-mode:Voorraad met locaties, loten of serienummers vereist de gespecialiseerde workflow.';
  end if;
  return new;
end;
$$;
drop trigger if exists products_guard_specialized_inventory_projection on public.products;
create trigger products_guard_specialized_inventory_projection
  before update of stock_qty on public.products
  for each row execute function private.guard_specialized_inventory_projection();

create table public.inventory_operation_batches (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  client_request_id text not null check (char_length(btrim(client_request_id)) between 8 and 200),
  operation_mode text not null check (operation_mode in ('delivery', 'count', 'correction')),
  line_count integer not null check (line_count between 1 and 500),
  user_id uuid references auth.users(id),
  user_name text,
  occurred_at timestamptz not null default clock_timestamp(),
  unique (store_id, client_request_id)
);
alter table public.inventory_operation_batches enable row level security;
create policy inventory_operation_batches_member_select on public.inventory_operation_batches
  for select to authenticated using ((select private.is_store_member(store_id)));
grant select on public.inventory_operation_batches to authenticated;

create or replace function public.record_inventory_batch(target_store_id uuid, payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  actor_name text;
  request_id text := nullif(pg_catalog.btrim(payload ->> 'client_request_id'), '');
  operation_mode text := nullif(pg_catalog.btrim(payload ->> 'mode'), '');
  lines jsonb := payload -> 'lines';
  line jsonb;
  line_index integer := 0;
  line_count integer;
  product_external_id text;
  expected_qty integer;
  requested_qty integer;
  product_record public.products%rowtype;
  seen_product_ids uuid[] := array[]::uuid[];
  existing_batch public.inventory_operation_batches%rowtype;
  line_result jsonb;
  conflict_messages text[] := array[]::text[];
  profile_mode text;
begin
  if actor_id is null or not private.has_store_role(target_store_id, array['owner', 'manager']) then
    raise exception using errcode = '42501', message = 'inventory-operation:forbidden:Alleen een manager of eigenaar kan een voorraadbatch boeken.';
  end if;
  if not private.has_entitlement(target_store_id, 'inventory.operations') then
    raise exception using errcode = 'P0001', message = 'inventory-operation:plan-required:Voorraadoperaties zijn niet actief in dit abonnement.';
  end if;
  if not private.inventory_workspace_runtime_enabled(target_store_id) then
    raise exception using errcode = 'P0001', message = 'inventory-operation:disabled:De voorraadwerkruimte is tijdelijk uitgeschakeld.';
  end if;
  if request_id is null or operation_mode not in ('delivery', 'count', 'correction')
     or pg_catalog.jsonb_typeof(lines) is distinct from 'array' then
    raise exception using errcode = 'P0001', message = 'inventory-operation:invalid-request:De batch is ongeldig.';
  end if;
  line_count := pg_catalog.jsonb_array_length(lines);
  if line_count not between 1 and 500 then
    raise exception using errcode = 'P0001', message = 'inventory-operation:invalid-request:Verwerk 1 tot 500 producten per batch.';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(target_store_id::text || ':inventory-batch:' || request_id, 0)
  );
  select * into existing_batch from public.inventory_operation_batches
  where store_id = target_store_id and client_request_id = request_id;
  if found then
    return pg_catalog.jsonb_build_object(
      'batch_id', existing_batch.id, 'line_count', existing_batch.line_count, 'duplicate', true
    );
  end if;

  -- Phase one locks and validates every line before the first write. Any stale
  -- line therefore produces no hidden partial result.
  for line in select value from pg_catalog.jsonb_array_elements(lines) loop
    product_external_id := nullif(pg_catalog.btrim(line ->> 'product_id'), '');
    begin
      expected_qty := (line ->> 'expected_stock_qty')::integer;
      requested_qty := (line ->> 'quantity')::integer;
    exception when invalid_text_representation or numeric_value_out_of_range then
      raise exception using errcode = 'P0001', message = 'inventory-operation:invalid-quantity:Een batchaantal is ongeldig.';
    end;
    select * into product_record from public.products
    where store_id = target_store_id
      and (external_id = product_external_id or id::text = product_external_id)
    for update;
    if not found or product_record.stock_qty is null then
      conflict_messages := pg_catalog.array_append(
        conflict_messages,
        coalesce(product_external_id, 'Onbekend product') || ': bestaat niet of houdt geen voorraad bij'
      );
      continue;
    end if;
    if product_record.id = any(seen_product_ids) then
      raise exception using errcode = 'P0001', message = 'inventory-operation:duplicate-product:Eenzelfde product staat dubbel in de batch.';
    end if;
    seen_product_ids := pg_catalog.array_append(seen_product_ids, product_record.id);
    select stock_mode into profile_mode from public.product_inventory_profiles
    where store_id = target_store_id and product_id = product_record.id;
    if profile_mode is not null and profile_mode <> 'simple' then
      conflict_messages := pg_catalog.array_append(
        conflict_messages,
        product_record.name || ': gebruikt ' || profile_mode || ' en vereist de gespecialiseerde workflow'
      );
      continue;
    end if;
    if expected_qty < 0 or product_record.stock_qty <> expected_qty then
      conflict_messages := pg_catalog.array_append(
        conflict_messages,
        product_record.name || ': verwacht ' || expected_qty || ', actueel ' || product_record.stock_qty
      );
      continue;
    end if;
    if (operation_mode = 'count' and requested_qty < 0)
       or (operation_mode = 'delivery' and requested_qty <= 0)
       or (operation_mode = 'correction' and (requested_qty = 0 or expected_qty + requested_qty < 0)) then
      raise exception using errcode = 'P0001', message = 'inventory-operation:invalid-quantity:' || product_record.name || ': ongeldig aantal.';
    end if;
  end loop;
  if pg_catalog.cardinality(conflict_messages) > 0 then
    raise exception using errcode = 'P0001', message =
      'inventory-operation:stock-changed:De volledige batch is niet verwerkt. Conflicten: '
      || pg_catalog.array_to_string(conflict_messages, '; ');
  end if;

  select coalesce(profile.display_name, pg_catalog.split_part(account.email, '@', 1), 'Gebruiker')
  into actor_name from auth.users account
  left join public.profiles profile on profile.id = account.id where account.id = actor_id;

  -- Phase two invokes the reviewed single-line contracts inside this same SQL
  -- transaction. An exception rolls every line back.
  for line in select value from pg_catalog.jsonb_array_elements(lines) loop
    line_index := line_index + 1;
    line_result := public.record_inventory_operation(target_store_id, pg_catalog.jsonb_build_object(
      'client_request_id', request_id || ':' || line_index,
      'product_id', line ->> 'product_id',
      'expected_stock_qty', (line ->> 'expected_stock_qty')::integer,
      'mode', operation_mode,
      'quantity', (line ->> 'quantity')::integer,
      'reason', line ->> 'reason',
      'note', nullif(pg_catalog.btrim(line ->> 'note'), '')
    ));
  end loop;

  insert into public.inventory_operation_batches (
    store_id, client_request_id, operation_mode, line_count, user_id, user_name
  ) values (target_store_id, request_id, operation_mode, line_count, actor_id, actor_name)
  returning * into existing_batch;
  insert into public.audit_entries (store_id, user_id, user_name, action, detail, source)
  values (
    target_store_id, actor_id, actor_name, 'inventory.batch',
    pg_catalog.jsonb_build_object('batchId', existing_batch.id, 'clientRequestId', request_id,
      'mode', operation_mode, 'lineCount', line_count, 'lines', lines), 'app'
  );
  return pg_catalog.jsonb_build_object(
    'batch_id', existing_batch.id, 'line_count', line_count, 'duplicate', false
  );
end;
$$;
revoke all on function public.record_inventory_batch(uuid, jsonb) from public, anon;
grant execute on function public.record_inventory_batch(uuid, jsonb) to authenticated;

-- Keep the legacy navigation compatibility API aware of the new row. Current
-- clients still use StoreConfiguration V3 as their canonical source.
create or replace function public.save_module_navigation(target_store_id uuid, payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare item jsonb;
declare module_key text;
declare module_roles text[];
declare order_value integer;
declare enabled_value boolean;
begin
  if (select auth.uid()) is null or not private.has_store_role(target_store_id, array['owner']) then
    raise exception using errcode = '42501', message = 'modules:forbidden:Alleen de zaakvoerder kan modules beheren.';
  end if;
  if pg_catalog.jsonb_typeof(payload) <> 'array' or pg_catalog.jsonb_array_length(payload) = 0 then
    raise exception using errcode = 'P0001', message = 'modules:invalid:Ongeldige moduleconfiguratie.';
  end if;
  perform private.ensure_workforce_defaults(target_store_id);
  insert into public.store_module_settings (store_id, module_key, enabled, sort_order, visible_roles)
  values (target_store_id, 'inventory', true, 45, array['owner', 'manager']::text[])
  on conflict (store_id, module_key) do nothing;
  for item in select value from pg_catalog.jsonb_array_elements(payload) loop
    module_key := nullif(pg_catalog.btrim(item ->> 'key'), '');
    if module_key is null or module_key not in ('pos', 'service', 'workforce', 'customers', 'inventory', 'integration-hub', 'insights', 'z-report', 'audit-log', 'webshop') then
      raise exception using errcode = 'P0001', message = 'modules:invalid:Onbekende module.';
    end if;
    begin
      order_value := (item ->> 'order')::integer;
      enabled_value := (item ->> 'enabled')::boolean;
      select coalesce(pg_catalog.array_agg(value), array[]::text[]) into module_roles
      from pg_catalog.jsonb_array_elements_text(item -> 'visibleRoles');
    exception when others then
      raise exception using errcode = 'P0001', message = 'modules:invalid:Ongeldige moduleconfiguratie.';
    end;
    if order_value not between 0 and 1000 or pg_catalog.cardinality(module_roles) = 0
       or not (module_roles <@ array['owner', 'manager', 'cashier']::text[]) then
      raise exception using errcode = 'P0001', message = 'modules:invalid:Ongeldige volgorde of roltoegang.';
    end if;
    if module_key in ('pos', 'z-report', 'audit-log') then enabled_value := true; end if;
    if module_key = 'pos' then module_roles := array['owner', 'manager', 'cashier']::text[]; end if;
    if module_key = 'inventory' then module_roles := array['owner', 'manager']::text[]; end if;
    update public.store_module_settings set enabled = enabled_value, sort_order = order_value,
      custom_label = nullif(pg_catalog.btrim(item ->> 'customLabel'), ''), visible_roles = module_roles
    where store_id = target_store_id and store_module_settings.module_key = module_key;
  end loop;
  perform public.append_audit(target_store_id, 'modules.updated', pg_catalog.jsonb_build_object('modules', payload));
  return public.get_module_navigation(target_store_id);
end;
$$;
revoke all on function public.save_module_navigation(uuid, jsonb) from public, anon;
grant execute on function public.save_module_navigation(uuid, jsonb) to authenticated;

commit;
