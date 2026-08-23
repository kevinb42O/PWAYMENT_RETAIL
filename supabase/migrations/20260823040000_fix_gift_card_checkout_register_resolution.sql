-- The gift-card checkout used `register_id` for both a PL/pgSQL variable and
-- a table column. PostgreSQL rightfully rejects that ambiguity at runtime.
-- It also predates the immutable generic-VAT snapshot and therefore attempts
-- to write an invalid transaction. Keep the public RPC contract intact while
-- repairing both issues in its trusted implementation.
begin;

do $gift_card_register_resolution$
declare
  definition text;
  rewritten text;
begin
  if pg_catalog.to_regprocedure('public.checkout_gift_card_sale(uuid,jsonb)') is null then
    raise exception 'checkout_gift_card_sale is required before its register resolution can be fixed.';
  end if;

  select pg_catalog.pg_get_functiondef(
    'public.checkout_gift_card_sale(uuid,jsonb)'::pg_catalog.regprocedure
  ) into strict definition;

  if position('resolved_register_id uuid' in definition) > 0
     and position('vat_0_cents,vat_6_cents,vat_12_cents,vat_21_cents,vat_breakdown,vat_snapshot_version' in definition) > 0 then
    return;
  end if;

  rewritten := replace(
    definition,
    '  tx_id uuid; register_id uuid; shift_id uuid;',
    '  tx_id uuid; resolved_register_id uuid; shift_id uuid;'
  );
  rewritten := replace(
    rewritten,
    'returning id into register_id;',
    'returning id into resolved_register_id;'
  );
  rewritten := replace(
    rewritten,
    'where store_id=target_store_id and register_id=register_id and status=''open''',
    'where store_id=target_store_id and register_id=resolved_register_id and status=''open'''
  );
  rewritten := replace(
    rewritten,
    'values(target_store_id,register_id,coalesce((select max(shift_number)+1 from public.register_shifts where store_id=target_store_id and register_id=register_id),1),',
    'values(target_store_id,resolved_register_id,coalesce((select max(shift_number)+1 from public.register_shifts where store_id=target_store_id and register_id=resolved_register_id),1),'
  );
  rewritten := replace(
    rewritten,
    'coalesce(payload->''merchant_snapshot'',''{}''),register_id,shift_id)',
    'coalesce(payload->''merchant_snapshot'',''{}''),resolved_register_id,shift_id)'
  );
  rewritten := replace(
    rewritten,
    'subtotal_cents,vat_12_cents,vat_21_cents,total_cents',
    'subtotal_cents,vat_0_cents,vat_6_cents,vat_12_cents,vat_21_cents,vat_breakdown,vat_snapshot_version,total_cents'
  );
  rewritten := replace(
    rewritten,
    'subtotal,0,0,subtotal,0,payment_method',
    'subtotal,0,0,0,0,pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(''rate'',0,''grossCents'',subtotal,''exclCents'',subtotal,''vatCents'',0)),1,subtotal,0,payment_method'
  );

  if rewritten = definition
     or position('  tx_id uuid; register_id uuid; shift_id uuid;' in rewritten) > 0
     or position('register_id=register_id' in rewritten) > 0
     or position('returning id into register_id;' in rewritten) > 0
     or position('),register_id,shift_id)' in rewritten) > 0
     or position('subtotal_cents,vat_12_cents,vat_21_cents,total_cents' in rewritten) > 0
     or position('subtotal,0,0,subtotal,0,payment_method' in rewritten) > 0
     or position('vat_0_cents,vat_6_cents,vat_12_cents,vat_21_cents,vat_breakdown,vat_snapshot_version' in rewritten) = 0 then
    raise exception 'Could not safely repair checkout_gift_card_sale.';
  end if;

  execute rewritten;
end;
$gift_card_register_resolution$;

commit;
