begin;

-- PACE conversation state must only be changed by our server API.  Browser
-- sessions authenticate a user but are not an authorization boundary for
-- invoking low-level state-machine RPCs directly.
create or replace function public.pace_server_rpc(
  target_actor_user_id uuid,
  operation text,
  rpc_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  normalized_operation text := pg_catalog.btrim(coalesce(operation, ''));
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'pace-server-rpc:forbidden';
  end if;
  if target_actor_user_id is null or pg_catalog.jsonb_typeof(rpc_payload) <> 'object' then
    raise exception using errcode = '22023', message = 'pace-server-rpc:invalid-request';
  end if;

  -- The server has already validated the caller's bearer token with Auth. The
  -- existing state functions continue to perform their normal membership and
  -- ownership checks against this actor identity.
  perform pg_catalog.set_config('request.jwt.claim.sub', target_actor_user_id::text, true);

  case normalized_operation
    when 'start_pace_conversation' then
      return public.start_pace_conversation(
        (rpc_payload->>'target_store_id')::uuid,
        coalesce(rpc_payload->>'initial_view', 'pos')
      );
    when 'list_pace_conversations' then
      return public.list_pace_conversations(
        (rpc_payload->>'target_store_id')::uuid,
        coalesce((rpc_payload->>'page_size')::integer, 20)
      );
    when 'get_pace_conversation' then
      return public.get_pace_conversation(
        (rpc_payload->>'target_conversation_id')::uuid,
        coalesce((rpc_payload->>'after_sequence')::integer, 0)
      );
    when 'begin_pace_turn' then
      return public.begin_pace_turn(
        (rpc_payload->>'target_conversation_id')::uuid,
        (rpc_payload->>'target_client_turn_id')::uuid,
        (rpc_payload->>'expected_revision')::bigint,
        rpc_payload->>'question',
        rpc_payload->>'current_view',
        coalesce(rpc_payload->'target_plan', '{}'::jsonb)
      );
    when 'complete_pace_turn' then
      return public.complete_pace_turn(
        (rpc_payload->>'target_turn_id')::uuid,
        (rpc_payload->>'expected_revision')::bigint,
        rpc_payload->>'final_answer',
        rpc_payload->>'final_status',
        coalesce(rpc_payload->'state_patch', '{}'::jsonb),
        rpc_payload->>'final_summary',
        rpc_payload->>'final_title',
        coalesce(rpc_payload->'final_plan', '{}'::jsonb),
        coalesce(rpc_payload->'entity_items', '[]'::jsonb),
        coalesce(rpc_payload->'mention_items', '[]'::jsonb),
        coalesce(rpc_payload->'evidence_items', '[]'::jsonb),
        coalesce(rpc_payload->'final_model_metadata', '{}'::jsonb)
      );
    when 'fail_pace_turn' then
      perform public.fail_pace_turn((rpc_payload->>'target_turn_id')::uuid, rpc_payload->>'failure_code');
      return 'null'::jsonb;
    when 'close_pace_conversation' then
      perform public.close_pace_conversation((rpc_payload->>'target_conversation_id')::uuid);
      return 'null'::jsonb;
    when 'delete_pace_conversation' then
      perform public.delete_pace_conversation((rpc_payload->>'target_conversation_id')::uuid);
      return 'null'::jsonb;
    when 'resolve_pace_entities' then
      return public.resolve_pace_entities(
        (rpc_payload->>'target_store_id')::uuid,
        coalesce(rpc_payload->'resolution_requests', '[]'::jsonb)
      );
    else
      raise exception using errcode = '22023', message = 'pace-server-rpc:unknown-operation';
  end case;
end;
$$;

revoke all on function public.start_pace_conversation(uuid, text),
  public.list_pace_conversations(uuid, integer),
  public.get_pace_conversation(uuid, integer),
  public.begin_pace_turn(uuid, uuid, bigint, text, text, jsonb),
  public.complete_pace_turn(uuid, bigint, text, text, jsonb, text, text, jsonb, jsonb, jsonb, jsonb, jsonb),
  public.fail_pace_turn(uuid, text),
  public.close_pace_conversation(uuid),
  public.delete_pace_conversation(uuid),
  public.resolve_pace_entities(uuid, jsonb),
  public.pace_server_rpc(uuid, text, jsonb)
from public, anon, authenticated;

grant execute on function public.pace_server_rpc(uuid, text, jsonb) to service_role;

commit;
