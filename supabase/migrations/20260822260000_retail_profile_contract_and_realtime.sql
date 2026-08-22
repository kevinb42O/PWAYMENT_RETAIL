begin;

-- One validator is shared by signup and later owner changes. This prevents a
-- hand-written client from bypassing the same explicit retail choices that the
-- onboarding wizard requires.
create or replace function private.is_valid_store_configuration_v2(candidate jsonb)
returns boolean
language plpgsql
stable
set search_path = ''
as $$
declare
  capability text;
  parsed_completed_at timestamptz;
begin
  if pg_catalog.jsonb_typeof(candidate) is distinct from 'object'
     or candidate ->> 'version' is distinct from '2'
     or private.is_valid_retail_profile_code(candidate ->> 'industry') is not true
     or candidate ->> 'salesModel' not in ('physical', 'omnichannel', 'online-first', 'service-led')
     or candidate ->> 'teamSize' not in ('solo', 'small', 'medium', 'large')
     or candidate ->> 'catalogSource' not in ('none', 'spreadsheet', 'pos', 'ecommerce', 'erp', 'supplier')
     or candidate ->> 'importTiming' not in ('now', 'later')
     or candidate ->> 'pricingModel' not in ('single', 'customer-groups', 'retail-b2b', 'contract')
     or candidate ->> 'defaultVat' not in ('mixed', '0', '6', '12', '21')
     or candidate ->> 'serviceContactPreference' not in ('both', 'email', 'phone')
     or pg_catalog.jsonb_typeof(candidate -> 'firstRunCompleted') is distinct from 'boolean'
     or pg_catalog.jsonb_typeof(candidate -> 'modules') is distinct from 'object'
     or pg_catalog.jsonb_typeof(candidate #> '{modules,catalog}') is distinct from 'boolean'
     or pg_catalog.jsonb_typeof(candidate #> '{modules,customers}') is distinct from 'boolean'
     or pg_catalog.jsonb_typeof(candidate #> '{modules,service}') is distinct from 'boolean'
     or pg_catalog.jsonb_typeof(candidate #> '{modules,workforce}') is distinct from 'boolean'
     or pg_catalog.jsonb_typeof(candidate #> '{modules,webshop}') is distinct from 'boolean'
     or pg_catalog.jsonb_typeof(candidate #> '{modules,insights}') is distinct from 'boolean'
     or pg_catalog.jsonb_typeof(candidate -> 'capabilities') is distinct from 'object'
     or nullif(candidate ->> 'completedAt', '') is null then
    return false;
  end if;

  begin
    parsed_completed_at := (candidate ->> 'completedAt')::timestamptz;
  exception when invalid_datetime_format or datetime_field_overflow then
    return false;
  end;
  if parsed_completed_at is null then
    return false;
  end if;

  foreach capability in array array[
    'variant-matrix', 'multiple-identifiers', 'stock-locations',
    'serial-numbers', 'lot-traceability', 'measurable-quantities',
    'packaging', 'customer-pricing', 'webshop-variants'
  ]
  loop
    if candidate #>> array['capabilities', capability] not in (
      'unknown', 'not-needed', 'required', 'enabled', 'blocked'
    ) then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

revoke all on function private.is_valid_store_configuration_v2(jsonb)
  from public, anon, authenticated;

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
  completed_at_value timestamptz;
begin
  if actor_id is null
     or not private.has_store_role(target_store_id, array['owner']) then
    raise exception using errcode = '42501', message = 'retail-profile:forbidden:Alleen de eigenaar kan het winkelprofiel wijzigen.';
  end if;
  if not private.is_valid_store_configuration_v2(profile_payload) then
    raise exception using errcode = '22023', message = 'retail-profile:invalid:De volledige retailconfiguratie is ongeldig of onvolledig.';
  end if;

  requested_profile := pg_catalog.btrim(profile_payload ->> 'industry');
  completed_at_value := (profile_payload ->> 'completedAt')::timestamptz;

  update public.stores
  set industry_code = requested_profile,
      onboarding_config = profile_payload,
      onboarding_completed_at = completed_at_value
  where id = target_store_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'retail-profile:not-found:De winkel bestaat niet.';
  end if;

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
       and not private.is_valid_store_configuration_v2(
         new.raw_user_meta_data -> 'onboarding_config'
       ) then
      raise exception using errcode = '22023', message = 'retail-profile:required:Kies en bevestig eerst het type retailwinkel.';
    end if;

    if private.is_valid_store_configuration_v2(
      new.raw_user_meta_data -> 'onboarding_config'
    ) then
      onboarding_value := new.raw_user_meta_data -> 'onboarding_config';
      requested_industry := onboarding_value ->> 'industry';
      onboarding_completed := trial_start;
    else
      -- The one internal demo account predates onboarding. It is explicitly a
      -- general-retail fixture, never a merchant-sector inference.
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

-- Owners may still maintain ordinary merchant identity fields, but the three
-- retail-contract columns can now only be changed by the validated RPC above.
revoke update on public.stores from authenticated;
grant update (
  name, legal_name, vat_number, address_line_1, address_line_2,
  postal_code, city, country_code, phone, email, website,
  receipt_footer, return_policy, currency, locale, timezone
) on public.stores to authenticated;

-- Open clients refresh the authoritative configuration when another device or
-- a platform lifecycle action changes the normalized retail profile.
do $retail_profile_realtime$
declare
  target_table text;
begin
  foreach target_table in array array[
    'store_retail_profiles', 'store_capability_assessments'
  ]
  loop
    if not exists (
      select 1 from pg_catalog.pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = target_table
    ) then
      execute pg_catalog.format(
        'alter publication supabase_realtime add table public.%I', target_table
      );
    end if;
  end loop;
end;
$retail_profile_realtime$;

do $retail_profile_contract_assertions$
declare
  signup_definition text;
begin
  select pg_catalog.pg_get_functiondef('public.handle_new_auth_user()'::regprocedure)
    into strict signup_definition;
  if position('is_valid_store_configuration_v2' in signup_definition) = 0 then
    raise exception 'Signup is not linked to the V2 retail contract.';
  end if;
  if pg_catalog.has_column_privilege('authenticated', 'public.stores', 'industry_code', 'UPDATE')
     or pg_catalog.has_column_privilege('authenticated', 'public.stores', 'onboarding_config', 'UPDATE')
     or pg_catalog.has_column_privilege('authenticated', 'public.stores', 'onboarding_completed_at', 'UPDATE') then
    raise exception 'A retail-contract store column is still directly writable.';
  end if;
  if not pg_catalog.has_column_privilege('authenticated', 'public.stores', 'name', 'UPDATE') then
    raise exception 'Ordinary merchant profile updates were accidentally revoked.';
  end if;
end;
$retail_profile_contract_assertions$;

commit;
