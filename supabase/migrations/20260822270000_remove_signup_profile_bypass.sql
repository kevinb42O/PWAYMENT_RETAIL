begin;

-- Account creation is stricter than later profile maintenance. A merchant may
-- declare requirements, but platform lifecycle states are server-owned.
create or replace function private.is_valid_signup_store_configuration_v2(candidate jsonb)
returns boolean
language plpgsql
stable
set search_path = ''
as $$
declare
  capability text;
begin
  if not private.is_valid_store_configuration_v2(candidate) then
    return false;
  end if;

  foreach capability in array array[
    'variant-matrix', 'multiple-identifiers', 'stock-locations',
    'serial-numbers', 'lot-traceability', 'measurable-quantities',
    'packaging', 'customer-pricing', 'webshop-variants'
  ]
  loop
    if candidate #>> array['capabilities', capability] not in (
      'unknown', 'not-needed', 'required'
    ) then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

revoke all on function private.is_valid_signup_store_configuration_v2(jsonb)
  from public, anon, authenticated;

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
    onboarding_value := new.raw_user_meta_data -> 'onboarding_config';

    if not private.is_valid_signup_store_configuration_v2(onboarding_value) then
      raise exception using
        errcode = '22023',
        message = 'retail-profile:required:Kies en bevestig eerst het type retailwinkel.';
    end if;

    requested_industry := onboarding_value ->> 'industry';
    onboarding_completed := (onboarding_value ->> 'completedAt')::timestamptz;

    insert into public.stores (
      name, is_demo, industry_code, onboarding_config, onboarding_completed_at
    ) values (
      coalesce(requested_store_name, 'Mijn winkel'),
      false,
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

do $retail_signup_contract_assertions$
declare
  signup_definition text;
begin
  select pg_catalog.pg_get_functiondef('public.handle_new_auth_user()'::regprocedure)
    into strict signup_definition;

  if position('is_valid_signup_store_configuration_v2' in signup_definition) = 0 then
    raise exception 'Signup is not linked to the merchant-only retail contract.';
  end if;
  if position('is_demo' in signup_definition) = 0
     or position('false' in signup_definition) = 0 then
    raise exception 'Ordinary signup no longer has an explicit non-demo value.';
  end if;
end;
$retail_signup_contract_assertions$;

commit;
