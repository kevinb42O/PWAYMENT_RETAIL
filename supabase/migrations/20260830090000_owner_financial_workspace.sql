begin;

create table public.financial_costs (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  external_id text not null,
  cost_kind text not null check (cost_kind in ('recurring', 'one-off')),
  name text not null check (char_length(btrim(name)) between 1 and 160),
  category_key text not null check (category_key ~ '^[a-z0-9-]{1,60}$'),
  custom_category text check (custom_category is null or char_length(btrim(custom_category)) between 1 and 80),
  supplier text check (supplier is null or char_length(btrim(supplier)) between 1 and 160),
  document_number text check (document_number is null or char_length(btrim(document_number)) between 1 and 100),
  amount_cents bigint not null check (amount_cents >= 0),
  amount_mode text not null check (amount_mode in ('excluding-vat', 'including-vat')),
  vat_rate smallint not null check (vat_rate in (0, 6, 12, 21)),
  vat_recoverable_percent smallint not null check (vat_recoverable_percent between 0 and 100),
  cost_behavior text not null check (cost_behavior in ('fixed', 'variable')),
  frequency text not null check (frequency in ('once', 'monthly', 'quarterly', 'yearly')),
  start_date date not null,
  end_date date,
  status text not null default 'active' check (status in ('active', 'archived')),
  source text not null default 'live' check (source in ('live', 'demo')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, external_id),
  check (end_date is null or end_date >= start_date),
  check ((cost_kind = 'one-off' and frequency = 'once') or cost_kind = 'recurring')
);

create index financial_costs_store_active_idx
  on public.financial_costs (store_id, status, start_date, end_date);

create table public.store_financial_settings (
  store_id uuid primary key references public.stores(id) on delete cascade,
  safety_buffer_cents bigint not null default 0 check (safety_buffer_cents >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Idempotency is separate from the cost record: a retry may arrive after the
-- original mutation has already been acknowledged by another browser tab.
create table private.financial_workspace_mutations (
  store_id uuid not null references public.stores(id) on delete cascade,
  mutation_id text not null check (char_length(mutation_id) between 8 and 100),
  created_at timestamptz not null default now(),
  primary key (store_id, mutation_id)
);

-- Financial audit is deliberately not written to public.audit_entries because
-- existing managers may read that operational log.
create table public.financial_cost_events (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  cost_external_id text,
  actor_user_id uuid references auth.users(id),
  event_type text not null check (event_type in ('cost.upsert', 'cost.archive', 'settings.update')),
  detail jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index financial_cost_events_store_time_idx
  on public.financial_cost_events (store_id, occurred_at desc);

alter table public.financial_costs enable row level security;
alter table public.store_financial_settings enable row level security;
alter table public.financial_cost_events enable row level security;

create policy financial_costs_owner_select
  on public.financial_costs for select to authenticated
  using ((select private.has_store_role(store_id, array['owner'])));
create policy financial_costs_owner_insert
  on public.financial_costs for insert to authenticated
  with check ((select private.has_store_role(store_id, array['owner'])));
create policy financial_costs_owner_update
  on public.financial_costs for update to authenticated
  using ((select private.has_store_role(store_id, array['owner'])))
  with check ((select private.has_store_role(store_id, array['owner'])));

create policy store_financial_settings_owner_select
  on public.store_financial_settings for select to authenticated
  using ((select private.has_store_role(store_id, array['owner'])));
create policy store_financial_settings_owner_insert
  on public.store_financial_settings for insert to authenticated
  with check ((select private.has_store_role(store_id, array['owner'])));
create policy store_financial_settings_owner_update
  on public.store_financial_settings for update to authenticated
  using ((select private.has_store_role(store_id, array['owner'])))
  with check ((select private.has_store_role(store_id, array['owner'])));

create policy financial_cost_events_owner_select
  on public.financial_cost_events for select to authenticated
  using ((select private.has_store_role(store_id, array['owner'])));

create or replace function public.get_owner_financial_workspace(target_store_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.has_store_role(target_store_id, array['owner']) then
    raise exception 'financial:not-authorized:Alleen de eigenaar kan financiële gegevens bekijken.' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'costs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', cost.external_id,
        'kind', cost.cost_kind,
        'name', cost.name,
        'category', cost.category_key,
        'customCategory', cost.custom_category,
        'supplier', cost.supplier,
        'documentNumber', cost.document_number,
        'amountCents', cost.amount_cents,
        'amountMode', cost.amount_mode,
        'vatRate', cost.vat_rate,
        'vatRecoverablePercent', cost.vat_recoverable_percent,
        'behavior', cost.cost_behavior,
        'frequency', cost.frequency,
        'startDate', to_char(cost.start_date, 'YYYY-MM-DD'),
        'endDate', case when cost.end_date is null then null else to_char(cost.end_date, 'YYYY-MM-DD') end,
        'status', cost.status,
        'source', cost.source,
        'createdAt', cost.created_at,
        'updatedAt', cost.updated_at
      ) order by cost.updated_at desc)
      from public.financial_costs cost
      where cost.store_id = target_store_id
    ), '[]'::jsonb),
    'settings', coalesce((
      select jsonb_build_object(
        'id', 'store',
        'safetyBufferCents', settings.safety_buffer_cents,
        'updatedAt', settings.updated_at
      )
      from public.store_financial_settings settings
      where settings.store_id = target_store_id
    ), jsonb_build_object('id', 'store', 'safetyBufferCents', 0, 'updatedAt', to_timestamp(0)))
  );
