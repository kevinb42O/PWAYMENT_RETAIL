begin;

-- A store's operational state must be derived once on the server, not
-- reconstructed differently by every platform RPC.  The snapshot keeps the
-- dashboard fast and, more importantly, gives every status a documented
-- meaning.
create table if not exists private.store_health_snapshots (
  store_id uuid primary key references public.stores(id) on delete cascade,
  health_status text not null check (health_status in ('not_activated', 'healthy', 'at_risk', 'critical', 'inactive', 'data_only')),
  data_coverage_status text not null check (data_coverage_status in ('not_activated', 'measured', 'server_data_only')),
  primary_reason text not null,
  recommended_action text not null,
  last_seen_at timestamptz,
  last_active_at timestamptz,
  last_successful_sync_at timestamptz,
  last_sync_issue_at timestamptz,
  last_business_activity_at timestamptz,
  pending_queue_count integer not null default 0 check (pending_queue_count >= 0),
  oldest_queue_age_seconds integer,
  failed_sync_count_24h integer not null default 0 check (failed_sync_count_24h >= 0),
  open_incident_count integer not null default 0 check (open_incident_count >= 0),
  calculated_at timestamptz not null default now()
);

create index if not exists store_health_snapshots_status_idx
  on private.store_health_snapshots (health_status, calculated_at desc);

