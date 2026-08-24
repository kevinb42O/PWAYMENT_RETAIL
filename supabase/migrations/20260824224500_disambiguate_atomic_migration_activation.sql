-- PL/pgSQL resolves an unqualified identifier against both local variables and
-- query columns. Qualify the activation variable wherever an inverse receipt
-- also exposes a `migration_id` column. This is a forward-only correction to
-- the already deployed atomic activation definition.

begin;

do $migration_fix$
declare
  function_definition text;
  ambiguous_reference constant text := 'inverse_change.migration_id = migration_id';
  qualified_reference constant text := 'inverse_change.migration_id = apply_migration_activation.migration_id';
begin
  select pg_catalog.pg_get_functiondef(
    'public.apply_migration_activation(uuid,jsonb)'::pg_catalog.regprocedure
  ) into function_definition;

  if pg_catalog.strpos(function_definition, ambiguous_reference) = 0 then
    raise exception using errcode = 'P0001', message = 'migration-fix:expected-reference-not-found';
  end if;

  function_definition := pg_catalog.replace(
    function_definition,
    ambiguous_reference,
    qualified_reference
  );
  execute function_definition;
end;
$migration_fix$;

commit;
