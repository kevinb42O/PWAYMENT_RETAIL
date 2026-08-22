-- Generic Belgian retail VAT (0%, 6%, 12%, 21%).
--
-- This is deliberately an additive, rolling-safe migration. Historic rows and
-- their existing report hashes remain readable through the legacy 12/21
-- projections; every new server-side sale/refund persists a complete immutable
-- VAT snapshot. The public checkout and refund wrappers remain in place.

begin;

alter table public.transactions
  add column if not exists vat_0_cents bigint not null default 0,
  add column if not exists vat_6_cents bigint not null default 0,
  add column if not exists vat_breakdown jsonb not null default '[]'::jsonb,
  add column if not exists vat_snapshot_version smallint not null default 0;

-- Existing rows receive version 0 through the fast column default. Any row
-- that already contains a complete snapshot (for example after retrying an
-- interrupted deployment) is promoted before version 1 becomes the default.
update public.transactions
set vat_snapshot_version = 1
where vat_snapshot_version = 0
  and pg_catalog.jsonb_typeof(vat_breakdown) = 'array'
  and pg_catalog.jsonb_array_length(vat_breakdown) > 0;

alter table public.transactions
  alter column vat_snapshot_version set default 1;

comment on column public.transactions.vat_breakdown is
  'Immutable legal VAT snapshot by rate. New retail rows use only 0, 6, 12 and 21 percent.';

create or replace function private.is_valid_retail_vat_breakdown(
  candidate jsonb,
  snapshot_version smallint,
  expected_total_cents bigint,
  expected_vat_0_cents bigint,
  expected_vat_6_cents bigint,
  expected_vat_12_cents bigint,
  expected_vat_21_cents bigint
)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  line jsonb;
  rate integer;
  gross_cents bigint;
  excl_cents bigint;
  vat_cents bigint;
  seen_rates integer[] := array[]::integer[];
  gross_total bigint := 0;
  vat_0 bigint := 0;
  vat_6 bigint := 0;
  vat_12 bigint := 0;
  vat_21 bigint := 0;
begin
  if pg_catalog.jsonb_typeof(candidate) <> 'array' then
    return false;
  end if;

  if snapshot_version not in (0, 1) then
    return false;
  end if;

  -- Rows written before this migration had no VAT snapshot. They remain
  -- readable without rewriting closed, hash-chained history. New RPC-created
  -- sales/refunds always contain one or more snapshot lines. In particular,
  -- an empty legacy snapshot can never be used to introduce 0% or 6% VAT.
  if pg_catalog.jsonb_array_length(candidate) = 0 then
    return snapshot_version = 0
      and expected_vat_0_cents = 0
      and expected_vat_6_cents = 0;
  end if;

  if snapshot_version <> 1 then
    return false;
  end if;

  for line in select value from pg_catalog.jsonb_array_elements(candidate)
  loop
    begin
      rate := (line ->> 'rate')::integer;
      gross_cents := (line ->> 'grossCents')::bigint;
      excl_cents := (line ->> 'exclCents')::bigint;
      vat_cents := (line ->> 'vatCents')::bigint;
    exception when invalid_text_representation or numeric_value_out_of_range then
      return false;
    end;
    if rate is null
       or gross_cents is null
       or excl_cents is null
       or vat_cents is null
       or rate not in (0, 6, 12, 21)
       or rate = any(seen_rates)
       or gross_cents <> excl_cents + vat_cents
       or (rate = 0 and vat_cents <> 0) then
      return false;
    end if;
    seen_rates := array_append(seen_rates, rate);
    gross_total := gross_total + gross_cents;
    case rate
      when 0 then vat_0 := vat_cents;
      when 6 then vat_6 := vat_cents;
      when 12 then vat_12 := vat_cents;
      when 21 then vat_21 := vat_cents;
    end case;
  end loop;

  return coalesce(
    gross_total = expected_total_cents
    and vat_0 = expected_vat_0_cents
    and vat_6 = expected_vat_6_cents
    and vat_12 = expected_vat_12_cents
    and vat_21 = expected_vat_21_cents,
    false
  );
end;
$$;

alter table public.transactions
  drop constraint if exists transactions_retail_vat_breakdown_check;
alter table public.transactions
  add constraint transactions_retail_vat_breakdown_check
  check (private.is_valid_retail_vat_breakdown(
    vat_breakdown,
    vat_snapshot_version,
    total_cents,
    vat_0_cents,
    vat_6_cents,
    vat_12_cents,
    vat_21_cents
  )) not valid;

