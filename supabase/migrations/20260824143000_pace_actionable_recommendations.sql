begin;

alter table public.stores
  add column if not exists pace_recommendation_rules jsonb not null default '[]'::jsonb;

alter table public.stores
  drop constraint if exists stores_pace_recommendation_rules_valid,
  add constraint stores_pace_recommendation_rules_valid check (
    jsonb_typeof(pace_recommendation_rules) = 'array'
    and jsonb_array_length(pace_recommendation_rules) <= 100
  );

grant update (pace_recommendation_rules)
  on public.stores to authenticated;

comment on column public.stores.pace_recommendation_rules is
  'Retailer-managed, deterministic Pace recommendation rules scoped to this store. No cart mutation or cross-store profiling.';

commit;
