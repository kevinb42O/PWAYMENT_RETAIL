-- Make PL/pgSQL variable resolution explicit in the catalog activation RPC.
--
-- The function intentionally compares qualified table columns with local IDs,
-- but `product_id` is also a column name. PostgreSQL's runtime checker rejects
-- that ambiguity before an import can activate. `use_variable` is scoped to
-- this function body and preserves the intended, creation-only activation
-- semantics for all local identifiers.

begin;

do $retail_catalog_variable_resolution$
declare
  definition text;
  rewritten text;
  declaration_needle text := $needle$declare
  families jsonb;$needle$;
  declaration_replacement text := $replacement$#variable_conflict use_variable
-- retail_catalog_variable_resolution_v1
declare
  families jsonb;$replacement$;
begin
  if pg_catalog.to_regprocedure('public.apply_retail_catalog_relations(uuid,jsonb)') is null then
    raise exception 'apply_retail_catalog_relations is required before its variable resolution can be fixed.';
  end if;

  select pg_catalog.pg_get_functiondef(
    'public.apply_retail_catalog_relations(uuid,jsonb)'::pg_catalog.regprocedure
  ) into strict definition;

  if position('retail_catalog_variable_resolution_v1' in definition) > 0 then
    return;
  end if;

  rewritten := replace(definition, declaration_needle, declaration_replacement);
  if rewritten = definition then
    raise exception 'Could not make retail catalog variable resolution explicit.';
  end if;
  execute rewritten;
end;
$retail_catalog_variable_resolution$;

commit;
