create unique index purchase_order_lines_store_order_product_unique
  on public.purchase_order_lines (store_id, purchase_order_id, product_id);

create or replace function public.save_purchase_order(
  target_store_id uuid,
  payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  actor_name text;
  order_external_id text := nullif(btrim(payload ->> 'id'), '');
  order_status text := payload ->> 'status';
  order_id uuid;
  existing_status text;
  item jsonb;
  product_record public.products%rowtype;
  line_record public.purchase_order_lines%rowtype;
  requested_ordered_qty integer;
  requested_received_qty integer;
  received_delta integer;
  seen_products uuid[] := array[]::uuid[];
begin
  if actor_id is null or not private.has_store_role(target_store_id, array['owner', 'manager']) then
    raise exception using errcode = '42501', message = 'purchase:forbidden:Alleen een manager of eigenaar kan inkooporders beheren.';
  end if;
  if order_external_id is null or nullif(btrim(payload ->> 'supplier'), '') is null
     or order_status not in ('draft', 'ordered', 'partially-received', 'received', 'cancelled')
     or pg_catalog.jsonb_typeof(payload -> 'items') is distinct from 'array'
     or pg_catalog.jsonb_array_length(payload -> 'items') = 0 then
    raise exception using errcode = 'P0001', message = 'purchase:invalid-request:Ongeldige inkooporder.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(target_store_id::text || ':purchase:' || order_external_id, 0)
  );
  select id, status into order_id, existing_status
  from public.purchase_orders
  where store_id = target_store_id and external_id = order_external_id
  for update;
  if order_id is null then
    if order_status <> 'draft' then
      raise exception using errcode = 'P0001', message = 'purchase:invalid-state:Een nieuwe inkooporder moet als concept beginnen.';
    end if;
    insert into public.purchase_orders (
      store_id, external_id, supplier, status, source, ordered_at, received_at,
      expected_delivery_at, reference, note, owner_user_id, owner_name, created_at
    ) values (
      target_store_id, order_external_id, btrim(payload ->> 'supplier'), order_status,
      'inventory-forecast', nullif(payload ->> 'ordered_at', '')::timestamptz,
      nullif(payload ->> 'received_at', '')::timestamptz,
      nullif(payload ->> 'expected_delivery_at', '')::timestamptz,
      nullif(btrim(payload ->> 'reference'), ''), nullif(btrim(payload ->> 'note'), ''),
      actor_id, nullif(payload ->> 'owner_name', ''),
      coalesce(nullif(payload ->> 'created_at', '')::timestamptz, clock_timestamp())
    ) returning id into order_id;
  else
    if existing_status in ('received', 'cancelled') and order_status <> existing_status then
      raise exception using errcode = 'P0001', message = 'purchase:invalid-state:Deze inkooporder is afgesloten.';
    end if;
    if existing_status <> 'draft' and order_status = 'draft' then
      raise exception using errcode = 'P0001', message = 'purchase:invalid-state:Een bestelde inkooporder kan geen concept meer worden.';
    end if;
    update public.purchase_orders set
      supplier = btrim(payload ->> 'supplier'), status = order_status,
      ordered_at = nullif(payload ->> 'ordered_at', '')::timestamptz,
      received_at = nullif(payload ->> 'received_at', '')::timestamptz,
      expected_delivery_at = nullif(payload ->> 'expected_delivery_at', '')::timestamptz,
      reference = nullif(btrim(payload ->> 'reference'), ''),
      note = nullif(btrim(payload ->> 'note'), '')
    where id = order_id and store_id = target_store_id;
  end if;

  select coalesce(p.display_name, split_part(u.email, '@', 1), 'Gebruiker')
  into actor_name from auth.users u
  left join public.profiles p on p.id = u.id where u.id = actor_id;

  for item in select value from pg_catalog.jsonb_array_elements(payload -> 'items')
  loop
    select * into product_record from public.products
    where store_id = target_store_id
      and (external_id = item ->> 'product_id' or id::text = item ->> 'product_id')
    for update;
    if not found then
      raise exception using errcode = 'P0001', message = 'purchase:product-not-found:Een product bestaat niet meer.';
    end if;
    if product_record.id = any(seen_products) then
      raise exception using errcode = 'P0001', message = 'purchase:duplicate-product:Een product staat dubbel in de inkooporder.';
    end if;
    seen_products := array_append(seen_products, product_record.id);
    begin
      requested_ordered_qty := (item ->> 'ordered_qty')::integer;
      requested_received_qty := coalesce((item ->> 'received_qty')::integer, 0);
    exception when invalid_text_representation or numeric_value_out_of_range then
      raise exception using errcode = 'P0001', message = 'purchase:invalid-quantity:Ongeldige aantallen.';
    end;
    if requested_ordered_qty <= 0 or requested_received_qty < 0
       or requested_received_qty > requested_ordered_qty then
      raise exception using errcode = 'P0001', message = 'purchase:invalid-quantity:Ongeldige aantallen.';
    end if;

    select * into line_record from public.purchase_order_lines
    where store_id = target_store_id and purchase_order_id = order_id
      and product_id = product_record.id
    for update;
    if found then
      if existing_status <> 'draft' and requested_ordered_qty <> line_record.ordered_qty then
        raise exception using errcode = 'P0001', message = 'purchase:invalid-state:Bestelaantallen kunnen na bestellen niet meer wijzigen.';
      end if;
      if requested_received_qty < line_record.received_qty then
        raise exception using errcode = 'P0001', message = 'purchase:invalid-quantity:Ontvangen voorraad kan niet worden teruggedraaid.';
      end if;
      received_delta := requested_received_qty - line_record.received_qty;
      update public.purchase_order_lines set
        product_name = product_record.name, sku = product_record.sku,
        ordered_qty = requested_ordered_qty,
        received_qty = requested_received_qty,
        unit_cost_cents = nullif(item ->> 'unit_cost_cents', '')::bigint,
        forecast_snapshot = coalesce(item -> 'forecast_snapshot', '{}'::jsonb)
      where id = line_record.id;
    else
      if existing_status is not null and existing_status <> 'draft' then
        raise exception using errcode = 'P0001', message = 'purchase:invalid-state:Na bestellen kunnen geen producten worden toegevoegd.';
      end if;
      received_delta := requested_received_qty;
      insert into public.purchase_order_lines (
        store_id, purchase_order_id, product_id, product_external_id,
        product_name, sku, ordered_qty, received_qty, unit_cost_cents,
        forecast_snapshot
      ) values (
        target_store_id, order_id, product_record.id,
        coalesce(product_record.external_id, product_record.id::text),
        product_record.name, product_record.sku,
        requested_ordered_qty, requested_received_qty,
        nullif(item ->> 'unit_cost_cents', '')::bigint,
        coalesce(item -> 'forecast_snapshot', '{}'::jsonb)
      );
    end if;
    if received_delta > 0 then
      if product_record.stock_qty is null then
        raise exception using errcode = 'P0001', message = 'purchase:stock-not-tracked:Voorraad wordt voor dit product niet bijgehouden.';
      end if;
      update public.products set stock_qty = stock_qty + received_delta
      where id = product_record.id and store_id = target_store_id;
      insert into public.stock_movements (
        store_id, product_id, product_name, quantity_delta, reason,
        occurred_at, purchase_order_id, user_id, user_name, client_request_id
      ) values (
        target_store_id, product_record.id, product_record.name, received_delta,
        'purchase-receipt', clock_timestamp(), order_id, actor_id, actor_name,
        order_external_id || ':received:' || product_record.id || ':' || requested_received_qty
      );
    end if;
  end loop;

  if existing_status = 'draft' then
    delete from public.purchase_order_lines
    where store_id = target_store_id and purchase_order_id = order_id
      and not (product_id = any(seen_products));
  end if;
  insert into public.audit_entries (
    store_id, user_id, user_name, action, detail, source
  ) values (
    target_store_id, actor_id, actor_name,
    case when existing_status is null then 'purchase_order.create'
         when order_status = 'cancelled' then 'purchase_order.cancel'
         when order_status in ('partially-received', 'received') then 'purchase_order.receive'
         else 'purchase_order.update' end,
    pg_catalog.jsonb_build_object(
      'orderId', order_external_id, 'supplier', payload ->> 'supplier',
      'status', order_status
    ), 'app'
  );
  return order_id;
end;
$$;

revoke all on function public.save_purchase_order(uuid, jsonb) from public, anon;
grant execute on function public.save_purchase_order(uuid, jsonb) to authenticated;
