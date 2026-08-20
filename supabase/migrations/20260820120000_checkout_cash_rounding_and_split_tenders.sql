-- Cash settlement is distinct from the commercial/VAT total. Belgian retail
-- cash payments above €0,05 settle to the nearest €0,05; the resulting
-- difference must remain visible and auditable instead of altering VAT lines.
alter table public.transactions
  add column if not exists rounding_adjustment_cents bigint not null default 0;

alter table public.transactions
  drop constraint if exists transactions_rounding_adjustment_cents_range;
alter table public.transactions
  add constraint transactions_rounding_adjustment_cents_range
  check (rounding_adjustment_cents between -2 and 2);

comment on column public.transactions.rounding_adjustment_cents is
  'Belgian five-cent cash settlement difference; total_cents remains the commercial VAT total.';

-- checkout_sale_v1 is the implementation behind the barcode-validating public
-- wrapper introduced in 20260816130000_receipt_barcodes.sql. Patch that trusted
-- implementation so legacy clients (without `tenders`) keep working while new
-- clients can send exact Cash/PIN allocations for a split sale.
do $migration$
declare
  definition text;
  rewritten text;
  declaration_needle text := $needle$  tender_count integer := 0;$needle$;
  declaration_replacement text := $replacement$  tender_count integer := 0;
  -- cash_rounding_split_tenders_v1
  supplied_tenders jsonb := payload -> 'tenders';
  supplied_tender jsonb;
  supplied_tender_method text;
  supplied_tender_amount bigint;
  supplied_pin_cents bigint := 0;
  supplied_cash_cents bigint := 0;
  has_explicit_tenders boolean := false;
  cash_payment_requested boolean := false;
  commercial_cash_due_cents bigint := 0;
  cash_due_cents bigint := 0;
  rounding_adjustment_cents bigint := 0;
  settlement_total_cents bigint;$replacement$;
  method_needle text := $needle$  requested_method := payload ->> 'method';
  if requested_method not in ('Cash', 'PIN', 'Cadeaubon') then
    raise exception using errcode = 'P0001', message = 'checkout:invalid-tender:Ongeldige betaalwijze.';
  end if;$needle$;
  method_replacement text := $replacement$  requested_method := payload ->> 'method';
  if requested_method is null or requested_method not in ('Cash', 'PIN', 'Cadeaubon', 'Split') then
    raise exception using errcode = 'P0001', message = 'checkout:invalid-tender:Ongeldige betaalwijze.';
  end if;$replacement$;
  payment_needle text := $needle$  if gift_card_total > total_cents then
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
  end;$needle$;
  payment_replacement text := $replacement$  if gift_card_total > total_cents then
    raise exception using errcode = 'P0001', message = 'checkout:gift-card-exceeds-total:Cadeaubonnen overschrijden het totaalbedrag.';
  end if;
  remaining_cents := total_cents - gift_card_total;
  has_explicit_tenders := payload ? 'tenders';

  if has_explicit_tenders and pg_catalog.jsonb_typeof(supplied_tenders) is distinct from 'array' then
    raise exception using errcode = 'P0001', message = 'checkout:invalid-tender:Ongeldige deelbetalingen.';
  end if;
  if has_explicit_tenders and pg_catalog.jsonb_array_length(supplied_tenders) > 20 then
    raise exception using errcode = 'P0001', message = 'checkout:invalid-tender:Te veel deelbetalingen.';
  end if;

  if has_explicit_tenders then
    for supplied_tender in
      select value from pg_catalog.jsonb_array_elements(supplied_tenders)
    loop
      supplied_tender_method := nullif(btrim(supplied_tender ->> 'method'), '');
      begin
        supplied_tender_amount := nullif(supplied_tender ->> 'amount_cents', '')::bigint;
      exception when invalid_text_representation or numeric_value_out_of_range then
        raise exception using errcode = 'P0001', message = 'checkout:invalid-tender:Ongeldig deelbedrag.';
      end;
      if supplied_tender_method is null
         or supplied_tender_method not in ('Cash', 'PIN')
         or supplied_tender_amount is null
         or supplied_tender_amount <= 0 then
        raise exception using errcode = 'P0001', message = 'checkout:invalid-tender:Elke deelbetaling moet een positief cash- of kaartbedrag hebben.';
      end if;
      if supplied_tender_method = 'Cash' then
        supplied_cash_cents := supplied_cash_cents + supplied_tender_amount;
        cash_payment_requested := true;
      else
        supplied_pin_cents := supplied_pin_cents + supplied_tender_amount;
      end if;
    end loop;

    if requested_method = 'Cadeaubon' and remaining_cents <> 0 then
      raise exception using errcode = 'P0001', message = 'checkout:invalid-tender:Kies Cash of PIN voor het resterende bedrag.';
    end if;
    if cash_payment_requested then
      commercial_cash_due_cents := remaining_cents - supplied_pin_cents;
      if commercial_cash_due_cents < 0 then
        raise exception using errcode = 'P0001', message = 'checkout:invalid-tender:De kaartdeelbetaling is hoger dan het resterende bedrag.';
      end if;
      cash_due_cents := case
        when commercial_cash_due_cents <= 5 then commercial_cash_due_cents
        else ((commercial_cash_due_cents + 2) / 5) * 5
      end;
      rounding_adjustment_cents := cash_due_cents - commercial_cash_due_cents;
      if supplied_cash_cents <> cash_due_cents then
        raise exception using errcode = 'P0001', message = 'checkout:invalid-tender:Het cashdeel sluit niet aan op de verplichte 5-centafronding.';
      end if;
    elsif supplied_pin_cents <> remaining_cents then
      raise exception using errcode = 'P0001', message = 'checkout:invalid-tender:Deelbetalingen sluiten niet aan op het resterende bedrag.';
    end if;
  else
    if requested_method = 'Split' then
      raise exception using errcode = 'P0001', message = 'checkout:invalid-tender:Een splitbetaling vereist concrete deelbetalingen.';
    end if;
    if requested_method = 'Cadeaubon' and remaining_cents <> 0 then
      raise exception using errcode = 'P0001', message = 'checkout:invalid-tender:Kies Cash of PIN voor het resterende bedrag.';
    elsif requested_method = 'Cash' and remaining_cents > 0 then
      cash_payment_requested := true;
      commercial_cash_due_cents := remaining_cents;
      cash_due_cents := case
        when commercial_cash_due_cents <= 5 then commercial_cash_due_cents
        else ((commercial_cash_due_cents + 2) / 5) * 5
      end;
      rounding_adjustment_cents := cash_due_cents - commercial_cash_due_cents;
      supplied_cash_cents := cash_due_cents;
    elsif requested_method = 'PIN' and remaining_cents > 0 then
      supplied_pin_cents := remaining_cents;
    end if;
  end if;

  if cash_payment_requested and cash_due_cents > 300000 then
    raise exception using errcode = 'P0001', message = 'checkout:invalid-tender:Een cashbetaling mag maximaal €3.000,00 bedragen.';
  end if;
  if cash_payment_requested then
    tendered_cents := coalesce(tendered_cents, cash_due_cents);
    if tendered_cents < cash_due_cents then
      raise exception using errcode = 'P0001', message = 'checkout:invalid-tender:Ontvangen cashbedrag is lager dan het afgeronde cashbedrag.';
    end if;
    if tendered_cents > 300000 then
      raise exception using errcode = 'P0001', message = 'checkout:invalid-tender:Een cashbetaling mag maximaal €3.000,00 bedragen.';
    end if;
  elsif tendered_cents is not null then
    raise exception using errcode = 'P0001', message = 'checkout:invalid-tender:Een ontvangen cashbedrag kan alleen bij een cashbetaling worden opgegeven.';
  end if;

  settlement_total_cents := total_cents + rounding_adjustment_cents;
  if gift_card_total + supplied_pin_cents + supplied_cash_cents <> settlement_total_cents then
    raise exception using errcode = 'P0001', message = 'checkout:invalid-tender:Betaalmiddelen sluiten niet aan op het te vereffenen bedrag.';
  end if;
  if gift_card_total > 0 then tender_count := tender_count + 1; end if;
  if supplied_pin_cents > 0 then tender_count := tender_count + 1; end if;
  if supplied_cash_cents > 0 then tender_count := tender_count + 1; end if;
  if tender_count = 0 then
    raise exception using errcode = 'P0001', message = 'checkout:invalid-tender:Het totaalbedrag moet groter zijn dan nul.';
  end if;
  payment_method := case
    when cash_payment_requested and (gift_card_total > 0 or supplied_pin_cents > 0) then 'Split'
    when cash_payment_requested then 'Cash'
    when gift_card_total > 0 and supplied_pin_cents > 0 then 'Split'
    when gift_card_total > 0 then 'Cadeaubon'
    else 'PIN'
  end;$replacement$;
  tender_needle text := $needle$  if remaining_cents > 0 then
    insert into public.transaction_tenders (store_id, transaction_id, method, amount_cents)
    values (target_store_id, transaction_id, requested_method, remaining_cents);
  end if;$needle$;
  tender_replacement text := $replacement$  if supplied_pin_cents > 0 then
    insert into public.transaction_tenders (store_id, transaction_id, method, amount_cents)
    values (target_store_id, transaction_id, 'PIN', supplied_pin_cents);
  end if;
  if supplied_cash_cents > 0 then
    insert into public.transaction_tenders (store_id, transaction_id, method, amount_cents)
    values (target_store_id, transaction_id, 'Cash', supplied_cash_cents);
  end if;$replacement$;
  columns_needle text := $needle$    document_request, invoice_number, invoice_issued_at, register_id, shift_id$needle$;
  columns_replacement text := $replacement$    document_request, invoice_number, invoice_issued_at, rounding_adjustment_cents, register_id, shift_id$replacement$;
  values_needle text := $needle$    invoice_number, case when invoice_number is null then null else checkout_at end,
    target_register_id, shift_id$needle$;
  values_replacement text := $replacement$    invoice_number, case when invoice_number is null then null else checkout_at end,
    rounding_adjustment_cents, target_register_id, shift_id$replacement$;
  audit_needle text := $needle$      'giftCardCents', gift_card_total$needle$;
  audit_replacement text := $replacement$      'giftCardCents', gift_card_total,
      'cashRoundingAdjustmentCents', rounding_adjustment_cents,
      'settlementTotalCents', settlement_total_cents$replacement$;
  return_needle text := $needle$    'document_number', document_number,
    'duplicate', false$needle$;
  return_replacement text := $replacement$    'document_number', document_number,
    'rounding_adjustment_cents', rounding_adjustment_cents,
    'duplicate', false$replacement$;
