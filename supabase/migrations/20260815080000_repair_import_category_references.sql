begin;

-- Imports before the dedicated subcategory mapping stored the source column in
-- custom_fields. Promote that unambiguous source value once, without touching
-- any merchant-maintained subcategory.
update public.products
set subcategory = coalesce(
  nullif(btrim(custom_fields ->> 'Subcategorie'), ''),
  nullif(btrim(custom_fields ->> 'Subcategory'), ''),
  nullif(btrim(custom_fields ->> 'Subgroep'), ''),
  nullif(btrim(custom_fields ->> 'Artikel subgroep'), '')
)
where subcategory is null
  and coalesce(
    nullif(btrim(custom_fields ->> 'Subcategorie'), ''),
    nullif(btrim(custom_fields ->> 'Subcategory'), ''),
    nullif(btrim(custom_fields ->> 'Subgroep'), ''),
    nullif(btrim(custom_fields ->> 'Artikel subgroep'), '')
  ) is not null;

commit;
