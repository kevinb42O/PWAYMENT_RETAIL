begin;

-- Harden the first confirmed Pace write: a product cannot be added to a new
-- Pace draft while any internal draft already contains it, and an idempotency
-- key belongs to the actor that first used it. Product row locks serialize
-- concurrent confirmations before the existing-draft check runs.
create or replace function public.create_pace_replenishment_drafts(
  target_store_id uuid,
  action_idempotency_key uuid,
  requested_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  actor_name text;
  existing_actor_id uuid;
  include_demo boolean;
  item jsonb;
  candidate jsonb;
  requested_product_id uuid;
  product_record public.products%rowtype;
  supplier_name text;
  purchase_order_id uuid;
  created_order_ids jsonb := '[]'::jsonb;
  candidate_items jsonb := '[]'::jsonb;
  skipped_items jsonb := '[]'::jsonb;
  result jsonb;
  seen_product_ids uuid[] := '{}'::uuid[];
  supplier_index integer := 0;
  calculated_quantity integer;
begin
  if actor_id is null or not private.has_store_role(target_store_id, array['owner', 'manager']) then
    raise exception using errcode = '42501', message = 'pace-action:forbidden:Alleen een manager of eigenaar kan een concept-inkooporder aanmaken.';
  end if;
  if not private.has_entitlement(target_store_id, 'purchase_orders.create') then
    raise exception using errcode = '42501', message = 'pace-action:entitlement:Concept-inkooporders zijn niet beschikbaar in dit abonnement.';
  end if;
  if pg_catalog.jsonb_typeof(requested_items) is distinct from 'array'
     or pg_catalog.jsonb_array_length(requested_items) < 1
     or pg_catalog.jsonb_array_length(requested_items) > 25 then
    raise exception using errcode = '22023', message = 'pace-action:invalid:Kies tussen 1 en 25 producten voor dit concept.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(target_store_id::text || ':pace-replenishment:' || action_idempotency_key::text, 0)
  );
  select execution.result, execution.actor_user_id into result, existing_actor_id
  from public.pace_action_executions execution
  where execution.store_id = target_store_id and execution.idempotency_key = action_idempotency_key;
  if found then
    if existing_actor_id <> actor_id then
      raise exception using errcode = '42501', message = 'pace-action:forbidden:Deze actie hoort bij een andere gebruiker.';
    end if;
    return result;
  end if;

  select store.is_demo into include_demo from public.stores store where store.id = target_store_id;
  select coalesce(profile.display_name, pg_catalog.split_part(user_row.email, '@', 1), 'Gebruiker') into actor_name
  from auth.users user_row
  left join public.profiles profile on profile.id = user_row.id
  where user_row.id = actor_id;

  for item in select value from pg_catalog.jsonb_array_elements(requested_items)
  loop
    begin
      requested_product_id := (item ->> 'productId')::uuid;
    exception when invalid_text_representation then
      raise exception using errcode = '22023', message = 'pace-action:invalid:Een productreferentie is ongeldig.';
    end;
    if requested_product_id = any(seen_product_ids) then
      raise exception using errcode = '22023', message = 'pace-action:invalid:Een product mag maar één keer voorkomen.';
    end if;
    seen_product_ids := array_append(seen_product_ids, requested_product_id);

    select * into product_record
    from public.products product
    where product.store_id = target_store_id and product.id = requested_product_id
      and (include_demo or not product.is_demo)
    for update;
    if not found then
      skipped_items := skipped_items || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('productId', requested_product_id, 'reason', 'product_not_found'));
      continue;
    end if;
    if not product_record.is_active or product_record.stock_qty is null or product_record.min_stock_qty is null
       or product_record.stock_qty > product_record.min_stock_qty then
      skipped_items := skipped_items || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('productId', requested_product_id, 'reason', 'stock_condition_changed'));
      continue;
    end if;
    if exists (
      select 1 from public.purchase_order_lines line
      join public.purchase_orders purchase on purchase.id = line.purchase_order_id and purchase.store_id = line.store_id
      where line.store_id = target_store_id and line.product_id = product_record.id
        and purchase.status in ('draft', 'ordered', 'partially-received')
    ) then
      skipped_items := skipped_items || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('productId', requested_product_id, 'reason', 'existing_draft'));
      continue;
    end if;
    supplier_name := nullif(pg_catalog.btrim(product_record.supplier), '');
    if supplier_name is null then
      skipped_items := skipped_items || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('productId', requested_product_id, 'reason', 'supplier_missing'));
      continue;
    end if;
    calculated_quantity := greatest(1, product_record.min_stock_qty - product_record.stock_qty);
    candidate_items := candidate_items || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'productId', product_record.id,
      'productExternalId', product_record.external_id,
      'productName', product_record.name,
      'sku', product_record.sku,
      'supplier', supplier_name,
      'orderedQty', calculated_quantity,
      'unitCostCents', product_record.cost_price_cents,
      'stockQty', product_record.stock_qty,
      'minStockQty', product_record.min_stock_qty
    ));
  end loop;

  for supplier_name in
    select distinct value ->> 'supplier' from pg_catalog.jsonb_array_elements(candidate_items)
  loop
    supplier_index := supplier_index + 1;
    insert into public.purchase_orders (
      store_id, external_id, supplier, status, source, owner_user_id, owner_name, note
    ) values (
      target_store_id,
      'pace-replenishment:' || action_idempotency_key::text || ':' || supplier_index::text,
      supplier_name, 'draft', 'pace-replenishment', actor_id, actor_name,
      'Concept aangemaakt na expliciete Pace-bevestiging. Niet verzonden naar leverancier.'
    ) returning id into purchase_order_id;
    created_order_ids := created_order_ids || pg_catalog.jsonb_build_array(purchase_order_id);

    for candidate in
      select value from pg_catalog.jsonb_array_elements(candidate_items) where value ->> 'supplier' = supplier_name
    loop
      insert into public.purchase_order_lines (
        store_id, purchase_order_id, product_id, product_external_id, product_name,
        sku, ordered_qty, received_qty, unit_cost_cents, forecast_snapshot
      ) values (
        target_store_id, purchase_order_id, (candidate ->> 'productId')::uuid,
        nullif(candidate ->> 'productExternalId', ''), candidate ->> 'productName',
        nullif(candidate ->> 'sku', ''), (candidate ->> 'orderedQty')::integer, 0,
        nullif(candidate ->> 'unitCostCents', '')::bigint,
        pg_catalog.jsonb_build_object(
          'currentStockQtyAtDraft', (candidate ->> 'stockQty')::integer,
          'minStockQtyAtDraft', (candidate ->> 'minStockQty')::integer,
          'origin', 'pace-confirmed-replenishment'
        )
      );
    end loop;
  end loop;

  result := pg_catalog.jsonb_build_object(
    'createdOrderIds', created_order_ids,
    'createdOrderCount', pg_catalog.jsonb_array_length(created_order_ids),
    'createdItemCount', pg_catalog.jsonb_array_length(candidate_items),
    'skipped', skipped_items,
    'message', case when pg_catalog.jsonb_array_length(created_order_ids) > 0
      then 'Interne concept-inkooporders zijn aangemaakt; er is niets naar een leverancier verzonden.'
      else 'Er werd geen concept aangemaakt omdat geen geselecteerd product nog aan de voorwaarden voldeed, al in een concept stond of een leverancier miste.' end
  );
  insert into public.pace_action_executions (store_id, idempotency_key, action_type, actor_user_id, result)
  values (target_store_id, action_idempotency_key, 'replenishment_draft', actor_id, result);
  perform public.append_audit(target_store_id, 'pace.replenishment_drafts_created', pg_catalog.jsonb_build_object(
    'idempotencyKey', action_idempotency_key,
    'createdOrderCount', pg_catalog.jsonb_array_length(created_order_ids),
    'createdItemCount', pg_catalog.jsonb_array_length(candidate_items),
    'skippedCount', pg_catalog.jsonb_array_length(skipped_items)
  ));
  return result;
end;
$$;

commit;
