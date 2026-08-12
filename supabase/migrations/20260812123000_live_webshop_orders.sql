begin;

create or replace function private.webshop_order_payload(target_order_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'order', to_jsonb(webshop_order),
    'lines', coalesce(
      (
        select jsonb_agg(to_jsonb(order_line) order by order_line.created_at, order_line.id)
        from public.webshop_order_lines as order_line
        where order_line.webshop_order_id = webshop_order.id
      ),
      '[]'::jsonb
    )
  )
  from public.webshop_orders as webshop_order
  where webshop_order.id = target_order_id;
$$;

create or replace function public.place_public_webshop_order(
  store_identifier text,
  payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_store_id uuid;
  shop_settings jsonb;
  existing_order_id uuid;
  created_order_id uuid := gen_random_uuid();
  created_order_number text;
  order_line jsonb;
  normalized_lines jsonb := '[]'::jsonb;
  product_row public.products%rowtype;
  requested_product_id text;
  requested_quantity integer;
  expected_unit_price bigint;
  calculated_subtotal bigint := 0;
  calculated_discount bigint := 0;
  calculated_shipping bigint := 0;
  calculated_total bigint := 0;
  markup_percent numeric := 0;
  coupon jsonb;
  coupon_code text := nullif(upper(btrim(payload ->> 'couponCode')), '');
  minimum_order bigint := 0;
  delivery_mode_value text := payload ->> 'deliveryMode';
  payment_method_value text := payload ->> 'paymentMethod';
  payment_setting_key text;
  paid_online boolean;
  line_index integer := 0;
begin
  if jsonb_typeof(payload) <> 'object' then
    raise exception 'Ongeldige bestelling.' using errcode = '22023';
  end if;

  select settings.store_id, settings.settings
    into target_store_id, shop_settings
  from public.webshop_settings as settings
  where settings.is_enabled
    and (
      lower(settings.store_id::text) = lower(btrim(store_identifier))
      or lower(coalesce(settings.subdomain, '')) = lower(btrim(store_identifier))
      or lower(coalesce(settings.custom_domain, '')) = lower(regexp_replace(btrim(store_identifier), '^https?://', '', 'i'))
      or lower(regexp_replace(coalesce(settings.custom_domain, ''), '^www\.', '', 'i')) = lower(regexp_replace(btrim(store_identifier), '^(https?://)?www\.', '', 'i'))
    )
  limit 1;

  if target_store_id is null and auth.uid() is not null then
    select membership.store_id, settings.settings
      into target_store_id, shop_settings
    from public.store_memberships as membership
    join public.webshop_settings as settings on settings.store_id = membership.store_id
    where membership.user_id = auth.uid()
      and membership.status = 'active'
      and settings.is_enabled
    limit 1;
  end if;

  if target_store_id is null then
    raise exception 'Deze webshop is niet beschikbaar.' using errcode = 'P0001';
  end if;

  if nullif(btrim(payload ->> 'clientRequestId'), '') is null then
    raise exception 'De bestelling mist een uniek verzoeknummer.' using errcode = '22023';
  end if;

  select webshop_order.id into existing_order_id
  from public.webshop_orders as webshop_order
  where webshop_order.store_id = target_store_id
    and webshop_order.client_request_id = payload ->> 'clientRequestId';

  if existing_order_id is not null then
    return private.webshop_order_payload(existing_order_id) || jsonb_build_object('duplicate', true);
  end if;

  if jsonb_typeof(payload -> 'lines') <> 'array'
    or jsonb_array_length(payload -> 'lines') < 1
    or jsonb_array_length(payload -> 'lines') > 100 then
    raise exception 'De winkelmand is leeg of te groot.' using errcode = '22023';
  end if;

  if nullif(btrim(payload #>> '{customer,email}'), '') is null
    or nullif(btrim(payload #>> '{customer,firstName}'), '') is null
    or nullif(btrim(payload #>> '{customer,lastName}'), '') is null then
    raise exception 'De klantgegevens zijn onvolledig.' using errcode = '22023';
  end if;

  markup_percent := greatest(0, coalesce((shop_settings ->> 'webshopMarkupPercent')::numeric, 0));

  for order_line in select value from jsonb_array_elements(payload -> 'lines') loop
    line_index := line_index + 1;
    requested_product_id := nullif(btrim(order_line ->> 'productId'), '');
    requested_quantity := coalesce((order_line ->> 'quantity')::integer, 0);
    if requested_product_id is null or requested_quantity <= 0 then
      raise exception 'Ongeldige bestellijn.' using errcode = '22023';
    end if;

    select product.* into product_row
    from public.products as product
    where product.store_id = target_store_id
      and (product.id::text = requested_product_id or product.external_id = requested_product_id)
      and product.is_active
    for update;

    if product_row.id is null then
      raise exception 'Een product in uw winkelmand is niet meer beschikbaar.' using errcode = 'P0001';
    end if;
    if coalesce(shop_settings -> 'unpublishedProductIds', '[]'::jsonb)
      @> jsonb_build_array(coalesce(product_row.external_id, product_row.id::text)) then
      raise exception 'Een product in uw winkelmand is niet meer beschikbaar.' using errcode = 'P0001';
    end if;
    if product_row.stock_qty is not null and product_row.stock_qty < requested_quantity then
      raise exception '% heeft onvoldoende voorraad.', product_row.name using errcode = 'P0001';
    end if;

    expected_unit_price := round(product_row.price_cents * (1 + markup_percent / 100));
    if coalesce((order_line ->> 'unitPriceCents')::bigint, -1) <> expected_unit_price then
      raise exception 'De prijs van % is gewijzigd. Vernieuw de webshop en probeer opnieuw.', product_row.name using errcode = 'P0001';
    end if;

    calculated_subtotal := calculated_subtotal + expected_unit_price * requested_quantity;
    normalized_lines := normalized_lines || jsonb_build_array(jsonb_build_object(
      'productId', product_row.id,
      'productExternalId', coalesce(product_row.external_id, product_row.id::text),
      'productName', product_row.name,
      'variant', product_row.variant,
      'sku', product_row.sku,
      'quantity', requested_quantity,
      'unitPriceCents', expected_unit_price,
      'lineTotalCents', expected_unit_price * requested_quantity
    ));

    if product_row.stock_qty is not null then
      update public.products
      set stock_qty = stock_qty - requested_quantity
      where id = product_row.id;
    end if;

    insert into public.stock_movements (
      store_id, product_id, product_name, quantity_delta, reason,
      occurred_at, user_name, client_request_id, is_demo
    ) values (
      target_store_id, product_row.id, product_row.name, -requested_quantity,
      'webshop-reservation', now(), 'Webshop',
      (payload ->> 'clientRequestId') || ':' || line_index::text, false
    );
  end loop;

  if calculated_subtotal <> coalesce((payload ->> 'subtotalCents')::bigint, -1) then
    raise exception 'Het subtotaal kon niet worden gevalideerd.' using errcode = '22023';
  end if;

  if coupon_code is not null then
    select value into coupon
    from jsonb_array_elements(coalesce(shop_settings -> 'coupons', '[]'::jsonb))
    where upper(value ->> 'code') = coupon_code
      and coalesce((value ->> 'active')::boolean, false)
    limit 1;
    if coupon is null then
      raise exception 'De kortingscode is niet geldig.' using errcode = 'P0001';
    end if;
    minimum_order := coalesce((coupon ->> 'minOrderCents')::bigint, 0);
    if calculated_subtotal < minimum_order then
      raise exception 'Het bestelbedrag is te laag voor deze kortingscode.' using errcode = 'P0001';
    end if;
    if coupon ->> 'discountType' = 'percent' then
      calculated_discount := least(
        calculated_subtotal,
        round(calculated_subtotal * least(100, greatest(0, (coupon ->> 'value')::numeric)) / 100)
      );
    elsif coupon ->> 'discountType' = 'fixed' then
      calculated_discount := least(calculated_subtotal, greatest(0, (coupon ->> 'value')::bigint));
    else
      raise exception 'De kortingscode heeft een ongeldig type.' using errcode = '22023';
    end if;
  end if;

  if delivery_mode_value = 'pickup' then
    if not coalesce((shop_settings ->> 'pickupEnabled')::boolean, false) then
      raise exception 'Afhalen is niet beschikbaar.' using errcode = 'P0001';
    end if;
    calculated_shipping := 0;
  elsif delivery_mode_value = 'shipping' then
    calculated_shipping := case
      when calculated_subtotal >= coalesce((shop_settings ->> 'freeShippingThresholdCents')::bigint, 0) then 0
      else coalesce((shop_settings ->> 'shippingFeeCents')::bigint, 0)
    end;
  else
    raise exception 'Ongeldige leveringsmethode.' using errcode = '22023';
  end if;

  calculated_total := greatest(0, calculated_subtotal - calculated_discount + calculated_shipping);
  if calculated_discount <> coalesce((payload ->> 'discountCents')::bigint, -1)
    or calculated_shipping <> coalesce((payload ->> 'shippingCents')::bigint, -1)
    or calculated_total <> coalesce((payload ->> 'totalCents')::bigint, -1) then
    raise exception 'Het bestelbedrag kon niet worden gevalideerd.' using errcode = '22023';
  end if;

  payment_setting_key := case payment_method_value
    when 'pickup' then 'payOnPickup'
    when 'bancontact' then 'bancontact'
    when 'ideal' then 'ideal'
    when 'creditcard' then 'creditcard'
    when 'applepay' then 'applepay'
    when 'klarna' then 'klarna'
    else null
  end;
  if payment_setting_key is null
    or not coalesce((shop_settings #>> array['paymentMethods', payment_setting_key])::boolean, false) then
    raise exception 'Deze betaalmethode is niet beschikbaar.' using errcode = 'P0001';
  end if;

  paid_online := payment_method_value <> 'pickup';
  created_order_number := 'WEB-' || to_char(current_date, 'YYYYMMDD') || '-' || upper(substr(replace(created_order_id::text, '-', ''), 1, 6));

  insert into public.webshop_orders (
    id, store_id, client_request_id, order_number, source, status,
    payment_status, fulfillment_status, inventory_status, payment_method,
    payment_reference, delivery_mode, customer_snapshot, shipping_address,
    pickup_address, note, coupon_code, subtotal_cents, discount_cents,
    shipping_cents, total_cents, confirmation_email
  ) values (
    created_order_id,
    target_store_id,
    payload ->> 'clientRequestId',
    created_order_number,
    'live',
    case when coalesce((payload ->> 'autoConfirm')::boolean, false) then 'confirmed' else 'pending' end,
    case when paid_online then 'paid' else 'pending' end,
    'unfulfilled',
    'reserved',
    payment_method_value,
    case when paid_online then 'pay-' || created_order_id::text else 'pickup-' || created_order_id::text end,
    delivery_mode_value,
    payload -> 'customer',
    case when delivery_mode_value = 'shipping' then payload -> 'shippingAddress' else null end,
    case when delivery_mode_value = 'pickup' then nullif(btrim(payload ->> 'pickupAddress'), '') else null end,
    nullif(btrim(payload ->> 'note'), ''),
    coupon_code,
    calculated_subtotal,
    calculated_discount,
    calculated_shipping,
    calculated_total,
    jsonb_build_object(
      'to', lower(btrim(payload #>> '{customer,email}')),
      'status', 'queued',
      'subject', 'Bevestiging ' || created_order_number || ' · ' || coalesce(nullif(btrim(payload ->> 'shopName'), ''), 'Webshop')
    )
  );

  for order_line in select value from jsonb_array_elements(normalized_lines) loop
    insert into public.webshop_order_lines (
      store_id, webshop_order_id, product_id, product_external_id,
      product_name, variant, sku, quantity, unit_price_cents, line_total_cents
    ) values (
      target_store_id,
      created_order_id,
      (order_line ->> 'productId')::uuid,
      order_line ->> 'productExternalId',
      order_line ->> 'productName',
      order_line ->> 'variant',
      order_line ->> 'sku',
      (order_line ->> 'quantity')::integer,
      (order_line ->> 'unitPriceCents')::bigint,
      (order_line ->> 'lineTotalCents')::bigint
    );
  end loop;

  insert into public.audit_entries (store_id, user_name, action, detail, source, is_demo)
  values (
    target_store_id,
    'Webshop',
    'webshop_order.create',
    jsonb_build_object('orderId', created_order_id, 'number', created_order_number, 'totalCents', calculated_total),
    'webshop',
    false
  );

  return private.webshop_order_payload(created_order_id) || jsonb_build_object('duplicate', false);
end;
$$;

create or replace function public.update_webshop_order(
  target_store_id uuid,
  target_order_id uuid,
  payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_order public.webshop_orders%rowtype;
  next_status text;
  next_payment_status text;
  next_fulfillment_status text;
  next_inventory_status text;
  order_line record;
begin
  if not private.has_store_role(target_store_id, array['owner', 'manager']) then
    raise exception 'U hebt geen toegang tot deze bestelling.' using errcode = '42501';
  end if;

  select * into current_order
  from public.webshop_orders
  where id = target_order_id and store_id = target_store_id
  for update;
  if current_order.id is null then
    raise exception 'De webshopbestelling bestaat niet meer.' using errcode = 'P0002';
  end if;

  next_status := coalesce(nullif(payload ->> 'status', ''), current_order.status);
  next_payment_status := coalesce(nullif(payload ->> 'paymentStatus', ''), current_order.payment_status);
  next_fulfillment_status := coalesce(nullif(payload ->> 'fulfillmentStatus', ''), current_order.fulfillment_status);
  next_inventory_status := current_order.inventory_status;

  if next_status not in ('pending', 'confirmed', 'completed', 'cancelled')
    or next_payment_status not in ('pending', 'paid', 'failed', 'refunded')
    or next_fulfillment_status not in ('unfulfilled', 'processing', 'ready-for-pickup', 'shipped', 'picked-up') then
    raise exception 'Ongeldige orderstatus.' using errcode = '22023';
  end if;
  if current_order.status = 'cancelled' and next_status <> 'cancelled' then
    raise exception 'Een geannuleerde bestelling kan niet opnieuw worden geopend.' using errcode = 'P0001';
  end if;
  if current_order.status = 'completed' and next_status = 'cancelled' then
    raise exception 'Een afgeronde bestelling kan niet worden geannuleerd.' using errcode = 'P0001';
  end if;

  if next_status = 'cancelled' and current_order.inventory_status = 'reserved' then
    for order_line in
      select line.product_id, line.product_name, sum(line.quantity)::integer as quantity
      from public.webshop_order_lines as line
      where line.store_id = target_store_id
        and line.webshop_order_id = target_order_id
        and line.product_id is not null
      group by line.product_id, line.product_name
    loop
      update public.products
      set stock_qty = case when stock_qty is null then null else stock_qty + order_line.quantity end
      where id = order_line.product_id and store_id = target_store_id;
      insert into public.stock_movements (
        store_id, product_id, product_name, quantity_delta, reason,
        occurred_at, user_id, user_name, client_request_id, is_demo
      ) values (
        target_store_id, order_line.product_id, order_line.product_name,
        order_line.quantity, 'webshop-release', now(), auth.uid(),
        'Dashboard', target_order_id::text || ':release:' || order_line.product_id::text, false
      ) on conflict (store_id, client_request_id) where client_request_id is not null do nothing;
    end loop;
    next_inventory_status := 'released';
    if current_order.payment_status = 'paid' then
      next_payment_status := 'refunded';
    end if;
  end if;

  if next_fulfillment_status in ('shipped', 'picked-up') then
    next_inventory_status := 'committed';
    next_status := 'completed';
  end if;

  update public.webshop_orders
  set status = next_status,
      payment_status = next_payment_status,
      fulfillment_status = next_fulfillment_status,
      inventory_status = next_inventory_status
  where id = target_order_id and store_id = target_store_id;

  insert into public.audit_entries (store_id, user_id, user_name, action, detail, source, is_demo)
  values (
    target_store_id,
    auth.uid(),
    'Dashboard',
    case when next_status = 'cancelled' then 'webshop_order.cancel' else 'webshop_order.update' end,
    jsonb_build_object('orderId', target_order_id, 'update', payload),
    'app',
    false
  );

  return private.webshop_order_payload(target_order_id);
end;
$$;

revoke all on function public.place_public_webshop_order(text, jsonb) from public;
grant execute on function public.place_public_webshop_order(text, jsonb) to anon, authenticated;
revoke all on function public.update_webshop_order(uuid, uuid, jsonb) from public;
grant execute on function public.update_webshop_order(uuid, uuid, jsonb) to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.webshop_orders;
exception
  when duplicate_object then null;
end;
$$;

commit;
