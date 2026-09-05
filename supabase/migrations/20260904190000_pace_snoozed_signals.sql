begin;

alter table public.pace_user_preferences
  add column if not exists snoozed_signals jsonb not null default '{}'::jsonb;

comment on column public.pace_user_preferences.snoozed_signals is
  'Per-user, per-store temporary Pace signal suppression. Values are UTC epoch milliseconds and are validated client-side before use.';

commit;
