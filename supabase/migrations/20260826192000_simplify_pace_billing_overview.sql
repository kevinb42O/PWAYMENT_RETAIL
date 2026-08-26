begin;

-- The settings page only needs the current quota position. Removing the
-- 30-day log aggregation keeps this frequently loaded RPC small and fast.
create or replace function public.get_pace_billing_overview(target_store_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if not private.is_store_member(target_store_id) then
    raise exception using errcode = '42501', message = 'pace:forbidden';
  end if;

  select jsonb_build_object(
    'tier', private.effective_plan(target_store_id),
    'rollover_enabled', coalesce(subscription.pace_rollover_enabled, false),
    'usage', jsonb_build_object(
      'daily_count', case
        when usage.daily_period_start = (now() at time zone 'UTC')::date then coalesce(usage.daily_count, 0)
        else 0
      end,
      'monthly_count', case
        when usage.monthly_period_end > now() then coalesce(usage.monthly_count, 0)
        else 0
      end,
      'rollover_balance', coalesce(usage.rollover_balance, 0),
      'period_end', usage.monthly_period_end
    ),
    'credit_balance', coalesce(credits.balance, 0),
    'role_policies', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'role', roles.role,
          'enabled', coalesce(policy.enabled, true),
          'monthly_limit', policy.monthly_limit
        ) order by roles.role
      )
      from (values ('owner'), ('manager'), ('cashier')) roles(role)
      left join public.pace_role_policies policy
        on policy.store_id = target_store_id
       and policy.role = roles.role
    ), '[]'::jsonb)
  ) into result
  from (select target_store_id store_id) target
  left join public.store_subscriptions subscription on subscription.store_id = target.store_id
  left join public.pace_usage usage on usage.store_id = target.store_id
  left join public.pace_credits credits on credits.store_id = target.store_id;

  return result;
end;
$$;

commit;
