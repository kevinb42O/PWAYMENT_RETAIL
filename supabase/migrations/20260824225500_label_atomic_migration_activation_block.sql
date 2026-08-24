-- The function name is not an implicit PL/pgSQL block label for local
-- variables. Add an explicit label, then bind every inverse-receipt comparison
-- to that label so PostgreSQL cannot interpret it as a table reference.

begin;

do $migration_fix$
declare
  function_definition text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.apply_migration_activation(uuid,jsonb)'::pg_catalog.regprocedure
  ) into function_definition;

  function_definition := pg_catalog.regexp_replace(
    function_definition,
    '(AS \$function\$[[:space:]]*)(declare)',
    E'\\1<<migration_activation_block>>\n\\2',
    'i'
  );
  function_definition := pg_catalog.replace(
    function_definition,
    'apply_migration_activation.migration_id',
    'migration_activation_block.migration_id'
  );

  if pg_catalog.strpos(function_definition, '<<migration_activation_block>>') = 0
     or pg_catalog.strpos(function_definition, 'migration_activation_block.migration_id') = 0 then
    raise exception using errcode = 'P0001', message = 'migration-fix:block-label-rewrite-failed';
  end if;

  execute function_definition;
end;
$migration_fix$;

commit;