-- checkout_sale_v1 is the trusted implementation behind the receipt and
-- discount-approval wrappers. Patch that implementation rather than bypassing
-- the wrappers, so its stock, cash-rounding, invoice and idempotency guarantees
-- remain identical for every VAT rate.
do $retail_generic_checkout$
declare
  definition text;
  rewritten text;
  transaction_occurrences integer;
  declaration_needle text := $needle$  subtotal_12 bigint := 0;
  subtotal_21 bigint := 0;$needle$;
  declaration_replacement text := $replacement$  -- retail_generic_vat_v1
  subtotal_0 bigint := 0;
  subtotal_6 bigint := 0;
  subtotal_12 bigint := 0;
  subtotal_21 bigint := 0;$replacement$;
  discount_declaration_needle text := $needle$  discount_12 bigint := 0;
  discount_21 bigint := 0;
  discounted_12 bigint;
  discounted_21 bigint;
  vat_12_cents bigint;
  vat_21_cents bigint;$needle$;
  discount_declaration_replacement text := $replacement$  discount_0 bigint := 0;
  discount_6 bigint := 0;
  discount_12 bigint := 0;
  discount_21 bigint := 0;
  discounted_0 bigint;
  discounted_6 bigint;
  discounted_12 bigint;
  discounted_21 bigint;
  vat_0_cents bigint;
  vat_6_cents bigint;
  vat_12_cents bigint;
  vat_21_cents bigint;
  vat_breakdown jsonb;
  discount_cents_left bigint;
  discount_bucket record;$replacement$;
  vat_validation_needle text := $needle$    if product_record.vat_rate not in (12, 21) then
      raise exception using errcode = 'P0001', message = 'checkout:unsupported-vat:Enkel 12% en 21% BTW zijn toegelaten.';
    end if;$needle$;
  vat_validation_replacement text := $replacement$    if product_record.vat_rate not in (0, 6, 12, 21) then
      raise exception using errcode = 'P0001', message = 'checkout:unsupported-vat:Enkel 0%, 6%, 12% en 21% BTW zijn toegelaten.';
    end if;$replacement$;
  line_bucket_needle text := $needle$    if product_record.vat_rate = 12 then
      subtotal_12 := subtotal_12 + line_total_cents;
    else
      subtotal_21 := subtotal_21 + line_total_cents;
    end if;$needle$;
  line_bucket_replacement text := $replacement$    case product_record.vat_rate::integer
      when 0 then subtotal_0 := subtotal_0 + line_total_cents;
      when 6 then subtotal_6 := subtotal_6 + line_total_cents;
      when 12 then subtotal_12 := subtotal_12 + line_total_cents;
      when 21 then subtotal_21 := subtotal_21 + line_total_cents;
    end case;$replacement$;
  totals_needle text := $needle$  subtotal_cents := subtotal_12 + subtotal_21;
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
  total_cents := discounted_12 + discounted_21;$needle$;
  totals_replacement text := $replacement$  subtotal_cents := subtotal_0 + subtotal_6 + subtotal_12 + subtotal_21;
  discount_cents := least(requested_discount, subtotal_cents);
  if subtotal_cents > 0 and discount_cents > 0 then
    discount_0 := (discount_cents * subtotal_0) / subtotal_cents;
    discount_6 := (discount_cents * subtotal_6) / subtotal_cents;
    discount_12 := (discount_cents * subtotal_12) / subtotal_cents;
    discount_21 := (discount_cents * subtotal_21) / subtotal_cents;
    discount_cents_left := discount_cents - discount_0 - discount_6 - discount_12 - discount_21;
    for discount_bucket in
      select * from (values
        (0, (discount_cents * subtotal_0) % subtotal_cents),
        (6, (discount_cents * subtotal_6) % subtotal_cents),
        (12, (discount_cents * subtotal_12) % subtotal_cents),
        (21, (discount_cents * subtotal_21) % subtotal_cents)
      ) as bucket(rate, remainder)
      order by remainder desc, rate asc
    loop
      exit when discount_cents_left <= 0;
      case discount_bucket.rate
        when 0 then discount_0 := discount_0 + 1;
        when 6 then discount_6 := discount_6 + 1;
        when 12 then discount_12 := discount_12 + 1;
        when 21 then discount_21 := discount_21 + 1;
      end case;
      discount_cents_left := discount_cents_left - 1;
    end loop;
  end if;
  discounted_0 := subtotal_0 - discount_0;
  discounted_6 := subtotal_6 - discount_6;
  discounted_12 := subtotal_12 - discount_12;
  discounted_21 := subtotal_21 - discount_21;
  vat_0_cents := 0;
  vat_6_cents := discounted_6 - round(discounted_6::numeric / 1.06)::bigint;
  vat_12_cents := discounted_12 - round(discounted_12::numeric / 1.12)::bigint;
  vat_21_cents := discounted_21 - round(discounted_21::numeric / 1.21)::bigint;
  total_cents := discounted_0 + discounted_6 + discounted_12 + discounted_21;
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'rate', rate,
    'grossCents', gross_cents,
    'exclCents', excl_cents,
    'vatCents', vat_cents
  ) order by rate), '[]'::jsonb)
    into vat_breakdown
  from (values
    (0, discounted_0, discounted_0, vat_0_cents),
    (6, discounted_6, discounted_6 - vat_6_cents, vat_6_cents),
    (12, discounted_12, discounted_12 - vat_12_cents, vat_12_cents),
    (21, discounted_21, discounted_21 - vat_21_cents, vat_21_cents)
  ) as tax_line(rate, gross_cents, excl_cents, vat_cents)
  where gross_cents <> 0;$replacement$;
  transaction_columns_needle text := $needle$    subtotal_cents, vat_12_cents, vat_21_cents, total_cents,$needle$;
  transaction_columns_replacement text := $replacement$    subtotal_cents, vat_0_cents, vat_6_cents, vat_12_cents, vat_21_cents, vat_breakdown, total_cents,$replacement$;