create table if not exists private.platform_incident_events (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references private.platform_incidents(id) on delete cascade,
  health_event_id uuid references private.store_health_events(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null check (event_type in ('detected', 'updated', 'acknowledged', 'investigating', 'mitigated', 'resolved', 'false_positive')),
  note text,
  detail jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index if not exists platform_incident_events_incident_idx
  on private.platform_incident_events (incident_id, occurred_at desc);

create or replace function private.refresh_store_health_snapshot(target_store_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  last_seen timestamptz;
  last_active timestamptz;
  last_sync timestamptz;
  last_sync_issue timestamptz;
  last_business timestamptz;
  latest_queue_depth integer := 0;
  latest_queue_age integer;
  failed_syncs integer := 0;
  incidents integer := 0;
  has_installation boolean := false;
  coverage text;
  next_status text;
  reason text;
  action text;
begin
  select
    max(event.occurred_at),
    max(event.occurred_at) filter (where event.event_type in ('app.started', 'app.heartbeat', 'checkout.completed', 'z_report.completed', 'sync.completed')),
    max(event.occurred_at) filter (where event.event_type = 'sync.completed'),
    max(event.occurred_at) filter (where event.event_type in ('sync.retrying', 'sync.failed_permanent')),
    count(*) filter (where event.event_type = 'sync.failed_permanent' and event.occurred_at >= now() - interval '24 hours')::integer
  into last_seen, last_active, last_sync, last_sync_issue, failed_syncs
  from private.store_health_events event
  where event.store_id = target_store_id;

  select coalesce((event.metadata ->> 'queue_depth')::integer, 0),
         (event.metadata ->> 'oldest_queue_age_seconds')::integer
  into latest_queue_depth, latest_queue_age
  from private.store_health_events event
  where event.store_id = target_store_id
    and event.metadata ? 'queue_depth'
  order by event.occurred_at desc
  limit 1;
  latest_queue_depth := coalesce(latest_queue_depth, 0);

  select exists (
    select 1 from private.store_installations installation
    where installation.store_id = target_store_id
  ) into has_installation;

  select greatest(
    coalesce((select max(transaction_row.occurred_at) from public.transactions transaction_row where transaction_row.store_id = target_store_id), '-infinity'::timestamptz),
    coalesce((select max(report_row.occurred_at) from public.daily_reports report_row where report_row.store_id = target_store_id), '-infinity'::timestamptz),
    coalesce((select max(order_row.created_at) from public.webshop_orders order_row where order_row.store_id = target_store_id), '-infinity'::timestamptz)
  ) into last_business;
  if last_business = '-infinity'::timestamptz then last_business := null; end if;

  select count(*)::integer into incidents
  from private.platform_incidents incident
  where incident.status not in ('resolved', 'false_positive')
    and exists (
      select 1 from private.store_health_events event
      where event.store_id = target_store_id
        and coalesce(event.error_fingerprint, concat_ws(':', event.event_type, coalesce(event.operation, 'unknown'), coalesce(event.error_code, 'unknown'))) = incident.fingerprint
        and event.occurred_at >= incident.first_seen_at
    );

  coverage := case
    when has_installation then 'measured'
    when last_business is not null then 'server_data_only'
    else 'not_activated'
  end;

  if coverage = 'not_activated' then
    next_status := 'not_activated';
    reason := 'De winkel heeft nog geen meetagent of succesvolle appverbinding geregistreerd.';
    action := 'Open de winkelapp minstens één keer met een actieve accountverbinding.';
  elsif last_sync_issue is not null
    and last_sync_issue > coalesce(last_sync, '-infinity'::timestamptz)
    and (failed_syncs > 0 or latest_queue_age >= 1800) then
    next_status := 'critical';
    reason := 'Een synchronisatie is geblokkeerd of de wachtrij is langer dan 30 minuten oud.';
    action := 'Open het winkeldossier, controleer de wachtrij en herstel de verbindings- of validatiefout.';
  elsif last_sync_issue is not null
    and last_sync_issue > coalesce(last_sync, '-infinity'::timestamptz) then
    next_status := 'at_risk';
    reason := 'Een recente synchronisatie wordt opnieuw geprobeerd.';
    action := 'Controleer of de volgende synchronisatie slaagt; onderzoek alleen wanneer de retry aanhoudt.';
  elsif latest_queue_depth > 0 and coalesce(latest_queue_age, 0) >= 300 then
    next_status := 'at_risk';
    reason := 'Er wachten nog lokale wijzigingen langer dan vijf minuten op bevestiging.';
    action := 'Controleer netwerkverbinding en de synchronisatiediagnose.';
  elsif last_seen is not null and last_seen < now() - interval '30 days' then
    next_status := 'inactive';
    reason := 'De meetagent heeft meer dan 30 dagen geen activiteit gemeld.';
    action := 'Bevestig of de winkel bewust inactief is of contacteer de winkelbeheerder.';
  elsif coverage = 'server_data_only' then
    next_status := 'data_only';
    reason := 'Er is centrale bedrijfsdata, maar nog geen actieve meetagent op een installatie.';
    action := 'Laat een gebruiker de actuele winkelapp openen om technische dekking te activeren.';
  else
    next_status := 'healthy';
    reason := 'Recente activiteit en synchronisatie zijn zonder open blokkade bevestigd.';
    action := 'Geen actie vereist.';
  end if;

  insert into private.store_health_snapshots (
    store_id, health_status, data_coverage_status, primary_reason, recommended_action,
    last_seen_at, last_active_at, last_successful_sync_at, last_sync_issue_at,
    last_business_activity_at, pending_queue_count, oldest_queue_age_seconds,
    failed_sync_count_24h, open_incident_count, calculated_at
  ) values (
    target_store_id, next_status, coverage, reason, action,
    last_seen, last_active, last_sync, last_sync_issue,
    last_business, latest_queue_depth, latest_queue_age,
    failed_syncs, incidents, now()
  ) on conflict (store_id) do update set
    health_status = excluded.health_status,
    data_coverage_status = excluded.data_coverage_status,
    primary_reason = excluded.primary_reason,
    recommended_action = excluded.recommended_action,
    last_seen_at = excluded.last_seen_at,
    last_active_at = excluded.last_active_at,
    last_successful_sync_at = excluded.last_successful_sync_at,
    last_sync_issue_at = excluded.last_sync_issue_at,
    last_business_activity_at = excluded.last_business_activity_at,
    pending_queue_count = excluded.pending_queue_count,
    oldest_queue_age_seconds = excluded.oldest_queue_age_seconds,
    failed_sync_count_24h = excluded.failed_sync_count_24h,
    open_incident_count = excluded.open_incident_count,
    calculated_at = excluded.calculated_at;
end;
$$;

create or replace function private.record_platform_incident_from_health_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  incident_fingerprint text;
  incident_severity text;
  incident_title text;
  incident_id uuid;
begin
  if new.severity not in ('error', 'critical') then return new; end if;
  incident_fingerprint := coalesce(nullif(new.error_fingerprint, ''), concat_ws(':', new.event_type, coalesce(new.operation, 'unknown'), coalesce(new.error_code, 'unknown')));
  incident_severity := case
    when new.severity = 'critical' and new.operation in ('checkout_sale', 'finalize_daily_report') then 'p1'
    when new.event_type = 'sync.failed_permanent' or new.operation in ('checkout_sale', 'finalize_daily_report') then 'p2'
    else 'p3'
  end;
  incident_title := case
    when new.operation = 'checkout_sale' then 'Checkout ondervindt fouten'
    when new.operation = 'finalize_daily_report' then 'Dagafsluiting ondervindt fouten'
    when new.event_type = 'sync.failed_permanent' then 'Synchronisatie heeft een permanente fout'
    else 'Operationele applicatiefout'
  end;

  select incident.id into incident_id
  from private.platform_incidents incident
  where incident.fingerprint = incident_fingerprint
    and incident.status not in ('resolved', 'false_positive')
  order by incident.last_seen_at desc
  limit 1
  for update;

  if incident_id is null then
    insert into private.platform_incidents (
      fingerprint, title, severity, status, operation, affected_store_count, first_seen_at, last_seen_at
    ) values (
      incident_fingerprint, incident_title, incident_severity, 'new', new.operation, 1, new.occurred_at, new.occurred_at
    ) returning id into incident_id;
    insert into private.platform_incident_events (incident_id, health_event_id, event_type, detail)
    values (incident_id, new.id, 'detected', jsonb_build_object('store_id', new.store_id, 'operation', new.operation));
  else
    update private.platform_incidents incident
    set severity = case when incident.severity = 'p1' or incident_severity = 'p1' then 'p1' when incident.severity = 'p2' or incident_severity = 'p2' then 'p2' else incident_severity end,
        title = incident_title,
        operation = new.operation,
        affected_store_count = (select count(distinct event.store_id) from private.store_health_events event where coalesce(event.error_fingerprint, concat_ws(':', event.event_type, coalesce(event.operation, 'unknown'), coalesce(event.error_code, 'unknown'))) = incident_fingerprint and event.occurred_at >= now() - interval '24 hours'),
        last_seen_at = new.occurred_at
    where incident.id = incident_id;
    insert into private.platform_incident_events (incident_id, health_event_id, event_type, detail)
    values (incident_id, new.id, 'updated', jsonb_build_object('store_id', new.store_id, 'operation', new.operation));
  end if;
  return new;
end;
$$;

create or replace function private.refresh_health_snapshot_from_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.refresh_store_health_snapshot(new.store_id);
  return new;
end;
$$;

drop trigger if exists store_health_event_creates_incident on private.store_health_events;
create trigger store_health_event_creates_incident
  after insert on private.store_health_events
  for each row execute function private.record_platform_incident_from_health_event();

drop trigger if exists store_health_event_refreshes_snapshot on private.store_health_events;
create trigger store_health_event_refreshes_snapshot
  after insert on private.store_health_events
  for each row execute function private.refresh_health_snapshot_from_event();

create or replace function public.platform_refresh_store_health_snapshots()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  store_row record;
  refreshed integer := 0;
begin
  if not (select private.platform_scope_allowed('dashboard.read')) then
    raise exception 'PLATFORM_ACCESS_DENIED' using errcode = '42501';
  end if;
  for store_row in select id from public.stores loop
    perform private.refresh_store_health_snapshot(store_row.id);
    refreshed := refreshed + 1;
  end loop;
  insert into private.platform_audit_entries (actor_user_id, action, detail)
  values ((select auth.uid()), 'health_snapshots.refreshed', jsonb_build_object('store_count', refreshed));
  return refreshed;
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
      'active_stores_24h', (select count(*) from private.store_health_snapshots where coalesce(last_active_at, last_business_activity_at) >= now() - interval '24 hours'),
      'critical_incidents', (select count(*) from private.platform_incidents where status not in ('resolved', 'false_positive') and severity in ('p1', 'p2')),
      'sync_at_risk', (select count(*) from private.store_health_snapshots where health_status in ('at_risk', 'critical')),
      'financial_failures_24h', (select count(*) from private.store_health_events where event_type = 'rpc.failed' and operation in ('checkout_sale', 'refund_sale', 'finalize_daily_report') and occurred_at >= now() - interval '24 hours'),
      'subscriptions', (select jsonb_build_object('trialing', count(*) filter (where status = 'trialing'), 'active', count(*) filter (where status = 'active'), 'past_due', count(*) filter (where status = 'past_due')) from public.store_subscriptions),
      'health', (select jsonb_build_object('healthy', count(*) filter (where health_status = 'healthy'), 'at_risk', count(*) filter (where health_status = 'at_risk'), 'critical', count(*) filter (where health_status = 'critical'), 'not_activated', count(*) filter (where health_status = 'not_activated'), 'inactive', count(*) filter (where health_status = 'inactive'), 'data_only', count(*) filter (where health_status = 'data_only')) from private.store_health_snapshots)
    ),
    'incidents', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'title', title, 'severity', severity, 'status', status, 'affected_store_count', affected_store_count, 'last_seen_at', last_seen_at) order by case severity when 'p1' then 1 when 'p2' then 2 when 'p3' then 3 else 4 end, last_seen_at desc) from (select * from private.platform_incidents where status not in ('resolved', 'false_positive') order by case severity when 'p1' then 1 when 'p2' then 2 when 'p3' then 3 else 4 end, last_seen_at desc limit 8) incident), '[]'::jsonb),
    'priority_stores', coalesce((select jsonb_agg(jsonb_build_object('store_id', store_row.id, 'store_name', store_row.name, 'health_status', snapshot.health_status, 'primary_reason', snapshot.primary_reason, 'recommended_action', snapshot.recommended_action, 'last_sync_at', snapshot.last_successful_sync_at, 'pending_queue_count', snapshot.pending_queue_count) order by case snapshot.health_status when 'critical' then 1 when 'at_risk' then 2 when 'not_activated' then 3 when 'data_only' then 4 else 5 end, snapshot.calculated_at desc) from (select * from private.store_health_snapshots where health_status in ('critical', 'at_risk', 'not_activated', 'data_only') order by case health_status when 'critical' then 1 when 'at_risk' then 2 when 'not_activated' then 3 else 4 end, calculated_at desc limit 6) snapshot join public.stores store_row on store_row.id = snapshot.store_id), '[]'::jsonb)
  );
