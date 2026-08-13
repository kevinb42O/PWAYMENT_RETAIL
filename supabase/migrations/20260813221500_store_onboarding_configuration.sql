begin;

alter table public.stores
  add column if not exists industry_code text not null default 'general-retail',
  add column if not exists onboarding_config jsonb not null default '{}'::jsonb,
  add column if not exists onboarding_completed_at timestamptz;

alter table public.stores
  alter column industry_code set default 'general-retail';
update public.stores
set industry_code = 'general-retail'
where industry_code is null;
alter table public.stores
  alter column industry_code set not null;

alter table public.stores drop constraint if exists stores_industry_code_check;
alter table public.stores add constraint stores_industry_code_check check (
  industry_code in (
    'telecom-it', 'fashion', 'lingerie', 'bicycles', 'toys',
    'skate-sports', 'electronics', 'home-living', 'beauty', 'food',
    'jewelry', 'books-hobby', 'general-retail', 'repair-service', 'other'
  )
);

alter table public.stores drop constraint if exists stores_onboarding_config_object_check;
alter table public.stores add constraint stores_onboarding_config_object_check check (
  jsonb_typeof(onboarding_config) = 'object'
);

create index if not exists stores_industry_code_idx on public.stores (industry_code);

comment on column public.stores.onboarding_config is
  'Versioned, non-authoritative store setup preferences. Billing entitlements remain server-controlled.';

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
  trial_start timestamptz := now();
  onboarding_value jsonb := '{}'::jsonb;
  requested_industry text := 'general-retail';
  onboarding_completed timestamptz;
begin
  first_name_value := nullif(btrim(new.raw_user_meta_data ->> 'first_name'), '');
  last_name_value := nullif(btrim(new.raw_user_meta_data ->> 'last_name'), '');
  display_name_value := coalesce(
    nullif(btrim(concat_ws(' ', first_name_value, last_name_value)), ''),
    split_part(coalesce(new.email, 'Gebruiker'), '@', 1)
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
    requested_store_name := nullif(btrim(new.raw_user_meta_data ->> 'store_name'), '');
    if lower(coalesce(new.email, '')) = 'kevin@webaanzee.be' then
      requested_store_name := 'PWAYMENT Demo Store';
    end if;

    if jsonb_typeof(new.raw_user_meta_data -> 'onboarding_config') = 'object'
      and new.raw_user_meta_data -> 'onboarding_config' ->> 'version' = '1'
    then
      onboarding_value := new.raw_user_meta_data -> 'onboarding_config';
      requested_industry := coalesce(nullif(onboarding_value ->> 'industry', ''), 'general-retail');
      if requested_industry not in (
        'telecom-it', 'fashion', 'lingerie', 'bicycles', 'toys',
        'skate-sports', 'electronics', 'home-living', 'beauty', 'food',
        'jewelry', 'books-hobby', 'general-retail', 'repair-service', 'other'
      ) then
        requested_industry := 'general-retail';
      end if;
      onboarding_completed := trial_start;
    end if;

    insert into public.stores (
      name, is_demo, industry_code, onboarding_config, onboarding_completed_at
    ) values (
      coalesce(requested_store_name, 'Mijn winkel'),
      lower(coalesce(new.email, '')) = 'kevin@webaanzee.be',
      requested_industry,
      onboarding_value,
      onboarding_completed
    ) returning id into target_store_id;
    member_role := 'owner';
  end if;

  insert into public.store_memberships (store_id, user_id, role, status)
  values (target_store_id, new.id, member_role, 'active')
  on conflict (store_id, user_id) do nothing;

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
      'signup', jsonb_build_object('trial_days', 30), trial_start
    );
  end if;
  return new;
end;
$$;

commit;