begin
  if to_regprocedure('public.checkout_sale_v1(uuid,jsonb)') is null then
    raise exception 'checkout_sale_v1 is required before generic retail VAT can be installed.';
  end if;
  select pg_get_functiondef('public.checkout_sale_v1(uuid,jsonb)'::regprocedure)
    into strict definition;
  if position('retail_generic_vat_v1' in definition) > 0 then
    return;
  end if;
  rewritten := replace(definition, declaration_needle, declaration_replacement);
  if rewritten = definition then raise exception 'Could not patch checkout VAT declarations.'; end if;
  definition := rewritten;
  rewritten := replace(definition, discount_declaration_needle, discount_declaration_replacement);
  if rewritten = definition then raise exception 'Could not patch checkout VAT variables.'; end if;
  definition := rewritten;
  rewritten := replace(definition, vat_validation_needle, vat_validation_replacement);
  if rewritten = definition then raise exception 'Could not patch checkout VAT validation.'; end if;
  definition := rewritten;
  rewritten := replace(definition, line_bucket_needle, line_bucket_replacement);
  if rewritten = definition then raise exception 'Could not patch checkout VAT line buckets.'; end if;
  definition := rewritten;
  rewritten := replace(definition, totals_needle, totals_replacement);
  if rewritten = definition then raise exception 'Could not patch checkout VAT totals.'; end if;
  definition := rewritten;

  -- The checkout INSERT uses the same expression list for its columns and
  -- values. PostgreSQL replace() updates every occurrence, so require exactly
  -- those two anchors and patch them together.
  transaction_occurrences :=
    (char_length(definition) - char_length(replace(definition, transaction_columns_needle, '')))
    / char_length(transaction_columns_needle);
  if transaction_occurrences <> 2 then
    raise exception 'Could not safely patch checkout VAT transaction fields (found % anchors).', transaction_occurrences;
  end if;
  rewritten := replace(definition, transaction_columns_needle, transaction_columns_replacement);
  execute rewritten;
end;
$retail_generic_checkout$;

