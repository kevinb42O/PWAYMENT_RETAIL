-- Repair the already-deployed checkout function without duplicating its large
-- body. On a clean rebuild the source is already corrected, so this is a no-op
-- replacement; on the linked project it renames the ambiguous local variable.
do $repair$
declare
  function_definition text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.checkout_sale(uuid,jsonb)'::regprocedure
  ) into function_definition;

  function_definition := replace(function_definition,
    'occurred_at timestamptz := clock_timestamp();',
    'checkout_at timestamptz := clock_timestamp();');
  function_definition := replace(function_definition,
    'card_record.expires_at < occurred_at',
    'card_record.expires_at < checkout_at');
  function_definition := replace(function_definition,
    'target_store_id, target_register_id, shift_number, occurred_at, actor_id',
    'target_store_id, target_register_id, shift_number, checkout_at, actor_id');
  function_definition := replace(function_definition,
    '''pos-'' || extract(year from occurred_at)::integer',
    '''pos-'' || extract(year from checkout_at)::integer');
  function_definition := replace(function_definition,
    'extract(year from occurred_at) = extract(year from clock_timestamp())',
    'extract(year from public.transactions.occurred_at) = extract(year from checkout_at)');
  function_definition := replace(function_definition,
    '''POS-'' || extract(year from occurred_at)::integer',
    '''POS-'' || extract(year from checkout_at)::integer');
  function_definition := replace(function_definition,
    'tendered_cents, payment_method, occurred_at, false',
    'tendered_cents, payment_method, checkout_at, false');
  function_definition := replace(function_definition,
    'occurred_at, transaction_id, actor_id, actor_name',
    'checkout_at, transaction_id, actor_id, actor_name');
  function_definition := replace(function_definition,
    '(line_record.value ->> ''balance_after_cents'')::bigint, occurred_at',
    '(line_record.value ->> ''balance_after_cents'')::bigint, checkout_at');
  function_definition := replace(function_definition,
    'last_visit_at = occurred_at',
    'last_visit_at = checkout_at');
  function_definition := replace(function_definition,
    'target_store_id, occurred_at, actor_id, actor_name, ''checkout''',
    'target_store_id, checkout_at, actor_id, actor_name, ''checkout''');

  execute function_definition;
end;
$repair$;
