-- Atomic tenant-scoped gift-card lifecycle operations.

create unique index if not exists gift_cards_store_normalized_code_unique
  on public.gift_cards (
    store_id,
    upper(regexp_replace(code, '[[:space:]-]', '', 'g'))
  );

create or replace function public.mutate_gift_card(
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
  action_name text := payload ->> 'action';
  card_external_id text := nullif(btrim(payload ->> 'card_id'), '');
  event_external_id text := nullif(btrim(payload ->> 'event_id'), '');
  card_code text := upper(nullif(btrim(payload ->> 'code'), ''));
  normalized_code text;
  amount_cents bigint := 0;
  customer_id uuid;
  card_record public.gift_cards%rowtype;
  event_type text;
  balance_before bigint;
  balance_after bigint;
  event_at timestamptz := clock_timestamp();
  tender jsonb;
  tender_total bigint := 0;
  tender_amount bigint;
begin
  if actor_id is null then
    raise exception using errcode = 'P0001', message = 'giftcard:not-authenticated:Log opnieuw in.';
  end if;
  if not private.has_store_role(target_store_id, array['owner', 'manager', 'cashier']) then
    raise exception using errcode = '42501', message = 'giftcard:forbidden:Geen toegang tot deze winkel.';
  end if;
  if action_name not in ('issue', 'recharge', 'activate', 'deactivate')
     or card_external_id is null or event_external_id is null then
    raise exception using errcode = 'P0001', message = 'giftcard:invalid-request:Ongeldige cadeaubonactie.';
  end if;

  if exists (
    select 1 from public.gift_card_events
    where store_id = target_store_id and external_id = event_external_id
  ) then
    select * into card_record from public.gift_cards
    where store_id = target_store_id
      and (external_id = card_external_id or id::text = card_external_id);
    return pg_catalog.jsonb_build_object(
      'gift_card_id', card_record.id,
      'duplicate', true
    );
  end if;

  select coalesce(p.display_name, split_part(u.email, '@', 1), 'Gebruiker')
  into actor_name
  from auth.users u
  left join public.profiles p on p.id = u.id
  where u.id = actor_id;

  begin
    amount_cents := coalesce((payload ->> 'amount_cents')::bigint, 0);
    if nullif(payload ->> 'occurred_at', '') is not null then
      event_at := (payload ->> 'occurred_at')::timestamptz;
    end if;
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception using errcode = 'P0001', message = 'giftcard:invalid-amount:Ongeldig cadeaubonbedrag.';
  end;
  if amount_cents < 0 or (action_name in ('issue', 'recharge') and amount_cents <= 0) then
    raise exception using errcode = 'P0001', message = 'giftcard:invalid-amount:Het bedrag moet groter zijn dan nul.';
  end if;

  if action_name in ('issue', 'recharge') then
    if pg_catalog.jsonb_typeof(payload -> 'payment_tenders') is distinct from 'array'
       or pg_catalog.jsonb_array_length(payload -> 'payment_tenders') = 0 then
      raise exception using errcode = 'P0001', message = 'giftcard:invalid-tender:Betaalmiddelen ontbreken.';
    end if;
    for tender in select value from pg_catalog.jsonb_array_elements(payload -> 'payment_tenders')
    loop
      if tender ->> 'method' not in ('Cash', 'PIN', 'Cadeaubon') then
        raise exception using errcode = 'P0001', message = 'giftcard:invalid-tender:Ongeldige betaalwijze.';
      end if;
      begin
        tender_amount := (tender ->> 'amountCents')::bigint;
      exception when invalid_text_representation or numeric_value_out_of_range then
        raise exception using errcode = 'P0001', message = 'giftcard:invalid-tender:Ongeldig betaalbedrag.';
      end;
      if tender_amount <= 0 then
        raise exception using errcode = 'P0001', message = 'giftcard:invalid-tender:Ongeldig betaalbedrag.';
      end if;
      tender_total := tender_total + tender_amount;
    end loop;
    if tender_total <> amount_cents then
      raise exception using errcode = 'P0001', message = 'giftcard:invalid-tender:Betaalmiddelen sluiten niet aan op de cadeaubonwaarde.';
    end if;
  end if;

  if nullif(payload ->> 'customer_id', '') is not null then
    select id into customer_id from public.customers
    where store_id = target_store_id
      and (external_id = payload ->> 'customer_id' or id::text = payload ->> 'customer_id')
      and is_active;
    if customer_id is null then
      raise exception using errcode = 'P0001', message = 'giftcard:customer-not-found:Klant bestaat niet meer.';
    end if;
  end if;

  if action_name = 'issue' then
    if card_code is null then
      raise exception using errcode = 'P0001', message = 'giftcard:invalid-request:Cadeauboncode ontbreekt.';
    end if;
    normalized_code := upper(regexp_replace(card_code, '[[:space:]-]', '', 'g'));
    if length(normalized_code) < 6 or length(normalized_code) > 100 then
      raise exception using errcode = 'P0001', message = 'giftcard:invalid-request:Ongeldige cadeauboncode.';
    end if;
    if exists (
      select 1 from public.gift_cards
      where store_id = target_store_id
        and upper(regexp_replace(code, '[[:space:]-]', '', 'g')) = normalized_code
    ) then
      raise exception using errcode = '23505', message = 'giftcard:duplicate-code:Deze cadeauboncode bestaat al.';
    end if;
    insert into public.gift_cards (
      store_id, external_id, customer_id, code, initial_cents,
      balance_cents, issued_at, expires_at, is_active
    ) values (
      target_store_id, card_external_id, customer_id, card_code, amount_cents,
      amount_cents, event_at, nullif(payload ->> 'expires_at', '')::timestamptz, true
    ) returning * into card_record;
    event_type := 'issue';
    balance_before := 0;
    balance_after := amount_cents;
  else
    select * into card_record from public.gift_cards
    where store_id = target_store_id
      and (external_id = card_external_id or id::text = card_external_id)
    for update;
    if not found then
      raise exception using errcode = 'P0001', message = 'giftcard:not-found:Cadeaubon bestaat niet.';
    end if;
    customer_id := card_record.customer_id;
    balance_before := card_record.balance_cents;
    if action_name = 'recharge' then
      balance_after := balance_before + amount_cents;
      update public.gift_cards set balance_cents = balance_after
      where id = card_record.id and store_id = target_store_id;
      event_type := 'recharge';
    elsif action_name = 'deactivate' then
      if not card_record.is_active then
        raise exception using errcode = 'P0001', message = 'giftcard:invalid-state:Cadeaubon is al geblokkeerd.';
      end if;
      balance_after := balance_before;
      update public.gift_cards set is_active = false
      where id = card_record.id and store_id = target_store_id;
      event_type := 'deactivate';
    else
      if card_record.is_active then
        raise exception using errcode = 'P0001', message = 'giftcard:invalid-state:Cadeaubon is al actief.';
      end if;
      balance_after := balance_before;
      update public.gift_cards set is_active = true
      where id = card_record.id and store_id = target_store_id;
      event_type := 'activate';
    end if;
  end if;

  insert into public.gift_card_events (
    store_id, external_id, gift_card_id, gift_card_code, event_type,
    amount_cents, balance_before_cents, balance_after_cents, occurred_at,
    client_request_id, customer_id, user_id, user_name, source, note,
    payment_tenders
  ) values (
    target_store_id, event_external_id, card_record.id, card_record.code, event_type,
    amount_cents, balance_before, balance_after, event_at,
    event_external_id, customer_id, actor_id, actor_name, 'live',
    nullif(btrim(payload ->> 'note'), ''),
    coalesce(payload -> 'payment_tenders', '[]'::jsonb)
  );

  insert into public.audit_entries (
    store_id, occurred_at, user_id, user_name, action, detail, source
  ) values (
    target_store_id, event_at, actor_id, actor_name, 'giftcard.' || action_name,
    pg_catalog.jsonb_build_object(
      'giftCardId', coalesce(card_record.external_id, card_record.id::text),
      'code', card_record.code,
      'amountCents', amount_cents,
      'balanceBeforeCents', balance_before,
      'balanceAfterCents', balance_after
    ), 'app'
  );

  return pg_catalog.jsonb_build_object(
    'gift_card_id', card_record.id,
    'balance_cents', balance_after,
    'duplicate', false
  );
end;
$$;

revoke all on function public.mutate_gift_card(uuid, jsonb) from public, anon;
grant execute on function public.mutate_gift_card(uuid, jsonb) to authenticated;
