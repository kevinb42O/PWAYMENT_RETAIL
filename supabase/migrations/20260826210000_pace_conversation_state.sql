begin;

-- Durable, user-private PACE research threads. Conversation memory is never an
-- authorization source: every RPC below re-checks the caller's active store
-- membership before reading or mutating state.
create table public.pace_conversations (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Nieuw onderzoek' check (char_length(title) between 1 and 120),
  status text not null default 'active' check (status in ('active','closed','deleted')),
  revision bigint not null default 0 check (revision >= 0),
  next_turn_sequence integer not null default 1 check (next_turn_sequence > 0),
  active_view text not null default 'pos' check (active_view in (
    'pos','service','workforce','integration-hub','insights','z-report','audit-log','admin','customers','profile'
  )),
  state_json jsonb not null default '{"version":1}'::jsonb check (
    jsonb_typeof(state_json) = 'object' and coalesce((state_json->>'version')::integer, 0) = 1
  ),
  summary text not null default '' check (octet_length(summary) <= 12000),
  last_turn_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default (clock_timestamp() + interval '30 days'),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (store_id, id)
);

create index pace_conversations_owner_recent_idx
  on public.pace_conversations (store_id, owner_user_id, last_turn_at desc)
  where status <> 'deleted';

create table public.pace_turns (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null,
  store_id uuid not null,
  sequence integer not null check (sequence > 0),
  client_turn_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  question_text text not null check (char_length(question_text) between 1 and 800),
  answer_text text check (answer_text is null or octet_length(answer_text) <= 24000),
  status text not null default 'processing' check (status in ('processing','completed','failed','clarification')),
  view text not null check (view in (
    'pos','service','workforce','integration-hub','insights','z-report','audit-log','admin','customers','profile'
  )),
  plan_json jsonb not null default '{}'::jsonb check (jsonb_typeof(plan_json) = 'object'),
  model_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(model_metadata) = 'object'),
  quota_log_id uuid references public.pace_logs(id),
  failure_code text,
  started_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  foreign key (store_id, conversation_id) references public.pace_conversations(store_id, id) on delete cascade,
  unique (conversation_id, sequence),
  unique (conversation_id, client_turn_id),
  unique (store_id, id)
);

create index pace_turns_conversation_sequence_idx on public.pace_turns (conversation_id, sequence);
create index pace_turns_processing_idx on public.pace_turns (started_at) where status = 'processing';

create table public.pace_conversation_entities (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null,
  store_id uuid not null,
  entity_type text not null check (entity_type in (
    'transaction','product','category','customer','gift_card','daily_report','purchase_order','webshop_order',
    'service_order','stock_movement','employee','leave_request','audit_entry','inventory_location'
  )),
  canonical_id text not null check (char_length(canonical_id) between 1 and 180),
  safe_label text not null check (char_length(safe_label) between 1 and 180),
  aliases text[] not null default '{}',
  resolution_state text not null default 'resolved' check (resolution_state in ('resolved','ambiguous','stale','inaccessible')),
  confidence numeric(4,3) not null default 1 check (confidence between 0 and 1),
  first_turn_sequence integer not null,
  last_turn_sequence integer not null,
  attributes_json jsonb not null default '{}'::jsonb check (jsonb_typeof(attributes_json) = 'object'),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  foreign key (store_id, conversation_id) references public.pace_conversations(store_id, id) on delete cascade,
  unique (conversation_id, entity_type, canonical_id),
  unique (store_id, id)
);

create index pace_conversation_entities_focus_idx
  on public.pace_conversation_entities (conversation_id, last_turn_sequence desc);

