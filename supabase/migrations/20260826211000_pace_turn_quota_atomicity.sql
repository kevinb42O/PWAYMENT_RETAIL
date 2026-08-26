begin;

-- Reserve a durable turn and its billable credit in one transaction. The
-- unique client turn id is checked before quota consumption, so browser or
-- network retries can never debit the same exchange twice.
create or replace function public.begin_pace_turn(
  target_conversation_id uuid, target_client_turn_id uuid, expected_revision bigint,
  question text, current_view text, target_plan jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  conversation public.pace_conversations%rowtype;
  existing public.pace_turns%rowtype;
  created public.pace_turns%rowtype;
  quota jsonb;
  quota_log uuid;
begin
  conversation := private.require_pace_conversation(target_conversation_id);
  select * into existing from public.pace_turns
    where conversation_id = conversation.id and client_turn_id = target_client_turn_id;
  if existing.id is not null then
    return jsonb_build_object('created', false, 'turnId', existing.id, 'sequence', existing.sequence,
      'status', existing.status, 'answer', existing.answer_text, 'revision', conversation.revision,
      'state', conversation.state_json, 'summary', conversation.summary);
  end if;

  select * into conversation from public.pace_conversations where id = target_conversation_id for update;
  if conversation.status <> 'active' then
    raise exception using errcode = '55000', message = 'pace-conversation:closed';
  end if;
  if conversation.revision <> expected_revision then
    raise exception using errcode = '40001', message = 'pace-conversation:revision-conflict';
  end if;
  if exists (select 1 from public.pace_turns where conversation_id = conversation.id and status = 'processing') then
    raise exception using errcode = '55P03', message = 'pace-conversation:turn-in-progress';
  end if;
  if char_length(btrim(question)) not between 1 and 800 or jsonb_typeof(target_plan) <> 'object' then
    raise exception using errcode = '22023', message = 'pace-conversation:invalid-turn';
  end if;
  if current_view <> all(array['pos','service','workforce','integration-hub','insights','z-report','audit-log','admin','customers','profile']) then
    raise exception using errcode = '22023', message = 'pace-conversation:invalid-view';
  end if;

  insert into public.pace_turns (conversation_id, store_id, sequence, client_turn_id, user_id, question_text, view, plan_json)
  values (conversation.id, conversation.store_id, conversation.next_turn_sequence, target_client_turn_id,
    auth.uid(), btrim(question), current_view, target_plan)
  returning * into created;

  quota := public.check_and_consume_pace_credit(
    conversation.store_id,
    conversation.id::text || ':' || target_client_turn_id::text
  );
  if coalesce((quota->>'allowed')::boolean, false) then
    quota_log := nullif(quota->>'log_id','')::uuid;
    update public.pace_turns set quota_log_id = quota_log where id = created.id;
  else
    update public.pace_turns set status = 'failed', failure_code = coalesce(quota->>'reason','QUOTA_EXCEEDED'),
      completed_at = clock_timestamp() where id = created.id;
  end if;

  update public.pace_conversations set next_turn_sequence = next_turn_sequence + 1, active_view = current_view,
    last_turn_at = clock_timestamp(), expires_at = clock_timestamp() + interval '30 days', updated_at = clock_timestamp()
  where id = conversation.id;

  return jsonb_build_object('created', true, 'turnId', created.id, 'sequence', created.sequence,
    'status', case when coalesce((quota->>'allowed')::boolean, false) then 'processing' else 'failed' end,
    'revision', conversation.revision, 'state', conversation.state_json, 'summary', conversation.summary,
    'quota', quota);
end;
$$;

create or replace function private.finalize_pace_log_from_turn()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.quota_log_id is not null and old.status = 'processing' and new.status <> 'processing' then
    update public.pace_logs set
      status = case when new.status in ('completed','clarification') then 'completed' else 'failed' end,
      execution_time_ms = greatest(0, extract(epoch from (coalesce(new.completed_at, clock_timestamp()) - new.started_at)) * 1000)::integer,
      model = coalesce(nullif(new.model_metadata->>'model',''), model),
      error_code = case when new.status = 'failed' then new.failure_code else null end
    where id = new.quota_log_id and status = 'reserved';
  end if;
  return new;
end;
$$;

drop trigger if exists pace_turn_finalize_quota_log on public.pace_turns;
create trigger pace_turn_finalize_quota_log
  after update of status on public.pace_turns
  for each row execute function private.finalize_pace_log_from_turn();

revoke all on function private.finalize_pace_log_from_turn() from public;

commit;
