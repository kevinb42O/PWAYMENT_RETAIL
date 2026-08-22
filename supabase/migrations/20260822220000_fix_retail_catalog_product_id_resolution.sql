-- Replace the catalog activation RPC's broad variable-conflict directive with
-- an unambiguous local variable name. A directive also affects ON CONFLICT
-- inference lists; a unique variable name keeps both SQL and PL/pgSQL exact.

begin;

do $retail_catalog_product_id_resolution$
declare
  definition text;
  rewritten text;
begin
  if pg_catalog.to_regprocedure('public.apply_retail_catalog_relations(uuid,jsonb)') is null then
    raise exception 'apply_retail_catalog_relations is required before its product ID resolution can be fixed.';
  end if;

  select pg_catalog.pg_get_functiondef(
    'public.apply_retail_catalog_relations(uuid,jsonb)'::pg_catalog.regprocedure
  ) into strict definition;

  if position('retail_catalog_product_id_resolution_v2' in definition) > 0 then
    return;
  end if;
  if position('retail_catalog_variable_resolution_v1' in definition) = 0 then
    raise exception 'The catalog variable-resolution prerequisite is missing.';
  end if;

  rewritten := replace(
    definition,
    E'#variable_conflict use_variable\n-- retail_catalog_variable_resolution_v1',
    '-- retail_catalog_product_id_resolution_v2'
  );
  rewritten := replace(rewritten, '  product_id uuid;', '  target_product_id uuid;');
  rewritten := replace(rewritten, 'select product.id into product_id', 'select product.id into target_product_id');
  rewritten := replace(rewritten, 'if product_id is null then', 'if target_product_id is null then');
  rewritten := replace(rewritten, 'existing_variant.product_id = product_id;', 'existing_variant.product_id = target_product_id;');
  rewritten := replace(rewritten, 'existing_option.product_id = product_id;', 'existing_option.product_id = target_product_id;');
  rewritten := replace(rewritten, E'        product_id,\n        family_id,', E'        target_product_id,\n        family_id,');
  rewritten := replace(rewritten, 'default_family.id = product_id', 'default_family.id = target_product_id');
  rewritten := replace(rewritten, 'target_store_id, product_id, family_id, definition_id, value_id', 'target_store_id, target_product_id, family_id, definition_id, value_id');
  rewritten := replace(rewritten, 'existing_identifier.product_id = product_id', 'existing_identifier.product_id = target_product_id');
  rewritten := replace(rewritten, 'target_store_id, product_id, identifier_type, identifier_content', 'target_store_id, target_product_id, identifier_type, identifier_content');

  if rewritten = definition
     or position('  product_id uuid;' in rewritten) > 0
     or position(' = product_id;' in rewritten) > 0
     or position('target_store_id, product_id, family_id, definition_id, value_id' in rewritten) > 0
     or position('target_store_id, product_id, identifier_type, identifier_content' in rewritten) > 0 then
    raise exception 'Could not safely rename the retail catalog product ID variable.';
  end if;

  execute rewritten;
end;
$retail_catalog_product_id_resolution$;

commit;