end;
$$;

create or replace function public.platform_list_stores(search_term text default null, health_filter text default null, page_limit integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare safe_limit integer := greatest(1, least(coalesce(page_limit, 50), 100));
begin
  if not (select private.platform_scope_allowed('stores.read')) then raise exception 'PLATFORM_ACCESS_DENIED' using errcode = '42501'; end if;
  return jsonb_build_object('items', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', row.id, 'name', row.name, 'is_demo', row.is_demo, 'created_at', row.created_at,
      'plan_code', row.plan_code, 'subscription_status', row.subscription_status,
      'last_active_at', row.last_active_at, 'last_sync_at', row.last_sync_at,
      'health_status', row.health_status, 'health_reason', row.health_reason,
      'data_coverage_status', row.data_coverage_status, 'open_incidents', row.open_incidents,
      'pending_queue_count', row.pending_queue_count
    ) order by case row.health_status when 'critical' then 1 when 'at_risk' then 2 when 'not_activated' then 3 when 'data_only' then 4 when 'inactive' then 5 else 6 end, row.created_at desc)
    from (
      select store_row.id, store_row.name, store_row.is_demo, store_row.created_at,
        subscription.plan_code, subscription.status as subscription_status,
        snapshot.last_active_at, snapshot.last_successful_sync_at as last_sync_at,
        coalesce(snapshot.health_status, 'not_activated') as health_status,
        coalesce(snapshot.primary_reason, 'De winkel wacht nog op haar eerste meetagent.') as health_reason,
        coalesce(snapshot.data_coverage_status, 'not_activated') as data_coverage_status,
        coalesce(snapshot.open_incident_count, 0) as open_incidents,
        coalesce(snapshot.pending_queue_count, 0) as pending_queue_count
      from public.stores store_row
      left join public.store_subscriptions subscription on subscription.store_id = store_row.id
      left join private.store_health_snapshots snapshot on snapshot.store_id = store_row.id
      where (search_term is null or store_row.name ilike '%' || left(search_term, 120) || '%')
        and (health_filter is null or coalesce(snapshot.health_status, 'not_activated') = health_filter)
      order by case coalesce(snapshot.health_status, 'not_activated') when 'critical' then 1 when 'at_risk' then 2 when 'not_activated' then 3 when 'data_only' then 4 when 'inactive' then 5 else 6 end, store_row.created_at desc
      limit safe_limit
    ) row
  ), '[]'::jsonb));
