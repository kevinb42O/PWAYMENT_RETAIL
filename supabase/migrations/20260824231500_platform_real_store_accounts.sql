-- The platform console is an operational view, never a demo surface.
-- Exclude explicitly marked demo tenants at the database boundary and expose
-- the owning Auth registration so operators can verify genuine sign-ups.

create or replace function public.platform_list_stores(
  search_term text default null,
  health_filter text default null,
  page_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  safe_limit integer := greatest(1, least(coalesce(page_limit, 50), 100));
begin
  if not (select private.platform_scope_allowed('stores.read')) then
    raise exception 'PLATFORM_ACCESS_DENIED' using errcode = '42501';
  end if;

  return jsonb_build_object('items', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', row.id,
      'name', row.name,
      'is_demo', row.is_demo,
      'created_at', row.created_at,
      'owner_email', row.owner_email,
      'account_created_at', row.account_created_at,
      'plan_code', row.plan_code,
      'subscription_status', row.subscription_status,
      'last_active_at', row.last_active_at,
      'last_sync_at', row.last_sync_at,
      'health_status', row.health_status,
      'health_reason', row.health_reason,
      'data_coverage_status', row.data_coverage_status,
      'open_incidents', row.open_incidents,
      'pending_queue_count', row.pending_queue_count
    ) order by
      case row.health_status
        when 'critical' then 1 when 'at_risk' then 2
        when 'not_activated' then 3 when 'data_only' then 4
        when 'inactive' then 5 else 6
      end,
      row.created_at desc
    )
    from (
      select
        store_row.id,
        store_row.name,
        store_row.is_demo,
        store_row.created_at,
        owner_account.email as owner_email,
        owner_account.created_at as account_created_at,
        subscription.plan_code,
        subscription.status as subscription_status,
        snapshot.last_active_at,
        snapshot.last_successful_sync_at as last_sync_at,
        coalesce(snapshot.health_status, 'not_activated') as health_status,
        coalesce(snapshot.primary_reason, 'De winkel wacht nog op haar eerste meetagent.') as health_reason,
        coalesce(snapshot.data_coverage_status, 'not_activated') as data_coverage_status,
        coalesce(snapshot.open_incident_count, 0) as open_incidents,
        coalesce(snapshot.pending_queue_count, 0) as pending_queue_count
      from public.stores store_row
      left join public.store_subscriptions subscription
        on subscription.store_id = store_row.id
      left join private.store_health_snapshots snapshot
        on snapshot.store_id = store_row.id
      left join lateral (
        select auth_user.email, auth_user.created_at
        from public.store_memberships membership
        join auth.users auth_user on auth_user.id = membership.user_id
        where membership.store_id = store_row.id
          and membership.role = 'owner'
          and membership.status = 'active'
        order by membership.created_at, auth_user.created_at
        limit 1
      ) owner_account on true
      where store_row.is_demo = false
        and (search_term is null or store_row.name ilike '%' || left(search_term, 120) || '%')
        and (health_filter is null or coalesce(snapshot.health_status, 'not_activated') = health_filter)
      order by
        case coalesce(snapshot.health_status, 'not_activated')
          when 'critical' then 1 when 'at_risk' then 2
          when 'not_activated' then 3 when 'data_only' then 4
          when 'inactive' then 5 else 6
        end,
        store_row.created_at desc
      limit safe_limit
    ) row
  ), '[]'::jsonb));
end;
$$;

