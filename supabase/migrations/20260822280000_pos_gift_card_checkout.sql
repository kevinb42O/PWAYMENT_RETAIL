-- A gift-card issue/recharge is a real POS settlement: one immutable sale,
-- tender ledger and card event, committed atomically.  It deliberately uses a
-- virtual 0%-VAT line instead of catalog revenue/stock.
create or replace function public.checkout_gift_card_sale(target_store_id uuid, payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor_id uuid := (select auth.uid()); actor_name text; request_id text := nullif(btrim(payload->>'client_request_id'),'');
  tx_id uuid; register_id uuid; shift_id uuid; document_no text; sequence bigint; now_at timestamptz := clock_timestamp();
  item jsonb; op jsonb; tender jsonb; card public.gift_cards%rowtype; customer_id uuid;
  subtotal bigint := 0; tender_total bigint := 0; amount bigint; line_id text; method text; payment_method text;
begin
  if actor_id is null then raise exception using errcode='P0001', message='giftcard-checkout:not-authenticated:Log opnieuw in.'; end if;
  if not private.has_store_role(target_store_id, array['owner','manager','cashier']) then raise exception using errcode='42501', message='giftcard-checkout:forbidden:Geen toegang tot deze winkel.'; end if;
  if request_id is null then raise exception using errcode='P0001', message='giftcard-checkout:invalid-request:Ongeldige idempotentiesleutel.'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(target_store_id::text || ':checkout',0));
  select id into tx_id from public.transactions where store_id=target_store_id and client_request_id=request_id;
  if tx_id is not null then return pg_catalog.jsonb_build_object('transaction_id',tx_id,'duplicate',true); end if;
  select coalesce(p.display_name,split_part(u.email,'@',1),'Gebruiker') into actor_name from auth.users u left join public.profiles p on p.id=u.id where u.id=actor_id;
  if pg_catalog.jsonb_typeof(payload->'items') is distinct from 'array' or pg_catalog.jsonb_array_length(payload->'items')=0 then raise exception using errcode='P0001',message='giftcard-checkout:invalid-request:Geen cadeaubonregels.'; end if;
  for item in select value from pg_catalog.jsonb_array_elements(payload->'items') loop
    op := item->'gift_card_operation';
    if pg_catalog.jsonb_typeof(op) is distinct from 'object' or op->>'action' not in ('issue','recharge') then raise exception using errcode='P0001',message='giftcard-checkout:invalid-request:Ongeldige cadeaubonregel.'; end if;
    amount := (item#>>'{product,priceCents}')::bigint * coalesce((item->>'quantity')::integer,0);
    if amount <= 0 or coalesce((item->>'quantity')::integer,0) <> 1 then raise exception using errcode='P0001',message='giftcard-checkout:invalid-request:Ongeldig cadeaubonbedrag.'; end if;
    subtotal := subtotal + amount;
  end loop;
  if coalesce((payload->>'discount_cents')::bigint,0) <> 0 then raise exception using errcode='P0001',message='giftcard-checkout:invalid-request:Korting op cadeaubonwaarde is niet toegestaan.'; end if;
  if pg_catalog.jsonb_typeof(payload->'tenders') is distinct from 'array' then raise exception using errcode='P0001',message='giftcard-checkout:invalid-tender:Betaalmiddelen ontbreken.'; end if;
  for tender in select value from pg_catalog.jsonb_array_elements(payload->'tenders') loop
    method := tender->>'method'; amount := (tender->>'amount_cents')::bigint;
    if method not in ('Cash','PIN') or amount <= 0 then raise exception using errcode='P0001',message='giftcard-checkout:invalid-tender:Ongeldig betaalmiddel.'; end if;
    tender_total := tender_total + amount;
  end loop;
  if tender_total <> subtotal then raise exception using errcode='P0001',message='giftcard-checkout:invalid-tender:Betaalmiddelen sluiten niet aan op de cadeaubonwaarde.'; end if;
  payment_method := case when (select count(*) from jsonb_array_elements(payload->'tenders'))=1 then payload#>>'{tenders,0,method}' else 'Split' end;
  insert into public.registers(store_id,external_id,name,is_active) values(target_store_id,'retail-register-1','Kassa 1',true) on conflict(store_id,external_id) do update set is_active=true returning id into register_id;
  select id into shift_id from public.register_shifts where store_id=target_store_id and register_id=register_id and status='open' order by opened_at desc limit 1;
  if shift_id is null then insert into public.register_shifts(store_id,register_id,shift_number,opened_at,opened_by_user_id,opened_by_user_name,opening_float_cents,status) values(target_store_id,register_id,coalesce((select max(shift_number)+1 from public.register_shifts where store_id=target_store_id and register_id=register_id),1),now_at,actor_id,actor_name,0,'open') returning id into shift_id; end if;
  insert into private.store_counters(store_id,counter_name,value) values(target_store_id,'pos-'||extract(year from now_at)::integer,1) on conflict(store_id,counter_name) do update set value=private.store_counters.value+1 returning value into sequence;
  document_no := 'POS-'||extract(year from now_at)::integer||'-'||lpad(sequence::text,8,'0');
  insert into public.transactions(store_id,external_id,client_request_id,document_number,table_id,subtotal_cents,vat_12_cents,vat_21_cents,total_cents,discount_cents,payment_method,occurred_at,is_finalized,user_id,user_name,source,kind,merchant_snapshot,register_id,shift_id)
  values(target_store_id,request_id,request_id,document_no,coalesce((payload->>'cart_id')::integer,1),subtotal,0,0,subtotal,0,payment_method,now_at,false,actor_id,actor_name,'live','sale',coalesce(payload->'merchant_snapshot','{}'),register_id,shift_id) returning id into tx_id;
  for item in select value from pg_catalog.jsonb_array_elements(payload->'items') loop
    op := item->'gift_card_operation'; amount := (item#>>'{product,priceCents}')::bigint; line_id := item->>'line_id';
    insert into public.transaction_lines(store_id,transaction_id,line_external_id,product_name,quantity,unit_price_cents,vat_rate,line_total_cents,product_snapshot) values(target_store_id,tx_id,line_id,case when op->>'action'='issue' then 'Cadeaubon – uitgifte' else 'Cadeaubon – oplading' end,1,amount,0,amount,item->'product');
    if op->>'action'='issue' then
      if exists(select 1 from public.gift_cards where store_id=target_store_id and external_id=op->>'card_id') then raise exception using errcode='23505',message='giftcard-checkout:duplicate-code:Cadeaubon bestaat al.'; end if;
      if nullif(op->>'customer_id','') is not null then select id into customer_id from public.customers where store_id=target_store_id and (external_id=op->>'customer_id' or id::text=op->>'customer_id'); end if;
      insert into public.gift_cards(store_id,external_id,customer_id,code,initial_cents,balance_cents,issued_at,expires_at,is_active) values(target_store_id,op->>'card_id',customer_id,upper(op->>'code'),amount,amount,now_at,nullif(op->>'expires_at','')::timestamptz,true) returning * into card;
      insert into public.gift_card_events(store_id,external_id,gift_card_id,gift_card_code,event_type,amount_cents,balance_before_cents,balance_after_cents,occurred_at,transaction_id,client_request_id,customer_id,user_id,user_name,payment_tenders) values(target_store_id,request_id||':gift:'||(op->>'card_id'),card.id,card.code,'issue',amount,0,amount,now_at,tx_id,request_id,card.customer_id,actor_id,actor_name,payload->'tenders');
    else
      select * into card from public.gift_cards where store_id=target_store_id and (external_id=op->>'card_id' or id::text=op->>'card_id') for update;
      if not found or not card.is_active then raise exception using errcode='P0001',message='giftcard-checkout:not-found:Cadeaubon bestaat niet of is geblokkeerd.'; end if;
      update public.gift_cards set balance_cents=card.balance_cents+amount where id=card.id; insert into public.gift_card_events(store_id,external_id,gift_card_id,gift_card_code,event_type,amount_cents,balance_before_cents,balance_after_cents,occurred_at,transaction_id,client_request_id,customer_id,user_id,user_name,payment_tenders) values(target_store_id,request_id||':gift:'||(op->>'card_id'),card.id,card.code,'recharge',amount,card.balance_cents,card.balance_cents+amount,now_at,tx_id,request_id,card.customer_id,actor_id,actor_name,payload->'tenders');
    end if;
  end loop;
  for tender in select value from pg_catalog.jsonb_array_elements(payload->'tenders') loop insert into public.transaction_tenders(store_id,transaction_id,method,amount_cents) values(target_store_id,tx_id,tender->>'method',(tender->>'amount_cents')::bigint); end loop;
  return pg_catalog.jsonb_build_object('transaction_id',tx_id,'document_number',document_no,'duplicate',false);
end $$;
grant execute on function public.checkout_gift_card_sale(uuid,jsonb) to authenticated;