-- Refunds must calculate the same rate buckets as sales and preserve their
-- sign. This keeps a partial return's VAT, stock and tender ledger exact.
do $retail_generic_refund$
declare
  definition text;
  rewritten text;
  declaration_needle text := $needle$  selected_subtotal_12 bigint := 0;
  selected_subtotal_21 bigint := 0;$needle$;
  declaration_replacement text := $replacement$  -- retail_generic_refund_v1
  selected_subtotal_0 bigint := 0;
  selected_subtotal_6 bigint := 0;
  selected_subtotal_12 bigint := 0;
  selected_subtotal_21 bigint := 0;$replacement$;
  discount_declaration_needle text := $needle$  discount_12 bigint := 0;
  discount_21 bigint := 0;
  discounted_12 bigint;
  discounted_21 bigint;
  refund_vat_12 bigint;
  refund_vat_21 bigint;$needle$;
  discount_declaration_replacement text := $replacement$  discount_0 bigint := 0;
  discount_6 bigint := 0;
  discount_12 bigint := 0;
  discount_21 bigint := 0;
  discounted_0 bigint;
  discounted_6 bigint;
  discounted_12 bigint;
  discounted_21 bigint;
  refund_vat_0 bigint;
  refund_vat_6 bigint;
  refund_vat_12 bigint;
  refund_vat_21 bigint;
  refund_vat_breakdown jsonb;
  discount_cents_left bigint;
  discount_bucket record;$replacement$;
  line_bucket_needle text := $needle$      if original_line.vat_rate = 12 then
        selected_subtotal_12 := selected_subtotal_12 + original_line.unit_price_cents * requested_quantity;
      elsif original_line.vat_rate = 21 then
        selected_subtotal_21 := selected_subtotal_21 + original_line.unit_price_cents * requested_quantity;
      else
        raise exception using errcode = 'P0001', message = 'refund:unsupported-vat:De oorspronkelijke BTW kan niet worden geboekt.';
      end if;$needle$;
  line_bucket_replacement text := $replacement$      case original_line.vat_rate::integer
        when 0 then selected_subtotal_0 := selected_subtotal_0 + original_line.unit_price_cents * requested_quantity;
        when 6 then selected_subtotal_6 := selected_subtotal_6 + original_line.unit_price_cents * requested_quantity;
        when 12 then selected_subtotal_12 := selected_subtotal_12 + original_line.unit_price_cents * requested_quantity;
        when 21 then selected_subtotal_21 := selected_subtotal_21 + original_line.unit_price_cents * requested_quantity;
        else raise exception using errcode = 'P0001', message = 'refund:unsupported-vat:De oorspronkelijke BTW kan niet worden geboekt.';
      end case;$replacement$;
  subtotal_needle text := $needle$  selected_subtotal := selected_subtotal_12 + selected_subtotal_21;$needle$;
  subtotal_replacement text := $replacement$  selected_subtotal := selected_subtotal_0 + selected_subtotal_6 + selected_subtotal_12 + selected_subtotal_21;$replacement$;
  totals_needle text := $needle$  if refund_discount > 0 then
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
  refund_total := discounted_12 + discounted_21;$needle$;
  totals_replacement text := $replacement$  if refund_discount > 0 then
    discount_0 := (refund_discount * selected_subtotal_0) / selected_subtotal;
    discount_6 := (refund_discount * selected_subtotal_6) / selected_subtotal;
    discount_12 := (refund_discount * selected_subtotal_12) / selected_subtotal;
    discount_21 := (refund_discount * selected_subtotal_21) / selected_subtotal;
    discount_cents_left := refund_discount - discount_0 - discount_6 - discount_12 - discount_21;
    for discount_bucket in
      select * from (values
        (0, (refund_discount * selected_subtotal_0) % selected_subtotal),
        (6, (refund_discount * selected_subtotal_6) % selected_subtotal),
        (12, (refund_discount * selected_subtotal_12) % selected_subtotal),
        (21, (refund_discount * selected_subtotal_21) % selected_subtotal)
      ) as bucket(rate, remainder)
      order by remainder desc, rate asc
    loop
      exit when discount_cents_left <= 0;
      case discount_bucket.rate
        when 0 then discount_0 := discount_0 + 1;
        when 6 then discount_6 := discount_6 + 1;
        when 12 then discount_12 := discount_12 + 1;
        when 21 then discount_21 := discount_21 + 1;
      end case;
      discount_cents_left := discount_cents_left - 1;
    end loop;
  end if;
  discounted_0 := selected_subtotal_0 - discount_0;
  discounted_6 := selected_subtotal_6 - discount_6;
  discounted_12 := selected_subtotal_12 - discount_12;
  discounted_21 := selected_subtotal_21 - discount_21;
  refund_vat_0 := 0;
  refund_vat_6 := discounted_6 - round(discounted_6::numeric / 1.06)::bigint;
  refund_vat_12 := discounted_12 - round(discounted_12::numeric / 1.12)::bigint;
  refund_vat_21 := discounted_21 - round(discounted_21::numeric / 1.21)::bigint;
  refund_total := discounted_0 + discounted_6 + discounted_12 + discounted_21;
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'rate', rate,
    'grossCents', -gross_cents,
    'exclCents', -excl_cents,
    'vatCents', -vat_cents
  ) order by rate), '[]'::jsonb)
    into refund_vat_breakdown
  from (values
    (0, discounted_0, discounted_0, refund_vat_0),
    (6, discounted_6, discounted_6 - refund_vat_6, refund_vat_6),
    (12, discounted_12, discounted_12 - refund_vat_12, refund_vat_12),
    (21, discounted_21, discounted_21 - refund_vat_21, refund_vat_21)
  ) as tax_line(rate, gross_cents, excl_cents, vat_cents)
  where gross_cents <> 0;$replacement$;
  transaction_columns_needle text := $needle$    subtotal_cents, vat_12_cents, vat_21_cents, total_cents,$needle$;
  transaction_columns_replacement text := $replacement$    subtotal_cents, vat_0_cents, vat_6_cents, vat_12_cents, vat_21_cents, vat_breakdown, total_cents,$replacement$;
  transaction_values_needle text := $needle$    -selected_subtotal, -refund_vat_12, -refund_vat_21, -refund_total,$needle$;
  transaction_values_replacement text := $replacement$    -selected_subtotal, -refund_vat_0, -refund_vat_6, -refund_vat_12, -refund_vat_21, refund_vat_breakdown, -refund_total,$replacement$;
