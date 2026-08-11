-- Refunds use negative transaction/tender amounts while keeping line quantities
-- positive. Make the financial constraints aware of the transaction direction.
alter table public.transactions
  drop constraint if exists transactions_discount_cents_check;
alter table public.transactions
  add constraint transactions_discount_direction_check check (
    (kind = 'sale' and discount_cents >= 0)
    or (kind = 'refund' and discount_cents <= 0)
  );
alter table public.transaction_tenders
  drop constraint if exists transaction_tenders_amount_cents_check;
alter table public.transaction_tenders
  add constraint transaction_tenders_amount_nonzero_check check (amount_cents <> 0);

create or replace function public.refund_sale(
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
  original_request_id text := nullif(btrim(payload ->> 'original_client_request_id'), '');
  refund_reason text := nullif(btrim(payload ->> 'reason'), '');
  refund_method text := payload ->> 'method';
  checkout_at timestamptz := clock_timestamp();
  original_record public.transactions%rowtype;
  original_line public.transaction_lines%rowtype;
  product_record public.products%rowtype;
  existing_id uuid;
  refund_id uuid;
  refund_sequence bigint;
  document_number text;
  selected_lines jsonb := '[]'::jsonb;
  requested_line jsonb;
  requested_quantity integer;
  requested_line_count integer;
  matched_line_count integer := 0;
  prior_quantity integer;
  remaining_quantity integer;
  selected_subtotal_12 bigint := 0;
  selected_subtotal_21 bigint := 0;
  selected_subtotal bigint;
  prior_refund_discount bigint;
  remaining_discount bigint;
  refund_discount bigint;
  discount_12 bigint := 0;
  discount_21 bigint := 0;
  discounted_12 bigint;
  discounted_21 bigint;
  refund_vat_12 bigint;
  refund_vat_21 bigint;
  refund_total bigint;
  full_remaining_refund boolean := true;
  refund_line record;
  gift_record record;
  gift_remaining bigint;
  gift_amount bigint;
  gift_balance_before bigint;
  customer_id uuid;
  target_shift_id uuid;
begin
  if actor_id is null then
    raise exception using errcode = 'P0001', message = 'refund:not-authenticated:Log opnieuw in.';
  end if;
  if not private.has_store_role(target_store_id, array['owner', 'manager']) then
    raise exception using errcode = '42501', message = 'refund:forbidden:Alleen een manager of eigenaar kan een retour boeken.';
  end if;
  if request_id is null or original_request_id is null or refund_reason is null then
    raise exception using errcode = 'P0001', message = 'refund:invalid-request:Retourreden en referenties zijn verplicht.';
  end if;
  if refund_method not in ('Cash', 'PIN', 'Cadeaubon') then
    raise exception using errcode = 'P0001', message = 'refund:invalid-method:Ongeldige terugbetaalwijze.';
  end if;
  if pg_catalog.jsonb_typeof(payload -> 'lines') is distinct from 'array'
     or pg_catalog.jsonb_array_length(payload -> 'lines') = 0 then
    raise exception using errcode = 'P0001', message = 'refund:invalid-lines:Selecteer minstens één retourregel.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(target_store_id::text || ':checkout', 0)
  );
  select id into existing_id from public.transactions
  where store_id = target_store_id and client_request_id = request_id;
  if existing_id is not null then
    return pg_catalog.jsonb_build_object('transaction_id', existing_id, 'duplicate', true);
  end if;

  select * into original_record from public.transactions
  where store_id = target_store_id
    and client_request_id = original_request_id
    and kind = 'sale'
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'refund:not-found:De oorspronkelijke verkoop bestaat niet.';
  end if;
  if original_record.source = 'demo' then
    raise exception using errcode = 'P0001', message = 'refund:demo-sale:Demo-omzet kan niet als echte retour worden geboekt.';
  end if;

  -- Reject duplicate line selectors up front.
  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(payload -> 'lines') selected(value)
    group by selected.value ->> 'line_id'
    having count(*) > 1
  ) then
    raise exception using errcode = 'P0001', message = 'refund:invalid-lines:Een retourregel is dubbel geselecteerd.';
  end if;
  requested_line_count := pg_catalog.jsonb_array_length(payload -> 'lines');

  for original_line in
    select * from public.transaction_lines
    where store_id = target_store_id and transaction_id = original_record.id
    order by created_at, id
  loop
    requested_quantity := 0;
    select selected.value into requested_line
    from pg_catalog.jsonb_array_elements(payload -> 'lines') selected(value)
    where selected.value ->> 'line_id' = original_line.line_external_id;
    if requested_line is not null then
      matched_line_count := matched_line_count + 1;
      begin
        requested_quantity := (requested_line ->> 'quantity')::integer;
      exception when invalid_text_representation or numeric_value_out_of_range then
        raise exception using errcode = 'P0001', message = 'refund:invalid-lines:Ongeldige retourhoeveelheid.';
      end;
      if requested_quantity <= 0 then
        raise exception using errcode = 'P0001', message = 'refund:invalid-lines:Ongeldige retourhoeveelheid.';
      end if;
    end if;

    select coalesce(sum(refund_line_row.quantity), 0)::integer into prior_quantity
    from public.transaction_lines refund_line_row
    join public.transactions refund_transaction
      on refund_transaction.id = refund_line_row.transaction_id
     and refund_transaction.store_id = refund_line_row.store_id
    where refund_transaction.store_id = target_store_id
      and refund_transaction.original_transaction_id = original_record.id
      and refund_transaction.kind = 'refund'
      and refund_line_row.line_external_id = original_line.line_external_id;
    remaining_quantity := original_line.quantity - prior_quantity;
    if remaining_quantity < 0 or requested_quantity > remaining_quantity then
      raise exception using errcode = 'P0001', message =
        'refund:over-refund:Er worden meer stuks geretourneerd dan oorspronkelijk verkocht.';
    end if;
    if requested_quantity <> remaining_quantity then
      full_remaining_refund := false;
    end if;
    if requested_quantity > 0 then
      if original_line.vat_rate = 12 then
        selected_subtotal_12 := selected_subtotal_12 + original_line.unit_price_cents * requested_quantity;
      elsif original_line.vat_rate = 21 then
        selected_subtotal_21 := selected_subtotal_21 + original_line.unit_price_cents * requested_quantity;
      else
        raise exception using errcode = 'P0001', message = 'refund:unsupported-vat:De oorspronkelijke BTW kan niet worden geboekt.';
      end if;
      selected_lines := selected_lines || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'line_external_id', original_line.line_external_id,
          'product_id', original_line.product_id,
          'product_external_id', original_line.product_external_id,
          'product_name', original_line.product_name,
          'sku', original_line.sku,
          'barcode', original_line.barcode,
          'quantity', requested_quantity,
          'unit_price_cents', original_line.unit_price_cents,
          'unit_cost_cents', original_line.unit_cost_cents,
          'vat_rate', original_line.vat_rate,
          'line_total_cents', original_line.unit_price_cents * requested_quantity,
          'notes', original_line.notes,
          'modifiers', original_line.modifiers,
          'product_snapshot', original_line.product_snapshot
        )
      );
    end if;
    requested_line := null;
  end loop;

  if matched_line_count <> requested_line_count then
    raise exception using errcode = 'P0001', message = 'refund:invalid-lines:Een geselecteerde orderregel bestaat niet.';
  end if;
  selected_subtotal := selected_subtotal_12 + selected_subtotal_21;
  if selected_subtotal <= 0 then
    raise exception using errcode = 'P0001', message = 'refund:invalid-lines:Het retourbedrag moet groter zijn dan nul.';
  end if;

  select coalesce(-sum(refund_transaction.discount_cents), 0)
  into prior_refund_discount
  from public.transactions refund_transaction
  where refund_transaction.store_id = target_store_id
    and refund_transaction.original_transaction_id = original_record.id
    and refund_transaction.kind = 'refund';
  remaining_discount := greatest(0, original_record.discount_cents - prior_refund_discount);
  if full_remaining_refund then
    refund_discount := remaining_discount;
  elsif original_record.subtotal_cents > 0 then
    refund_discount := least(
      remaining_discount,
      round(original_record.discount_cents::numeric * selected_subtotal / original_record.subtotal_cents)::bigint
    );
  else
    refund_discount := 0;
  end if;
  refund_discount := least(refund_discount, selected_subtotal);

  if refund_discount > 0 then
    discount_12 := (refund_discount * selected_subtotal_12) / selected_subtotal;
    discount_21 := (refund_discount * selected_subtotal_21) / selected_subtotal;
    if discount_12 + discount_21 < refund_discount then
      if (refund_discount * selected_subtotal_12) % selected_subtotal >=
         (refund_discount * selected_subtotal_21) % selected_subtotal then
        discount_12 := discount_12 + 1;
      else
        discount_21 := discount_21 + 1;
      end if;
    end if;
  end if;
  discounted_12 := selected_subtotal_12 - discount_12;
  discounted_21 := selected_subtotal_21 - discount_21;
  refund_vat_12 := discounted_12 - round(discounted_12::numeric / 1.12)::bigint;
  refund_vat_21 := discounted_21 - round(discounted_21::numeric / 1.21)::bigint;
  refund_total := discounted_12 + discounted_21;
  if refund_total <= 0 or refund_total > original_record.total_cents - coalesce((
    select -sum(t.total_cents) from public.transactions t
    where t.store_id = target_store_id
      and t.original_transaction_id = original_record.id
      and t.kind = 'refund'
  ), 0) then
    raise exception using errcode = 'P0001', message = 'refund:over-refund:Het retourbedrag overschrijdt de resterende verkoopwaarde.';
  end if;

  select coalesce(p.display_name, split_part(u.email, '@', 1), 'Gebruiker')
  into actor_name from auth.users u
  left join public.profiles p on p.id = u.id where u.id = actor_id;
  select rs.id into target_shift_id from public.register_shifts rs
  where rs.store_id = target_store_id
    and rs.register_id = original_record.register_id
    and rs.status = 'open'
  order by rs.opened_at desc limit 1;

  insert into private.store_counters (store_id, counter_name, value)
  values (
    target_store_id, 'credit-' || extract(year from checkout_at)::integer,
    (select count(*) + 1 from public.transactions counted_refund
      where counted_refund.store_id = target_store_id
        and counted_refund.kind = 'refund'
        and extract(year from counted_refund.occurred_at) = extract(year from checkout_at))
  ) on conflict (store_id, counter_name)
  do update set value = private.store_counters.value + 1
  returning value into refund_sequence;
  document_number := 'CR-' || extract(year from checkout_at)::integer || '-' ||
    lpad(refund_sequence::text, 8, '0');

  customer_id := original_record.customer_id;
  insert into public.transactions (
    store_id, external_id, client_request_id, document_number, table_id,
    subtotal_cents, vat_12_cents, vat_21_cents, total_cents,
    discount_cents, payment_method, occurred_at, is_finalized,
    user_id, user_name, customer_id, source, kind, original_transaction_id,
    correction_reason, merchant_snapshot, register_id, shift_id
  ) values (
    target_store_id, request_id, request_id, document_number, original_record.table_id,
    -selected_subtotal, -refund_vat_12, -refund_vat_21, -refund_total,
    -refund_discount, refund_method, checkout_at, false,
    actor_id, actor_name, customer_id, 'live', 'refund', original_record.id,
    refund_reason, original_record.merchant_snapshot, original_record.register_id, target_shift_id
  ) returning id into refund_id;

  for refund_line in select * from pg_catalog.jsonb_array_elements(selected_lines) as row(value)
  loop
    insert into public.transaction_lines (
      store_id, transaction_id, line_external_id, product_id,
      product_external_id, product_name, sku, barcode, quantity,
      unit_price_cents, unit_cost_cents, vat_rate, line_total_cents,
      notes, modifiers, product_snapshot
    ) values (
      target_store_id, refund_id, refund_line.value ->> 'line_external_id',
      nullif(refund_line.value ->> 'product_id', '')::uuid,
      refund_line.value ->> 'product_external_id', refund_line.value ->> 'product_name',
      refund_line.value ->> 'sku', refund_line.value ->> 'barcode',
      (refund_line.value ->> 'quantity')::integer,
      (refund_line.value ->> 'unit_price_cents')::bigint,
      nullif(refund_line.value ->> 'unit_cost_cents', '')::bigint,
      (refund_line.value ->> 'vat_rate')::numeric,
      (refund_line.value ->> 'line_total_cents')::bigint,
      refund_line.value ->> 'notes', refund_line.value -> 'modifiers',
      refund_line.value -> 'product_snapshot'
    );
    if nullif(refund_line.value ->> 'product_id', '') is not null then
      select * into product_record from public.products
      where store_id = target_store_id
        and id = (refund_line.value ->> 'product_id')::uuid
      for update;
      if found and product_record.stock_qty is not null then
        update public.products
        set stock_qty = stock_qty + (refund_line.value ->> 'quantity')::integer
        where id = product_record.id and store_id = target_store_id;
        insert into public.stock_movements (
          store_id, product_id, product_name, quantity_delta, reason,
          occurred_at, transaction_id, user_id, user_name, client_request_id
        ) values (
          target_store_id, product_record.id, product_record.name,
          (refund_line.value ->> 'quantity')::integer, 'pos-refund',
          checkout_at, refund_id, actor_id, actor_name,
          request_id || ':stock:' || (refund_line.value ->> 'line_external_id')
        );
      end if;
    end if;
  end loop;

  insert into public.transaction_tenders (store_id, transaction_id, method, amount_cents)
  values (target_store_id, refund_id, refund_method, -refund_total);

  if refund_method = 'Cadeaubon' then
    gift_remaining := refund_total;
    for gift_record in
      select
        redeemed.gift_card_id,
        max(redeemed.gift_card_code) as gift_card_code,
        sum(redeemed.amount_cents) as redeemed_cents,
        coalesce((
          select sum(restored.amount_cents)
          from public.gift_card_events restored
          join public.transactions restored_transaction
            on restored_transaction.id = restored.transaction_id
           and restored_transaction.store_id = restored.store_id
          where restored.store_id = target_store_id
            and restored.event_type = 'refund'
            and restored.gift_card_id = redeemed.gift_card_id
            and restored_transaction.original_transaction_id = original_record.id
        ), 0) as restored_cents
      from public.gift_card_events redeemed
      where redeemed.store_id = target_store_id
        and redeemed.transaction_id = original_record.id
        and redeemed.event_type = 'redeem'
      group by redeemed.gift_card_id
      order by redeemed.gift_card_id
    loop
      exit when gift_remaining <= 0;
      gift_amount := least(gift_remaining, gift_record.redeemed_cents - gift_record.restored_cents);
      if gift_amount > 0 then
        select balance_cents into gift_balance_before from public.gift_cards
        where store_id = target_store_id and id = gift_record.gift_card_id
        for update;
        if gift_balance_before is null then
          raise exception using errcode = 'P0001', message = 'refund:gift-card-not-found:De oorspronkelijke cadeaubon bestaat niet meer.';
        end if;
        update public.gift_cards set balance_cents = balance_cents + gift_amount
        where store_id = target_store_id and id = gift_record.gift_card_id;
        insert into public.gift_card_events (
          store_id, external_id, gift_card_id, gift_card_code, event_type,
          amount_cents, balance_before_cents, balance_after_cents, occurred_at,
          transaction_id, client_request_id, user_id, user_name, source
        ) values (
          target_store_id, request_id || ':gift-card:' || gift_record.gift_card_id,
          gift_record.gift_card_id, gift_record.gift_card_code, 'refund', gift_amount,
          gift_balance_before, gift_balance_before + gift_amount, checkout_at,
          refund_id, request_id, actor_id, actor_name, 'live'
        );
        gift_remaining := gift_remaining - gift_amount;
      end if;
    end loop;
    if gift_remaining > 0 then
      raise exception using errcode = 'P0001', message =
        'refund:gift-card-limit:Deze retour kan niet volledig naar de oorspronkelijke cadeaubon worden teruggestort. Kies Cash of PIN.';
    end if;
  end if;

  if customer_id is not null then
    update public.customers
    set total_spent_cents = greatest(0, total_spent_cents - refund_total)
    where store_id = target_store_id and id = customer_id;
  end if;
  insert into public.audit_entries (
    store_id, occurred_at, user_id, user_name, action, detail, source
  ) values (
    target_store_id, checkout_at, actor_id, actor_name, 'refund.create',
    pg_catalog.jsonb_build_object(
      'originalTransactionId', original_record.id,
      'refundTransactionId', refund_id,
      'clientRequestId', request_id,
      'amountCents', refund_total,
      'reason', refund_reason,
      'method', refund_method
    ), 'app'
  );

  return pg_catalog.jsonb_build_object(
    'transaction_id', refund_id,
    'document_number', document_number,
    'duplicate', false
  );
end;
$$;

revoke all on function public.refund_sale(uuid, jsonb) from public, anon;
grant execute on function public.refund_sale(uuid, jsonb) to authenticated;
