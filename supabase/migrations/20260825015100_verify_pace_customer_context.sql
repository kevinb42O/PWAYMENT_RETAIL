begin;

do $$
declare
  probe_user_id uuid;
  probe_store_id uuid;
  probe_context jsonb;
begin
  select membership.user_id, membership.store_id
    into probe_user_id, probe_store_id
  from public.store_memberships membership
  where membership.status = 'active'
  order by membership.created_at
  limit 1;

  perform pg_catalog.set_config('request.jwt.claim.sub', probe_user_id::text, true);
  select public.get_pace_ai_context(probe_store_id, 'hoeveel klanten en welke beste klant') into probe_context;

  if not (probe_context -> 'customers' ? 'activeCount')
     or not (probe_context -> 'customers' ? 'topCustomersBySpend') then
    raise exception 'pace-ai customer context release assertion failed';
  end if;
end;
$$;

commit;