begin
  if to_regprocedure('public.refund_sale_v1(uuid,jsonb)') is null then
    raise exception 'refund_sale_v1 is required before generic retail VAT can be installed.';
  end if;
  select pg_get_functiondef('public.refund_sale_v1(uuid,jsonb)'::regprocedure)
    into strict definition;
  if position('retail_generic_refund_v1' in definition) > 0 then
    return;
  end if;
  rewritten := replace(definition, declaration_needle, declaration_replacement);
  if rewritten = definition then raise exception 'Could not patch refund VAT declarations.'; end if;
  definition := rewritten;
  rewritten := replace(definition, discount_declaration_needle, discount_declaration_replacement);
  if rewritten = definition then raise exception 'Could not patch refund VAT variables.'; end if;
  definition := rewritten;
  rewritten := replace(definition, line_bucket_needle, line_bucket_replacement);
  if rewritten = definition then raise exception 'Could not patch refund VAT line buckets.'; end if;
  definition := rewritten;
  rewritten := replace(definition, subtotal_needle, subtotal_replacement);
  if rewritten = definition then raise exception 'Could not patch refund VAT subtotal.'; end if;
  definition := rewritten;
  rewritten := replace(definition, totals_needle, totals_replacement);
  if rewritten = definition then raise exception 'Could not patch refund VAT totals.'; end if;
  definition := rewritten;
  rewritten := replace(definition, transaction_columns_needle, transaction_columns_replacement);
  if rewritten = definition then raise exception 'Could not patch refund VAT columns.'; end if;
  definition := rewritten;
  rewritten := replace(definition, transaction_values_needle, transaction_values_replacement);
  if rewritten = definition then raise exception 'Could not patch refund VAT values.'; end if;
  execute rewritten;
end;
$retail_generic_refund$;

-- Snapshot rows feed historical Z-report detail, PDF exports and product-level
-- reconciliation. Make their rate-to-VAT target mapping generic before a new
-- report can link a transaction.
do $retail_generic_snapshot$
declare
  definition text;
  rewritten text;
  source_needle text := $needle$           abs(transaction.vat_12_cents)::bigint as transaction_vat_12_cents,
           abs(transaction.vat_21_cents)::bigint as transaction_vat_21_cents,$needle$;
  source_replacement text := $replacement$           -- retail_generic_snapshot_v1
           abs(transaction.vat_0_cents)::bigint as transaction_vat_0_cents,
           abs(transaction.vat_6_cents)::bigint as transaction_vat_6_cents,
           abs(transaction.vat_12_cents)::bigint as transaction_vat_12_cents,
           abs(transaction.vat_21_cents)::bigint as transaction_vat_21_cents,$replacement$;
  target_needle text := $needle$           case when vat_rate = 12 then transaction_vat_12_cents
                when vat_rate = 21 then transaction_vat_21_cents
                else 0 end::bigint as target_vat_cents$needle$;
  target_replacement text := $replacement$           case when vat_rate = 0 then transaction_vat_0_cents
                when vat_rate = 6 then transaction_vat_6_cents
                when vat_rate = 12 then transaction_vat_12_cents
                when vat_rate = 21 then transaction_vat_21_cents
                else 0 end::bigint as target_vat_cents$replacement$;
begin
  if to_regprocedure('private.snapshot_daily_report_transaction(uuid,uuid,uuid)') is null then
    raise exception 'daily report snapshot function is required before generic retail VAT can be installed.';
  end if;
  select pg_get_functiondef('private.snapshot_daily_report_transaction(uuid,uuid,uuid)'::regprocedure)
    into strict definition;
  if position('retail_generic_snapshot_v1' in definition) > 0 then
    return;
  end if;
  rewritten := replace(definition, source_needle, source_replacement);
  if rewritten = definition then raise exception 'Could not patch daily report VAT snapshot source.'; end if;
  definition := rewritten;
  rewritten := replace(definition, target_needle, target_replacement);
  if rewritten = definition then raise exception 'Could not patch daily report VAT snapshot mapping.'; end if;
  execute rewritten;
end;
$retail_generic_snapshot$;

