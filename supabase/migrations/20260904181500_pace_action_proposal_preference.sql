begin;

alter table public.pace_user_preferences
  add column if not exists action_proposals_enabled boolean not null default false;

comment on column public.pace_user_preferences.action_proposals_enabled is
  'Per-user, per-store opt-in for Pace to include non-executing concept action proposals in evidence-backed briefings.';

commit;