begin
  if to_regprocedure('public.checkout_sale_v1(uuid,jsonb)') is null then
    raise exception 'checkout_sale_v1 is required before cash rounding can be installed.';
  end if;
  select pg_get_functiondef('public.checkout_sale_v1(uuid,jsonb)'::regprocedure)
    into strict definition;
  if position('cash_rounding_split_tenders_v1' in definition) > 0 then
    return;
  end if;
  rewritten := replace(definition, declaration_needle, declaration_replacement);
  if rewritten = definition then raise exception 'Could not patch checkout_sale_v1 declarations.'; end if;
  definition := rewritten;
  rewritten := replace(definition, method_needle, method_replacement);
  if rewritten = definition then raise exception 'Could not patch checkout_sale_v1 payment methods.'; end if;
  definition := rewritten;
  rewritten := replace(definition, payment_needle, payment_replacement);
  if rewritten = definition then raise exception 'Could not patch checkout_sale_v1 tender validation.'; end if;
  definition := rewritten;
  rewritten := replace(definition, tender_needle, tender_replacement);
  if rewritten = definition then raise exception 'Could not patch checkout_sale_v1 tender inserts.'; end if;
  definition := rewritten;
  rewritten := replace(definition, columns_needle, columns_replacement);
  if rewritten = definition then raise exception 'Could not patch checkout_sale_v1 transaction columns.'; end if;
  definition := rewritten;
  rewritten := replace(definition, values_needle, values_replacement);
  if rewritten = definition then raise exception 'Could not patch checkout_sale_v1 transaction values.'; end if;
  definition := rewritten;
  rewritten := replace(definition, audit_needle, audit_replacement);
  if rewritten = definition then raise exception 'Could not patch checkout_sale_v1 audit payload.'; end if;
  definition := rewritten;
  rewritten := replace(definition, return_needle, return_replacement);
  if rewritten = definition then raise exception 'Could not patch checkout_sale_v1 response.'; end if;
  execute definition;
