begin;

do $clean_inventory_batch$
declare
  definition text;
  rewritten text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.record_inventory_batch(uuid,jsonb)'::regprocedure
  ) into strict definition;

  if position('line_result jsonb;' in definition) = 0
     or position('line_result := public.record_inventory_operation' in definition) = 0 then
    raise exception 'record_inventory_batch no longer matches the reviewed definition.';
  end if;

  rewritten := pg_catalog.regexp_replace(
    definition,
    E'\\n[[:space:]]*line_result jsonb;',
    '',
    'g'
  );
  rewritten := pg_catalog.replace(
    rewritten,
    'line_result := public.record_inventory_operation',
    'perform public.record_inventory_operation'
  );

  if position('line_result' in rewritten) > 0 then
    raise exception 'Could not remove unused record_inventory_batch state safely.';
  end if;
  execute rewritten;
end;
$clean_inventory_batch$;

do $clean_pace_analytics$
declare
  definition text;
  rewritten text;
  unused_period_block text := $block$  if range_start is not null and range_end is not null then
    previous_end := range_start;
    previous_start := range_start - (range_end - range_start);
  end if;

$block$;
begin
  select pg_catalog.pg_get_functiondef(
    'public.get_pace_analytics_context(uuid,jsonb)'::regprocedure
  ) into strict definition;

  if position('previous_start timestamptz;' in definition) = 0
     or position('previous_end timestamptz;' in definition) = 0
     or position(unused_period_block in definition) = 0 then
    raise exception 'get_pace_analytics_context no longer matches the reviewed definition.';
  end if;

  rewritten := pg_catalog.regexp_replace(
    definition,
    E'\\n[[:space:]]*previous_start timestamptz;',
    '',
    'g'
  );
  rewritten := pg_catalog.regexp_replace(
    rewritten,
    E'\\n[[:space:]]*previous_end timestamptz;',
    '',
    'g'
  );
  rewritten := pg_catalog.replace(rewritten, unused_period_block, '');

  if position('previous_start' in rewritten) > 0
     or position('previous_end' in rewritten) > 0 then
    raise exception 'Could not remove unused get_pace_analytics_context state safely.';
  end if;
  execute rewritten;
end;
$clean_pace_analytics$;

commit;
