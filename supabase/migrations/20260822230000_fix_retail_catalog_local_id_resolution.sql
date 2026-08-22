-- Finish the catalog RPC hardening by giving every local relational ID a name
-- that cannot collide with an INSERT target or ON CONFLICT index column.

begin;

do $retail_catalog_local_id_resolution$
declare
  definition text;
  rewritten text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.apply_retail_catalog_relations(uuid,jsonb)'::pg_catalog.regprocedure
  ) into strict definition;

  if position('retail_catalog_local_id_resolution_v3' in definition) > 0 then
    return;
  end if;
  if position('retail_catalog_product_id_resolution_v2' in definition) = 0 then
    raise exception 'The catalog product-ID resolution prerequisite is missing.';
  end if;

  rewritten := replace(
    definition,
    '-- retail_catalog_product_id_resolution_v2',
    '-- retail_catalog_local_id_resolution_v3'
  );

  rewritten := replace(rewritten, '  category_id uuid;', '  resolved_category_id uuid;');
  rewritten := replace(rewritten, 'category_id := null;', 'resolved_category_id := null;');
  rewritten := replace(rewritten, 'select category.id into category_id', 'select category.id into resolved_category_id');
  rewritten := replace(rewritten, 'if category_id is null then', 'if resolved_category_id is null then');
  rewritten := replace(rewritten, 'family_brand, category_id, true', 'family_brand, resolved_category_id, true');

  rewritten := replace(rewritten, '  family_id uuid;', '  resolved_family_id uuid;');
  rewritten := replace(rewritten, 'returning id into family_id;', 'returning id into resolved_family_id;');
  rewritten := replace(rewritten, E'        family_id,\n        nullif', E'        resolved_family_id,\n        nullif');
  rewritten := replace(rewritten, 'default_family.id <> family_id', 'default_family.id <> resolved_family_id');
  rewritten := replace(rewritten, 'target_store_id, family_id, option_name', 'target_store_id, resolved_family_id, option_name');

  rewritten := replace(rewritten, '  current_family_id uuid;', '  previous_family_id uuid;');
  rewritten := replace(rewritten, 'into current_family_id', 'into previous_family_id');
  rewritten := replace(rewritten, 'if current_family_id is not null then', 'if previous_family_id is not null then');

  rewritten := replace(rewritten, '  definition_id uuid;', '  resolved_definition_id uuid;');
  rewritten := replace(rewritten, 'returning id into definition_id;', 'returning id into resolved_definition_id;');

  rewritten := replace(rewritten, '  value_id uuid;', '  resolved_value_id uuid;');
  rewritten := replace(rewritten, 'returning id into value_id;', 'returning id into resolved_value_id;');

  rewritten := replace(
    rewritten,
    'target_store_id, family_id, definition_id, option_content',
    'target_store_id, resolved_family_id, resolved_definition_id, option_content'
  );
  rewritten := replace(
    rewritten,
    'target_store_id, target_product_id, family_id, definition_id, value_id',
    'target_store_id, target_product_id, resolved_family_id, resolved_definition_id, resolved_value_id'
  );

  if rewritten = definition
     or position('  category_id uuid;' in rewritten) > 0
     or position('  family_id uuid;' in rewritten) > 0
     or position('  current_family_id uuid;' in rewritten) > 0
     or position('  definition_id uuid;' in rewritten) > 0
     or position('  value_id uuid;' in rewritten) > 0
     or position('family_brand, category_id, true' in rewritten) > 0
     or position('target_store_id, family_id, option_name' in rewritten) > 0
     or position('target_store_id, family_id, definition_id, option_content' in rewritten) > 0
     or position('target_store_id, target_product_id, family_id, definition_id, value_id' in rewritten) > 0 then
    raise exception 'Could not safely rename every retail catalog relational ID variable.';
  end if;

  execute rewritten;
end;
$retail_catalog_local_id_resolution$;

commit;
