begin;

-- This context reads statement time to build date windows. VOLATILE is the
-- honest contract and prevents PostgreSQL from treating time-sensitive output
-- as stable within a statement plan.
alter function public.get_pace_ai_context(uuid, text) volatile;

-- Preserve the authorization/row-lock side effect without assigning the
-- returned conversation to an unused local variable.
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
begin
  select pace_turn.*
  into turn_row
  from public.pace_turns as pace_turn
  where pace_turn.id = target_turn_id;

  if turn_row.id is null then return; end if;

  perform private.require_pace_conversation(turn_row.conversation_id);

  update public.pace_turns as pace_turn
  set status = 'failed',
      failure_code = normalized_failure_code,
      completed_at = pg_catalog.clock_timestamp()
  where pace_turn.id = target_turn_id
    and pace_turn.status = 'processing';
end;
$$;

revoke all on function public.fail_pace_turn(uuid, text) from public, anon;
grant execute on function public.fail_pace_turn(uuid, text) to authenticated;

commit;
