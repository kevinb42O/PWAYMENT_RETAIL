begin;

-- Keep failure persistence best-effort at the API boundary without allowing a
-- PL/pgSQL name collision to leave the durable turn in `processing` forever.
-- The parameter name is part of the existing PostgREST contract, so normalize
-- it into an unambiguous local variable instead of changing the signature.
create or replace function public.fail_pace_turn(target_turn_id uuid, failure_code text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  normalized_failure_code text := pg_catalog.left(
    coalesce(nullif(pg_catalog.btrim(failure_code), ''), 'PACE_TURN_FAILED'),
    120
  );
  turn_row public.pace_turns%rowtype;
  conversation public.pace_conversations%rowtype;
begin
  select * into turn_row
  from public.pace_turns
  where id = target_turn_id;

  if turn_row.id is null then
    return;
  end if;

  conversation := private.require_pace_conversation(turn_row.conversation_id);

  update public.pace_turns as pace_turn
  set status = 'failed',
      failure_code = normalized_failure_code,
      completed_at = pg_catalog.clock_timestamp()
  where pace_turn.id = target_turn_id
    and pace_turn.status = 'processing';
end;
$$;

-- Recover abandoned work while holding the conversation row lock. Five
-- minutes is deliberately above every individual PACE upstream timeout and
-- prevents a second request from racing a legitimately active turn. Updating
-- the stale row also fires pace_turn_finalize_quota_log, closing its reserved
-- usage log before the next turn is admitted.
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

  -- Serialize idempotency, stale recovery and admission for this conversation.
  select * into conversation
  from public.pace_conversations
  where id = target_conversation_id
  for update;

  update public.pace_turns as stale_turn
  set status = 'failed',
      failure_code = 'PACE_TURN_STALE',
      completed_at = pg_catalog.clock_timestamp()
  where stale_turn.conversation_id = conversation.id
    and stale_turn.status = 'processing'
    and stale_turn.started_at < pg_catalog.clock_timestamp() - interval '5 minutes';

  -- Idempotency is evaluated after recovery. A retry with the same client turn
  -- id therefore observes the durable failed state instead of an eternal
  -- `processing` response and never consumes another credit.
  select * into existing
  from public.pace_turns
  where conversation_id = conversation.id
    and client_turn_id = target_client_turn_id;

  if existing.id is not null then
    return pg_catalog.jsonb_build_object(
      'created', false,
      'turnId', existing.id,
      'sequence', existing.sequence,
      'status', existing.status,
      'answer', existing.answer_text,
      'revision', conversation.revision,
      'state', conversation.state_json,
      'summary', conversation.summary
    );
  end if;

  if conversation.status <> 'active' then
    raise exception using errcode = '55000', message = 'pace-conversation:closed';
  end if;
  if conversation.revision <> expected_revision then
    raise exception using errcode = '40001', message = 'pace-conversation:revision-conflict';
  end if;
  if exists (
    select 1
    from public.pace_turns
    where conversation_id = conversation.id
      and status = 'processing'
  ) then
    raise exception using errcode = '55P03', message = 'pace-conversation:turn-in-progress';
  end if;
  if pg_catalog.char_length(pg_catalog.btrim(question)) not between 1 and 800
    or pg_catalog.jsonb_typeof(target_plan) <> 'object' then
    raise exception using errcode = '22023', message = 'pace-conversation:invalid-turn';
  end if;
  if current_view <> all(array[
    'pos','service','workforce','integration-hub','insights',
    'z-report','audit-log','admin','customers','profile'
  ]) then
    raise exception using errcode = '22023', message = 'pace-conversation:invalid-view';
  end if;

  insert into public.pace_turns (
    conversation_id, store_id, sequence, client_turn_id, user_id,
    question_text, view, plan_json
  )
  values (
    conversation.id, conversation.store_id, conversation.next_turn_sequence,
    target_client_turn_id, auth.uid(), pg_catalog.btrim(question), current_view,
    target_plan
  )
  returning * into created;

  quota := public.check_and_consume_pace_credit(
    conversation.store_id,
    conversation.id::text || ':' || target_client_turn_id::text
  );

  if coalesce((quota->>'allowed')::boolean, false) then
    quota_log := nullif(quota->>'log_id', '')::uuid;
    update public.pace_turns
    set quota_log_id = quota_log
    where id = created.id;
  else
    update public.pace_turns
    set status = 'failed',
        failure_code = coalesce(quota->>'reason', 'QUOTA_EXCEEDED'),
        completed_at = pg_catalog.clock_timestamp()
    where id = created.id;
  end if;

  update public.pace_conversations
  set next_turn_sequence = next_turn_sequence + 1,
      active_view = current_view,
      last_turn_at = pg_catalog.clock_timestamp(),
      expires_at = pg_catalog.clock_timestamp() + interval '30 days',
      updated_at = pg_catalog.clock_timestamp()
  where id = conversation.id;

  return pg_catalog.jsonb_build_object(
    'created', true,
    'turnId', created.id,
    'sequence', created.sequence,
    'status', case
      when coalesce((quota->>'allowed')::boolean, false) then 'processing'
      else 'failed'
    end,
    'revision', conversation.revision,
    'state', conversation.state_json,
    'summary', conversation.summary,
    'quota', quota
  );
end;
$$;

revoke all on function public.fail_pace_turn(uuid, text),
  public.begin_pace_turn(uuid, uuid, bigint, text, text, jsonb)
  from public, anon;
grant execute on function public.fail_pace_turn(uuid, text),
  public.begin_pace_turn(uuid, uuid, bigint, text, text, jsonb)
  to authenticated;

commit;
