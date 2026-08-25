begin;

create table if not exists public.pace_user_preferences (
  store_id uuid not null references public.stores(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  enabled boolean not null default true,
  ai_enabled boolean not null default true,
  live_store_context boolean not null default true,
  proactivity text not null default 'balanced' check (proactivity in ('quiet', 'balanced', 'coach')),
  motion text not null default 'full' check (motion in ('full', 'subtle', 'off')),
  tone text not null default 'compact' check (tone in ('compact', 'friendly', 'explanatory')),
  operational_signals boolean not null default true,
  setup_guidance boolean not null default true,
  insight_guidance boolean not null default true,
  customer_guidance boolean not null default true,
  expressive_morphs boolean not null default true,
  dismissed_signals text[] not null default '{}',
  customer_feedback jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (store_id, user_id)
);

alter table public.pace_user_preferences enable row level security;

drop policy if exists pace_preferences_select_own on public.pace_user_preferences;
create policy pace_preferences_select_own on public.pace_user_preferences
  for select to authenticated
  using (user_id = (select auth.uid()) and private.is_store_member(store_id));

drop policy if exists pace_preferences_insert_own on public.pace_user_preferences;
create policy pace_preferences_insert_own on public.pace_user_preferences
  for insert to authenticated
  with check (user_id = (select auth.uid()) and private.is_store_member(store_id));

drop policy if exists pace_preferences_update_own on public.pace_user_preferences;
create policy pace_preferences_update_own on public.pace_user_preferences
  for update to authenticated
  using (user_id = (select auth.uid()) and private.is_store_member(store_id))
  with check (user_id = (select auth.uid()) and private.is_store_member(store_id));

revoke all on public.pace_user_preferences from anon;
grant select, insert, update on public.pace_user_preferences to authenticated;

commit;
