-- `identifier_type` is both a catalog column and a reviewed payload value.
-- Keep the conflict-index column untouched and rename only the local value.

begin;

do $retail_catalog_identifier_type_resolution$
declare
  definition text;
  rewritten text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.apply_retail_catalog_relations(uuid,jsonb)'::pg_catalog.regprocedure
  ) into strict definition;

  if position('retail_catalog_identifier_type_resolution_v4' in definition) > 0 then
    return;
  end if;
  if position('retail_catalog_local_id_resolution_v3' in definition) = 0 then
    raise exception 'The catalog local-ID resolution prerequisite is missing.';
  end if;

  rewritten := replace(
    definition,
    '-- retail_catalog_local_id_resolution_v3',
    '-- retail_catalog_identifier_type_resolution_v4'
  );
  rewritten := replace(rewritten, '  identifier_type text;', '  resolved_identifier_type text;');
  rewritten := replace(rewritten, 'identifier_type := nullif(', 'resolved_identifier_type := nullif(');
  rewritten := replace(rewritten, 'if identifier_type not in (', 'if resolved_identifier_type not in (');
  rewritten := replace(
    rewritten,
    'target_store_id, target_product_id, identifier_type, identifier_content',
    'target_store_id, target_product_id, resolved_identifier_type, identifier_content'
  );

  if rewritten = definition
     or position(E'\n  identifier_type text;' in rewritten) > 0
     or position(E'\n        identifier_type := nullif(' in rewritten) > 0
     or position(E'\n        if identifier_type not in (' in rewritten) > 0
     or position('target_store_id, target_product_id, identifier_type, identifier_content' in rewritten) > 0 then
    raise exception 'Could not safely rename the retail catalog identifier-type variable.';
  end if;

  execute rewritten;
end;
$retail_catalog_identifier_type_resolution$;

commit;
