begin;

-- A run summary is useful for the list, but it loses the crucial distinction
-- between "accepted locally", "waiting for delivery" and "confirmed by the
-- server". Keep that lifecycle as a small append-only, redacted timeline.
do $$
declare constraint_name text;
begin
  for constraint_name in
    select conname
    from pg_constraint
    where conrelid = 'private.integration_runs'::regclass
      and contype = 'c'
  loop
    execute format('alter table private.integration_runs drop constraint %I', constraint_name);
  end loop;
end;
$$;

alter table private.integration_runs
  add constraint integration_runs_operation_check check (operation in ('import', 'connection_test', 'sync', 'webhook')),
  add constraint integration_runs_status_check check (status in ('queued', 'running', 'completed', 'completed_with_errors', 'failed', 'cancelled')),
  add constraint integration_runs_row_count_check check (row_count >= 0),
  add constraint integration_runs_created_count_check check (created_count >= 0),
  add constraint integration_runs_updated_count_check check (updated_count >= 0),
  add constraint integration_runs_skipped_count_check check (skipped_count >= 0),
  add constraint integration_runs_error_count_check check (error_count >= 0),
  add constraint integration_runs_mapping_summary_check check (jsonb_typeof(mapping_summary) = 'object'),
  add constraint integration_runs_completion_check check (
    (status in ('queued', 'running') and completed_at is null)
    or status not in ('queued', 'running')
  );

