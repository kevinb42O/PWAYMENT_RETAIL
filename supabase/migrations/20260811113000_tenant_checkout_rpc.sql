-- Atomic, tenant-scoped POS checkout.
-- The browser supplies intent; trusted prices, VAT, stock, gift-card balances,
-- membership and the final document number are resolved inside PostgreSQL.

create table private.store_counters (
  store_id uuid not null references public.stores(id) on delete cascade,
  counter_name text not null,
  value bigint not null default 0 check (value >= 0),
  primary key (store_id, counter_name)
);

create or replace function public.checkout_sale(
  target_store_id uuid,
  payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  actor_name text;
  request_id text := nullif(btrim(payload ->> 'client_request_id'), '');
  existing_transaction_id uuid;
  transaction_id uuid;
  target_register_id uuid;
  shift_id uuid;
  shift_number bigint;
  document_sequence bigint;
  document_number text;
  checkout_at timestamptz := clock_timestamp();
  cart_id integer;
  requested_discount bigint;
  discount_cents bigint;
  subtotal_12 bigint := 0;
  subtotal_21 bigint := 0;
  subtotal_cents bigint;
  discount_12 bigint := 0;
  discount_21 bigint := 0;
  discounted_12 bigint;
  discounted_21 bigint;
  vat_12_cents bigint;
  vat_21_cents bigint;
  total_cents bigint;
  gift_card_total bigint := 0;
  remaining_cents bigint;
  tendered_cents bigint;
  requested_method text;
  payment_method text;
  customer_id uuid;
  discount_approver_id uuid;
  item jsonb;
  modifier jsonb;
  allocation jsonb;
  canonical_lines jsonb := '[]'::jsonb;
  canonical_cards jsonb := '[]'::jsonb;
  line_record record;
  product_record public.products%rowtype;
  card_record public.gift_cards%rowtype;
  item_external_id text;
  line_external_id text;
  quantity integer;
  modifier_total bigint;
  modifier_delta bigint;
  unit_price_cents bigint;
  line_total_cents bigint;
  allocation_external_id text;
  allocation_amount bigint;
  allocation_code text;
  balance_after bigint;
  tender_count integer := 0;
begin
  if actor_id is null then
    raise exception using errcode = 'P0001', message = 'checkout:not-authenticated:Log opnieuw in.';
  end if;
  if not private.has_store_role(target_store_id, array['owner', 'manager', 'cashier']) then
    raise exception using errcode = '42501', message = 'checkout:forbidden:Geen toegang tot deze winkel.';
  end if;
  if request_id is null or length(request_id) > 200 then
    raise exception using errcode = 'P0001', message = 'checkout:invalid-request:Ongeldige idempotentiesleutel.';
  end if;

  -- Serialize checkout numbering/shift creation per tenant.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(target_store_id::text || ':checkout', 0)
  );

  select id into existing_transaction_id
  from public.transactions
  where store_id = target_store_id and client_request_id = request_id;
  if existing_transaction_id is not null then
    return pg_catalog.jsonb_build_object(
      'transaction_id', existing_transaction_id,
      'duplicate', true
    );
  end if;

  if pg_catalog.jsonb_typeof(payload -> 'items') is distinct from 'array'
     or pg_catalog.jsonb_array_length(payload -> 'items') = 0 then
    raise exception using errcode = 'P0001', message = 'checkout:empty-cart:Winkelwagen is leeg.';
  end if;
  if pg_catalog.jsonb_array_length(payload -> 'items') > 500 then
    raise exception using errcode = 'P0001', message = 'checkout:invalid-request:Te veel orderregels.';
  end if;

  begin
    cart_id := coalesce((payload ->> 'cart_id')::integer, 1);
    requested_discount := coalesce((payload ->> 'discount_cents')::bigint, 0);
    tendered_cents := nullif(payload ->> 'tendered_cents', '')::bigint;
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception using errcode = 'P0001', message = 'checkout:invalid-request:Ongeldige numerieke invoer.';
  end;
  if cart_id < 1 or requested_discount < 0 or tendered_cents < 0 then
    raise exception using errcode = 'P0001', message = 'checkout:invalid-tender:Ongeldig bedrag.';
  end if;

  requested_method := payload ->> 'method';
  if requested_method not in ('Cash', 'PIN', 'Cadeaubon') then
    raise exception using errcode = 'P0001', message = 'checkout:invalid-tender:Ongeldige betaalwijze.';
  end if;

  select coalesce(p.display_name, split_part(u.email, '@', 1), 'Gebruiker')
  into actor_name
  from auth.users u
  left join public.profiles p on p.id = u.id
  where u.id = actor_id;

  if coalesce(payload ->> 'discount_approved_by_user_id', '') ~
     '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' then
    discount_approver_id := (payload ->> 'discount_approved_by_user_id')::uuid;
    if not exists (
      select 1 from public.store_memberships
      where store_id = target_store_id
        and user_id = discount_approver_id
        and role in ('owner', 'manager')
        and status = 'active'
    ) then
      raise exception using errcode = '42501', message = 'checkout:forbidden:De korting is niet door een manager goedgekeurd.';
    end if;
  end if;

  -- Lock and debit stock while deriving totals from trusted catalog rows.
  for item in select value from pg_catalog.jsonb_array_elements(payload -> 'items')
  loop
    item_external_id := nullif(btrim(item #>> '{product,id}'), '');
    line_external_id := coalesce(nullif(btrim(item ->> 'line_id'), ''), gen_random_uuid()::text);
    begin
      quantity := (item ->> 'quantity')::integer;
    exception when invalid_text_representation or numeric_value_out_of_range then
      raise exception using errcode = 'P0001', message = 'checkout:invalid-request:Ongeldige hoeveelheid.';
    end;
    if item_external_id is null or quantity is null or quantity <= 0 or quantity > 100000 then
      raise exception using errcode = 'P0001', message = 'checkout:invalid-request:Ongeldige orderregel.';
    end if;

    select * into product_record
    from public.products
    where store_id = target_store_id
      and (external_id = item_external_id or id::text = item_external_id)
    for update;
    if not found or not product_record.is_active then
      raise exception using errcode = 'P0001', message = 'checkout:product-not-found:Een product bestaat niet meer of is niet actief.';
    end if;
    if product_record.product_type = 'gift-card' then
      raise exception using errcode = 'P0001', message = 'checkout:gift-card-product:Cadeaubonnen moeten via Klanten worden uitgegeven.';
    end if;
    if product_record.vat_rate not in (12, 21) then
      raise exception using errcode = 'P0001', message = 'checkout:unsupported-vat:Enkel 12% en 21% BTW zijn toegelaten.';
    end if;

    modifier_total := 0;
    if item ? 'modifiers' and pg_catalog.jsonb_typeof(item -> 'modifiers') is distinct from 'array' then
      raise exception using errcode = 'P0001', message = 'checkout:invalid-request:Ongeldige productopties.';
    end if;
    for modifier in
      select value from pg_catalog.jsonb_array_elements(coalesce(item -> 'modifiers', '[]'::jsonb))
    loop
      begin
        modifier_delta := coalesce((modifier ->> 'deltaCents')::bigint, 0);
      exception when invalid_text_representation or numeric_value_out_of_range then
        raise exception using errcode = 'P0001', message = 'checkout:invalid-request:Ongeldige productoptie.';
      end;
      if modifier_delta < 0 or modifier_delta > 10000000 then
        raise exception using errcode = 'P0001', message = 'checkout:invalid-request:Ongeldige productoptieprijs.';
      end if;
      modifier_total := modifier_total + modifier_delta;
    end loop;

    unit_price_cents := product_record.price_cents + modifier_total;
    line_total_cents := unit_price_cents * quantity;
    if product_record.vat_rate = 12 then
      subtotal_12 := subtotal_12 + line_total_cents;
    else
      subtotal_21 := subtotal_21 + line_total_cents;
    end if;

    if product_record.stock_qty is not null then
      if product_record.stock_qty < quantity then
        raise exception using errcode = 'P0001', message =
          'checkout:insufficient-stock:Onvoldoende voorraad voor ' || product_record.name || '.';
      end if;
      update public.products
      set stock_qty = stock_qty - quantity
      where id = product_record.id and store_id = target_store_id;
    end if;

    canonical_lines := canonical_lines || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'line_external_id', line_external_id,
        'product_id', product_record.id,
        'product_external_id', coalesce(product_record.external_id, product_record.id::text),
        'product_name', product_record.name,
        'sku', product_record.sku,
        'barcode', product_record.barcode,
        'quantity', quantity,
        'unit_price_cents', unit_price_cents,
        'unit_cost_cents', product_record.cost_price_cents,
        'vat_rate', product_record.vat_rate,
        'line_total_cents', line_total_cents,
        'notes', nullif(item ->> 'notes', ''),
        'modifiers', coalesce(item -> 'modifiers', '[]'::jsonb),
        'product_snapshot', pg_catalog.jsonb_build_object(
          'name', product_record.name,
          'category', product_record.category_name,
          'priceCents', product_record.price_cents,
          'vatRate', product_record.vat_rate,
          'brand', product_record.brand,
          'variant', product_record.variant
        )
      )
    );
  end loop;

  subtotal_cents := subtotal_12 + subtotal_21;
  discount_cents := least(requested_discount, subtotal_cents);
  if subtotal_cents > 0 and discount_cents > 0 then
    discount_12 := (discount_cents * subtotal_12) / subtotal_cents;
    discount_21 := (discount_cents * subtotal_21) / subtotal_cents;
    if discount_12 + discount_21 < discount_cents then
      if (discount_cents * subtotal_12) % subtotal_cents >=
         (discount_cents * subtotal_21) % subtotal_cents then
        discount_12 := discount_12 + 1;
      else
        discount_21 := discount_21 + 1;
      end if;
    end if;
  end if;
  discounted_12 := subtotal_12 - discount_12;
  discounted_21 := subtotal_21 - discount_21;
  vat_12_cents := discounted_12 - round(discounted_12::numeric / 1.12)::bigint;
  vat_21_cents := discounted_21 - round(discounted_21::numeric / 1.21)::bigint;
  total_cents := discounted_12 + discounted_21;

  if payload ? 'gift_cards' and pg_catalog.jsonb_typeof(payload -> 'gift_cards') is distinct from 'array' then
    raise exception using errcode = 'P0001', message = 'checkout:invalid-request:Ongeldige cadeaubonnen.';
  end if;
  for allocation in
    select value from pg_catalog.jsonb_array_elements(coalesce(payload -> 'gift_cards', '[]'::jsonb))
  loop
    allocation_external_id := nullif(btrim(allocation ->> 'id'), '');
    allocation_code := nullif(btrim(allocation ->> 'code'), '');
    begin
      allocation_amount := (allocation ->> 'amount_cents')::bigint;
    exception when invalid_text_representation or numeric_value_out_of_range then
      raise exception using errcode = 'P0001', message = 'checkout:gift-card-invalid-amount:Ongeldig cadeaubonbedrag.';
    end;
    if allocation_external_id is null or allocation_amount is null or allocation_amount <= 0 then
      raise exception using errcode = 'P0001', message = 'checkout:gift-card-invalid-amount:Ongeldig cadeaubonbedrag.';
    end if;
    if exists (
      select 1 from pg_catalog.jsonb_array_elements(canonical_cards) c
      where c ->> 'external_id' = allocation_external_id
    ) then
      raise exception using errcode = 'P0001', message = 'checkout:gift-card-invalid-amount:Een cadeaubon kan maar eenmaal worden toegepast.';
    end if;

    select * into card_record
    from public.gift_cards
    where store_id = target_store_id
      and (external_id = allocation_external_id or id::text = allocation_external_id)
    for update;
    if not found then
      raise exception using errcode = 'P0001', message = 'checkout:gift-card-not-found:Cadeaubon bestaat niet.';
    end if;
    if allocation_code is not null and allocation_code <> card_record.code then
      raise exception using errcode = 'P0001', message = 'checkout:gift-card-not-found:Cadeauboncode komt niet overeen.';
    end if;
    if not card_record.is_active then
      raise exception using errcode = 'P0001', message = 'checkout:gift-card-inactive:Cadeaubon is geblokkeerd.';
    end if;
    if card_record.expires_at is not null and card_record.expires_at < checkout_at then
      raise exception using errcode = 'P0001', message = 'checkout:gift-card-expired:Cadeaubon is verlopen.';
    end if;
    if allocation_amount > card_record.balance_cents then
      raise exception using errcode = 'P0001', message = 'checkout:gift-card-insufficient-balance:Cadeaubon heeft onvoldoende saldo.';
    end if;
    balance_after := card_record.balance_cents - allocation_amount;
    update public.gift_cards
    set balance_cents = balance_after
    where id = card_record.id and store_id = target_store_id;
    gift_card_total := gift_card_total + allocation_amount;
    canonical_cards := canonical_cards || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'id', card_record.id,
        'external_id', coalesce(card_record.external_id, card_record.id::text),
        'code', card_record.code,
        'amount_cents', allocation_amount,
        'balance_before_cents', card_record.balance_cents,
        'balance_after_cents', balance_after,
        'customer_id', card_record.customer_id
      )
    );
  end loop;

  if gift_card_total > total_cents then
    raise exception using errcode = 'P0001', message = 'checkout:gift-card-exceeds-total:Cadeaubonnen overschrijden het totaalbedrag.';
  end if;
  remaining_cents := total_cents - gift_card_total;
  if requested_method = 'Cadeaubon' and remaining_cents <> 0 then
    raise exception using errcode = 'P0001', message = 'checkout:invalid-tender:Kies Cash of PIN voor het resterende bedrag.';
  end if;
  if requested_method = 'Cash' and tendered_cents is not null and tendered_cents < remaining_cents then
    raise exception using errcode = 'P0001', message = 'checkout:invalid-tender:Ontvangen bedrag is te laag.';
  end if;
  if gift_card_total > 0 then tender_count := tender_count + 1; end if;
  if remaining_cents > 0 then tender_count := tender_count + 1; end if;
  if tender_count = 0 then
    -- A zero-total checkout still gets one canonical tender row impossible due
    -- to the positive tender constraint, so reject it explicitly.
    raise exception using errcode = 'P0001', message = 'checkout:invalid-tender:Het totaalbedrag moet groter zijn dan nul.';
  end if;
  payment_method := case
    when gift_card_total > 0 and remaining_cents > 0 then 'Split'
    when gift_card_total > 0 then 'Cadeaubon'
    else requested_method
  end;

  if nullif(payload ->> 'customer_id', '') is not null then
    select id into customer_id
    from public.customers
    where store_id = target_store_id
      and (external_id = payload ->> 'customer_id' or id::text = payload ->> 'customer_id')
      and is_active
    for update;
    if customer_id is null then
      raise exception using errcode = 'P0001', message = 'checkout:customer-not-found:Klant bestaat niet meer.';
    end if;
  end if;

  insert into public.registers (store_id, external_id, name, is_active)
  values (target_store_id, 'retail-register-1', 'Kassa 1', true)
  on conflict (store_id, external_id) do update set is_active = true
  returning id into target_register_id;

  select id into shift_id
  from public.register_shifts
  where store_id = target_store_id
    and register_id = target_register_id
    and status = 'open'
  order by opened_at desc limit 1
  for update;
  if shift_id is null then
    select coalesce(max(rs.shift_number), 0) + 1 into shift_number
    from public.register_shifts rs
    where rs.store_id = target_store_id and rs.register_id = target_register_id;
    insert into public.register_shifts (
      store_id, register_id, shift_number, opened_at, opened_by_user_id,
      opened_by_user_name, opening_float_cents, status
    ) values (
      target_store_id, target_register_id, shift_number, checkout_at, actor_id,
      actor_name, 0, 'open'
    ) returning id into shift_id;
  end if;

  insert into private.store_counters (store_id, counter_name, value)
  values (
    target_store_id,
    'pos-' || extract(year from checkout_at)::integer,
    (select count(*) + 1 from public.transactions counted_transaction
      where counted_transaction.store_id = target_store_id
        and extract(year from counted_transaction.occurred_at) = extract(year from checkout_at))
  )
  on conflict (store_id, counter_name)
  do update set value = private.store_counters.value + 1
  returning value into document_sequence;
  document_number := 'POS-' || extract(year from checkout_at)::integer || '-' ||
    lpad(document_sequence::text, 8, '0');

  insert into public.transactions (
    store_id, external_id, client_request_id, document_number, table_id,
    subtotal_cents, vat_12_cents, vat_21_cents, total_cents,
    discount_cents, discount_reason, discount_approved_by_user_id,
    tendered_cents, payment_method, occurred_at, is_finalized,
    user_id, user_name, customer_id, source, kind, merchant_snapshot,
    register_id, shift_id
  ) values (
    target_store_id, request_id, request_id, document_number, cart_id,
    subtotal_cents, vat_12_cents, vat_21_cents, total_cents,
    discount_cents, nullif(payload ->> 'discount_reason', ''), discount_approver_id,
    tendered_cents, payment_method, checkout_at, false,
    actor_id, actor_name, customer_id, 'live', 'sale',
    coalesce(payload -> 'merchant_snapshot', '{}'::jsonb), target_register_id, shift_id
  ) returning id into transaction_id;

  for line_record in select * from pg_catalog.jsonb_array_elements(canonical_lines) as row(value)
  loop
    insert into public.transaction_lines (
      store_id, transaction_id, line_external_id, product_id,
      product_external_id, product_name, sku, barcode, quantity,
      unit_price_cents, unit_cost_cents, vat_rate, line_total_cents,
      notes, modifiers, product_snapshot
    ) values (
      target_store_id, transaction_id, line_record.value ->> 'line_external_id',
      (line_record.value ->> 'product_id')::uuid,
      line_record.value ->> 'product_external_id', line_record.value ->> 'product_name',
      line_record.value ->> 'sku', line_record.value ->> 'barcode',
      (line_record.value ->> 'quantity')::integer,
      (line_record.value ->> 'unit_price_cents')::bigint,
      nullif(line_record.value ->> 'unit_cost_cents', '')::bigint,
      (line_record.value ->> 'vat_rate')::numeric,
      (line_record.value ->> 'line_total_cents')::bigint,
      line_record.value ->> 'notes', line_record.value -> 'modifiers',
      line_record.value -> 'product_snapshot'
    );
    if exists (
      select 1 from public.products p
      where p.id = (line_record.value ->> 'product_id')::uuid
        and p.store_id = target_store_id and p.stock_qty is not null
    ) then
      insert into public.stock_movements (
        store_id, product_id, product_name, quantity_delta, reason,
        occurred_at, transaction_id, user_id, user_name, client_request_id
      ) values (
        target_store_id, (line_record.value ->> 'product_id')::uuid,
        line_record.value ->> 'product_name',
        -((line_record.value ->> 'quantity')::integer), 'pos-sale',
        checkout_at, transaction_id, actor_id, actor_name,
        request_id || ':stock:' || (line_record.value ->> 'line_external_id')
      );
    end if;
  end loop;

  for line_record in select * from pg_catalog.jsonb_array_elements(canonical_cards) as row(value)
  loop
    insert into public.gift_card_events (
      store_id, external_id, gift_card_id, gift_card_code, event_type,
      amount_cents, balance_before_cents, balance_after_cents, occurred_at,
      transaction_id, client_request_id, customer_id, user_id, user_name, source
    ) values (
      target_store_id, request_id || ':gift-card:' || (line_record.value ->> 'external_id'),
      (line_record.value ->> 'id')::uuid, line_record.value ->> 'code', 'redeem',
      (line_record.value ->> 'amount_cents')::bigint,
      (line_record.value ->> 'balance_before_cents')::bigint,
      (line_record.value ->> 'balance_after_cents')::bigint, checkout_at,
      transaction_id, request_id,
      nullif(line_record.value ->> 'customer_id', '')::uuid,
      actor_id, actor_name, 'live'
    );
    insert into public.transaction_tenders (store_id, transaction_id, method, amount_cents)
    values (
      target_store_id, transaction_id, 'Cadeaubon',
      (line_record.value ->> 'amount_cents')::bigint
    );
  end loop;
  if remaining_cents > 0 then
    insert into public.transaction_tenders (store_id, transaction_id, method, amount_cents)
    values (target_store_id, transaction_id, requested_method, remaining_cents);
  end if;

  if customer_id is not null then
    update public.customers
    set total_spent_cents = total_spent_cents + total_cents,
        visit_count = visit_count + 1,
        last_visit_at = checkout_at
    where id = customer_id and store_id = target_store_id;
  end if;

  insert into public.audit_entries (
    store_id, occurred_at, user_id, user_name, action, detail, source
  ) values (
    target_store_id, checkout_at, actor_id, actor_name, 'checkout',
    pg_catalog.jsonb_build_object(
      'transactionId', transaction_id,
      'clientRequestId', request_id,
      'documentNumber', document_number,
      'totalCents', total_cents,
      'discountCents', discount_cents,
      'method', payment_method,
      'giftCardCents', gift_card_total
    ), 'app'
  );

  return pg_catalog.jsonb_build_object(
    'transaction_id', transaction_id,
    'document_number', document_number,
    'duplicate', false
  );
end;
$$;

revoke all on function public.checkout_sale(uuid, jsonb) from public, anon;
grant execute on function public.checkout_sale(uuid, jsonb) to authenticated;