create table public.pace_entity_mentions (
  id bigint generated always as identity primary key,
  turn_id uuid not null,
  store_id uuid not null,
  conversation_entity_id uuid,
  mention_text text not null check (char_length(mention_text) between 1 and 180),
  entity_type_hint text,
  resolution_method text not null check (resolution_method in (
    'explicit_ui','exact_identifier','exact_label','prior_focus','rank_reference','bounded_fuzzy','clarified','unresolved'
  )),
  confidence numeric(4,3) not null check (confidence between 0 and 1),
  candidate_count integer not null default 0 check (candidate_count between 0 and 5),
  status text not null check (status in ('resolved','ambiguous','unresolved')),
  created_at timestamptz not null default clock_timestamp(),
  foreign key (store_id, turn_id) references public.pace_turns(store_id, id) on delete cascade,
  foreign key (store_id, conversation_entity_id) references public.pace_conversation_entities(store_id, id) on delete set null (conversation_entity_id)
);

create table public.pace_evidence_items (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null,
  turn_id uuid not null,
  store_id uuid not null,
  source_kind text not null check (source_kind in ('record','aggregate','product_knowledge','ui_context')),
  source_name text not null check (source_name in (
    'tenant.context','inventory.action','analytics.query','records.lookup','sales.vat_breakdown',
    'sales.tender_breakdown','gift_cards.summary','workforce.leave_summary','inventory.location_stock',
    'product.knowledge','ui.context'
  )),
  observed_at timestamptz not null,
  period_json jsonb,
  basis text not null check (octet_length(basis) <= 1200),
  entity_refs uuid[] not null default '{}',
  facts_json jsonb not null check (jsonb_typeof(facts_json) in ('object','array') and octet_length(facts_json::text) <= 24000),
  data_quality_json jsonb not null default '{}'::jsonb check (jsonb_typeof(data_quality_json) = 'object'),
  payload_digest text not null check (payload_digest ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default clock_timestamp(),
  foreign key (store_id, conversation_id) references public.pace_conversations(store_id, id) on delete cascade,
  foreign key (store_id, turn_id) references public.pace_turns(store_id, id) on delete cascade,
  unique (turn_id, payload_digest),
  unique (store_id, id)
);

create table public.pace_turn_evidence (
  turn_id uuid not null,
  evidence_id uuid not null,
  store_id uuid not null,
  citation_key text not null check (citation_key ~ '^E[1-9][0-9]?$'),
  claim_index integer not null default 0 check (claim_index >= 0),
  relation text not null default 'supports' check (relation in ('supports','qualifies')),
  primary key (turn_id, citation_key),
  foreign key (store_id, turn_id) references public.pace_turns(store_id, id) on delete cascade,
  foreign key (store_id, evidence_id) references public.pace_evidence_items(store_id, id) on delete cascade
);

alter table public.pace_conversations enable row level security;
alter table public.pace_turns enable row level security;
alter table public.pace_conversation_entities enable row level security;
alter table public.pace_entity_mentions enable row level security;
alter table public.pace_evidence_items enable row level security;
alter table public.pace_turn_evidence enable row level security;

-- Direct table access is deliberately unavailable; bounded RPCs are the only
-- public API so text, state and evidence cannot be forged around validation.
revoke all on public.pace_conversations, public.pace_turns, public.pace_conversation_entities,
  public.pace_entity_mentions, public.pace_evidence_items, public.pace_turn_evidence from anon, authenticated;

create or replace function private.require_pace_conversation(target_conversation_id uuid)
returns public.pace_conversations
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result public.pace_conversations%rowtype;
  actor_id uuid := (select auth.uid());
begin
  select conversation.* into result
  from public.pace_conversations conversation
  join public.store_memberships membership
    on membership.store_id = conversation.store_id and membership.user_id = actor_id and membership.status = 'active'
  where conversation.id = target_conversation_id
    and conversation.owner_user_id = actor_id
    and conversation.status <> 'deleted';
  if actor_id is null or result.id is null then
    raise exception using errcode = '42501', message = 'pace-conversation:forbidden';
  end if;
  return result;
end;
$$;

create or replace function public.start_pace_conversation(target_store_id uuid, initial_view text default 'pos')
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare actor_id uuid := (select auth.uid()); result public.pace_conversations%rowtype;
begin
  if actor_id is null or not private.is_store_member(target_store_id) then
    raise exception using errcode = '42501', message = 'pace-conversation:forbidden';
  end if;
  if initial_view <> all(array['pos','service','workforce','integration-hub','insights','z-report','audit-log','admin','customers','profile']) then
    raise exception using errcode = '22023', message = 'pace-conversation:invalid-view';
  end if;
  insert into public.pace_conversations (store_id, owner_user_id, active_view)
  values (target_store_id, actor_id, initial_view) returning * into result;
  return jsonb_build_object('id', result.id, 'storeId', result.store_id, 'title', result.title,
    'status', result.status, 'revision', result.revision, 'activeView', result.active_view,
    'lastTurnAt', result.last_turn_at, 'expiresAt', result.expires_at);
end;
$$;

create or replace function public.list_pace_conversations(target_store_id uuid, page_size integer default 20)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare actor_id uuid := (select auth.uid()); result jsonb;
begin
  if actor_id is null or not private.is_store_member(target_store_id) then
    raise exception using errcode = '42501', message = 'pace-conversation:forbidden';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', item.id, 'title', item.title, 'status', item.status,
    'revision', item.revision, 'activeView', item.active_view, 'lastTurnAt', item.last_turn_at,
    'expiresAt', item.expires_at) order by item.last_turn_at desc), '[]'::jsonb) into result
  from (select * from public.pace_conversations where store_id = target_store_id and owner_user_id = actor_id
    and status <> 'deleted' order by last_turn_at desc limit least(50, greatest(1, page_size))) item;
  return result;