create table if not exists private.integration_run_events (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references private.integration_runs(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null check (event_type in ('run.started', 'delivery.queued', 'delivery.confirmed', 'delivery.failed', 'run.cancelled')),
  status text not null check (status in ('queued', 'running', 'completed', 'completed_with_errors', 'failed', 'cancelled')),
  message text,
  error_code text,
  error_fingerprint text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  occurred_at timestamptz not null default now()
);

create index if not exists integration_run_events_run_occurred_idx
  on private.integration_run_events (run_id, occurred_at desc);
create index if not exists integration_run_events_store_occurred_idx
  on private.integration_run_events (store_id, occurred_at desc);
alter table private.integration_run_events enable row level security;

drop function if exists public.record_integration_run(uuid, uuid, text, text, text, text, integer, integer, integer, integer, integer, text, text, jsonb);
create function public.record_integration_run(
  target_store_id uuid,
  run_id uuid,
  run_operation text,
  run_source_name text,
  run_source_format text,
  run_status text,
  run_row_count integer default 0,
  run_created_count integer default 0,
  run_updated_count integer default 0,
  run_skipped_count integer default 0,
  run_error_count integer default 0,
  run_error_code text default null,
  run_error_fingerprint text default null,
  run_mapping_summary jsonb default '{}'::jsonb,
  run_event_type text default null,
  run_event_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare result jsonb; persisted_run_id uuid; resolved_event_type text;
begin
  if (select auth.uid()) is null
     or not private.has_store_role(target_store_id, array['owner', 'manager']) then
    raise exception using errcode = '42501', message = 'integration:forbidden:Geen toegang tot deze winkel.';
  end if;
  if run_operation not in ('import', 'connection_test', 'sync', 'webhook')
     or run_status not in ('queued', 'running', 'completed', 'completed_with_errors', 'failed', 'cancelled')
     or nullif(btrim(run_source_name), '') is null
     or coalesce(run_row_count, 0) < 0 or coalesce(run_created_count, 0) < 0
     or coalesce(run_updated_count, 0) < 0 or coalesce(run_skipped_count, 0) < 0
     or coalesce(run_error_count, 0) < 0
     or jsonb_typeof(coalesce(run_mapping_summary, '{}'::jsonb)) <> 'object' then
    raise exception using errcode = '22023', message = 'integration:invalid:Ongeldige operationele gegevens.';
  end if;
  resolved_event_type := coalesce(run_event_type, case
    when run_status = 'running' then 'run.started'
    when run_status = 'queued' then 'delivery.queued'
    when run_status = 'cancelled' then 'run.cancelled'
    when run_status = 'failed' then 'delivery.failed'
    else 'delivery.confirmed'
  end);
  if resolved_event_type not in ('run.started', 'delivery.queued', 'delivery.confirmed', 'delivery.failed', 'run.cancelled') then
    raise exception using errcode = '22023', message = 'integration:invalid:Ongeldige lifecycle-gebeurtenis.';
  end if;
  insert into private.integration_runs (
    client_run_id, store_id, actor_user_id, operation, source_name, source_format,
    status, row_count, created_count, updated_count, skipped_count, error_count,
    error_code, error_fingerprint, mapping_summary, started_at, completed_at
  ) values (
    run_id, target_store_id, (select auth.uid()), run_operation, left(btrim(run_source_name), 255),
    nullif(left(btrim(coalesce(run_source_format, '')), 40), ''), run_status,
    run_row_count, run_created_count, run_updated_count, run_skipped_count, run_error_count,
    nullif(left(btrim(coalesce(run_error_code, '')), 120), ''),
    nullif(left(btrim(coalesce(run_error_fingerprint, '')), 160), ''),
    run_mapping_summary, now(), case when run_status in ('queued', 'running') then null else now() end
  ) on conflict (client_run_id) do update set
    status = excluded.status, row_count = excluded.row_count, created_count = excluded.created_count,
    updated_count = excluded.updated_count, skipped_count = excluded.skipped_count,
    error_count = excluded.error_count, error_code = excluded.error_code,
    error_fingerprint = excluded.error_fingerprint, mapping_summary = excluded.mapping_summary,
    completed_at = case when excluded.status in ('queued', 'running') then null else now() end
  returning id, jsonb_build_object('id', id, 'status', status, 'completed_at', completed_at)
    into persisted_run_id, result;
  insert into private.integration_run_events (
    run_id, store_id, actor_user_id, event_type, status, message, error_code, error_fingerprint, metadata
  ) values (
    persisted_run_id, target_store_id, (select auth.uid()), resolved_event_type, run_status,
    nullif(left(btrim(coalesce(run_event_message, '')), 500), ''),
    nullif(left(btrim(coalesce(run_error_code, '')), 120), ''),
    nullif(left(btrim(coalesce(run_error_fingerprint, '')), 160), ''),
    jsonb_build_object('row_count', run_row_count, 'created_count', run_created_count, 'updated_count', run_updated_count, 'skipped_count', run_skipped_count, 'error_count', run_error_count)
  );
  return result;
end;
$$;

create or replace function public.platform_list_integration_runs(target_store_id uuid, page_limit integer default 100)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_platform_scope('integrations.read');
  return jsonb_build_object('items', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', run.id, 'operation', run.operation, 'source_name', run.source_name,
      'source_format', run.source_format, 'status', run.status, 'row_count', run.row_count,
      'created_count', run.created_count, 'updated_count', run.updated_count,
      'skipped_count', run.skipped_count, 'error_count', run.error_count,
      'error_code', run.error_code, 'error_fingerprint', run.error_fingerprint,
      'mapping_summary', run.mapping_summary, 'started_at', run.started_at,
      'completed_at', run.completed_at, 'actor_name', profile.display_name,
      'actor_email', account.email,
      'events', coalesce((select jsonb_agg(jsonb_build_object(
        'event_type', event.event_type, 'status', event.status, 'message', event.message,
        'error_code', event.error_code, 'occurred_at', event.occurred_at
      ) order by event.occurred_at asc) from private.integration_run_events event where event.run_id = run.id), '[]'::jsonb)
    ) order by run.started_at desc)
    from (
      select * from private.integration_runs
      where store_id = target_store_id
      order by started_at desc
      limit greatest(1, least(coalesce(page_limit, 100), 200))
    ) run
    left join auth.users account on account.id = run.actor_user_id
    left join public.profiles profile on profile.id = run.actor_user_id
  ), '[]'::jsonb));
end;
$$;

revoke all on function public.record_integration_run(uuid, uuid, text, text, text, text, integer, integer, integer, integer, integer, text, text, jsonb, text, text) from public, anon;
revoke all on function public.platform_list_integration_runs(uuid, integer) from public, anon;
grant execute on function public.record_integration_run(uuid, uuid, text, text, text, text, integer, integer, integer, integer, integer, text, text, jsonb, text, text) to authenticated;
grant execute on function public.platform_list_integration_runs(uuid, integer) to authenticated;

commit;