end;
$migration$;

-- A server-side Z close must reconcile tender rows against cash-settled totals,
-- otherwise any properly rounded sale would be rejected during day close.
do $migration$
declare
  definition text;
  rewritten text;
  declaration_needle text := $needle$  v_total_discount_cents bigint := 0;$needle$;
  declaration_replacement text := $replacement$  v_total_discount_cents bigint := 0;
  v_total_cash_rounding_adjustment_cents bigint := 0;$replacement$;
  integrity_needle text := $needle$      and (tender_check.tender_count = 0 or tender_check.tender_total <> transaction.total_cents)$needle$;
  integrity_replacement text := $replacement$      and (tender_check.tender_count = 0 or tender_check.tender_total <> transaction.total_cents + transaction.rounding_adjustment_cents)$replacement$;
  line_needle text := $needle$           transaction.discount_cents,
           transaction.direction,$needle$;
  line_replacement text := $replacement$           transaction.discount_cents,
           transaction.rounding_adjustment_cents,
           transaction.direction,$replacement$;
  group_needle text := $needle$             transaction.vat_21_cents, transaction.discount_cents, transaction.direction$needle$;
  group_replacement text := $replacement$             transaction.vat_21_cents, transaction.discount_cents,
             transaction.rounding_adjustment_cents, transaction.direction$replacement$;
  aggregate_needle text := $needle$         coalesce(sum(allocation.discount_cents), 0)$needle$;
  aggregate_replacement text := $replacement$         coalesce(sum(allocation.discount_cents), 0),
         coalesce(sum(allocation.rounding_adjustment_cents), 0)$replacement$;
  into_needle text := $needle$         v_total_discount_cents$needle$;
  into_replacement text := $replacement$         v_total_discount_cents,
         v_total_cash_rounding_adjustment_cents$replacement$;
  totals_needle text := $needle$    'totalDiscountCents', v_total_discount_cents,
    'paymentTotalsCents',$needle$;
  totals_replacement text := $replacement$    'totalDiscountCents', v_total_discount_cents,
    'totalCashRoundingAdjustmentCents', v_total_cash_rounding_adjustment_cents,
    'paymentTotalsCents',$replacement$;