end;
$$;

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
  select coalesce(jsonb_agg(jsonb_build_object('id', turn_row.id, 'sequence', turn_row.sequence,
    'clientTurnId', turn_row.client_turn_id, 'question', turn_row.question_text, 'answer', turn_row.answer_text,
    'status', turn_row.status, 'view', turn_row.view, 'startedAt', turn_row.started_at,
    'completedAt', turn_row.completed_at) order by turn_row.sequence), '[]'::jsonb) into turns
  from public.pace_turns turn_row where turn_row.conversation_id = conversation.id
    and turn_row.sequence > greatest(0, after_sequence);
  select coalesce(jsonb_agg(jsonb_build_object('id', entity.id, 'type', entity.entity_type,
    'label', entity.safe_label, 'state', entity.resolution_state, 'confidence', entity.confidence,
    'lastTurnSequence', entity.last_turn_sequence) order by entity.last_turn_sequence desc), '[]'::jsonb) into entities
  from public.pace_conversation_entities entity where entity.conversation_id = conversation.id;
  return jsonb_build_object('id', conversation.id, 'storeId', conversation.store_id, 'title', conversation.title,
    'status', conversation.status, 'revision', conversation.revision, 'activeView', conversation.active_view,
    'state', conversation.state_json, 'summary', conversation.summary, 'turns', turns, 'entities', entities,
    'lastTurnAt', conversation.last_turn_at, 'expiresAt', conversation.expires_at);
end;
$$;

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
declare conversation public.pace_conversations%rowtype; existing public.pace_turns%rowtype; created public.pace_turns%rowtype;
begin
  conversation := private.require_pace_conversation(target_conversation_id);
  select * into existing from public.pace_turns where conversation_id = conversation.id and client_turn_id = target_client_turn_id;
  if existing.id is not null then
    return jsonb_build_object('created', false, 'turnId', existing.id, 'sequence', existing.sequence,
      'status', existing.status, 'answer', existing.answer_text, 'revision', conversation.revision,
      'state', conversation.state_json, 'summary', conversation.summary);
  end if;
  select * into conversation from public.pace_conversations where id = target_conversation_id for update;
  if conversation.status <> 'active' then raise exception using errcode = '55000', message = 'pace-conversation:closed'; end if;
  if conversation.revision <> expected_revision then raise exception using errcode = '40001', message = 'pace-conversation:revision-conflict'; end if;
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
  values (conversation.id, conversation.store_id, conversation.next_turn_sequence, target_client_turn_id, auth.uid(), btrim(question), current_view, target_plan)
  returning * into created;
  update public.pace_conversations set next_turn_sequence = next_turn_sequence + 1, active_view = current_view,
    last_turn_at = clock_timestamp(), expires_at = clock_timestamp() + interval '30 days', updated_at = clock_timestamp()
  where id = conversation.id;
  return jsonb_build_object('created', true, 'turnId', created.id, 'sequence', created.sequence,
    'status', created.status, 'revision', conversation.revision, 'state', conversation.state_json,
    'summary', conversation.summary);
