-- Retail profile V2: an industry choice is no longer only a navigation hint.
-- It creates explicit, auditable capability assessments without assuming that
-- a shop needs (or may use) variants, lots, serial numbers, or weighed stock.

begin;

create table if not exists public.store_retail_profiles (
  store_id uuid primary key references public.stores(id) on delete cascade,
  profile_code text not null check (profile_code in (
    'telecom-it', 'fashion', 'lingerie', 'bicycles', 'toys',
    'skate-sports', 'electronics', 'home-living', 'beauty', 'food',
    'jewelry', 'books-hobby', 'general-retail', 'repair-service', 'other'
  )),
  profile_version integer not null default 1 check (profile_version > 0),
  selected_by_user_id uuid references auth.users(id),
  selected_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

create table if not exists public.store_capability_assessments (
  store_id uuid not null references public.stores(id) on delete cascade,
  capability_code text not null check (capability_code in (
    'variant-matrix', 'multiple-identifiers', 'stock-locations',
    'serial-numbers', 'lot-traceability', 'measurable-quantities',
    'packaging', 'customer-pricing', 'webshop-variants'
  )),
  state text not null check (state in (
    'unknown', 'not-needed', 'required', 'enabled', 'blocked'
  )),
  source text not null check (source in (
    'signup', 'settings', 'migration', 'import-evidence', 'platform'
  )),
  assessed_by_user_id uuid references auth.users(id),
  assessment_note text,
  assessed_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  primary key (store_id, capability_code)
);

create index if not exists store_capability_assessments_state_idx
  on public.store_capability_assessments (store_id, state);

alter table public.store_retail_profiles enable row level security;
alter table public.store_capability_assessments enable row level security;

drop policy if exists store_retail_profiles_member_select on public.store_retail_profiles;
create policy store_retail_profiles_member_select
  on public.store_retail_profiles for select to authenticated
  using ((select private.is_store_member(store_id)));

drop policy if exists store_capability_assessments_member_select on public.store_capability_assessments;
create policy store_capability_assessments_member_select
  on public.store_capability_assessments for select to authenticated
  using ((select private.is_store_member(store_id)));

revoke all on public.store_retail_profiles from public, anon, authenticated;
revoke all on public.store_capability_assessments from public, anon, authenticated;
grant select on public.store_retail_profiles to authenticated;
grant select on public.store_capability_assessments to authenticated;

create or replace function private.is_valid_retail_profile_code(value text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select value in (
    'telecom-it', 'fashion', 'lingerie', 'bicycles', 'toys',
    'skate-sports', 'electronics', 'home-living', 'beauty', 'food',
    'jewelry', 'books-hobby', 'general-retail', 'repair-service', 'other'
  );
$$;

-- Read only merchant-declared states from an onboarding document. Platform
-- lifecycle states remain server-owned and cannot be forged by signup data or
-- by a settings form.
create or replace function private.sync_store_capability_assessments(
  target_store_id uuid,
  profile_payload jsonb,
  assessment_source text,
  actor_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  capability text;
  requested_state text;
  accepted_state text;
begin
  if assessment_source not in ('signup', 'settings', 'migration', 'import-evidence', 'platform') then
    raise exception using errcode = '22023', message = 'retail-profile:invalid-source:Ongeldige profielbron.';
  end if;
  if pg_catalog.jsonb_typeof(profile_payload) is distinct from 'object' then
    profile_payload := '{}'::jsonb;
  end if;

  foreach capability in array array[
    'variant-matrix', 'multiple-identifiers', 'stock-locations',
    'serial-numbers', 'lot-traceability', 'measurable-quantities',
    'packaging', 'customer-pricing', 'webshop-variants'
  ]
  loop
    requested_state := profile_payload #>> array['capabilities', capability];
    accepted_state := case
      when requested_state in ('unknown', 'not-needed', 'required') then requested_state
      else 'unknown'
    end;

    insert into public.store_capability_assessments (
      store_id, capability_code, state, source, assessed_by_user_id, assessed_at, updated_at
    ) values (
      target_store_id, capability, accepted_state, assessment_source, actor_id,
      clock_timestamp(), clock_timestamp()
    )
    on conflict (store_id, capability_code) do update
      set state = case
            when public.store_capability_assessments.state in ('enabled', 'blocked')
              and assessment_source <> 'platform'
              then public.store_capability_assessments.state
            else excluded.state
          end,
          source = case
            when public.store_capability_assessments.state in ('enabled', 'blocked')
              and assessment_source <> 'platform'
              then public.store_capability_assessments.source
            else excluded.source
          end,
          assessed_by_user_id = case
            when public.store_capability_assessments.state in ('enabled', 'blocked')
              and assessment_source <> 'platform'
              then public.store_capability_assessments.assessed_by_user_id
            else excluded.assessed_by_user_id
          end,
          assessed_at = case
            when public.store_capability_assessments.state in ('enabled', 'blocked')
              and assessment_source <> 'platform'
              then public.store_capability_assessments.assessed_at
            else excluded.assessed_at
          end,
          updated_at = clock_timestamp();
  end loop;
end;
$$;

revoke all on function private.is_valid_retail_profile_code(text) from public, anon, authenticated;
revoke all on function private.sync_store_capability_assessments(uuid, jsonb, text, uuid) from public, anon, authenticated;

create or replace function public.save_store_retail_profile(
  target_store_id uuid,
  profile_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  requested_profile text;
  configuration_version text;
  completed_at_value timestamptz;
begin
  if actor_id is null
     or not private.has_store_role(target_store_id, array['owner']) then
    raise exception using errcode = '42501', message = 'retail-profile:forbidden:Alleen de eigenaar kan het winkelprofiel wijzigen.';
  end if;
  if pg_catalog.jsonb_typeof(profile_payload) is distinct from 'object' then
    raise exception using errcode = '22023', message = 'retail-profile:invalid:Ongeldige winkelconfiguratie.';
  end if;

  configuration_version := profile_payload ->> 'version';
  if configuration_version not in ('1', '2') then
    raise exception using errcode = '22023', message = 'retail-profile:invalid:Onbekende configuratieversie.';
  end if;
  requested_profile := coalesce(
    nullif(pg_catalog.btrim(profile_payload ->> 'industry'), ''),
    'general-retail'
  );
  if not private.is_valid_retail_profile_code(requested_profile) then
    raise exception using errcode = '22023', message = 'retail-profile:invalid:Ongeldig retailprofiel.';
  end if;
  begin
    completed_at_value := nullif(profile_payload ->> 'completedAt', '')::timestamptz;
  exception when invalid_datetime_format then
    raise exception using errcode = '22023', message = 'retail-profile:invalid:Ongeldige voltooiingsdatum.';
  end;

  update public.stores
  set industry_code = requested_profile,
      onboarding_config = profile_payload,
      onboarding_completed_at = completed_at_value
  where id = target_store_id;

  insert into public.store_retail_profiles (
    store_id, profile_code, profile_version, selected_by_user_id, selected_at, updated_at
  ) values (
    target_store_id, requested_profile, 1, actor_id, clock_timestamp(), clock_timestamp()
  )
  on conflict (store_id) do update
    set profile_code = excluded.profile_code,
        profile_version = excluded.profile_version,
        selected_by_user_id = excluded.selected_by_user_id,
        selected_at = excluded.selected_at,
        updated_at = excluded.updated_at;

  perform private.sync_store_capability_assessments(
    target_store_id, profile_payload, 'settings', actor_id
  );

  return pg_catalog.jsonb_build_object(
    'store_id', target_store_id,
    'profile_code', requested_profile,
    'profile_version', 1
  );
end;
$$;

revoke all on function public.save_store_retail_profile(uuid, jsonb) from public, anon;
grant execute on function public.save_store_retail_profile(uuid, jsonb) to authenticated;

-- Existing tenants retain their selected profile. They do not receive an
-- inferred capability: every new assessment starts as unknown unless V2 data
-- already contains an explicit merchant declaration.
insert into public.store_retail_profiles (
  store_id, profile_code, profile_version, selected_at, updated_at
)
select
  store.id,
  case when private.is_valid_retail_profile_code(store.industry_code)
    then store.industry_code else 'general-retail' end,
  1,
  clock_timestamp(),
  clock_timestamp()
from public.stores as store
on conflict (store_id) do nothing;

do $$
declare
  store_record record;
begin
  for store_record in select id, onboarding_config from public.stores loop
    perform private.sync_store_capability_assessments(
      store_record.id, store_record.onboarding_config, 'migration', null
    );
  end loop;
end;
$$;

-- Extend account creation. A V1 client remains valid during a rolling deploy;
-- its capability assessments are intentionally recorded as unknown.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_store_id uuid;
  invited_store_text text;
  member_role text;
  requested_store_name text;
  first_name_value text;
  last_name_value text;
  display_name_value text;
  trial_start timestamptz := clock_timestamp();
  onboarding_value jsonb := '{}'::jsonb;
  requested_industry text;
  onboarding_completed timestamptz;
  created_store boolean := false;
begin
  first_name_value := nullif(pg_catalog.btrim(new.raw_user_meta_data ->> 'first_name'), '');
  last_name_value := nullif(pg_catalog.btrim(new.raw_user_meta_data ->> 'last_name'), '');
  display_name_value := coalesce(
    nullif(pg_catalog.btrim(pg_catalog.concat_ws(' ', first_name_value, last_name_value)), ''),
    pg_catalog.split_part(coalesce(new.email, 'Gebruiker'), '@', 1)
  );
  insert into public.profiles (id, first_name, last_name, display_name)
  values (new.id, first_name_value, last_name_value, display_name_value)
  on conflict (id) do nothing;

  invited_store_text := nullif(new.raw_app_meta_data ->> 'invited_store_id', '');
  if invited_store_text is not null then
    target_store_id := invited_store_text::uuid;
    if not exists (select 1 from public.stores where id = target_store_id) then
      raise exception 'Invited store does not exist';
    end if;
    member_role := coalesce(nullif(new.raw_app_meta_data ->> 'invited_role', ''), 'cashier');
    if member_role not in ('owner', 'manager', 'cashier') then
      raise exception 'Invalid invited role';
    end if;
  else
    requested_store_name := nullif(pg_catalog.btrim(new.raw_user_meta_data ->> 'store_name'), '');
    if pg_catalog.lower(coalesce(new.email, '')) = 'kevin@webaanzee.be' then
      requested_store_name := 'PWAYMENT Demo Store';
    end if;

    if pg_catalog.lower(coalesce(new.email, '')) <> 'kevin@webaanzee.be'
       and (
         pg_catalog.jsonb_typeof(new.raw_user_meta_data -> 'onboarding_config') is distinct from 'object'
         or new.raw_user_meta_data -> 'onboarding_config' ->> 'version' is distinct from '2'
         or nullif(new.raw_user_meta_data -> 'onboarding_config' ->> 'completedAt', '') is null
         or private.is_valid_retail_profile_code(
           new.raw_user_meta_data -> 'onboarding_config' ->> 'industry'
         ) is not true
       ) then
      raise exception using errcode = '22023', message = 'retail-profile:required:Kies en bevestig eerst het type retailwinkel.';
    end if;

    if pg_catalog.jsonb_typeof(new.raw_user_meta_data -> 'onboarding_config') = 'object'
      and new.raw_user_meta_data -> 'onboarding_config' ->> 'version' = '2'
    then
      onboarding_value := new.raw_user_meta_data -> 'onboarding_config';
      requested_industry := nullif(onboarding_value ->> 'industry', '');
      if not private.is_valid_retail_profile_code(requested_industry) then
        raise exception using errcode = '22023', message = 'retail-profile:invalid:Ongeldig retailprofiel.';
      end if;
      onboarding_completed := trial_start;
    else
      -- The one internal demo account predates onboarding. It is explicitly a
      -- general retail fixture, never a merchant-sector inference.
      requested_industry := 'general-retail';
    end if;

    insert into public.stores (
      name, is_demo, industry_code, onboarding_config, onboarding_completed_at
    ) values (
      coalesce(requested_store_name, 'Mijn winkel'),
      pg_catalog.lower(coalesce(new.email, '')) = 'kevin@webaanzee.be',
      requested_industry,
      onboarding_value,
      onboarding_completed
    ) returning id into target_store_id;
    member_role := 'owner';
    created_store := true;
  end if;

  insert into public.store_memberships (store_id, user_id, role, status)
  values (target_store_id, new.id, member_role, 'active')
  on conflict (store_id, user_id) do nothing;

  if created_store then
    insert into public.store_retail_profiles (
      store_id, profile_code, profile_version, selected_by_user_id, selected_at, updated_at
    ) values (
      target_store_id, requested_industry, 1, new.id, trial_start, trial_start
    );
    perform private.sync_store_capability_assessments(
      target_store_id, onboarding_value, 'signup', new.id
    );
  end if;

  insert into public.store_subscriptions (
    store_id, plan_code, status, trial_started_at, trial_ends_at,
    activation_source, test_mode
  ) values (
    target_store_id, 'pro', 'trialing', trial_start,
    trial_start + interval '30 days', 'trial', true
  ) on conflict (store_id) do nothing;

  if found then
    insert into public.subscription_events (
      store_id, event_type, new_plan_code, new_status, actor_user_id,
      source, metadata, occurred_at
    ) values (
      target_store_id, 'trial_started', 'pro', 'trialing', new.id,
      'signup', pg_catalog.jsonb_build_object('trial_days', 30), trial_start
    );
  end if;
  return new;
end;
$$;

commit;
