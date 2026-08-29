-- Rehydrate the public provenance already stored for completed Pace turns.
-- Raw evidence facts, internal plans and model metadata remain private.
create or replace function public.get_pace_conversation(target_conversation_id uuid, after_sequence integer default 0)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare conversation public.pace_conversations%rowtype; turns jsonb; entities jsonb;
begin
  conversation := private.require_pace_conversation(target_conversation_id);
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', turn_row.id,
    'sequence', turn_row.sequence,
    'clientTurnId', turn_row.client_turn_id,
    'question', turn_row.question_text,
    'answer', turn_row.answer_text,
    'status', turn_row.status,
    'view', turn_row.view,
    'startedAt', turn_row.started_at,
    'completedAt', turn_row.completed_at,
    'source', case
      when turn_row.model_metadata->>'provider' in ('gemini','openai','analytics','records','local')
        then turn_row.model_metadata->>'provider'
      else 'local'
    end,
    'model', nullif(left(coalesce(turn_row.model_metadata->>'model',''),120),''),
    'citations', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'key', link.citation_key,
        'label', case evidence.source_name
          when 'tenant.context' then 'Winkelcontext'
          when 'inventory.action' then 'Voorraadanalyse'
          when 'analytics.query' then 'Retailanalyse'
          when 'records.lookup' then 'Winkelrecords'
          when 'sales.vat_breakdown' then 'BTW-uitsplitsing'
          when 'sales.tender_breakdown' then 'Betaalmiddelen'
          when 'gift_cards.summary' then 'Cadeaubonnen'
          when 'workforce.leave_summary' then 'Verlofgegevens'
          when 'inventory.location_stock' then 'Locatievoorraad'
          when 'product.knowledge' then 'PWAYMENT-productkennis'
          else 'PWAYMENT-context'
        end,
        'sourceKind', evidence.source_kind,
        'observedAt', evidence.observed_at,
        'freshness', case
          when evidence.source_kind = 'product_knowledge' then 'general'
          when evidence.period_json is not null then 'period'
          else 'live'
        end
      ) order by link.citation_key), '[]'::jsonb)
      from public.pace_turn_evidence link
      join public.pace_evidence_items evidence
        on evidence.id = link.evidence_id and evidence.store_id = link.store_id
      where link.turn_id = turn_row.id and link.store_id = conversation.store_id
    )
  ) order by turn_row.sequence), '[]'::jsonb) into turns
  from public.pace_turns turn_row
  where turn_row.conversation_id = conversation.id
    and turn_row.store_id = conversation.store_id
    and turn_row.sequence > greatest(0, after_sequence);

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', entity.id,
    'type', entity.entity_type,
    'label', entity.safe_label,
    'state', entity.resolution_state,
    'confidence', entity.confidence,
    'lastTurnSequence', entity.last_turn_sequence
  ) order by entity.last_turn_sequence desc), '[]'::jsonb) into entities
  from public.pace_conversation_entities entity
  where entity.conversation_id = conversation.id and entity.store_id = conversation.store_id;

  return jsonb_build_object(
    'id', conversation.id,
    'storeId', conversation.store_id,
    'title', conversation.title,
    'status', conversation.status,
    'revision', conversation.revision,
    'activeView', conversation.active_view,
    'state', conversation.state_json,
    'summary', conversation.summary,
    'turns', turns,
    'entities', entities,
    'lastTurnAt', conversation.last_turn_at,
    'expiresAt', conversation.expires_at
  );
end;
$$;

comment on function public.get_pace_conversation(uuid,integer) is
  'Returns one authorized Pace conversation with bounded public per-turn provenance; raw evidence facts and internal plans remain private.';