create or replace function public.platform_get_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select private.platform_scope_allowed('dashboard.read')) then
    raise exception 'PLATFORM_ACCESS_DENIED' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'metrics', jsonb_build_object(
      'active_stores_24h', (
        select count(*)
        from private.store_health_snapshots snapshot
        join public.stores store_row on store_row.id = snapshot.store_id
        where store_row.is_demo = false
          and coalesce(snapshot.last_active_at, snapshot.last_business_activity_at) >= now() - interval '24 hours'
      ),
      'critical_incidents', (
        select count(*) from private.platform_incidents
        where status not in ('resolved', 'false_positive') and severity in ('p1', 'p2')
      ),
      'sync_at_risk', (
        select count(*)
        from private.store_health_snapshots snapshot
        join public.stores store_row on store_row.id = snapshot.store_id
        where store_row.is_demo = false and snapshot.health_status in ('at_risk', 'critical')
      ),
      'financial_failures_24h', (
        select count(*)
        from private.store_health_events event
        join public.stores store_row on store_row.id = event.store_id
        where store_row.is_demo = false
          and event.event_type = 'rpc.failed'
          and event.operation in ('checkout_sale', 'refund_sale', 'finalize_daily_report')
          and event.occurred_at >= now() - interval '24 hours'
      ),
      'subscriptions', (
        select jsonb_build_object(
          'trialing', count(*) filter (where subscription.status = 'trialing'),
          'active', count(*) filter (where subscription.status = 'active'),
          'past_due', count(*) filter (where subscription.status = 'past_due')
        )
        from public.store_subscriptions subscription
        join public.stores store_row on store_row.id = subscription.store_id
        where store_row.is_demo = false
      ),
      'health', (
        select jsonb_build_object(
          'healthy', count(*) filter (where snapshot.health_status = 'healthy'),
          'at_risk', count(*) filter (where snapshot.health_status = 'at_risk'),
          'critical', count(*) filter (where snapshot.health_status = 'critical'),
          'not_activated', count(*) filter (where snapshot.health_status = 'not_activated'),
          'inactive', count(*) filter (where snapshot.health_status = 'inactive'),
          'data_only', count(*) filter (where snapshot.health_status = 'data_only')
        )
        from private.store_health_snapshots snapshot
        join public.stores store_row on store_row.id = snapshot.store_id
        where store_row.is_demo = false
      )
    ),
    'incidents', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', incident.id,
        'title', incident.title,
        'severity', incident.severity,
        'status', incident.status,
        'affected_store_count', incident.affected_store_count,
        'last_seen_at', incident.last_seen_at
      ) order by
        case incident.severity when 'p1' then 1 when 'p2' then 2 when 'p3' then 3 else 4 end,
        incident.last_seen_at desc)
      from (
        select * from private.platform_incidents
        where status not in ('resolved', 'false_positive')
        order by case severity when 'p1' then 1 when 'p2' then 2 when 'p3' then 3 else 4 end, last_seen_at desc
        limit 8
      ) incident
    ), '[]'::jsonb),
    'priority_stores', coalesce((
      select jsonb_agg(jsonb_build_object(
        'store_id', priority.id,
        'store_name', priority.name,
        'health_status', priority.health_status,
        'primary_reason', priority.primary_reason,
        'recommended_action', priority.recommended_action,
        'last_sync_at', priority.last_successful_sync_at,
        'pending_queue_count', priority.pending_queue_count
      ) order by priority.sort_order, priority.calculated_at desc)
      from (
        select
          store_row.id,
          store_row.name,
          snapshot.health_status,
          snapshot.primary_reason,
          snapshot.recommended_action,
          snapshot.last_successful_sync_at,
          snapshot.pending_queue_count,
          snapshot.calculated_at,
          case snapshot.health_status
            when 'critical' then 1 when 'at_risk' then 2
            when 'not_activated' then 3 when 'data_only' then 4 else 5
          end as sort_order
        from private.store_health_snapshots snapshot
        join public.stores store_row on store_row.id = snapshot.store_id
        where store_row.is_demo = false
          and snapshot.health_status in ('critical', 'at_risk', 'not_activated', 'data_only')
        order by sort_order, snapshot.calculated_at desc
        limit 6
      ) priority
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.platform_list_stores(text, text, integer) from public, anon;
grant execute on function public.platform_list_stores(text, text, integer) to authenticated;
revoke all on function public.platform_get_overview() from public, anon;
grant execute on function public.platform_get_overview() to authenticated;