end;
$$;

create or replace function public.mutate_owner_financial_workspace(
  target_store_id uuid,
  mutation_payload jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  mutation_id text := btrim(coalesce(mutation_payload ->> 'mutationId', ''));
  entity_name text := mutation_payload ->> 'entity';
  cost jsonb := mutation_payload -> 'cost';
  settings jsonb := mutation_payload -> 'settings';
  requested_updated_at timestamptz;
  requested_created_at timestamptz;
begin
  if not private.has_store_role(target_store_id, array['owner']) then
    raise exception 'financial:not-authorized:Alleen de eigenaar kan financiële gegevens wijzigen.' using errcode = '42501';
  end if;
  if char_length(mutation_id) < 8 or char_length(mutation_id) > 100 then
    raise exception 'financial:invalid:Ongeldige mutatiereferentie.';
  end if;

  insert into private.financial_workspace_mutations(store_id, mutation_id)
  values (target_store_id, mutation_id)
  on conflict do nothing;
  if not found then return true; end if;

  if entity_name = 'cost' then
    if jsonb_typeof(cost) <> 'object'
       or btrim(coalesce(cost ->> 'id', '')) = ''
       or char_length(cost ->> 'id') > 100
       or char_length(btrim(coalesce(cost ->> 'name', ''))) not between 1 and 160
       or coalesce(cost ->> 'category', '') !~ '^[a-z0-9-]{1,60}$'
       or coalesce(cost ->> 'kind', '') not in ('recurring', 'one-off')
       or coalesce(cost ->> 'amountMode', '') not in ('excluding-vat', 'including-vat')
       or coalesce(cost ->> 'behavior', '') not in ('fixed', 'variable')
       or coalesce(cost ->> 'frequency', '') not in ('once', 'monthly', 'quarterly', 'yearly')
       or coalesce(cost ->> 'status', '') not in ('active', 'archived')
       or coalesce(cost ->> 'amountCents', '') !~ '^\d{1,16}$'
       or coalesce(cost ->> 'vatRate', '') not in ('0', '6', '12', '21')
       or coalesce(cost ->> 'vatRecoverablePercent', '') !~ '^\d{1,3}$'
       or (cost ->> 'vatRecoverablePercent')::integer not between 0 and 100
       or coalesce(cost ->> 'startDate', '') !~ '^\d{4}-\d{2}-\d{2}$'
       or (cost ->> 'kind') = 'one-off' and (cost ->> 'frequency') <> 'once'
       or nullif(cost ->> 'endDate', '') is not null and (cost ->> 'endDate') !~ '^\d{4}-\d{2}-\d{2}$'
    then
      raise exception 'financial:invalid:De kost bevat ongeldige of onvolledige gegevens.';
    end if;
    requested_updated_at := (cost ->> 'updatedAt')::timestamptz;
    requested_created_at := (cost ->> 'createdAt')::timestamptz;
    if nullif(cost ->> 'endDate', '') is not null
       and (cost ->> 'endDate')::date < (cost ->> 'startDate')::date then
      raise exception 'financial:invalid:De einddatum ligt vóór de startdatum.';
    end if;

    insert into public.financial_costs (
      store_id, external_id, cost_kind, name, category_key, custom_category,
      supplier, document_number, amount_cents, amount_mode, vat_rate,
      vat_recoverable_percent, cost_behavior, frequency, start_date, end_date,
      status, source, created_at, updated_at
    ) values (
      target_store_id,
      cost ->> 'id',
      cost ->> 'kind',
      btrim(cost ->> 'name'),
      cost ->> 'category',
      nullif(btrim(coalesce(cost ->> 'customCategory', '')), ''),
      nullif(btrim(coalesce(cost ->> 'supplier', '')), ''),
      nullif(btrim(coalesce(cost ->> 'documentNumber', '')), ''),
      (cost ->> 'amountCents')::bigint,
      cost ->> 'amountMode',
      (cost ->> 'vatRate')::smallint,
      (cost ->> 'vatRecoverablePercent')::smallint,
      cost ->> 'behavior',
      cost ->> 'frequency',
      (cost ->> 'startDate')::date,
      nullif(cost ->> 'endDate', '')::date,
      cost ->> 'status',
      'live',
      requested_created_at,
      requested_updated_at
    )
    on conflict (store_id, external_id) do update set
      cost_kind = excluded.cost_kind,
      name = excluded.name,
      category_key = excluded.category_key,
      custom_category = excluded.custom_category,
      supplier = excluded.supplier,
      document_number = excluded.document_number,
      amount_cents = excluded.amount_cents,
      amount_mode = excluded.amount_mode,
      vat_rate = excluded.vat_rate,
      vat_recoverable_percent = excluded.vat_recoverable_percent,
      cost_behavior = excluded.cost_behavior,
      frequency = excluded.frequency,
      start_date = excluded.start_date,
      end_date = excluded.end_date,
      status = excluded.status,
      updated_at = excluded.updated_at
    where public.financial_costs.updated_at <= excluded.updated_at;

    insert into public.financial_cost_events(
      store_id, cost_external_id, actor_user_id, event_type, detail
    ) values (
      target_store_id,
      cost ->> 'id',
      auth.uid(),
      case when cost ->> 'status' = 'archived' then 'cost.archive' else 'cost.upsert' end,
      jsonb_build_object('category', cost ->> 'category', 'updatedAt', requested_updated_at)
    );
  elsif entity_name = 'settings' then
    if jsonb_typeof(settings) <> 'object'
       or coalesce(settings ->> 'safetyBufferCents', '') !~ '^\d{1,16}$' then
      raise exception 'financial:invalid:De financiële instellingen zijn ongeldig.';
    end if;
    requested_updated_at := (settings ->> 'updatedAt')::timestamptz;
    insert into public.store_financial_settings(store_id, safety_buffer_cents, updated_at)
    values (target_store_id, (settings ->> 'safetyBufferCents')::bigint, requested_updated_at)
    on conflict (store_id) do update set
      safety_buffer_cents = excluded.safety_buffer_cents,
      updated_at = excluded.updated_at
    where public.store_financial_settings.updated_at <= excluded.updated_at;
    insert into public.financial_cost_events(store_id, actor_user_id, event_type, detail)
    values (target_store_id, auth.uid(), 'settings.update', jsonb_build_object('updatedAt', requested_updated_at));
  else
    raise exception 'financial:invalid:Onbekend financieel mutatietype.';
  end if;
  return true;
exception
  when invalid_datetime_format or datetime_field_overflow or numeric_value_out_of_range then
    raise exception 'financial:invalid:Een datum of bedrag heeft een ongeldig formaat.';
end;
$$;

revoke all on public.financial_costs from anon, authenticated;
revoke all on public.store_financial_settings from anon, authenticated;
revoke all on public.financial_cost_events from anon, authenticated;
-- Keep financial data RPC-only. This prevents direct PostgREST writes from
-- bypassing validation, idempotency and the dedicated owner-only audit trail.
revoke all on function public.get_owner_financial_workspace(uuid) from public, anon;
revoke all on function public.mutate_owner_financial_workspace(uuid, jsonb) from public, anon;
grant execute on function public.get_owner_financial_workspace(uuid) to authenticated;
grant execute on function public.mutate_owner_financial_workspace(uuid, jsonb) to authenticated;

commit;
