begin;

-- Commercial capability expansion. Test-mode plan switching intentionally
-- remains available to every store owner for the current public testing phase.
insert into public.billing_features (feature_key, name, category, value_type) values
  ('customer_display.local', 'Lokaal klantendisplay', 'hardware', 'boolean'),
  ('service.orders', 'ServiceDesk herstelorders', 'service', 'boolean'),
  ('service.active_orders', 'Actieve ServiceDesk dossiers', 'service', 'limit'),
  ('service.attachments', 'ServiceDesk foto-intake', 'service', 'boolean'),
  ('service.notifications.sms', 'ServiceDesk SMS notificaties', 'service', 'boolean'),
  ('service.technician_assignment', 'ServiceDesk techniekertoewijzing', 'service', 'boolean'),
  ('customers.crm', 'Klanten CRM', 'customers', 'boolean'),
  ('audit.viewer', 'Volledig auditlogboek', 'audit', 'boolean'),
  ('audit.export', 'Auditexport', 'audit', 'boolean'),
  ('insights.sales', 'Verkoop-, marge- en klantinzichten', 'insights', 'boolean'),
  ('api.access', 'REST API toegang', 'integrations', 'boolean'),
  ('webhooks.manage', 'Webhooks beheren', 'integrations', 'boolean')
on conflict (feature_key) do update set
  name = excluded.name,
  category = excluded.category,
  value_type = excluded.value_type;

insert into public.billing_plan_features (plan_code, feature_key, enabled, limit_value)
select plan.code, feature.feature_key,
  case
    when feature.feature_key in (
      'customer_display.local', 'service.orders', 'customers.crm',
      'insights.sales'
    ) then plan.code in ('pro', 'enterprise')
    when feature.feature_key = 'service.active_orders' then plan.code in ('pro', 'enterprise')
    else plan.code = 'enterprise'
  end,
  case
    when feature.feature_key = 'service.active_orders' and plan.code = 'pro' then 50
    else null
  end
from public.billing_plans plan
cross join public.billing_features feature
where feature.feature_key in (
  'customer_display.local', 'service.orders', 'service.active_orders',
  'service.attachments', 'service.notifications.sms',
  'service.technician_assignment', 'customers.crm', 'audit.viewer',
  'audit.export', 'insights.sales', 'api.access', 'webhooks.manage'
)
on conflict (plan_code, feature_key) do update set
  enabled = excluded.enabled,
  limit_value = excluded.limit_value;

-- Correct capabilities that were previously too broad for the approved matrix.
update public.billing_plan_features
set enabled = (plan_code = 'enterprise'), limit_value = null
where feature_key in (
  'workforce.core', 'inventory.forecast', 'purchase_orders.create',
  'multi_store.manage', 'team.advanced'
);

update public.billing_plan_features
set enabled = (plan_code in ('pro', 'enterprise')), limit_value = null
where feature_key in (
  'history.full', 'catalog.labels', 'insights.advanced', 'loyalty.manage',
  'gift_cards.issue', 'webshop.publish', 'integrations.configure',
  'hardware.advanced'
);

-- Keep the intentionally payment-free test workflow for now. This explicit
-- update makes the temporary product decision visible and reversible later.
update public.store_subscriptions set test_mode = true where test_mode is distinct from true;

-- Repair the zero-day simulation: the old function attempted to store an
-- already-ended row with status=trialing, which violates the table constraint.
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
  next_status text := case when days_remaining = 0 then 'expired' else 'trialing' end;
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
    status = next_status,
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
    subscription.status, next_status, actor_id, 'test_override',
    jsonb_build_object('days_remaining', days_remaining, 'payment_skipped', true)
  );

  return public.get_store_entitlements(target_store_id);
end;
$$;

-- ServiceDesk: wrap the existing save RPC. Existing records remain updatable
-- after downgrade, while creating a new record requires the plan and respects
-- the active-order limit. Enterprise-only attachments are checked separately.
alter function public.save_service_order(uuid, jsonb)
  rename to save_service_order_internal;
revoke all on function public.save_service_order_internal(uuid, jsonb)
  from public, anon, authenticated;

