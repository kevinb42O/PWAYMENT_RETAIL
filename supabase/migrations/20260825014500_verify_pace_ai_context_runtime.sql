begin;

-- Release assertion: execute the context projection with an existing active
-- membership so schema drift fails during deployment rather than at runtime.
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

  if probe_user_id is null or probe_store_id is null then
    raise exception 'pace-ai release assertion requires an active store membership';
  end if;

  perform pg_catalog.set_config('request.jwt.claim.sub', probe_user_id::text, true);
  select public.get_pace_ai_context(probe_store_id, 'release assertion') into probe_context;

  if probe_context is null or probe_context -> 'store' ->> 'id' <> probe_store_id::text then
    raise exception 'pace-ai release assertion returned invalid context';
  end if;
end;
$$;

commit;