end;
$$;

create or replace function public.complete_pace_turn(
  target_turn_id uuid, expected_revision bigint, final_answer text, final_status text,
  state_patch jsonb, final_summary text, final_title text, final_plan jsonb,
  entity_items jsonb default '[]'::jsonb, mention_items jsonb default '[]'::jsonb,
  evidence_items jsonb default '[]'::jsonb, final_model_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare turn_row public.pace_turns%rowtype; conversation public.pace_conversations%rowtype;
  entity_item jsonb; mention_item jsonb; evidence_item jsonb; entity_id uuid; evidence_id uuid;
  entity_ids jsonb := '{}'::jsonb; evidence_result jsonb := '[]'::jsonb;
begin
  select * into turn_row from public.pace_turns where id = target_turn_id;
  if turn_row.id is null then raise exception using errcode = '22023', message = 'pace-conversation:unknown-turn'; end if;
  conversation := private.require_pace_conversation(turn_row.conversation_id);
  select * into conversation from public.pace_conversations where id = turn_row.conversation_id for update;
  select * into turn_row from public.pace_turns where id = target_turn_id for update;
  if turn_row.status in ('completed','clarification') then
    return jsonb_build_object('turnId', turn_row.id, 'sequence', turn_row.sequence, 'status', turn_row.status,
      'answer', turn_row.answer_text, 'revision', conversation.revision);
  end if;
  if turn_row.status <> 'processing' or conversation.revision <> expected_revision then
    raise exception using errcode = '40001', message = 'pace-conversation:revision-conflict';
  end if;
  if final_status not in ('completed','clarification') or octet_length(final_answer) > 24000
    or jsonb_typeof(state_patch) <> 'object' or coalesce((state_patch->>'version')::integer, 0) <> 1
    or jsonb_typeof(final_plan) <> 'object' or jsonb_typeof(final_model_metadata) <> 'object'
    or jsonb_typeof(entity_items) <> 'array' or jsonb_array_length(entity_items) > 25
    or jsonb_typeof(mention_items) <> 'array' or jsonb_array_length(mention_items) > 25
    or jsonb_typeof(evidence_items) <> 'array' or jsonb_array_length(evidence_items) > 20 then
    raise exception using errcode = '22023', message = 'pace-conversation:invalid-completion';
  end if;

  for entity_item in select value from jsonb_array_elements(entity_items) loop
    if coalesce(entity_item->>'type','') <> all(array['transaction','product','category','customer','gift_card','daily_report','purchase_order','webshop_order','service_order','stock_movement','employee','leave_request','audit_entry','inventory_location'])
      or char_length(coalesce(entity_item->>'canonicalId','')) not between 1 and 180
      or char_length(coalesce(entity_item->>'label','')) not between 1 and 180 then
      raise exception using errcode = '22023', message = 'pace-conversation:invalid-entity';
    end if;
    insert into public.pace_conversation_entities (conversation_id, store_id, entity_type, canonical_id, safe_label,
      aliases, resolution_state, confidence, first_turn_sequence, last_turn_sequence, attributes_json)
    values (conversation.id, conversation.store_id, entity_item->>'type', entity_item->>'canonicalId', entity_item->>'label',
      array(select left(value,180) from jsonb_array_elements_text(coalesce(entity_item->'aliases','[]'::jsonb)) value limit 8),
      coalesce(entity_item->>'state','resolved'), least(1, greatest(0, coalesce((entity_item->>'confidence')::numeric,1))),
      turn_row.sequence, turn_row.sequence, coalesce(entity_item->'attributes','{}'::jsonb))
    on conflict (conversation_id, entity_type, canonical_id) do update set safe_label = excluded.safe_label,
      aliases = (select array(select distinct value from unnest(public.pace_conversation_entities.aliases || excluded.aliases) value limit 8)),
      resolution_state = excluded.resolution_state, confidence = excluded.confidence,
      last_turn_sequence = excluded.last_turn_sequence, attributes_json = excluded.attributes_json,
      updated_at = clock_timestamp()
    returning id into entity_id;
    entity_ids := entity_ids || jsonb_build_object(entity_item->>'clientKey', entity_id);
  end loop;

  for mention_item in select value from jsonb_array_elements(mention_items) loop
    insert into public.pace_entity_mentions (turn_id, store_id, conversation_entity_id, mention_text, entity_type_hint,
      resolution_method, confidence, candidate_count, status)
    values (turn_row.id, turn_row.store_id, case when entity_ids ? (mention_item->>'entityKey') then (entity_ids->>(mention_item->>'entityKey'))::uuid else null end,
      left(coalesce(mention_item->>'text','?'),180), nullif(left(coalesce(mention_item->>'type',''),80),''),
      coalesce(mention_item->>'method','unresolved'), least(1,greatest(0,coalesce((mention_item->>'confidence')::numeric,0))),
      least(5,greatest(0,coalesce((mention_item->>'candidateCount')::integer,0))), coalesce(mention_item->>'status','unresolved'));
  end loop;

  for evidence_item in select value from jsonb_array_elements(evidence_items) loop
    insert into public.pace_evidence_items (conversation_id, turn_id, store_id, source_kind, source_name, observed_at,
      period_json, basis, entity_refs, facts_json, data_quality_json, payload_digest)
    values (conversation.id, turn_row.id, turn_row.store_id, evidence_item->>'sourceKind', evidence_item->>'sourceName',
      (evidence_item->>'observedAt')::timestamptz, evidence_item->'period', left(coalesce(evidence_item->>'basis','PACE context'),1200),
      array(select (entity_ids->>value)::uuid from jsonb_array_elements_text(coalesce(evidence_item->'entityKeys','[]'::jsonb)) value where entity_ids ? value),
      coalesce(evidence_item->'facts','{}'::jsonb), coalesce(evidence_item->'dataQuality','{}'::jsonb), evidence_item->>'digest')
    returning id into evidence_id;
    insert into public.pace_turn_evidence (turn_id, evidence_id, store_id, citation_key, claim_index, relation)
    values (turn_row.id, evidence_id, turn_row.store_id, evidence_item->>'key', coalesce((evidence_item->>'claimIndex')::integer,0),
      coalesce(evidence_item->>'relation','supports'));
    evidence_result := evidence_result || jsonb_build_array(jsonb_build_object('key', evidence_item->>'key',
      'id', evidence_id, 'label', evidence_item->>'label', 'sourceKind', evidence_item->>'sourceKind',
      'observedAt', evidence_item->>'observedAt', 'freshness', evidence_item->>'freshness'));
  end loop;

  update public.pace_turns set answer_text = final_answer, status = final_status, plan_json = final_plan,
    model_metadata = final_model_metadata, completed_at = clock_timestamp() where id = turn_row.id;
  update public.pace_conversations set revision = revision + 1, state_json = state_patch,
    summary = left(coalesce(final_summary,''),12000), title = left(coalesce(nullif(btrim(final_title),''),title),120),
    last_turn_at = clock_timestamp(), updated_at = clock_timestamp(), expires_at = clock_timestamp() + interval '30 days'
  where id = conversation.id returning * into conversation;
  return jsonb_build_object('turnId', turn_row.id, 'sequence', turn_row.sequence, 'status', final_status,
    'answer', final_answer, 'revision', conversation.revision, 'title', conversation.title,
    'entities', (select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'type', e.entity_type, 'label', e.safe_label,
      'state', e.resolution_state, 'confidence', e.confidence)), '[]'::jsonb) from public.pace_conversation_entities e
      where e.conversation_id = conversation.id and e.last_turn_sequence = turn_row.sequence),
    'citations', evidence_result);
