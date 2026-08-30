begin;

-- The inventory compatibility migration accidentally reintroduced a
-- PL/pgSQL variable named `module_key`, colliding with the conflict target.
create or replace function public.save_module_navigation(target_store_id uuid, payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  item jsonb;
  selected_module_key text;
  module_roles text[];
  order_value integer;
  enabled_value boolean;
begin
  if (select auth.uid()) is null or not private.has_store_role(target_store_id, array['owner']) then
    raise exception using errcode = '42501', message = 'modules:forbidden:Alleen de zaakvoerder kan modules beheren.';
  end if;
  if pg_catalog.jsonb_typeof(payload) <> 'array' or pg_catalog.jsonb_array_length(payload) = 0 then
    raise exception using errcode = 'P0001', message = 'modules:invalid:Ongeldige moduleconfiguratie.';
  end if;

  perform private.ensure_workforce_defaults(target_store_id);
  insert into public.store_module_settings as settings
    (store_id, module_key, enabled, sort_order, visible_roles)
  values
    (target_store_id, 'inventory', true, 45, array['owner', 'manager']::text[])
  on conflict (store_id, module_key) do nothing;

  for item in select value from pg_catalog.jsonb_array_elements(payload) loop
    selected_module_key := nullif(pg_catalog.btrim(item ->> 'key'), '');
    if selected_module_key is null or selected_module_key not in (
      'pos', 'service', 'workforce', 'customers', 'inventory',
      'integration-hub', 'insights', 'z-report', 'audit-log', 'webshop'
    ) then
      raise exception using errcode = 'P0001', message = 'modules:invalid:Onbekende module.';
    end if;
    begin
      order_value := (item ->> 'order')::integer;
      enabled_value := (item ->> 'enabled')::boolean;
      select coalesce(pg_catalog.array_agg(role.value), array[]::text[])
      into module_roles
      from pg_catalog.jsonb_array_elements_text(item -> 'visibleRoles') as role(value);
    exception when others then
      raise exception using errcode = 'P0001', message = 'modules:invalid:Ongeldige moduleconfiguratie.';
    end;
    if order_value not between 0 and 1000
       or pg_catalog.cardinality(module_roles) = 0
       or not (module_roles <@ array['owner', 'manager', 'cashier']::text[]) then
      raise exception using errcode = 'P0001', message = 'modules:invalid:Ongeldige volgorde of roltoegang.';
    end if;
    if selected_module_key in ('pos', 'z-report', 'audit-log') then enabled_value := true; end if;
    if selected_module_key = 'pos' then module_roles := array['owner', 'manager', 'cashier']::text[]; end if;
    if selected_module_key = 'inventory' then module_roles := array['owner', 'manager']::text[]; end if;

    update public.store_module_settings as settings
    set enabled = enabled_value,
        sort_order = order_value,
        custom_label = nullif(pg_catalog.btrim(item ->> 'customLabel'), ''),
        visible_roles = module_roles
    where settings.store_id = target_store_id
      and settings.module_key = selected_module_key;
  end loop;

  perform public.append_audit(
    target_store_id,
    'modules.updated',
    pg_catalog.jsonb_build_object('modules', payload)
  );
  return public.get_module_navigation(target_store_id);
end;
$$;

revoke all on function public.save_module_navigation(uuid, jsonb) from public, anon;
grant execute on function public.save_module_navigation(uuid, jsonb) to authenticated;

-- Qualify every identifier carried between checkout statements. In the prior
-- version `register_id` was both a PL/pgSQL variable and a table column, which
-- could abort gift-card checkout before a transaction was created.
create or replace function public.checkout_gift_card_sale(target_store_id uuid, payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_actor_name text;
  v_request_id text := nullif(pg_catalog.btrim(payload ->> 'client_request_id'), '');
  v_transaction_id uuid;
  v_register_id uuid;
  v_shift_id uuid;
  v_document_number text;
  v_sequence bigint;
  v_now timestamptz := pg_catalog.clock_timestamp();
  item jsonb;
  operation jsonb;
  tender jsonb;
  v_card public.gift_cards%rowtype;
  v_customer_id uuid;
  event_tenders jsonb;
  subtotal bigint := 0;
  tender_total bigint := 0;
  amount bigint;
  line_id text;
  method text;
  payment_method text;
begin
  if v_actor_id is null then
    raise exception using errcode = 'P0001', message = 'giftcard-checkout:not-authenticated:Log opnieuw in.';
  end if;
  if not private.has_store_role(target_store_id, array['owner', 'manager', 'cashier']) then
    raise exception using errcode = '42501', message = 'giftcard-checkout:forbidden:Geen toegang tot deze winkel.';
  end if;
  if v_request_id is null then
    raise exception using errcode = 'P0001', message = 'giftcard-checkout:invalid-request:Ongeldige idempotentiesleutel.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(target_store_id::text || ':checkout', 0)
  );
  select transaction_row.id
  into v_transaction_id
  from public.transactions as transaction_row
  where transaction_row.store_id = target_store_id
    and transaction_row.client_request_id = v_request_id;
  if v_transaction_id is not null then
    return pg_catalog.jsonb_build_object('transaction_id', v_transaction_id, 'duplicate', true);
  end if;

  select coalesce(profile.display_name, pg_catalog.split_part(auth_user.email, '@', 1), 'Gebruiker')
  into v_actor_name
  from auth.users as auth_user
  left join public.profiles as profile on profile.id = auth_user.id
  where auth_user.id = v_actor_id;

  if pg_catalog.jsonb_typeof(payload -> 'items') is distinct from 'array'
     or pg_catalog.jsonb_array_length(payload -> 'items') = 0 then
    raise exception using errcode = 'P0001', message = 'giftcard-checkout:invalid-request:Geen cadeaubonregels.';
  end if;
  for item in select value from pg_catalog.jsonb_array_elements(payload -> 'items') loop
    operation := item -> 'gift_card_operation';
    if pg_catalog.jsonb_typeof(operation) is distinct from 'object'
       or operation ->> 'action' not in ('issue', 'recharge') then
      raise exception using errcode = 'P0001', message = 'giftcard-checkout:invalid-request:Ongeldige cadeaubonregel.';
    end if;
    amount := (item #>> '{product,priceCents}')::bigint * coalesce((item ->> 'quantity')::integer, 0);
    if amount <= 0 or coalesce((item ->> 'quantity')::integer, 0) <> 1 then
      raise exception using errcode = 'P0001', message = 'giftcard-checkout:invalid-request:Ongeldig cadeaubonbedrag.';
    end if;
    subtotal := subtotal + amount;
  end loop;

  if coalesce((payload ->> 'discount_cents')::bigint, 0) <> 0 then
    raise exception using errcode = 'P0001', message = 'giftcard-checkout:invalid-request:Korting op cadeaubonwaarde is niet toegestaan.';
  end if;
  if pg_catalog.jsonb_typeof(payload -> 'tenders') is distinct from 'array' then
    raise exception using errcode = 'P0001', message = 'giftcard-checkout:invalid-tender:Betaalmiddelen ontbreken.';
  end if;
  for tender in select value from pg_catalog.jsonb_array_elements(payload -> 'tenders') loop
    method := tender ->> 'method';
    amount := (tender ->> 'amount_cents')::bigint;
    if method is null or method not in ('Cash', 'PIN') or amount is null or amount <= 0 then
      raise exception using errcode = 'P0001', message = 'giftcard-checkout:invalid-tender:Ongeldig betaalmiddel.';
    end if;
    tender_total := tender_total + amount;
  end loop;
  if tender_total <> subtotal then
    raise exception using errcode = 'P0001', message = 'giftcard-checkout:invalid-tender:Betaalmiddelen sluiten niet aan op de cadeaubonwaarde.';
  end if;

  select pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'method', tender_row.value ->> 'method',
      'amountCents', (tender_row.value ->> 'amount_cents')::bigint
    ) order by tender_row.ordinality
  )
  into event_tenders
  from pg_catalog.jsonb_array_elements(payload -> 'tenders')
    with ordinality as tender_row(value, ordinality);
  payment_method := case
    when (select count(*) from pg_catalog.jsonb_array_elements(payload -> 'tenders')) = 1
      then payload #>> '{tenders,0,method}'
    else 'Split'
  end;

  insert into public.registers(store_id, external_id, name, is_active)
  values(target_store_id, 'retail-register-1', 'Kassa 1', true)
  on conflict(store_id, external_id) do update set is_active = true
  returning public.registers.id into v_register_id;

  select shift_row.id
  into v_shift_id
  from public.register_shifts as shift_row
  where shift_row.store_id = target_store_id
    and shift_row.register_id = v_register_id
    and shift_row.status = 'open'
  order by shift_row.opened_at desc
  limit 1;
  if v_shift_id is null then
    insert into public.register_shifts(
      store_id, register_id, shift_number, opened_at, opened_by_user_id,
      opened_by_user_name, opening_float_cents, status
    ) values (
      target_store_id,
      v_register_id,
      coalesce((
        select max(shift_row.shift_number) + 1
        from public.register_shifts as shift_row
        where shift_row.store_id = target_store_id
          and shift_row.register_id = v_register_id
      ), 1),
      v_now, v_actor_id, v_actor_name, 0, 'open'
    )
    returning public.register_shifts.id into v_shift_id;
  end if;

  insert into private.store_counters(store_id, counter_name, value)
  values(target_store_id, 'pos-' || extract(year from v_now)::integer, 1)
  on conflict(store_id, counter_name) do update
    set value = private.store_counters.value + 1
  returning value into v_sequence;
  v_document_number := 'POS-' || extract(year from v_now)::integer || '-' || pg_catalog.lpad(v_sequence::text, 8, '0');

  insert into public.transactions(
    store_id, external_id, client_request_id, document_number, table_id,
    subtotal_cents, vat_12_cents, vat_21_cents, total_cents, discount_cents,
    payment_method, occurred_at, is_finalized, user_id, user_name, source, kind,
    merchant_snapshot, register_id, shift_id
  ) values (
    target_store_id, v_request_id, v_request_id, v_document_number,
    coalesce((payload ->> 'cart_id')::integer, 1), subtotal, 0, 0, subtotal, 0,
    payment_method, v_now, false, v_actor_id, v_actor_name, 'live', 'sale',
    coalesce(payload -> 'merchant_snapshot', '{}'::jsonb), v_register_id, v_shift_id
  )
  returning public.transactions.id into v_transaction_id;

  for item in select value from pg_catalog.jsonb_array_elements(payload -> 'items') loop
    operation := item -> 'gift_card_operation';
    amount := (item #>> '{product,priceCents}')::bigint;
    line_id := item ->> 'line_id';
    insert into public.transaction_lines(
      store_id, transaction_id, line_external_id, product_name, quantity,
      unit_price_cents, vat_rate, line_total_cents, product_snapshot
    ) values (
      target_store_id, v_transaction_id, line_id,
      case when operation ->> 'action' = 'issue' then 'Cadeaubon – uitgifte' else 'Cadeaubon – oplading' end,
      1, amount, 0, amount, item -> 'product'
    );

    if operation ->> 'action' = 'issue' then
      v_customer_id := null;
      if exists(
        select 1 from public.gift_cards as existing_card
        where existing_card.store_id = target_store_id
          and existing_card.external_id = operation ->> 'card_id'
      ) then
        raise exception using errcode = '23505', message = 'giftcard-checkout:duplicate-code:Cadeaubon bestaat al.';
      end if;
      if nullif(operation ->> 'customer_id', '') is not null then
        select customer_row.id
        into v_customer_id
        from public.customers as customer_row
        where customer_row.store_id = target_store_id
          and (customer_row.external_id = operation ->> 'customer_id' or customer_row.id::text = operation ->> 'customer_id');
      end if;
      insert into public.gift_cards(
        store_id, external_id, customer_id, code, initial_cents, balance_cents,
        issued_at, expires_at, is_active
      ) values (
        target_store_id, operation ->> 'card_id', v_customer_id,
        pg_catalog.upper(operation ->> 'code'), amount, amount, v_now,
        nullif(operation ->> 'expires_at', '')::timestamptz, true
      ) returning * into v_card;
      insert into public.gift_card_events(
        store_id, external_id, gift_card_id, gift_card_code, event_type,
        amount_cents, balance_before_cents, balance_after_cents, occurred_at,
        transaction_id, client_request_id, customer_id, user_id, user_name,
        payment_tenders
      ) values (
        target_store_id, v_request_id || ':gift:' || (operation ->> 'card_id'),
        v_card.id, v_card.code, 'issue', amount, 0, amount, v_now,
        v_transaction_id, v_request_id, v_card.customer_id, v_actor_id,
        v_actor_name, event_tenders
      );
    else
      select card_row.*
      into v_card
      from public.gift_cards as card_row
      where card_row.store_id = target_store_id
        and (card_row.external_id = operation ->> 'card_id' or card_row.id::text = operation ->> 'card_id')
      for update;
      if not found or not v_card.is_active then
        raise exception using errcode = 'P0001', message = 'giftcard-checkout:not-found:Cadeaubon bestaat niet of is geblokkeerd.';
      end if;
      update public.gift_cards as updated_card
      set balance_cents = v_card.balance_cents + amount
      where updated_card.id = v_card.id;
      insert into public.gift_card_events(
        store_id, external_id, gift_card_id, gift_card_code, event_type,
        amount_cents, balance_before_cents, balance_after_cents, occurred_at,
        transaction_id, client_request_id, customer_id, user_id, user_name,
        payment_tenders
      ) values (
        target_store_id, v_request_id || ':gift:' || (operation ->> 'card_id'),
        v_card.id, v_card.code, 'recharge', amount, v_card.balance_cents,
        v_card.balance_cents + amount, v_now, v_transaction_id, v_request_id,
        v_card.customer_id, v_actor_id, v_actor_name, event_tenders
      );
    end if;
  end loop;

  for tender in select value from pg_catalog.jsonb_array_elements(payload -> 'tenders') loop
    insert into public.transaction_tenders(store_id, transaction_id, method, amount_cents)
    values(target_store_id, v_transaction_id, tender ->> 'method', (tender ->> 'amount_cents')::bigint);
  end loop;

  return pg_catalog.jsonb_build_object(
    'transaction_id', v_transaction_id,
    'document_number', v_document_number,
    'duplicate', false
  );
end;
$$;

revoke all on function public.checkout_gift_card_sale(uuid, jsonb) from public, anon;
grant execute on function public.checkout_gift_card_sale(uuid, jsonb) to authenticated;

commit;