begin
  select pg_get_functiondef('public.finalize_daily_report(uuid,jsonb)'::regprocedure)
    into strict definition;
  if position('v_total_cash_rounding_adjustment_cents' in definition) > 0 then
    return;
  end if;
  rewritten := replace(definition, declaration_needle, declaration_replacement);
  if rewritten = definition then raise exception 'Could not patch Z-report rounding declaration.'; end if;
  definition := rewritten;
  rewritten := replace(definition, integrity_needle, integrity_replacement);
  if rewritten = definition then raise exception 'Could not patch Z-report tender invariant.'; end if;
  definition := rewritten;
  rewritten := replace(definition, line_needle, line_replacement);
  if rewritten = definition then raise exception 'Could not patch Z-report rounding source.'; end if;
  definition := rewritten;
  rewritten := replace(definition, group_needle, group_replacement);
  if rewritten = definition then raise exception 'Could not patch Z-report rounding grouping.'; end if;
  definition := rewritten;
  rewritten := replace(definition, aggregate_needle, aggregate_replacement);
  if rewritten = definition then raise exception 'Could not patch Z-report rounding aggregate.'; end if;
  definition := rewritten;
  rewritten := replace(definition, into_needle, into_replacement);
  if rewritten = definition then raise exception 'Could not patch Z-report rounding target.'; end if;
  definition := rewritten;
  rewritten := replace(definition, totals_needle, totals_replacement);
  if rewritten = definition then raise exception 'Could not patch Z-report rounding totals.'; end if;
  execute definition;
end;
$migration$;

-- Surface the immutable rounding value in the detailed Z-report transaction
-- payload, so an auditor can reconcile commercial total, settlement and cash.
do $migration$
declare
  definition text;
  rewritten text;
  detail_needle text := $needle$        'totalCents', transaction.total_cents,
        'vat12Cents',$needle$;
  detail_replacement text := $replacement$        'totalCents', transaction.total_cents,
        'roundingAdjustmentCents', transaction.rounding_adjustment_cents,
        'vat12Cents',$replacement$;
begin
  select pg_get_functiondef('public.get_daily_report_detail(uuid,uuid)'::regprocedure)
    into strict definition;
  if position('''roundingAdjustmentCents''' in definition) > 0 then
    return;
  end if;
  rewritten := replace(definition, detail_needle, detail_replacement);
  if rewritten = definition then raise exception 'Could not patch detailed Z-report rounding payload.'; end if;
  execute rewritten;
end;
$migration$;