end;
$$;

create or replace function public.fail_pace_turn(target_turn_id uuid, failure_code text)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare turn_row public.pace_turns%rowtype; conversation public.pace_conversations%rowtype;
begin
  select * into turn_row from public.pace_turns where id = target_turn_id;
  if turn_row.id is null then return; end if;
  conversation := private.require_pace_conversation(turn_row.conversation_id);
  update public.pace_turns set status = 'failed', failure_code = left(failure_code,120), completed_at = clock_timestamp()
    where id = target_turn_id and status = 'processing';
end; $$;

create or replace function public.close_pace_conversation(target_conversation_id uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare conversation public.pace_conversations%rowtype;
begin conversation := private.require_pace_conversation(target_conversation_id);
  update public.pace_conversations set status = 'closed', updated_at = clock_timestamp() where id = conversation.id;
end; $$;

create or replace function public.delete_pace_conversation(target_conversation_id uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare conversation public.pace_conversations%rowtype;
begin conversation := private.require_pace_conversation(target_conversation_id);
  update public.pace_conversations set status = 'deleted', summary = '', state_json = '{"version":1}'::jsonb,
    title = 'Verwijderd gesprek', expires_at = clock_timestamp() + interval '7 days', updated_at = clock_timestamp()
  where id = conversation.id;
end; $$;

-- Bounded resolver. It returns candidates only; the API applies discourse and
-- confidence rules. The model never supplies table names or canonical ids.
create or replace function public.resolve_pace_entities(target_store_id uuid, resolution_requests jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare actor_id uuid := (select auth.uid()); request_item jsonb; result jsonb := '[]'::jsonb;
  requested_type text; requested_search text; candidates jsonb;
begin
  if actor_id is null or not private.is_store_member(target_store_id) then
    raise exception using errcode = '42501', message = 'pace-entity:forbidden';
  end if;
  if jsonb_typeof(resolution_requests) <> 'array' or jsonb_array_length(resolution_requests) > 8 then
    raise exception using errcode = '22023', message = 'pace-entity:invalid-request';
  end if;
  for request_item in select value from jsonb_array_elements(resolution_requests) loop
    requested_type := coalesce(request_item->>'type','');
    requested_search := lower(left(btrim(coalesce(request_item->>'search','')),160));
    if requested_search = '' then candidates := '[]'::jsonb;
    elsif requested_type = 'product' then
      select coalesce(jsonb_agg(payload order by score desc, label), '[]'::jsonb) into candidates from (
        select jsonb_build_object('canonicalId', p.id, 'type','product','label',left(concat_ws(' · ',p.name,nullif(p.variant,'')),180),
          'attributes',jsonb_strip_nulls(jsonb_build_object('sku',p.sku,'variant',p.variant,'color',p.color)),
          'score',case when lower(coalesce(p.sku,'')) = requested_search or lower(coalesce(p.barcode,'')) = requested_search then 1
            when lower(p.name) = requested_search then .97 when lower(concat_ws(' ',p.name,p.variant,p.color)) like '%'||requested_search||'%' then .88 else .70 end) payload,
          case when lower(coalesce(p.sku,'')) = requested_search or lower(coalesce(p.barcode,'')) = requested_search then 1
            when lower(p.name) = requested_search then .97 when lower(concat_ws(' ',p.name,p.variant,p.color)) like '%'||requested_search||'%' then .88 else .70 end score,
          p.name label from public.products p where p.store_id=target_store_id and p.is_active
          and lower(concat_ws(' ',p.name,p.variant,p.color,p.sku,p.barcode)) like '%'||requested_search||'%' limit 5
      ) ranked;
    elsif requested_type = 'category' then
      select coalesce(jsonb_agg(payload order by exact_match desc, label), '[]'::jsonb) into candidates from (
        select jsonb_build_object('canonicalId',c.id,'type','category','label',left(c.name,180),'attributes','{}'::jsonb,
          'score',case when lower(c.name)=requested_search then .97 else .86 end) payload,
          case when lower(c.name)=requested_search then 1 else 0 end exact_match, c.name label
        from public.categories c where c.store_id=target_store_id and c.is_active
          and lower(c.name) like '%'||requested_search||'%' order by exact_match desc,c.name limit 5
      ) ranked;
    elsif requested_type = 'customer' then
      select coalesce(jsonb_agg(payload order by exact_match desc, label), '[]'::jsonb) into candidates from (
        select jsonb_build_object('canonicalId',c.id,'type','customer','label',left(c.name,180),'attributes','{}'::jsonb,
          'score',case when lower(c.name)=requested_search then .97 else .84 end) payload,
          case when lower(c.name)=requested_search then 1 else 0 end exact_match, c.name label
        from public.customers c where c.store_id=target_store_id and c.is_active
          and lower(c.name) like '%'||requested_search||'%' order by exact_match desc,c.name limit 5
      ) ranked;
    elsif requested_type = 'transaction' then
      select coalesce(jsonb_agg(payload order by occurred_at desc), '[]'::jsonb) into candidates from (
        select jsonb_build_object('canonicalId',t.id,'type','transaction','label',left(t.document_number,180),
          'attributes',jsonb_build_object('occurredAt',t.occurred_at),'score',case when lower(t.document_number)=requested_search then 1 else .86 end) payload,
          t.occurred_at from public.transactions t where t.store_id=target_store_id and t.is_finalized
          and lower(t.document_number) like '%'||requested_search||'%' order by t.occurred_at desc limit 5
      ) ranked;
    elsif requested_type = 'inventory_location' then
      select coalesce(jsonb_agg(payload order by exact_match desc, label), '[]'::jsonb) into candidates from (
        select jsonb_build_object('canonicalId',l.id,'type','inventory_location','label',left(l.name,180),
          'attributes',jsonb_build_object('code',l.code),'score',case when lower(l.code)=requested_search or lower(l.name)=requested_search then .97 else .85 end) payload,
          case when lower(l.code)=requested_search or lower(l.name)=requested_search then 1 else 0 end exact_match, l.name label
        from public.inventory_locations l where l.store_id=target_store_id and l.is_active
          and lower(concat_ws(' ',l.code,l.name)) like '%'||requested_search||'%'
        order by exact_match desc,l.name limit 5
      ) ranked;
    else candidates := '[]'::jsonb;
    end if;
    result := result || jsonb_build_array(jsonb_build_object('mentionKey',request_item->>'mentionKey','type',requested_type,
      'search',requested_search,'candidates',candidates));
  end loop;
  return result;
end; $$;

revoke all on function private.require_pace_conversation(uuid) from public;
revoke all on function public.start_pace_conversation(uuid,text), public.list_pace_conversations(uuid,integer),
  public.get_pace_conversation(uuid,integer), public.begin_pace_turn(uuid,uuid,bigint,text,text,jsonb),
  public.complete_pace_turn(uuid,bigint,text,text,jsonb,text,text,jsonb,jsonb,jsonb,jsonb,jsonb),
  public.fail_pace_turn(uuid,text), public.close_pace_conversation(uuid), public.delete_pace_conversation(uuid),
  public.resolve_pace_entities(uuid,jsonb) from public, anon;
grant execute on function public.start_pace_conversation(uuid,text), public.list_pace_conversations(uuid,integer),
  public.get_pace_conversation(uuid,integer), public.begin_pace_turn(uuid,uuid,bigint,text,text,jsonb),
  public.complete_pace_turn(uuid,bigint,text,text,jsonb,text,text,jsonb,jsonb,jsonb,jsonb,jsonb),
  public.fail_pace_turn(uuid,text), public.close_pace_conversation(uuid), public.delete_pace_conversation(uuid),
  public.resolve_pace_entities(uuid,jsonb) to authenticated;

commit;
