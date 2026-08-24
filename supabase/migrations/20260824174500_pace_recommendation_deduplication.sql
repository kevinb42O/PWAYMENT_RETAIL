begin;

-- One candidate can match several products in a customer's history. Return
-- that candidate once, using its strongest store-local affinity as evidence.
create or replace function public.get_pace_product_recommendations(
  target_store_id uuid,
  purchased_product_external_ids text[],
  result_limit integer default 6
)
returns table (
  product_external_id text,
  pair_sale_count bigint,
  confidence numeric,
  evidence_label text
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if not (select private.is_store_member(target_store_id)) then
    raise exception 'STORE_ACCESS_DENIED' using errcode = '42501';
  end if;

  return query
  with candidates as (
    select
      recommended.external_id,
      affinity.pair_sale_count,
      affinity.pair_sale_count::numeric / greatest(stats.sale_count, 1) as confidence
    from public.pace_product_affinities affinity
    join public.pace_product_stats stats
      on stats.store_id = affinity.store_id and stats.product_id = affinity.antecedent_product_id
    join public.products antecedent
      on antecedent.store_id = affinity.store_id and antecedent.id = affinity.antecedent_product_id
    join public.products recommended
      on recommended.store_id = affinity.store_id and recommended.id = affinity.recommended_product_id
    where affinity.store_id = target_store_id
      and antecedent.external_id = any(coalesce(purchased_product_external_ids, '{}'::text[]))
      and not (recommended.external_id = any(coalesce(purchased_product_external_ids, '{}'::text[])))
      and recommended.external_id is not null
      and recommended.is_active
      and (recommended.stock_qty is null or recommended.stock_qty > 0)
      and affinity.pair_sale_count >= case when stats.sale_count >= 20 then 2 else 1 end
  ), ranked as (
    select
      candidates.external_id,
      max(candidates.pair_sale_count) as strongest_pair_sale_count,
      max(candidates.confidence) as strongest_confidence
    from candidates
    group by candidates.external_id
  )
  select
    ranked.external_id,
    ranked.strongest_pair_sale_count,
    round(ranked.strongest_confidence, 4),
    ranked.strongest_pair_sale_count::text
      || case when ranked.strongest_pair_sale_count = 1 then ' relevante verkoop' else ' relevante verkopen' end
  from ranked
  order by ranked.strongest_confidence desc, ranked.strongest_pair_sale_count desc, ranked.external_id
  limit least(greatest(coalesce(result_limit, 6), 1), 20);
end;
$$;

revoke all on function public.get_pace_product_recommendations(uuid, text[], integer) from public, anon;
grant execute on function public.get_pace_product_recommendations(uuid, text[], integer) to authenticated;

comment on function public.get_pace_product_recommendations(uuid, text[], integer) is
  'Returns unique stock-backed product candidates from each store local aggregate affinity evidence; never mutates a cart.';

commit;
