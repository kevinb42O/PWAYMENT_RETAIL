do $repair$
declare
  function_definition text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.save_purchase_order(uuid,jsonb)'::regprocedure
  ) into function_definition;
  function_definition := replace(
    function_definition,
    'received_delta := received_qty;',
    'received_delta := requested_received_qty;'
  );
  execute function_definition;
end;
$repair$;
