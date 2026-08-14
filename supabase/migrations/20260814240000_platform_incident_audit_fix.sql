begin;

-- Keep the audit trail truthful: the previous lifecycle state must be captured
-- before the update, not read back from the updated incident row.
create or replace function public.platform_update_incident(target_incident_id uuid, next_status text, operator_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  incident_row private.platform_incidents%rowtype;
  previous_status text;
begin
  if not (select private.platform_scope_allowed('incidents.write')) then
    raise exception 'PLATFORM_ACCESS_DENIED' using errcode = '42501';
  end if;
  if next_status not in ('acknowledged', 'investigating', 'mitigated', 'resolved', 'false_positive') then
    raise exception 'INVALID_INCIDENT_STATUS' using errcode = '22023';
  end if;
  if operator_note is not null and char_length(btrim(operator_note)) > 1000 then
    raise exception 'INVALID_INCIDENT_NOTE' using errcode = '22023';
  end if;
  select status into previous_status from private.platform_incidents where id = target_incident_id for update;
  if not found then raise exception 'INCIDENT_NOT_FOUND' using errcode = 'P0002'; end if;
  update private.platform_incidents
  set status = next_status,
      owner_user_id = coalesce(owner_user_id, (select auth.uid())),
      resolution_note = case when next_status in ('resolved', 'false_positive') then nullif(btrim(operator_note), '') else resolution_note end
  where id = target_incident_id
  returning * into incident_row;
  insert into private.platform_incident_events (incident_id, actor_user_id, event_type, note)
  values (incident_row.id, (select auth.uid()), next_status, nullif(btrim(operator_note), ''));
  insert into private.platform_audit_entries (actor_user_id, action, target_incident_id, reason, detail)
  values ((select auth.uid()), 'incident.' || next_status, incident_row.id, nullif(btrim(operator_note), ''), jsonb_build_object('previous_status', previous_status));
  return jsonb_build_object('id', incident_row.id, 'status', incident_row.status, 'updated_at', incident_row.updated_at);
end;
$$;

revoke all on function public.platform_update_incident(uuid, text, text) from public, anon;
grant execute on function public.platform_update_incident(uuid, text, text) to authenticated;

commit;
