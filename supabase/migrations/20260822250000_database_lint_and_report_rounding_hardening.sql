begin;

-- The cash-rounding aggregate was present in the authoritative v3 close, but
-- one production deployment predated the final source patch that exposed it
-- in the immutable totals/hash payload. Patch only the missing key so existing
-- report rows and their historic hash chain remain untouched.
do $retail_report_rounding$
declare
  definition text;
  rewritten text;
  totals_needle text := $needle$'totalDiscountCents', v_total_discount_cents,
    'paymentTotalsCents',$needle$;
  totals_replacement text := $replacement$'totalDiscountCents', v_total_discount_cents,
    'totalCashRoundingAdjustmentCents', v_total_cash_rounding_adjustment_cents,
    'paymentTotalsCents',$replacement$;
begin
  select pg_catalog.pg_get_functiondef('public.finalize_daily_report_v3(uuid,jsonb)'::regprocedure)
    into strict definition;

  if position('totalCashRoundingAdjustmentCents' in definition) = 0 then
    rewritten := replace(definition, totals_needle, totals_replacement);
    if rewritten = definition then
      raise exception 'Could not expose cash rounding in the v3 daily-report totals.';
    end if;
    execute rewritten;
  end if;
end;
$retail_report_rounding$;

-- These loop variables are created automatically by PL/pgSQL. The explicit
-- declarations were unused and shadowed, which obscured lint output without
-- changing runtime behaviour.
do $remove_shadowed_loop_declarations$
declare
  target record;
  definition text;
  rewritten text;
begin
  for target in
    select *
    from (values
      ('public.save_workforce_pattern_internal(uuid,jsonb)'::regprocedure, E'declare target_weekday integer;\n'),
      ('private.ensure_workforce_defaults(uuid)'::regprocedure, E' target_year integer;\n'),
      ('private.receipt_luhn_check_digit(text)'::regprocedure, E' idx integer;\n')
    ) as declarations(function_oid, declaration)
  loop
    select pg_catalog.pg_get_functiondef(target.function_oid)
      into strict definition;
    if position(target.declaration in definition) > 0 then
      rewritten := replace(definition, target.declaration, '');
      if rewritten = definition then
        raise exception 'Could not remove shadowed loop declaration from %.', target.function_oid;
      end if;
      execute rewritten;
    end if;
  end loop;
end;
$remove_shadowed_loop_declarations$;

-- This guard only reads the authenticated platform membership and MFA claim.
-- Declaring that property at the guard itself lets all read-only callers retain
-- their correct STABLE classification.
alter function private.require_platform_scope(text, boolean) stable;

do $retail_lint_assertions$
declare
  definition text;
  target record;
begin
  select pg_catalog.pg_get_functiondef('public.finalize_daily_report_v3(uuid,jsonb)'::regprocedure)
    into strict definition;
  if position('totalCashRoundingAdjustmentCents' in definition) = 0 then
    raise exception 'Daily-report cash-rounding total was not installed.';
  end if;

  for target in
    select *
    from (values
      ('public.save_workforce_pattern_internal(uuid,jsonb)'::regprocedure, 'target_weekday integer;'),
      ('private.ensure_workforce_defaults(uuid)'::regprocedure, 'target_year integer;'),
      ('private.receipt_luhn_check_digit(text)'::regprocedure, 'idx integer;')
    ) as declarations(function_oid, declaration)
  loop
    select pg_catalog.pg_get_functiondef(target.function_oid)
      into strict definition;
    if position(target.declaration in definition) > 0 then
      raise exception 'Shadowed declaration remains in %.', target.function_oid;
    end if;
  end loop;

  if not exists (
    select 1
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'private'
      and procedure.proname = 'require_platform_scope'
      and pg_catalog.pg_get_function_identity_arguments(procedure.oid) = 'required_scope text, require_mfa boolean'
      and procedure.provolatile = 's'
  ) then
    raise exception 'Platform scope guard is not STABLE.';
  end if;
end;
$retail_lint_assertions$;

commit;
