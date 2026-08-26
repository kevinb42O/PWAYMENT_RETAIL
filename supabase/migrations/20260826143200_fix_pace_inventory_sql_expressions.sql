begin;

-- GREATEST and LEAST are SQL conditional expressions, not pg_catalog
-- functions. Remove the invalid schema qualification retained by the first
-- function definition; fail closed if the expected definition is absent.
do $migration$
declare
  original_definition text;
  corrected_definition text;
begin
  select pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure('public.get_pace_inventory_action_context(uuid,text)')
  ) into original_definition;

  if original_definition is null then
    raise exception 'Expected Pace inventory context function is missing.';
  end if;

  corrected_definition := pg_catalog.replace(original_definition, 'pg_catalog.greatest(', 'greatest(');
  corrected_definition := pg_catalog.replace(corrected_definition, 'pg_catalog.least(', 'least(');

  if corrected_definition = original_definition then
    raise exception 'Pace SQL expression repair did not match the stored function definition.';
  end if;

  execute corrected_definition;
end;
$migration$;

commit;
