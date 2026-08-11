begin;

create table public.marketing_leads (
  id uuid primary key default gen_random_uuid(),
  request_type text not null check (request_type in ('demo', 'contact')),
  first_name text not null check (char_length(first_name) between 1 and 80),
  last_name text not null check (char_length(last_name) between 1 and 80),
  email text not null check (char_length(email) between 5 and 254),
  company text not null check (char_length(company) between 1 and 160),
  locations text,
  current_system text,
  message text not null check (char_length(message) between 10 and 4000),
  source_path text not null check (char_length(source_path) between 1 and 300),
  consented_at timestamptz not null,
  status text not null default 'new' check (status in ('new', 'contacted', 'qualified', 'closed')),
  created_at timestamptz not null default now()
);

create index marketing_leads_created_idx on public.marketing_leads (created_at desc);
create index marketing_leads_status_created_idx on public.marketing_leads (status, created_at desc);
create index marketing_leads_email_created_idx on public.marketing_leads (lower(email), created_at desc);

alter table public.marketing_leads enable row level security;

create table public.marketing_events (
  id bigint generated always as identity primary key,
  event_name text not null check (event_name in ('cta_clicked', 'pricing_cycle_changed', 'lead_form_started', 'lead_form_succeeded', 'lead_form_failed')),
  source_path text not null check (char_length(source_path) between 1 and 300),
  target text check (target is null or char_length(target) <= 300),
  created_at timestamptz not null default now()
);

create index marketing_events_created_idx on public.marketing_events (created_at desc);
create index marketing_events_name_created_idx on public.marketing_events (event_name, created_at desc);

alter table public.marketing_events enable row level security;

create or replace function public.submit_public_lead(
  lead_request_type text,
  lead_first_name text,
  lead_last_name text,
  lead_email text,
  lead_company text,
  lead_locations text,
  lead_current_system text,
  lead_message text,
  lead_source_path text,
  lead_consented_at timestamptz
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
  if lead_request_type not in ('demo', 'contact') then
    raise exception 'invalid_request_type';
  end if;
  if char_length(trim(lead_first_name)) not between 1 and 80
    or char_length(trim(lead_last_name)) not between 1 and 80
    or char_length(trim(lead_company)) not between 1 and 160 then
    raise exception 'invalid_identity';
  end if;
  if normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or char_length(normalized_email) > 254 then
    raise exception 'invalid_email';
  end if;
  if char_length(trim(lead_message)) not between 10 and 4000 then
    raise exception 'invalid_message';
  end if;
  if lead_consented_at is null or lead_consented_at > now() + interval '5 minutes' then
    raise exception 'invalid_consent';
  end if;
  if (
    select count(*)
    from public.marketing_leads
    where lower(email) = normalized_email
      and created_at > now() - interval '15 minutes'
  ) >= 3 then
    raise exception 'rate_limited';
  end if;

  insert into public.marketing_leads (
    request_type, first_name, last_name, email, company, locations,
    current_system, message, source_path, consented_at
  ) values (
    lead_request_type,
    trim(lead_first_name),
    trim(lead_last_name),
    normalized_email,
    trim(lead_company),
    nullif(trim(lead_locations), ''),
    nullif(trim(lead_current_system), ''),
    trim(lead_message),
    left(trim(lead_source_path), 300),
    lead_consented_at
  ) returning id into inserted_id;

  return inserted_id;
end;
$$;

revoke all on table public.marketing_leads from public, anon, authenticated;
revoke all on function public.submit_public_lead(text, text, text, text, text, text, text, text, text, timestamptz) from public;
grant execute on function public.submit_public_lead(text, text, text, text, text, text, text, text, text, timestamptz) to anon, authenticated;

create or replace function public.submit_public_event(
  marketing_event_name text,
  marketing_source_path text,
  marketing_target text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if marketing_event_name not in ('cta_clicked', 'pricing_cycle_changed', 'lead_form_started', 'lead_form_succeeded', 'lead_form_failed') then
    raise exception 'invalid_event';
  end if;
  if char_length(trim(marketing_source_path)) not between 1 and 300
    or char_length(coalesce(marketing_target, '')) > 300 then
    raise exception 'invalid_event_payload';
  end if;

  insert into public.marketing_events (event_name, source_path, target)
  values (marketing_event_name, left(trim(marketing_source_path), 300), nullif(left(trim(marketing_target), 300), ''));
end;
$$;

revoke all on table public.marketing_events from public, anon, authenticated;
revoke all on function public.submit_public_event(text, text, text) from public;
grant execute on function public.submit_public_event(text, text, text) to anon, authenticated;

commit;