create function public.save_service_order(target_store_id uuid, order_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_id uuid;
  existing boolean;
  active_limit integer;
  active_count integer;
begin
  begin
    requested_id := (order_payload ->> 'id')::uuid;
  exception when invalid_text_representation then
    raise exception using errcode = 'P0001', message = 'service-order:invalid:Ongeldige dossieridentificatie.';
  end;

  select exists (
    select 1 from public.service_orders
    where store_id = target_store_id and id = requested_id
  ) into existing;

  if not existing and not private.has_entitlement(target_store_id, 'service.orders') then
    raise exception using errcode = 'P0001', message = 'entitlement:plan-required:service.orders';
  end if;

  if not existing then
    active_limit := private.entitlement_limit(target_store_id, 'service.active_orders');
    if active_limit is not null then
      select count(*) into active_count
      from public.service_orders
      where store_id = target_store_id
        and status in ('open', 'in-progress', 'blocked', 'ready');
      if active_count >= active_limit then
        raise exception using errcode = 'P0001', message = 'entitlement:limit-reached:service.active_orders';
      end if;
    end if;
  end if;

  if jsonb_array_length(coalesce(order_payload -> 'attachments', '[]'::jsonb)) > 0
     and not private.has_entitlement(target_store_id, 'service.attachments') then
    raise exception using errcode = 'P0001', message = 'entitlement:plan-required:service.attachments';
  end if;

  return public.save_service_order_internal(target_store_id, order_payload);
end;
$$;
revoke all on function public.save_service_order(uuid, jsonb) from public, anon;
grant execute on function public.save_service_order(uuid, jsonb) to authenticated;

-- Direct ServiceDesk table access may not bypass plan checks. The RPC above is
-- the downgrade-safe path for completing existing obligations.
create policy service_orders_entitlement_select
  on public.service_orders as restrictive for select to authenticated
  using ((select private.has_entitlement(store_id, 'service.orders')));
create policy service_orders_entitlement_insert
  on public.service_orders as restrictive for insert to authenticated
  with check ((select private.has_entitlement(store_id, 'service.orders')));
create policy service_orders_entitlement_update
  on public.service_orders as restrictive for update to authenticated
  using ((select private.has_entitlement(store_id, 'service.orders')))
  with check ((select private.has_entitlement(store_id, 'service.orders')));

-- Audit events are still written for every plan; only the commercial viewer
-- and raw table reads require Enterprise.
create policy audit_entries_entitlement_select
  on public.audit_entries as restrictive for select to authenticated
  using ((select private.has_entitlement(store_id, 'audit.viewer')));

-- Workforce RPC wrappers. Renamed implementations retain their reviewed role
-- checks; wrappers add the Enterprise entitlement at the server boundary.
alter function public.get_workforce_bootstrap(uuid) rename to get_workforce_bootstrap_internal;
alter function public.get_workforce_roster(uuid, date, date) rename to get_workforce_roster_internal;
alter function public.save_workforce_shift(uuid, jsonb) rename to save_workforce_shift_internal;
alter function public.delete_workforce_shift(uuid, jsonb) rename to delete_workforce_shift_internal;
alter function public.apply_workforce_patterns(uuid, jsonb) rename to apply_workforce_patterns_internal;
alter function public.copy_workforce_week(uuid, jsonb) rename to copy_workforce_week_internal;
alter function public.publish_workforce_roster(uuid, jsonb) rename to publish_workforce_roster_internal;
alter function public.reopen_workforce_roster(uuid, jsonb) rename to reopen_workforce_roster_internal;
alter function public.save_workforce_pattern(uuid, jsonb) rename to save_workforce_pattern_internal;
alter function public.submit_leave_request(uuid, jsonb) rename to submit_leave_request_internal;
alter function public.decide_leave_request(uuid, jsonb) rename to decide_leave_request_internal;
alter function public.withdraw_leave_request(uuid, uuid) rename to withdraw_leave_request_internal;
alter function public.adjust_leave_balance(uuid, jsonb) rename to adjust_leave_balance_internal;

create function private.assert_workforce_entitlement(target_store_id uuid)
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.has_entitlement(target_store_id, 'workforce.core') then
    raise exception using errcode = 'P0001', message = 'entitlement:plan-required:workforce.core';
  end if;
end;
$$;
revoke all on function private.assert_workforce_entitlement(uuid) from public, anon, authenticated;

create function public.get_workforce_bootstrap(target_store_id uuid) returns jsonb language plpgsql security definer set search_path = '' as $$ begin perform private.assert_workforce_entitlement(target_store_id); return public.get_workforce_bootstrap_internal(target_store_id); end; $$;
create function public.get_workforce_roster(target_store_id uuid, range_start date, range_end date) returns jsonb language plpgsql security definer set search_path = '' as $$ begin perform private.assert_workforce_entitlement(target_store_id); return public.get_workforce_roster_internal(target_store_id, range_start, range_end); end; $$;
create function public.save_workforce_shift(target_store_id uuid, payload jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$ begin perform private.assert_workforce_entitlement(target_store_id); return public.save_workforce_shift_internal(target_store_id, payload); end; $$;
create function public.delete_workforce_shift(target_store_id uuid, payload jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$ begin perform private.assert_workforce_entitlement(target_store_id); return public.delete_workforce_shift_internal(target_store_id, payload); end; $$;
create function public.apply_workforce_patterns(target_store_id uuid, payload jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$ begin perform private.assert_workforce_entitlement(target_store_id); return public.apply_workforce_patterns_internal(target_store_id, payload); end; $$;
create function public.copy_workforce_week(target_store_id uuid, payload jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$ begin perform private.assert_workforce_entitlement(target_store_id); return public.copy_workforce_week_internal(target_store_id, payload); end; $$;
create function public.publish_workforce_roster(target_store_id uuid, payload jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$ begin perform private.assert_workforce_entitlement(target_store_id); return public.publish_workforce_roster_internal(target_store_id, payload); end; $$;
create function public.reopen_workforce_roster(target_store_id uuid, payload jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$ begin perform private.assert_workforce_entitlement(target_store_id); return public.reopen_workforce_roster_internal(target_store_id, payload); end; $$;
create function public.save_workforce_pattern(target_store_id uuid, payload jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$ begin perform private.assert_workforce_entitlement(target_store_id); return public.save_workforce_pattern_internal(target_store_id, payload); end; $$;
create function public.submit_leave_request(target_store_id uuid, payload jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$ begin perform private.assert_workforce_entitlement(target_store_id); return public.submit_leave_request_internal(target_store_id, payload); end; $$;
create function public.decide_leave_request(target_store_id uuid, payload jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$ begin perform private.assert_workforce_entitlement(target_store_id); return public.decide_leave_request_internal(target_store_id, payload); end; $$;
create function public.withdraw_leave_request(target_store_id uuid, target_request_id uuid) returns jsonb language plpgsql security definer set search_path = '' as $$ begin perform private.assert_workforce_entitlement(target_store_id); return public.withdraw_leave_request_internal(target_store_id, target_request_id); end; $$;
create function public.adjust_leave_balance(target_store_id uuid, payload jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$ begin perform private.assert_workforce_entitlement(target_store_id); return public.adjust_leave_balance_internal(target_store_id, payload); end; $$;

revoke all on function public.get_workforce_bootstrap_internal(uuid), public.get_workforce_roster_internal(uuid, date, date), public.save_workforce_shift_internal(uuid, jsonb), public.delete_workforce_shift_internal(uuid, jsonb), public.apply_workforce_patterns_internal(uuid, jsonb), public.copy_workforce_week_internal(uuid, jsonb), public.publish_workforce_roster_internal(uuid, jsonb), public.reopen_workforce_roster_internal(uuid, jsonb), public.save_workforce_pattern_internal(uuid, jsonb), public.submit_leave_request_internal(uuid, jsonb), public.decide_leave_request_internal(uuid, jsonb), public.withdraw_leave_request_internal(uuid, uuid), public.adjust_leave_balance_internal(uuid, jsonb) from public, anon, authenticated;

grant execute on function public.get_workforce_bootstrap(uuid), public.get_workforce_roster(uuid, date, date), public.save_workforce_shift(uuid, jsonb), public.delete_workforce_shift(uuid, jsonb), public.apply_workforce_patterns(uuid, jsonb), public.copy_workforce_week(uuid, jsonb), public.publish_workforce_roster(uuid, jsonb), public.reopen_workforce_roster(uuid, jsonb), public.save_workforce_pattern(uuid, jsonb), public.submit_leave_request(uuid, jsonb), public.decide_leave_request(uuid, jsonb), public.withdraw_leave_request(uuid, uuid), public.adjust_leave_balance(uuid, jsonb) to authenticated;

-- Restrictive policies are AND-ed with the existing role/visibility policies.
do $$
declare workforce_table text;
begin
  foreach workforce_table in array array[
    'workforce_employees', 'employee_work_patterns', 'leave_types',
    'workforce_calendar_days', 'workforce_competencies',
    'workforce_employee_competencies', 'workforce_coverage_rules',
    'leave_accounts', 'leave_requests', 'leave_request_segments',
    'leave_ledger_entries', 'leave_request_events', 'workforce_rosters',
    'workforce_shifts', 'workforce_availability_exceptions',
    'workforce_roster_events'
  ] loop
    execute format(
      'create policy %I on public.%I as restrictive for select to authenticated using ((select private.has_entitlement(store_id, ''workforce.core'')))',
      workforce_table || '_entitlement_select', workforce_table
    );
  end loop;
end;
$$;

commit;
