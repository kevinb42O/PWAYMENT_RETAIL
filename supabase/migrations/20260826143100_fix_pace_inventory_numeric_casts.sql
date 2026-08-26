begin;

-- PL/pgSQL validates the statement body lazily. Keep the original migration
-- immutable after it has reached production, and repair its two mixed
-- integer/numeric GREATEST expressions in a reproducible follow-up migration.
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

  corrected_definition := pg_catalog.replace(
    original_definition,
    'pg_catalog.greatest(0, pg_catalog.floor(extract(epoch from (pg_catalog.statement_timestamp() - activity.inactivity_anchor)) / 86400))::integer',
    'pg_catalog.greatest(0, pg_catalog.floor(extract(epoch from (pg_catalog.statement_timestamp() - activity.inactivity_anchor)) / 86400)::integer)'
  );
  corrected_definition := pg_catalog.replace(
    corrected_definition,
    'pg_catalog.greatest(0, pg_catalog.least(100, pg_catalog.floor(',
    'pg_catalog.greatest(0, pg_catalog.least(100, pg_catalog.floor('
  );
  corrected_definition := pg_catalog.replace(
    corrected_definition,
    'activity.cost_price_cents / nullif(0.75 * activity.price_cents * 100.0 / (100.0 + activity.vat_rate), 0))' || pg_catalog.chr(10) ||
      '        )))::integer',
    'activity.cost_price_cents / nullif(0.75 * activity.price_cents * 100.0 / (100.0 + activity.vat_rate), 0))' || pg_catalog.chr(10) ||
      '        )::integer))::integer'
  );

  if corrected_definition = original_definition then
    raise exception 'Pace numeric cast repair did not match the stored function definition.';
  end if;

  execute corrected_definition;
end;
$migration$;

commit;
