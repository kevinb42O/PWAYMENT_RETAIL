-- A financial refund and a sellable stock return are different decisions. Keep
-- the chosen operational destination on the credit note and make only the
-- explicit sellable path affect available inventory.

alter table public.transactions
  add column if not exists return_disposition text;
alter table public.transactions
  drop constraint if exists transactions_return_disposition_check;
alter table public.transactions
  add constraint transactions_return_disposition_check
  check (return_disposition is null or return_disposition in (
    'sellable', 'quarantine', 'defective', 'supplier-return'
  )) not valid;

alter table public.stock_movements
  add column if not exists return_disposition text;
alter table public.stock_movements
  drop constraint if exists stock_movements_return_disposition_check;
alter table public.stock_movements
  add constraint stock_movements_return_disposition_check
  check (return_disposition is null or return_disposition in (
    'sellable', 'quarantine', 'defective', 'supplier-return'
  )) not valid;

update public.transactions
set return_disposition = 'sellable'
where kind = 'refund' and return_disposition is null;

-- Keep the latest receipt-barcode wrapper intact and layer disposition handling
-- around it. The original RPC performs the financial credit atomically; this
-- wrapper reverses only its temporary available-stock restoration for
-- non-sellable returns before the transaction commits.
do $$
begin
  if to_regprocedure('public.refund_sale_receipt_v2(uuid,jsonb)') is null
     and to_regprocedure('public.refund_sale(uuid,jsonb)') is not null then
    alter function public.refund_sale(uuid, jsonb) rename to refund_sale_receipt_v2;
  end if;
end;
$$;

revoke all on function public.refund_sale_receipt_v2(uuid, jsonb)
  from public, anon, authenticated;

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
  disposition text := coalesce(nullif(btrim(payload ->> 'disposition'), ''), 'sellable');
  result jsonb;
  refund_id uuid;
  saved_disposition text;
  movement_record record;
begin
  if disposition not in ('sellable', 'quarantine', 'defective', 'supplier-return') then
    raise exception using errcode = 'P0001', message =
      'refund:invalid-disposition:Kies een geldige bestemming voor de retour.';
  end if;

  result := public.refund_sale_receipt_v2(target_store_id, payload);
  refund_id := nullif(result ->> 'transaction_id', '')::uuid;
  if refund_id is null then
    raise exception using errcode = 'P0001', message =
      'refund:invalid-response:De retour kon niet worden bevestigd.';
  end if;

  if coalesce(result ->> 'duplicate', 'false') = 'true' then
    select return_disposition into saved_disposition
    from public.transactions
    where store_id = target_store_id and id = refund_id;
    return result || pg_catalog.jsonb_build_object(
      'return_disposition', coalesce(saved_disposition, disposition)
    );
  end if;

  update public.transactions
  set return_disposition = disposition
  where store_id = target_store_id and id = refund_id;

  if disposition <> 'sellable' then
    for movement_record in
      select product_id, sum(quantity_delta)::integer as quantity
      from public.stock_movements
      where store_id = target_store_id
        and transaction_id = refund_id
        and reason = 'pos-refund'
      group by product_id
    loop
      update public.products
      set stock_qty = stock_qty - movement_record.quantity,
          updated_at = clock_timestamp()
      where store_id = target_store_id
        and id = movement_record.product_id
        and stock_qty is not null;
    end loop;

    delete from public.stock_movements
    where store_id = target_store_id
      and transaction_id = refund_id
      and reason = 'pos-refund';
  else
    update public.stock_movements
    set return_disposition = 'sellable'
    where store_id = target_store_id
      and transaction_id = refund_id
      and reason = 'pos-refund';
  end if;

  insert into public.audit_entries (
    store_id, user_id, user_name, action, detail, source
  )
  select
    target_store_id, transaction_record.user_id, transaction_record.user_name,
    'refund.disposition',
    pg_catalog.jsonb_build_object(
      'refundTransactionId', transaction_record.id,
      'clientRequestId', transaction_record.client_request_id,
      'disposition', disposition,
      'availableStockRestored', disposition = 'sellable'
    ),
    'app'
  from public.transactions transaction_record
  where transaction_record.store_id = target_store_id
    and transaction_record.id = refund_id;

  return result || pg_catalog.jsonb_build_object(
    'return_disposition', disposition
  );
end;
$$;

revoke all on function public.refund_sale(uuid, jsonb) from public, anon;
grant execute on function public.refund_sale(uuid, jsonb) to authenticated;
