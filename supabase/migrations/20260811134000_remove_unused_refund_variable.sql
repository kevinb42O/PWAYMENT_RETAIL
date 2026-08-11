do $repair$
declare
  function_definition text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.refund_sale(uuid,jsonb)'::regprocedure
  ) into function_definition;
  function_definition := replace(
    function_definition,
    '  prior_refund_subtotal bigint;' || chr(10),
    ''
  );
  function_definition := replace(
    function_definition,
    '  select' || chr(10) ||
    '    coalesce(-sum(refund_transaction.subtotal_cents), 0),' || chr(10) ||
    '    coalesce(-sum(refund_transaction.discount_cents), 0)' || chr(10) ||
    '  into prior_refund_subtotal, prior_refund_discount',
    '  select coalesce(-sum(refund_transaction.discount_cents), 0)' || chr(10) ||
    '  into prior_refund_discount'
  );
  execute function_definition;
end;
$repair$;