-- Let the existing authoritative close retain all its cash/shift/ledger locks
-- and validation. The new wrapper upgrades the immutable report totals and
-- hash to v4 after that close, using stored per-transaction VAT snapshots.
do $retail_generic_report_wrapper$
begin
  if to_regprocedure('public.finalize_daily_report_v3(uuid,jsonb)') is null
     and to_regprocedure('public.finalize_daily_report(uuid,jsonb)') is not null then
    alter function public.finalize_daily_report(uuid, jsonb)
      rename to finalize_daily_report_v3;
  end if;
end;
$retail_generic_report_wrapper$;

create or replace function public.finalize_daily_report(
  target_store_id uuid,
  payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
  report_id uuid;
  report_row public.daily_reports%rowtype;
  total_vat_0_cents bigint := 0;
  total_vat_6_cents bigint := 0;
  total_vat_12_cents bigint := 0;
  total_vat_21_cents bigint := 0;
  total_excl_vat_0_cents bigint := 0;
  total_excl_vat_6_cents bigint := 0;
  total_excl_vat_12_cents bigint := 0;
  total_excl_vat_21_cents bigint := 0;
  total_vat_breakdown jsonb := '[]'::jsonb;
  transaction_request_ids jsonb := '[]'::jsonb;
  gift_card_event_ids jsonb := '[]'::jsonb;
  upgraded_totals jsonb;
  hash_basis text;
  report_hash text;
begin
  if to_regprocedure('public.finalize_daily_report_v3(uuid,jsonb)') is null then
    raise exception 'finalize_daily_report_v3 is required before generic retail VAT can be installed.';
  end if;

  result := public.finalize_daily_report_v3(target_store_id, payload);
  if result is null then
    return null;
  end if;
  report_id := nullif(result ->> 'daily_report_id', '')::uuid;
  if report_id is null then
    raise exception using errcode = 'P0001', message = 'report:invalid-response:De server gaf geen rapport-ID terug.';
  end if;

  select * into report_row
  from public.daily_reports
  where store_id = target_store_id and id = report_id
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'report:not-found:Het net gesloten rapport ontbreekt.';
  end if;

  -- `vat_breakdown` is already signed for refunds, so aggregation gives the
  -- net legal VAT position of the closed register without a browser total.
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
           'rate', rate,
           'grossCents', gross_cents,
           'exclCents', excl_cents,
           'vatCents', vat_cents
         ) order by rate), '[]'::jsonb),
         coalesce(sum(vat_cents) filter (where rate = 0), 0),
         coalesce(sum(vat_cents) filter (where rate = 6), 0),
         coalesce(sum(vat_cents) filter (where rate = 12), 0),
         coalesce(sum(vat_cents) filter (where rate = 21), 0),
         coalesce(sum(excl_cents) filter (where rate = 0), 0),
         coalesce(sum(excl_cents) filter (where rate = 6), 0),
         coalesce(sum(excl_cents) filter (where rate = 12), 0),
         coalesce(sum(excl_cents) filter (where rate = 21), 0)
    into total_vat_breakdown,
         total_vat_0_cents, total_vat_6_cents, total_vat_12_cents, total_vat_21_cents,
         total_excl_vat_0_cents, total_excl_vat_6_cents,
         total_excl_vat_12_cents, total_excl_vat_21_cents
  from (
    select (line.value ->> 'rate')::integer as rate,
           sum((line.value ->> 'grossCents')::bigint)::bigint as gross_cents,
           sum((line.value ->> 'exclCents')::bigint)::bigint as excl_cents,
           sum((line.value ->> 'vatCents')::bigint)::bigint as vat_cents
    from public.daily_report_transactions link
    join public.transactions transaction_row
      on transaction_row.store_id = link.store_id
     and transaction_row.id = link.transaction_id
    cross join lateral pg_catalog.jsonb_array_elements(transaction_row.vat_breakdown) as line(value)
    where link.store_id = target_store_id
      and link.daily_report_id = report_id
    group by (line.value ->> 'rate')::integer
  ) rate_totals;

  if pg_catalog.jsonb_array_length(total_vat_breakdown) = 0 then
    -- No new-snapshot transaction entered this report. This is possible only
    -- for a historic queued close; preserve the v3 values and its hash chain.
    return result;
  end if;

  select coalesce(pg_catalog.jsonb_agg(transaction_row.client_request_id order by transaction_row.client_request_id), '[]'::jsonb)
    into transaction_request_ids
  from public.daily_report_transactions link
  join public.transactions transaction_row
    on transaction_row.store_id = link.store_id and transaction_row.id = link.transaction_id
  where link.store_id = target_store_id and link.daily_report_id = report_id;

  gift_card_event_ids := coalesce(report_row.totals -> 'giftCardEventIds', '[]'::jsonb);
  upgraded_totals := (report_row.totals - 'serverHashPayload') || pg_catalog.jsonb_build_object(
    'totalVat0Cents', total_vat_0_cents,
    'totalVat6Cents', total_vat_6_cents,
    'totalVat12Cents', total_vat_12_cents,
    'totalVat21Cents', total_vat_21_cents,
    'totalExclVat0Cents', total_excl_vat_0_cents,
    'totalExclVat6Cents', total_excl_vat_6_cents,
    'totalExclVat12Cents', total_excl_vat_12_cents,
    'totalExclVat21Cents', total_excl_vat_21_cents,
    'totalVatBreakdown', total_vat_breakdown,
    'hashPayloadVersion', 4
  );
  hash_basis := pg_catalog.jsonb_build_object(
    'version', 4,
    'storeId', target_store_id,
    'report', upgraded_totals,
    'previousHash', report_row.previous_hash,
    'transactionRequestIds', transaction_request_ids,
    'giftCardEventIds', gift_card_event_ids
  )::text;
  report_hash := encode(extensions.digest(hash_basis, 'sha256'), 'hex');
  upgraded_totals := upgraded_totals || pg_catalog.jsonb_build_object('serverHashPayload', hash_basis);

  update public.daily_reports
  set totals = upgraded_totals,
      hash = report_hash,
      hash_payload_version = 4
  where store_id = target_store_id and id = report_id;

  return result || pg_catalog.jsonb_build_object(
    'hash', report_hash,
    'hash_payload_version', 4,
    'calculation_authority', 'server'
  );