end;
$$;

create or replace function public.platform_get_store_detail(target_store_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  if not (select private.platform_scope_allowed('stores.read')) then raise exception 'PLATFORM_ACCESS_DENIED' using errcode = '42501'; end if;
  select jsonb_build_object(
    'store', jsonb_build_object('id', store_row.id, 'name', store_row.name, 'created_at', store_row.created_at, 'is_demo', store_row.is_demo, 'country_code', store_row.country_code, 'locale', store_row.locale, 'timezone', store_row.timezone),
    'subscription', coalesce((select jsonb_build_object('plan_code', plan_code, 'status', status, 'trial_ends_at', trial_ends_at, 'current_period_ends_at', current_period_ends_at) from public.store_subscriptions where store_id = store_row.id), '{}'::jsonb),
    'health', coalesce((select jsonb_build_object('status', health_status, 'coverage_status', data_coverage_status, 'primary_reason', primary_reason, 'recommended_action', recommended_action, 'last_seen_at', last_seen_at, 'last_active_at', last_active_at, 'last_successful_sync_at', last_successful_sync_at, 'last_sync_issue_at', last_sync_issue_at, 'pending_queue_count', pending_queue_count, 'oldest_queue_age_seconds', oldest_queue_age_seconds, 'failed_sync_count_24h', failed_sync_count_24h, 'open_incident_count', open_incident_count, 'calculated_at', calculated_at) from private.store_health_snapshots where store_id = store_row.id), jsonb_build_object('status', 'not_activated', 'coverage_status', 'not_activated', 'primary_reason', 'De winkel heeft nog geen meetagent geregistreerd.', 'recommended_action', 'Open de winkelapp met een actieve accountverbinding.')),
    'activity', jsonb_build_object(
      'last_active_at', coalesce((select last_active_at from private.store_health_snapshots where store_id = store_row.id), (select max(occurred_at) from private.store_health_events where store_id = store_row.id)),
      'last_sync_at', (select last_successful_sync_at from private.store_health_snapshots where store_id = store_row.id),
      'sales_30d', (select count(*) from public.transactions where store_id = store_row.id and kind = 'sale' and occurred_at >= now() - interval '30 days'),
      'z_reports_30d', (select count(*) from public.daily_reports where store_id = store_row.id and occurred_at >= now() - interval '30 days'),
      'webshop_orders_30d', (select count(*) from public.webshop_orders where store_id = store_row.id and created_at >= now() - interval '30 days'),
      'active_members', (select count(*) from public.store_memberships where store_id = store_row.id and status = 'active'),
      'data_as_of', greatest(coalesce((select max(occurred_at) from public.transactions where store_id = store_row.id), '-infinity'::timestamptz), coalesce((select max(occurred_at) from public.daily_reports where store_id = store_row.id), '-infinity'::timestamptz), coalesce((select max(created_at) from public.webshop_orders where store_id = store_row.id), '-infinity'::timestamptz))
    ),
    'devices', coalesce((select jsonb_agg(jsonb_build_object('installation_id', installation_id, 'app_version', app_version, 'platform_family', platform_family, 'last_seen_at', last_seen_at) order by last_seen_at desc) from private.store_installations where store_id = store_row.id), '[]'::jsonb),
    'recent_health_events', coalesce((select jsonb_agg(jsonb_build_object('event_type', event_type, 'severity', severity, 'operation', operation, 'error_code', error_code, 'error_fingerprint', error_fingerprint, 'occurred_at', occurred_at, 'metadata', metadata) order by occurred_at desc) from (select * from private.store_health_events where store_id = store_row.id order by occurred_at desc limit 20) event), '[]'::jsonb),
    'incidents', coalesce((select jsonb_agg(jsonb_build_object('id', incident.id, 'title', incident.title, 'severity', incident.severity, 'status', incident.status, 'last_seen_at', incident.last_seen_at) order by case incident.severity when 'p1' then 1 when 'p2' then 2 else 3 end, incident.last_seen_at desc) from private.platform_incidents incident where incident.status not in ('resolved', 'false_positive') and exists (select 1 from private.store_health_events event where event.store_id = store_row.id and coalesce(event.error_fingerprint, concat_ws(':', event.event_type, coalesce(event.operation, 'unknown'), coalesce(event.error_code, 'unknown'))) = incident.fingerprint)), '[]'::jsonb),
    'support_access', (select private.active_support_grant(store_row.id)),
    'active_support_grant', coalesce((select jsonb_build_object('id', id, 'access_scope', access_scope, 'expires_at', expires_at) from private.support_access_grants where store_id = store_row.id and operator_user_id = (select auth.uid()) and starts_at <= now() and expires_at > now() and revoked_at is null order by expires_at desc limit 1), '{}'::jsonb)
  ) into result
  from public.stores store_row where store_row.id = target_store_id;
  if result is null then raise exception 'STORE_NOT_FOUND' using errcode = 'P0002'; end if;
  return result;
end;
$$;

create or replace function public.platform_list_incidents(status_filter text default null, severity_filter text default null, page_limit integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare safe_limit integer := greatest(1, least(coalesce(page_limit, 50), 100));
begin
  if not (select private.platform_scope_allowed('incidents.write') or private.platform_scope_allowed('dashboard.read')) then raise exception 'PLATFORM_ACCESS_DENIED' using errcode = '42501'; end if;
  return jsonb_build_object('items', coalesce((
    select jsonb_agg(jsonb_build_object('id', incident.id, 'title', incident.title, 'severity', incident.severity, 'status', incident.status, 'operation', incident.operation, 'affected_store_count', incident.affected_store_count, 'first_seen_at', incident.first_seen_at, 'last_seen_at', incident.last_seen_at, 'resolution_note', incident.resolution_note, 'events', coalesce((select jsonb_agg(jsonb_build_object('event_type', event_row.event_type, 'note', event_row.note, 'occurred_at', event_row.occurred_at) order by event_row.occurred_at desc) from (select * from private.platform_incident_events where incident_id = incident.id order by occurred_at desc limit 4) event_row), '[]'::jsonb)) order by case incident.severity when 'p1' then 1 when 'p2' then 2 when 'p3' then 3 else 4 end, incident.last_seen_at desc)
    from (select * from private.platform_incidents where (status_filter is null or status = status_filter) and (severity_filter is null or severity = severity_filter) order by case severity when 'p1' then 1 when 'p2' then 2 when 'p3' then 3 else 4 end, last_seen_at desc limit safe_limit) incident
  ), '[]'::jsonb));
end;
$$;

create or replace function public.platform_update_incident(target_incident_id uuid, next_status text, operator_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare incident_row private.platform_incidents%rowtype;
begin
  if not (select private.platform_scope_allowed('incidents.write')) then raise exception 'PLATFORM_ACCESS_DENIED' using errcode = '42501'; end if;
  if next_status not in ('acknowledged', 'investigating', 'mitigated', 'resolved', 'false_positive') then raise exception 'INVALID_INCIDENT_STATUS' using errcode = '22023'; end if;
  if operator_note is not null and char_length(btrim(operator_note)) > 1000 then raise exception 'INVALID_INCIDENT_NOTE' using errcode = '22023'; end if;
  update private.platform_incidents set status = next_status, owner_user_id = coalesce(owner_user_id, (select auth.uid())), resolution_note = case when next_status in ('resolved', 'false_positive') then nullif(btrim(operator_note), '') else resolution_note end
  where id = target_incident_id returning * into incident_row;
  if not found then raise exception 'INCIDENT_NOT_FOUND' using errcode = 'P0002'; end if;
  insert into private.platform_incident_events (incident_id, actor_user_id, event_type, note)
  values (incident_row.id, (select auth.uid()), next_status, nullif(btrim(operator_note), ''));
  insert into private.platform_audit_entries (actor_user_id, action, target_incident_id, reason, detail)
  values ((select auth.uid()), 'incident.' || next_status, incident_row.id, nullif(btrim(operator_note), ''), jsonb_build_object('previous_status', incident_row.status));
  return jsonb_build_object('id', incident_row.id, 'status', incident_row.status, 'updated_at', incident_row.updated_at);
end;
$$;

-- Backfill all stores once. Future health events refresh only their own store.
select private.refresh_store_health_snapshot(id) from public.stores;

revoke all on function private.refresh_store_health_snapshot(uuid) from public, anon, authenticated;
revoke all on function private.record_platform_incident_from_health_event() from public, anon, authenticated;
revoke all on function private.refresh_health_snapshot_from_event() from public, anon, authenticated;
revoke all on function public.platform_refresh_store_health_snapshots() from public, anon;
revoke all on function public.platform_list_incidents(text, text, integer) from public, anon;
revoke all on function public.platform_update_incident(uuid, text, text) from public, anon;
grant execute on function public.platform_refresh_store_health_snapshots() to authenticated;
grant execute on function public.platform_list_incidents(text, text, integer) to authenticated;
grant execute on function public.platform_update_incident(uuid, text, text) to authenticated;

revoke all on all tables in schema private from public, anon, authenticated;

commit;
