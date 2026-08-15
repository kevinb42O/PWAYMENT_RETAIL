begin;

-- A retryable outbox entry is not a permanent failure. The original health
-- function could keep a store critical after a later heartbeat reported an
-- empty queue. A current queue is now required for critical status and an old
-- issue without a queue naturally expires from the active health state.
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
  where event.store_id = target_store_id and event.metadata ? 'queue_depth'
  order by event.occurred_at desc
  limit 1;
  latest_queue_depth := coalesce(latest_queue_depth, 0);

  select exists (select 1 from private.store_installations installation where installation.store_id = target_store_id)
  into has_installation;

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

  coverage := case when has_installation then 'measured' when last_business is not null then 'server_data_only' else 'not_activated' end;
  if coverage = 'not_activated' then
    next_status := 'not_activated'; reason := 'De winkel heeft nog geen meetagent of succesvolle appverbinding geregistreerd.'; action := 'Open de winkelapp minstens één keer met een actieve accountverbinding.';
  elsif last_sync_issue is not null
    and last_sync_issue > coalesce(last_sync, '-infinity'::timestamptz)
    and latest_queue_depth > 0
    and (failed_syncs > 0 or coalesce(latest_queue_age, 0) >= 1800) then
    next_status := 'critical'; reason := 'Een synchronisatie is geblokkeerd of de wachtrij is langer dan 30 minuten oud.'; action := 'Open het winkeldossier, controleer de wachtrij en herstel de verbindings- of validatiefout.';
  elsif last_sync_issue is not null
    and last_sync_issue > coalesce(last_sync, '-infinity'::timestamptz)
    and last_sync_issue >= now() - interval '30 minutes' then
    next_status := 'at_risk'; reason := 'Een recente synchronisatie wordt opnieuw geprobeerd.'; action := 'Controleer of de volgende synchronisatie slaagt; onderzoek alleen wanneer de retry aanhoudt.';
  elsif latest_queue_depth > 0 and coalesce(latest_queue_age, 0) >= 300 then
    next_status := 'at_risk'; reason := 'Er wachten nog lokale wijzigingen langer dan vijf minuten op bevestiging.'; action := 'Controleer netwerkverbinding en de synchronisatiediagnose.';
  elsif last_seen is not null and last_seen < now() - interval '30 days' then
    next_status := 'inactive'; reason := 'De meetagent heeft meer dan 30 dagen geen activiteit gemeld.'; action := 'Bevestig of de winkel bewust inactief is of contacteer de winkelbeheerder.';
  elsif coverage = 'server_data_only' then
    next_status := 'data_only'; reason := 'Er is centrale bedrijfsdata, maar nog geen actieve meetagent op een installatie.'; action := 'Laat een gebruiker de actuele winkelapp openen om technische dekking te activeren.';
  else
    next_status := 'healthy'; reason := 'Recente activiteit en synchronisatie zijn zonder open blokkade bevestigd.'; action := 'Geen actie vereist.';
  end if;

  insert into private.store_health_snapshots (
    store_id, health_status, data_coverage_status, primary_reason, recommended_action,
    last_seen_at, last_active_at, last_successful_sync_at, last_sync_issue_at,
    last_business_activity_at, pending_queue_count, oldest_queue_age_seconds,
    failed_sync_count_24h, open_incident_count, calculated_at
  ) values (
    target_store_id, next_status, coverage, reason, action,
    last_seen, last_active, last_sync, last_sync_issue, last_business,
    latest_queue_depth, latest_queue_age, failed_syncs, incidents, now()
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

select private.refresh_store_health_snapshot(id) from public.stores;

commit;
