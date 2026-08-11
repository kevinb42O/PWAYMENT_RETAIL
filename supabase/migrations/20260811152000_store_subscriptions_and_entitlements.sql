begin;

-- Subscription plans and feature entitlements are tenant-scoped. Operational
-- retail data never references these tables, so changing or removing a
-- subscription can never cascade into products, transactions or customers.
create table public.billing_plans (
  code text primary key check (code in ('basic', 'pro', 'enterprise')),
  name text not null,
  rank integer not null unique check (rank > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.billing_features (
  feature_key text primary key check (feature_key ~ '^[a-z0-9_.-]+$'),
  name text not null,
  category text not null,
  value_type text not null default 'boolean' check (value_type in ('boolean', 'limit')),
  created_at timestamptz not null default now()
);

create table public.billing_plan_features (
  plan_code text not null references public.billing_plans(code) on delete cascade,
  feature_key text not null references public.billing_features(feature_key) on delete cascade,
  enabled boolean not null default false,
  limit_value integer check (limit_value is null or limit_value >= 0),
  primary key (plan_code, feature_key)
);

create table public.store_subscriptions (
  store_id uuid primary key references public.stores(id) on delete cascade,
  plan_code text not null references public.billing_plans(code),
  status text not null check (status in ('trialing', 'active', 'past_due', 'canceled', 'expired')),
  billing_cycle text check (billing_cycle is null or billing_cycle in ('monthly', 'yearly')),
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  current_period_started_at timestamptz,
  current_period_ends_at timestamptz,
  cancel_at_period_end boolean not null default false,
  activation_source text not null default 'trial'
    check (activation_source in ('trial', 'test_override', 'provider', 'manual')),
  provider text,
  provider_customer_id text,
  provider_subscription_id text,
  test_mode boolean not null default true,
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    status <> 'trialing'
    or (trial_started_at is not null and trial_ends_at is not null and trial_ends_at > trial_started_at)
  )
);

create table public.subscription_events (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  event_type text not null,
  previous_plan_code text references public.billing_plans(code),
  new_plan_code text references public.billing_plans(code),
  previous_status text,
  new_status text,
  actor_user_id uuid references auth.users(id),
  source text not null,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  occurred_at timestamptz not null default now()
);

create index subscription_events_store_occurred_idx
  on public.subscription_events (store_id, occurred_at desc);
create unique index store_subscriptions_provider_subscription_unique
  on public.store_subscriptions (provider, provider_subscription_id)
  where provider_subscription_id is not null;

create trigger billing_plans_set_updated_at
  before update on public.billing_plans
  for each row execute function private.set_updated_at();
create trigger store_subscriptions_set_updated_at
  before update on public.store_subscriptions
  for each row execute function private.set_updated_at();

insert into public.billing_plans (code, name, rank) values
  ('basic', 'Pwayment Basis', 1),
  ('pro', 'Retail Professional', 2),
  ('enterprise', 'Enterprise & Ketens', 3);

insert into public.billing_features (feature_key, name, category, value_type) values
  ('pos.checkout', 'Kassa en betalingen', 'pos', 'boolean'),
  ('reports.z', 'Z-rapport', 'reports', 'boolean'),
  ('history.full', 'Volledige transactiehistoriek', 'reports', 'boolean'),
  ('catalog.active_products', 'Actieve producten', 'catalog', 'limit'),
  ('catalog.categories', 'Hoofdcategorieen', 'catalog', 'limit'),
  ('catalog.labels', 'Barcode-etiketten', 'catalog', 'boolean'),
  ('insights.advanced', 'Retail intelligence', 'insights', 'boolean'),
  ('inventory.forecast', 'Voorraadprognose en besteladvies', 'inventory', 'boolean'),
  ('purchase_orders.create', 'Nieuwe inkooporders', 'inventory', 'boolean'),
  ('loyalty.manage', 'Spaarprogramma en VIP-niveaus', 'customers', 'boolean'),
  ('gift_cards.issue', 'Cadeaubonnen uitgeven en opladen', 'customers', 'boolean'),
  ('webshop.publish', 'Webshop publiceren', 'webshop', 'boolean'),
  ('integrations.configure', 'Integraties, API en webhooks', 'integrations', 'boolean'),
  ('hardware.advanced', 'Betaalterminals en geavanceerde hardware', 'hardware', 'boolean'),
  ('multi_store.manage', 'Multi-store beheer', 'enterprise', 'boolean'),
  ('team.advanced', 'Geavanceerde rollen en permissies', 'enterprise', 'boolean');

insert into public.billing_plan_features (plan_code, feature_key, enabled, limit_value)
select plan.code, feature.feature_key,
  case
    when feature.feature_key in ('pos.checkout', 'reports.z') then true
    when plan.code in ('pro', 'enterprise') and feature.feature_key <> 'multi_store.manage' then true
    when plan.code = 'enterprise' then true
    else false
  end,
  case
    when feature.feature_key = 'catalog.active_products' and plan.code = 'basic' then 250
    when feature.feature_key = 'catalog.categories' and plan.code = 'basic' then 5
    else null
  end
from public.billing_plans plan
cross join public.billing_features feature;

-- A trial is exactly 30 elapsed days (720 hours), not "the end of next month".
-- Existing stores receive the same one-off launch trial. Demo stores are the
-- payment-free plan simulator until the real payment provider is connected.
insert into public.store_subscriptions (
  store_id, plan_code, status, trial_started_at, trial_ends_at,
  activation_source, test_mode
)
select id, 'pro', 'trialing', now(), now() + interval '30 days',
       'trial', true
from public.stores
on conflict (store_id) do nothing;

insert into public.subscription_events (
  store_id, event_type, new_plan_code, new_status, source,
  metadata, occurred_at
)
select store_id, 'trial_started', 'pro', 'trialing', 'migration',
       jsonb_build_object('trial_days', 30), trial_started_at
from public.store_subscriptions
where activation_source = 'trial'
  and not exists (
    select 1 from public.subscription_events event
    where event.store_id = store_subscriptions.store_id
      and event.event_type = 'trial_started'
  );

create or replace function private.effective_plan(target_store_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when subscription.store_id is null then 'basic'
    when subscription.status = 'trialing'
      and subscription.trial_ends_at > now()
      then subscription.plan_code
    when subscription.status = 'active' then subscription.plan_code
    when subscription.status = 'canceled'
      and subscription.current_period_ends_at > now()
      then subscription.plan_code
    else 'basic'
  end
  from (select target_store_id as requested_store_id) request
  left join public.store_subscriptions subscription
    on subscription.store_id = request.requested_store_id;
$$;

create or replace function private.has_entitlement(
  target_store_id uuid,
  requested_feature text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(entitlement.enabled, false)
  from public.billing_plan_features entitlement
  where entitlement.plan_code = private.effective_plan(target_store_id)
    and entitlement.feature_key = requested_feature;
$$;

create or replace function private.entitlement_limit(
  target_store_id uuid,
  requested_feature text
)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select entitlement.limit_value
  from public.billing_plan_features entitlement
  where entitlement.plan_code = private.effective_plan(target_store_id)
    and entitlement.feature_key = requested_feature;
$$;

revoke all on function private.effective_plan(uuid) from public, anon, authenticated;
revoke all on function private.has_entitlement(uuid, text) from public, anon, authenticated;
revoke all on function private.entitlement_limit(uuid, text) from public, anon, authenticated;

create or replace function public.get_store_entitlements(target_store_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  subscription public.store_subscriptions%rowtype;
  effective_plan_code text;
  effective_status text;
  features jsonb;
  limits jsonb;
begin
  if (select auth.uid()) is null
     or not private.is_store_member(target_store_id) then
    raise exception using errcode = '42501', message = 'billing:forbidden:Geen toegang tot deze winkel.';
  end if;

  select * into subscription
  from public.store_subscriptions
  where store_id = target_store_id;

  effective_plan_code := private.effective_plan(target_store_id);
  effective_status := case
    when subscription.store_id is null then 'active'
    when subscription.status = 'trialing'
      and subscription.trial_ends_at <= now() then 'expired'
    else subscription.status
  end;

  select coalesce(jsonb_object_agg(feature_key, enabled), '{}'::jsonb),
         coalesce(jsonb_object_agg(feature_key, limit_value)
           filter (where limit_value is not null), '{}'::jsonb)
    into features, limits
  from public.billing_plan_features
  where plan_code = effective_plan_code;

  return jsonb_build_object(
    'storedPlan', coalesce(subscription.plan_code, 'basic'),
    'effectivePlan', effective_plan_code,
    'status', effective_status,
    'billingCycle', subscription.billing_cycle,
    'trialStartedAt', subscription.trial_started_at,
    'trialEndsAt', subscription.trial_ends_at,
    'currentPeriodEndsAt', subscription.current_period_ends_at,
    'serverNow', now(),
    'features', features,
    'limits', limits,
    'canSimulateBilling', coalesce(subscription.test_mode, false),
    'version', coalesce(subscription.version, 0)
  );
end;
$$;

revoke all on function public.get_store_entitlements(uuid) from public, anon;
grant execute on function public.get_store_entitlements(uuid) to authenticated;

create or replace function public.change_test_subscription(
  target_store_id uuid,
  target_plan text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  previous public.store_subscriptions%rowtype;
begin
  if actor_id is null
     or not private.has_store_role(target_store_id, array['owner']) then
    raise exception using errcode = '42501', message = 'billing:forbidden:Alleen de eigenaar kan het testabonnement wijzigen.';
  end if;
  if target_plan not in ('basic', 'pro', 'enterprise') then
    raise exception using errcode = 'P0001', message = 'billing:invalid-plan:Onbekend abonnement.';
  end if;

  select * into previous from public.store_subscriptions
  where store_id = target_store_id for update;
  if previous.store_id is null or not previous.test_mode then
    raise exception using errcode = '42501', message = 'billing:test-disabled:Betalingsvrije planwissels zijn niet actief voor deze winkel.';
  end if;

  update public.store_subscriptions set
    plan_code = target_plan,
    status = 'active',
    billing_cycle = coalesce(billing_cycle, 'yearly'),
    current_period_started_at = now(),
    current_period_ends_at = null,
    cancel_at_period_end = false,
    activation_source = 'test_override',
    version = version + 1
  where store_id = target_store_id;

  insert into public.subscription_events (
    store_id, event_type, previous_plan_code, new_plan_code,
    previous_status, new_status, actor_user_id, source, metadata
  ) values (
    target_store_id,
    case when target_plan = 'basic' then 'test_downgrade' else 'test_upgrade' end,
    previous.plan_code, target_plan, previous.status, 'active', actor_id,
    'test_override', jsonb_build_object('payment_skipped', true)
  );

  return public.get_store_entitlements(target_store_id);
end;
$$;

revoke all on function public.change_test_subscription(uuid, text) from public, anon;
grant execute on function public.change_test_subscription(uuid, text) to authenticated;

create or replace function public.simulate_test_trial(
  target_store_id uuid,
  days_remaining integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  subscription public.store_subscriptions%rowtype;
  trial_start timestamptz := now();
begin
  if actor_id is null
     or not private.has_store_role(target_store_id, array['owner']) then
    raise exception using errcode = '42501', message = 'billing:forbidden:Alleen de eigenaar kan een testtrial simuleren.';
  end if;
  if days_remaining < 0 or days_remaining > 30 then
    raise exception using errcode = 'P0001', message = 'billing:invalid-trial:Kies 0 tot en met 30 resterende dagen.';
  end if;
  select * into subscription from public.store_subscriptions
  where store_id = target_store_id for update;
  if subscription.store_id is null or not subscription.test_mode then
    raise exception using errcode = '42501', message = 'billing:test-disabled:Trialsimulatie is niet actief voor deze winkel.';
  end if;

  update public.store_subscriptions set
    plan_code = 'pro',
    status = 'trialing',
    trial_started_at = trial_start,
    trial_ends_at = case
      when days_remaining = 0 then trial_start - interval '1 second'
      else trial_start + make_interval(days => days_remaining)
    end,
    activation_source = 'test_override',
    version = version + 1
  where store_id = target_store_id;

  insert into public.subscription_events (
    store_id, event_type, previous_plan_code, new_plan_code,
    previous_status, new_status, actor_user_id, source, metadata
  ) values (
    target_store_id, 'test_trial_simulated', subscription.plan_code, 'pro',
    subscription.status, 'trialing', actor_id, 'test_override',
    jsonb_build_object('days_remaining', days_remaining, 'payment_skipped', true)
  );

  return public.get_store_entitlements(target_store_id);
end;
$$;

revoke all on function public.simulate_test_trial(uuid, integer) from public, anon;
grant execute on function public.simulate_test_trial(uuid, integer) to authenticated;

-- Extend auth bootstrap: every newly created store starts one 30-day Pro trial.
-- Invited users hit ON CONFLICT and inherit the store's existing subscription.
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
    insert into public.stores (name, is_demo)
    values (
      coalesce(requested_store_name, 'Mijn winkel'),
      lower(coalesce(new.email, '')) = 'kevin@webaanzee.be'
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

-- Product/category limits are enforced at the database boundary without ever
-- archiving existing rows during a downgrade. Grandfathered active rows remain
-- sellable, but no new active row can be added until the store is under limit.
create or replace function private.can_activate_product(
  target_store_id uuid,
  target_product_id uuid,
  target_is_active boolean
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not target_is_active
    or private.entitlement_limit(target_store_id, 'catalog.active_products') is null
    or exists (
      select 1 from public.products
      where store_id = target_store_id and id = target_product_id and is_active
    )
    or (
      select count(*) from public.products
      where store_id = target_store_id and is_active
    ) < private.entitlement_limit(target_store_id, 'catalog.active_products');
$$;

create or replace function private.can_activate_category(
  target_store_id uuid,
  target_category_id uuid,
  target_is_active boolean
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not target_is_active
    or private.entitlement_limit(target_store_id, 'catalog.categories') is null
    or exists (
      select 1 from public.categories
      where store_id = target_store_id and id = target_category_id and is_active
    )
    or (
      select count(*) from public.categories
      where store_id = target_store_id and is_active
    ) < private.entitlement_limit(target_store_id, 'catalog.categories');
$$;

revoke all on function private.can_activate_product(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function private.can_activate_category(uuid, uuid, boolean) from public, anon, authenticated;

drop policy products_management_insert on public.products;
drop policy products_management_update on public.products;
create policy products_management_insert
  on public.products for insert to authenticated
  with check (
    (select private.has_store_role(store_id, array['owner', 'manager']))
    and (select private.can_activate_product(store_id, id, is_active))
  );
create policy products_management_update
  on public.products for update to authenticated
  using ((select private.has_store_role(store_id, array['owner', 'manager'])))
  with check (
    (select private.has_store_role(store_id, array['owner', 'manager']))
    and (select private.can_activate_product(store_id, id, is_active))
  );

drop policy categories_management_insert on public.categories;
drop policy categories_management_update on public.categories;
create policy categories_management_insert
  on public.categories for insert to authenticated
  with check (
    (select private.has_store_role(store_id, array['owner', 'manager']))
    and (select private.can_activate_category(store_id, id, is_active))
  );
create policy categories_management_update
  on public.categories for update to authenticated
  using ((select private.has_store_role(store_id, array['owner', 'manager'])))
  with check (
    (select private.has_store_role(store_id, array['owner', 'manager']))
    and (select private.can_activate_category(store_id, id, is_active))
  );

-- Preserve the reviewed implementations and place a subscription-aware wrapper
-- in front. Existing gift-card liabilities and existing purchase orders remain
-- serviceable after downgrade.
alter function public.mutate_gift_card(uuid, jsonb)
  rename to mutate_gift_card_internal;
revoke all on function public.mutate_gift_card_internal(uuid, jsonb)
  from public, anon, authenticated;

create function public.mutate_gift_card(target_store_id uuid, payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if payload ->> 'action' in ('issue', 'recharge')
     and not private.has_entitlement(target_store_id, 'gift_cards.issue') then
    raise exception using errcode = 'P0001', message = 'giftcard:plan-required:Cadeaubonnen uitgeven en opladen vereist Retail Professional.';
  end if;
  return public.mutate_gift_card_internal(target_store_id, payload);
end;
$$;
revoke all on function public.mutate_gift_card(uuid, jsonb) from public, anon;
grant execute on function public.mutate_gift_card(uuid, jsonb) to authenticated;

alter function public.save_purchase_order(uuid, jsonb)
  rename to save_purchase_order_internal;
revoke all on function public.save_purchase_order_internal(uuid, jsonb)
  from public, anon, authenticated;

create function public.save_purchase_order(target_store_id uuid, payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
      select 1 from public.purchase_orders
      where store_id = target_store_id
        and (external_id = payload ->> 'id' or id::text = payload ->> 'id')
    ) and not private.has_entitlement(target_store_id, 'purchase_orders.create') then
    raise exception using errcode = 'P0001', message = 'purchase:plan-required:Nieuwe inkooporders vereisen Retail Professional.';
  end if;
  return public.save_purchase_order_internal(target_store_id, payload);
end;
$$;
revoke all on function public.save_purchase_order(uuid, jsonb) from public, anon;
grant execute on function public.save_purchase_order(uuid, jsonb) to authenticated;

alter table public.billing_plans enable row level security;
alter table public.billing_features enable row level security;
alter table public.billing_plan_features enable row level security;
alter table public.store_subscriptions enable row level security;
alter table public.subscription_events enable row level security;

create policy billing_plans_read
  on public.billing_plans for select to authenticated using (true);
create policy billing_features_read
  on public.billing_features for select to authenticated using (true);
create policy billing_plan_features_read
  on public.billing_plan_features for select to authenticated using (true);
create policy store_subscriptions_member_read
  on public.store_subscriptions for select to authenticated
  using ((select private.is_store_member(store_id)));
create policy subscription_events_management_read
  on public.subscription_events for select to authenticated
  using ((select private.has_store_role(store_id, array['owner', 'manager'])));

grant select on public.billing_plans, public.billing_features,
  public.billing_plan_features, public.store_subscriptions,
  public.subscription_events to authenticated;

alter publication supabase_realtime add table public.store_subscriptions;

commit;
