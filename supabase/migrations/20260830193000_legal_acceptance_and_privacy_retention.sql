begin;

alter table public.marketing_leads
  add column if not exists consent_version text,
  add column if not exists consent_text text,
  add column if not exists expires_at timestamptz;

update public.marketing_leads
set consent_version = coalesce(consent_version, 'legacy'),
    consent_text = coalesce(consent_text, 'Legacy contact- of demoaanvraag'),
    expires_at = coalesce(expires_at, created_at + interval '24 months');

alter table public.marketing_leads
  alter column consent_version set not null,
  alter column consent_text set not null,
  alter column expires_at set not null,
  alter column expires_at set default (now() + interval '24 months');

alter table public.marketing_events
  add column if not exists expires_at timestamptz;
update public.marketing_events
set expires_at = coalesce(expires_at, created_at + interval '13 months');
alter table public.marketing_events
  alter column expires_at set not null,
  alter column expires_at set default (now() + interval '13 months');

drop function if exists public.submit_public_lead(text, text, text, text, text, text, text, text, text, timestamptz);
create function public.submit_public_lead(
  lead_request_type text,
  lead_first_name text,
  lead_last_name text,
  lead_email text,
  lead_company text,
  lead_locations text,
  lead_current_system text,
  lead_message text,
  lead_source_path text,
  lead_consented_at timestamptz,
  lead_consent_version text,
  lead_consent_text text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_email text := lower(trim(lead_email));
  inserted_id uuid;
begin
  if lead_request_type not in ('demo', 'contact') then raise exception 'invalid_request_type'; end if;
  if char_length(trim(lead_first_name)) not between 1 and 80
    or char_length(trim(lead_last_name)) not between 1 and 80
    or char_length(trim(lead_company)) not between 1 and 160 then raise exception 'invalid_identity'; end if;
  if normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or char_length(normalized_email) > 254 then raise exception 'invalid_email'; end if;
  if char_length(trim(lead_message)) not between 10 and 4000 then raise exception 'invalid_message'; end if;
  if lead_consented_at is null or lead_consented_at > now() + interval '5 minutes'
    or lead_consented_at < now() - interval '1 day' then raise exception 'invalid_consent'; end if;
  if char_length(trim(lead_consent_version)) not between 1 and 50
    or char_length(trim(lead_consent_text)) not between 20 and 1000 then raise exception 'invalid_consent_evidence'; end if;
  if (select count(*) from public.marketing_leads where lower(email) = normalized_email and created_at > now() - interval '15 minutes') >= 3 then raise exception 'rate_limited'; end if;

  insert into public.marketing_leads (
    request_type, first_name, last_name, email, company, locations,
    current_system, message, source_path, consented_at, consent_version,
    consent_text, expires_at
  ) values (
    lead_request_type, trim(lead_first_name), trim(lead_last_name), normalized_email,
    trim(lead_company), nullif(trim(lead_locations), ''), nullif(trim(lead_current_system), ''),
    trim(lead_message), left(trim(lead_source_path), 300), lead_consented_at,
    trim(lead_consent_version), trim(lead_consent_text), now() + interval '24 months'
  ) returning id into inserted_id;
  return inserted_id;
end;
$$;

revoke all on function public.submit_public_lead(text, text, text, text, text, text, text, text, text, timestamptz, text, text) from public;
grant execute on function public.submit_public_lead(text, text, text, text, text, text, text, text, text, timestamptz, text, text) to anon, authenticated;

create table if not exists public.legal_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_version text not null,
  accepted_at timestamptz not null,
  business_use_confirmed boolean not null,
  source text not null default 'registration' check (source in ('registration', 'contract', 'renewal')),
  created_at timestamptz not null default now(),
  unique (user_id, document_version, source)
);
alter table public.legal_acceptances enable row level security;
create policy legal_acceptances_self_read on public.legal_acceptances
  for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.legal_acceptances from public, anon, authenticated;
grant select on public.legal_acceptances to authenticated;

create or replace function private.capture_registration_legal_acceptance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  version text := nullif(btrim(new.raw_user_meta_data ->> 'legal_version'), '');
  accepted_at timestamptz;
begin
  if version is null or coalesce((new.raw_user_meta_data ->> 'business_use_confirmed')::boolean, false) is not true then
    return new;
  end if;
  begin
    accepted_at := (new.raw_user_meta_data ->> 'legal_accepted_at')::timestamptz;
  exception when others then
    accepted_at := now();
  end;
  insert into public.legal_acceptances(user_id, document_version, accepted_at, business_use_confirmed)
  values (new.id, version, accepted_at, true)
  on conflict (user_id, document_version, source) do nothing;
  return new;
end;
$$;

drop trigger if exists capture_registration_legal_acceptance on auth.users;
create trigger capture_registration_legal_acceptance
after insert on auth.users
for each row execute function private.capture_registration_legal_acceptance();
revoke all on function private.capture_registration_legal_acceptance() from public, anon, authenticated;

create or replace function private.purge_expired_marketing_data()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare leads_deleted integer; events_deleted integer;
begin
  delete from public.marketing_leads where expires_at <= now();
  get diagnostics leads_deleted = row_count;
  delete from public.marketing_events where expires_at <= now();
  get diagnostics events_deleted = row_count;
  return jsonb_build_object('leads_deleted', leads_deleted, 'events_deleted', events_deleted);
end;
$$;
revoke all on function private.purge_expired_marketing_data() from public, anon, authenticated;

commit;
