begin;

-- Pace is a platform capability: new stores start with deterministic customer
-- intelligence enabled and can still pause it from their dedicated PACE page.
alter table public.stores
  alter column customer_insight_settings set default '{"enabled":true,"returnRemindersEnabled":true,"brandAffinityEnabled":true,"brandLookbackDays":540,"minimumBrandTransactions":2}'::jsonb;

update public.stores
set customer_insight_settings = jsonb_set(customer_insight_settings, '{enabled}', 'true'::jsonb, true)
where coalesce((customer_insight_settings ->> 'enabled')::boolean, false) = false;

comment on column public.stores.pace_recommendation_rules is
  'Deprecated optional override storage. The primary Pace engine learns automatically from tenant-isolated purchase affinities.';

create table public.pace_product_stats (
  store_id uuid not null references public.stores(id) on delete cascade,
  product_id uuid not null,
  sale_count bigint not null default 0 check (sale_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (store_id, product_id),
  foreign key (store_id, product_id) references public.products(store_id, id) on delete cascade
);

create table public.pace_product_affinities (
  store_id uuid not null references public.stores(id) on delete cascade,
  antecedent_product_id uuid not null,
  recommended_product_id uuid not null,
  pair_sale_count bigint not null default 0 check (pair_sale_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (store_id, antecedent_product_id, recommended_product_id),
  check (antecedent_product_id <> recommended_product_id),
  foreign key (store_id, antecedent_product_id) references public.products(store_id, id) on delete cascade,
  foreign key (store_id, recommended_product_id) references public.products(store_id, id) on delete cascade
);

create index pace_product_affinities_rank_idx
  on public.pace_product_affinities (store_id, antecedent_product_id, pair_sale_count desc);

create table private.pace_processed_products (
  store_id uuid not null,
  transaction_id uuid not null,
  product_id uuid not null,
  primary key (store_id, transaction_id, product_id)
);

create table private.pace_processed_pairs (
  store_id uuid not null,
  transaction_id uuid not null,
  first_product_id uuid not null,
  second_product_id uuid not null,
  primary key (store_id, transaction_id, first_product_id, second_product_id),
  check (first_product_id < second_product_id)
);

create or replace function private.capture_pace_line_affinity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  transaction_eligible boolean;
  other_product_id uuid;
  first_product_id uuid;
  second_product_id uuid;
begin
  if new.product_id is null then return new; end if;

  select sale.kind = 'sale'
    and sale.source <> 'demo'
  into transaction_eligible
  from public.transactions sale
  where sale.store_id = new.store_id
    and sale.id = new.transaction_id;
  if not coalesce(transaction_eligible, false) then return new; end if;

  insert into private.pace_processed_products(store_id, transaction_id, product_id)
  values (new.store_id, new.transaction_id, new.product_id)
  on conflict do nothing;
  if found then
    insert into public.pace_product_stats(store_id, product_id, sale_count)
    values (new.store_id, new.product_id, 1)
    on conflict (store_id, product_id) do update
      set sale_count = public.pace_product_stats.sale_count + 1,
          updated_at = now();
  end if;

  for other_product_id in
    select distinct line.product_id
    from public.transaction_lines line
    where line.store_id = new.store_id
      and line.transaction_id = new.transaction_id
      and line.product_id is not null
      and line.product_id <> new.product_id
  loop
    first_product_id := least(new.product_id, other_product_id);
    second_product_id := greatest(new.product_id, other_product_id);
    insert into private.pace_processed_pairs(store_id, transaction_id, first_product_id, second_product_id)
    values (new.store_id, new.transaction_id, first_product_id, second_product_id)
    on conflict do nothing;
    if found then
      insert into public.pace_product_affinities(store_id, antecedent_product_id, recommended_product_id, pair_sale_count)
      values
        (new.store_id, first_product_id, second_product_id, 1),
        (new.store_id, second_product_id, first_product_id, 1)
      on conflict (store_id, antecedent_product_id, recommended_product_id) do update
        set pair_sale_count = public.pace_product_affinities.pair_sale_count + 1,
            updated_at = now();
    end if;
  end loop;
  return new;
end;
$$;

create trigger transaction_lines_capture_pace_affinity
after insert on public.transaction_lines
for each row execute function private.capture_pace_line_affinity();

-- One bounded historical backfill makes every existing tenant useful without
-- requiring an owner action. Demo and refund rows never train the engine.
insert into public.pace_product_stats(store_id, product_id, sale_count)
select sale.store_id, sale.product_id, count(*)
from (
  select distinct sale.store_id, sale.id as transaction_id, line.product_id
  from public.transactions sale
  join public.transaction_lines line
    on line.store_id = sale.store_id and line.transaction_id = sale.id
  where sale.kind = 'sale' and sale.source <> 'demo' and line.product_id is not null
) sale
group by sale.store_id, sale.product_id
on conflict (store_id, product_id) do update
set sale_count = excluded.sale_count, updated_at = now();

insert into public.pace_product_affinities(store_id, antecedent_product_id, recommended_product_id, pair_sale_count)
select pair.store_id, pair.antecedent_product_id, pair.recommended_product_id, count(*)
from (
  select distinct sale.store_id, sale.id as transaction_id,
    left_line.product_id as antecedent_product_id,
    right_line.product_id as recommended_product_id
  from public.transactions sale
  join public.transaction_lines left_line
    on left_line.store_id = sale.store_id and left_line.transaction_id = sale.id
  join public.transaction_lines right_line
    on right_line.store_id = sale.store_id and right_line.transaction_id = sale.id
   and right_line.product_id <> left_line.product_id
  where sale.kind = 'sale' and sale.source <> 'demo'
    and left_line.product_id is not null and right_line.product_id is not null
) pair
group by pair.store_id, pair.antecedent_product_id, pair.recommended_product_id
on conflict (store_id, antecedent_product_id, recommended_product_id) do update
set pair_sale_count = excluded.pair_sale_count, updated_at = now();

alter table public.pace_product_stats enable row level security;
alter table public.pace_product_affinities enable row level security;

create policy pace_product_stats_select_member on public.pace_product_stats
for select to authenticated using ((select private.is_store_member(store_id)));
create policy pace_product_affinities_select_member on public.pace_product_affinities
for select to authenticated using ((select private.is_store_member(store_id)));

grant select on public.pace_product_stats, public.pace_product_affinities to authenticated;

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
  select recommended.external_id,
    affinity.pair_sale_count,
    round(affinity.pair_sale_count::numeric / greatest(stats.sale_count, 1), 4),
    affinity.pair_sale_count::text || case when affinity.pair_sale_count = 1 then ' relevante verkoop' else ' relevante verkopen' end
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
  order by affinity.pair_sale_count::numeric / greatest(stats.sale_count, 1) desc,
    affinity.pair_sale_count desc,
    recommended.external_id
  limit least(greatest(coalesce(result_limit, 6), 1), 20);
end;
$$;

revoke all on function public.get_pace_product_recommendations(uuid, text[], integer) from public, anon;
grant execute on function public.get_pace_product_recommendations(uuid, text[], integer) to authenticated;

comment on table public.pace_product_affinities is
  'Incremental, tenant-isolated product co-purchase counts used by Pace. Contains no customer identity or cross-store profile.';
comment on function public.get_pace_product_recommendations(uuid, text[], integer) is
  'Returns stock-backed product candidates from store-local aggregate affinity evidence; never mutates a cart.';

commit;
