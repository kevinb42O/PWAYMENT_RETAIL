begin;

alter table public.stores
  add column if not exists commercial_return_policy jsonb not null default '{"enabled":false,"windowDays":14,"reminderLeadDays":2,"excludedProductTypes":["service","gift-card"],"excludedCategoryIds":[],"effectiveFrom":"1970-01-01T00:00:00.000Z"}'::jsonb,
  add column if not exists customer_insight_settings jsonb not null default '{"enabled":false,"returnRemindersEnabled":true,"brandAffinityEnabled":true,"brandLookbackDays":540,"minimumBrandTransactions":2}'::jsonb;

alter table public.stores
  drop constraint if exists stores_commercial_return_policy_valid,
  add constraint stores_commercial_return_policy_valid check (
    jsonb_typeof(commercial_return_policy) = 'object'
    and commercial_return_policy ?& array['enabled','windowDays','reminderLeadDays','excludedProductTypes','excludedCategoryIds','effectiveFrom']
    and jsonb_typeof(commercial_return_policy -> 'enabled') = 'boolean'
    and (commercial_return_policy ->> 'windowDays')::integer between 1 and 365
    and (commercial_return_policy ->> 'reminderLeadDays')::integer between 0 and 30
    and jsonb_typeof(commercial_return_policy -> 'excludedProductTypes') = 'array'
    and jsonb_typeof(commercial_return_policy -> 'excludedCategoryIds') = 'array'
    and (commercial_return_policy ->> 'effectiveFrom')::timestamptz is not null
  ),
  drop constraint if exists stores_customer_insight_settings_valid,
  add constraint stores_customer_insight_settings_valid check (
    jsonb_typeof(customer_insight_settings) = 'object'
    and customer_insight_settings ?& array['enabled','returnRemindersEnabled','brandAffinityEnabled','brandLookbackDays','minimumBrandTransactions']
    and jsonb_typeof(customer_insight_settings -> 'enabled') = 'boolean'
    and jsonb_typeof(customer_insight_settings -> 'returnRemindersEnabled') = 'boolean'
    and jsonb_typeof(customer_insight_settings -> 'brandAffinityEnabled') = 'boolean'
    and (customer_insight_settings ->> 'brandLookbackDays')::integer between 30 and 1825
    and (customer_insight_settings ->> 'minimumBrandTransactions')::integer between 2 and 10
  );

grant update (commercial_return_policy, customer_insight_settings)
  on public.stores to authenticated;

comment on column public.stores.commercial_return_policy is
  'Machine-readable commercial return window snapshotted on new sales; never describes statutory warranty rights.';
comment on column public.stores.customer_insight_settings is
  'Store-wide opt-in for deterministic, tenant-local Pace customer guidance.';

commit;