end;
$$;

revoke all on function public.finalize_daily_report(uuid, jsonb) from public, anon;
grant execute on function public.finalize_daily_report(uuid, jsonb) to authenticated;

-- Detailed report responses must carry the immutable transaction snapshot as
-- well, otherwise 0% and 6% lines would disappear when reprinting history.
do $retail_generic_report_detail$
declare
  definition text;
  rewritten text;
  detail_needle text := $needle$        'totalCents', transaction.total_cents,
        'roundingAdjustmentCents', transaction.rounding_adjustment_cents,
        'vat12Cents',$needle$;
  detail_replacement text := $replacement$        'totalCents', transaction.total_cents,
        'roundingAdjustmentCents', transaction.rounding_adjustment_cents,
        'vatBreakdown', transaction.vat_breakdown,
        'vat12Cents',$replacement$;
begin
  if to_regprocedure('public.get_daily_report_detail(uuid,uuid)') is null then
    raise exception 'get_daily_report_detail is required before generic retail VAT can be installed.';
  end if;
  select pg_get_functiondef('public.get_daily_report_detail(uuid,uuid)'::regprocedure)
    into strict definition;
  if position('''vatBreakdown'', transaction.vat_breakdown' in definition) > 0 then
    return;
  end if;
  rewritten := replace(definition, detail_needle, detail_replacement);
  if rewritten = definition then raise exception 'Could not patch detailed report VAT payload.'; end if;
  execute rewritten;
end;
$retail_generic_report_detail$;

create or replace function public.get_retail_platform_capabilities(target_store_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_store_member(target_store_id) then
    raise exception using errcode = '42501', message = 'retail-capabilities:not-authorized';
  end if;
  return pg_catalog.jsonb_build_object(
    'schemaVersion', 2,
    'retailOnly', true,
    'supportedVatRates', pg_catalog.jsonb_build_array(0, 6, 12, 21),
    'genericVatSnapshots', true,
    'serverAuthoritativeReports', true
  );
end;
$$;

revoke all on function public.get_retail_platform_capabilities(uuid) from public, anon;
grant execute on function public.get_retail_platform_capabilities(uuid) to authenticated;

-- Day summaries are consumed by the report history as well. Return the full
-- VAT matrix while retaining the 12/21 projections for older clients.
create or replace function public.get_daily_report_day_summaries(
  target_store_id uuid,
  business_timezone text default 'Europe/Brussels'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if not private.is_store_member(target_store_id) then
    raise exception using errcode = '42501', message = 'report:not-authorized';
  end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = business_timezone) then
    raise exception using errcode = '22023', message = 'report:invalid-timezone';
  end if;

  with report_base as (
    select report.*,
           (report.occurred_at at time zone business_timezone)::date as business_date,
           case when pg_catalog.jsonb_array_length(coalesce(report.totals -> 'totalVatBreakdown', '[]'::jsonb)) > 0
             then report.totals -> 'totalVatBreakdown'
             else pg_catalog.jsonb_build_array(
               pg_catalog.jsonb_build_object(
                 'rate', 12,
                 'grossCents', coalesce((report.totals ->> 'totalExclVat12Cents')::bigint, 0) + coalesce((report.totals ->> 'totalVat12Cents')::bigint, 0),
                 'exclCents', coalesce((report.totals ->> 'totalExclVat12Cents')::bigint, 0),
                 'vatCents', coalesce((report.totals ->> 'totalVat12Cents')::bigint, 0)
               ),
               pg_catalog.jsonb_build_object(
                 'rate', 21,
                 'grossCents', coalesce((report.totals ->> 'totalExclVat21Cents')::bigint, 0) + coalesce((report.totals ->> 'totalVat21Cents')::bigint, 0),
                 'exclCents', coalesce((report.totals ->> 'totalExclVat21Cents')::bigint, 0),
                 'vatCents', coalesce((report.totals ->> 'totalVat21Cents')::bigint, 0)
               )
             ) end as vat_breakdown
    from public.daily_reports report
    where report.store_id = target_store_id
  ), summary as (
    select business_date,
           count(*)::bigint as report_count,
           min(report_number)::bigint as first_report_number,
           max(report_number)::bigint as last_report_number,
           sum((select count(*) from public.daily_report_transactions link where link.store_id = report_base.store_id and link.daily_report_id = report_base.id))::bigint as transaction_count,
           sum(coalesce((totals ->> 'totalRevenueCents')::bigint, 0))::bigint as total_revenue_cents,
           sum(coalesce((totals ->> 'totalCostCents')::bigint, 0))::bigint as total_cost_cents,
           sum(coalesce((totals ->> 'grossProfitCents')::bigint, 0))::bigint as gross_profit_cents,
           sum(coalesce((totals ->> 'totalVat0Cents')::bigint, 0))::bigint as total_vat_0_cents,
           sum(coalesce((totals ->> 'totalVat6Cents')::bigint, 0))::bigint as total_vat_6_cents,
           sum(coalesce((totals ->> 'totalVat12Cents')::bigint, 0))::bigint as total_vat_12_cents,
           sum(coalesce((totals ->> 'totalVat21Cents')::bigint, 0))::bigint as total_vat_21_cents,
           sum(coalesce((totals -> 'paymentTotalsCents' ->> 'Cash')::bigint, 0))::bigint as cash_cents,
           sum(coalesce((totals -> 'paymentTotalsCents' ->> 'PIN')::bigint, 0))::bigint as pin_cents,
           sum(coalesce((totals -> 'paymentTotalsCents' ->> 'Cadeaubon')::bigint, 0))::bigint as gift_card_cents,
           sum(coalesce(cash_difference_cents, 0))::bigint as cash_difference_cents
    from report_base
    group by business_date
  ), per_rate as (
    select report_base.business_date,
           (line.value ->> 'rate')::integer as rate,
           sum((line.value ->> 'grossCents')::bigint)::bigint as gross_cents,
           sum((line.value ->> 'exclCents')::bigint)::bigint as excl_cents,
           sum((line.value ->> 'vatCents')::bigint)::bigint as vat_cents
    from report_base
    cross join lateral pg_catalog.jsonb_array_elements(report_base.vat_breakdown) as line(value)
    group by report_base.business_date, (line.value ->> 'rate')::integer
  ), vat_matrix as (
    select business_date,
           pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
             'rate', rate,
             'grossCents', gross_cents,
             'exclCents', excl_cents,
             'vatCents', vat_cents
           ) order by rate) as total_vat_breakdown
    from per_rate
    group by business_date
  )
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'date', summary.business_date,
    'reportCount', summary.report_count,
    'firstReportNumber', summary.first_report_number,
    'lastReportNumber', summary.last_report_number,
    'transactionCount', summary.transaction_count,
    'totalRevenueCents', summary.total_revenue_cents,
    'totalCostCents', summary.total_cost_cents,
    'grossProfitCents', summary.gross_profit_cents,
    'totalVat0Cents', summary.total_vat_0_cents,
    'totalVat6Cents', summary.total_vat_6_cents,
    'totalVat12Cents', summary.total_vat_12_cents,
    'totalVat21Cents', summary.total_vat_21_cents,
    'totalVatBreakdown', coalesce(vat_matrix.total_vat_breakdown, '[]'::jsonb),
    'cashCents', summary.cash_cents,
    'pinCents', summary.pin_cents,
    'giftCardCents', summary.gift_card_cents,
    'cashDifferenceCents', summary.cash_difference_cents
  ) order by summary.business_date desc), '[]'::jsonb)
  into result
  from summary
  left join vat_matrix using (business_date);
  return result;
end;
$$;

revoke all on function public.get_daily_report_day_summaries(uuid, text) from public, anon;
grant execute on function public.get_daily_report_day_summaries(uuid, text) to authenticated;

commit;
