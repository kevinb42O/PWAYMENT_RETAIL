begin;

-- The server-owned migration ledger. The browser mirrors these records in
-- Dexie so an offline checkout can close its undo window atomically before a
-- later sync confirms the same seal centrally.
create table if not exists private.migration_activations (
  id uuid primary key,
  store_id uuid not null references public.stores(id) on delete cascade,
  status text not null check (status in ('active', 'undone', 'locked', 'correction-required')),
  graph_version integer not null check (graph_version > 0),
  answers_json jsonb not null default '{}'::jsonb check (jsonb_typeof(answers_json) = 'object'),
  receipt_json jsonb not null default '{}'::jsonb check (jsonb_typeof(receipt_json) = 'object'),
  activated_at timestamptz not null,
  first_meaningful_activity_at timestamptz,
  first_meaningful_activity_type text check (first_meaningful_activity_type in ('checkout', 'refund', 'catalog-change', 'customer-change', 'stock-change', 'service-change', 'gift-card-change', 'webshop-order', 'configuration-change', 'external-delivery')),
  first_meaningful_activity_entity_type text check (first_meaningful_activity_entity_type in ('transaction', 'product', 'category', 'customer', 'stock-movement', 'service-order', 'gift-card', 'webshop-order', 'store-configuration', 'external-delivery')),
  first_meaningful_activity_entity_id text,
  locked_at timestamptz,
  undone_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint migration_activation_first_activity_complete check (
    (first_meaningful_activity_at is null
      and first_meaningful_activity_type is null
      and first_meaningful_activity_entity_type is null
      and first_meaningful_activity_entity_id is null)
    or
    (first_meaningful_activity_at is not null
      and first_meaningful_activity_type is not null
      and first_meaningful_activity_entity_type is not null
      and nullif(btrim(first_meaningful_activity_entity_id), '') is not null)
  ),
  constraint migration_activation_status_consistent check (
    (status = 'active' and first_meaningful_activity_at is null and locked_at is null)
    or (status in ('locked', 'correction-required') and first_meaningful_activity_at is not null and locked_at is not null)
    or (status = 'undone' and undone_at is not null)
  )
);

create unique index if not exists migration_activations_one_active_per_store_idx
  on private.migration_activations (store_id)
  where status = 'active';
create index if not exists migration_activations_store_activated_idx
  on private.migration_activations (store_id, activated_at desc);

create table if not exists private.migration_inverse_changes (
  id uuid primary key,
  migration_id uuid not null references private.migration_activations(id) on delete cascade,
  sequence integer not null check (sequence >= 0),
  action_type text not null check (action_type in ('delete-created', 'restore-before-image', 'remove-relation', 'restore-configuration')),
  entity_type text not null check (entity_type in ('transaction', 'product', 'category', 'customer', 'stock-movement', 'service-order', 'gift-card', 'webshop-order', 'store-configuration', 'external-delivery')),
  entity_id text not null check (nullif(btrim(entity_id), '') is not null),
  before_image_or_inverse_payload jsonb not null,
  created_at timestamptz not null default now(),
  unique (migration_id, sequence)
);

create index if not exists migration_inverse_changes_migration_idx
  on private.migration_inverse_changes (migration_id, sequence desc);

create table if not exists private.migration_activity_locks (
  id uuid primary key,
  migration_id uuid not null references private.migration_activations(id) on delete restrict,
  store_id uuid not null references public.stores(id) on delete cascade,
  activity_type text not null check (activity_type in ('checkout', 'refund', 'catalog-change', 'customer-change', 'stock-change', 'service-change', 'gift-card-change', 'webshop-order', 'configuration-change', 'external-delivery')),
  entity_type text not null check (entity_type in ('transaction', 'product', 'category', 'customer', 'stock-movement', 'service-order', 'gift-card', 'webshop-order', 'store-configuration', 'external-delivery')),
  entity_id text not null check (nullif(btrim(entity_id), '') is not null),
  occurred_at timestamptz not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_name text,
  correlation_id text,
  created_at timestamptz not null default now(),
  unique (migration_id, activity_type, entity_type, entity_id, correlation_id)
);

create index if not exists migration_activity_locks_migration_occurred_idx
  on private.migration_activity_locks (migration_id, occurred_at);
create index if not exists migration_activity_locks_store_occurred_idx
  on private.migration_activity_locks (store_id, occurred_at desc);

alter table private.migration_activations enable row level security;
alter table private.migration_inverse_changes enable row level security;
alter table private.migration_activity_locks enable row level security;

create or replace function private.enforce_migration_activation_seal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.store_id is distinct from old.store_id
     or new.graph_version is distinct from old.graph_version
     or new.answers_json is distinct from old.answers_json
     or new.receipt_json is distinct from old.receipt_json
     or new.activated_at is distinct from old.activated_at then
    raise exception using errcode = 'P0001', message = 'migration:receipt-immutable:De migratiereceipt kan niet worden gewijzigd.';
  end if;
  if old.first_meaningful_activity_at is not null
     and (
       new.first_meaningful_activity_at is distinct from old.first_meaningful_activity_at
       or new.first_meaningful_activity_type is distinct from old.first_meaningful_activity_type
       or new.first_meaningful_activity_entity_type is distinct from old.first_meaningful_activity_entity_type
       or new.first_meaningful_activity_entity_id is distinct from old.first_meaningful_activity_entity_id
       or new.locked_at is distinct from old.locked_at
     ) then
    raise exception using errcode = 'P0001', message = 'migration:seal-write-once:De eerste live activiteit kan niet worden gewijzigd.';
  end if;
  if old.status <> 'active' and new.status = 'active' then
    raise exception using errcode = 'P0001', message = 'migration:invalid:Een afgesloten migratie kan niet opnieuw actief worden.';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists migration_activations_enforce_seal on private.migration_activations;
create trigger migration_activations_enforce_seal
  before update on private.migration_activations
  for each row execute function private.enforce_migration_activation_seal();

commit;
