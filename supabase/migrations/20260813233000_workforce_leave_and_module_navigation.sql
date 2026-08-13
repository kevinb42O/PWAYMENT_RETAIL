begin;

-- Workforce is intentionally separate from POS register shifts. All durations are
-- stored as integer minutes and all balance changes go through an immutable ledger.

create table public.store_module_settings (
  store_id uuid not null references public.stores(id) on delete cascade,
  module_key text not null check (module_key ~ '^[a-z0-9-]+$'),
  enabled boolean not null default true,
  sort_order integer not null check (sort_order between 0 and 1000),
  custom_label text check (custom_label is null or char_length(btrim(custom_label)) between 1 and 40),
  visible_roles text[] not null default array['owner', 'manager', 'cashier']::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (store_id, module_key),
  check (visible_roles <@ array['owner', 'manager', 'cashier']::text[]),
  check (cardinality(visible_roles) > 0)
);

create table public.workforce_employees (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  employee_number text,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 160),
  email text,
  employment_status text not null default 'active'
    check (employment_status in ('active', 'inactive', 'leave')),
  employment_start_date date not null default current_date,
  employment_end_date date,
  timezone text not null default 'Europe/Brussels',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, id),
  unique (store_id, user_id),
  unique (store_id, employee_number),
  check (employment_end_date is null or employment_end_date >= employment_start_date)
);

create index workforce_employees_store_status_idx
  on public.workforce_employees (store_id, employment_status);

create table public.employee_work_patterns (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  employee_id uuid not null,
  weekday smallint not null check (weekday between 1 and 7),
  scheduled_minutes integer not null check (scheduled_minutes between 0 and 1440),
  effective_from date not null default current_date,
  effective_until date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (store_id, employee_id)
    references public.workforce_employees(store_id, id) on delete cascade,
  unique (store_id, employee_id, weekday, effective_from),
  check (effective_until is null or effective_until >= effective_from)
);

create index employee_work_patterns_lookup_idx
  on public.employee_work_patterns (store_id, employee_id, weekday, effective_from desc);

create table public.leave_types (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  code text not null check (code ~ '^[a-z0-9-]+$'),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  color text not null default '#0ea5e9' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  requires_balance boolean not null default true,
  is_paid boolean not null default true,
  allows_negative_balance boolean not null default false,
  approval_required boolean not null default true,
  minimum_notice_days integer not null default 0 check (minimum_notice_days between 0 and 365),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, id),
  unique (store_id, code)
);

create table public.workforce_calendar_days (
  store_id uuid not null references public.stores(id) on delete cascade,
  calendar_date date not null,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  day_type text not null check (day_type in ('public_holiday', 'closure', 'special_opening')),
  consumes_leave boolean not null default false,
  source text not null default 'manual' check (source in ('belgian_calendar', 'manual')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (store_id, calendar_date)
);

create table public.workforce_competencies (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  code text not null check (code ~ '^[a-z0-9-]+$'),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, id),
  unique (store_id, code)
);

create table public.workforce_employee_competencies (
  store_id uuid not null,
  employee_id uuid not null,
  competency_id uuid not null,
  level smallint not null default 1 check (level between 1 and 5),
  valid_until date,
  verified_by_user_id uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (store_id, employee_id, competency_id),
  foreign key (store_id, employee_id)
    references public.workforce_employees(store_id, id) on delete cascade,
  foreign key (store_id, competency_id)
    references public.workforce_competencies(store_id, id) on delete cascade
);

create table public.workforce_coverage_rules (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 100),
  weekday smallint check (weekday between 1 and 7),
  competency_id uuid,
  minimum_present integer not null default 1 check (minimum_present between 0 and 1000),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, id),
  foreign key (store_id, competency_id)
    references public.workforce_competencies(store_id, id) on delete cascade
);

create table public.leave_accounts (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  employee_id uuid not null,
  leave_type_id uuid not null,
  balance_year integer not null check (balance_year between 2000 and 2200),
  entitlement_status text not null default 'estimated'
    check (entitlement_status in ('estimated', 'confirmed', 'imported')),
  opening_minutes integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, id),
  unique (store_id, employee_id, leave_type_id, balance_year),
  foreign key (store_id, employee_id)
    references public.workforce_employees(store_id, id) on delete cascade,
  foreign key (store_id, leave_type_id)
    references public.leave_types(store_id, id) on delete restrict
);

create table public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  employee_id uuid not null,
  leave_type_id uuid not null,
  client_request_id text not null check (char_length(btrim(client_request_id)) between 8 and 160),
  start_date date not null,
  end_date date not null,
  total_minutes integer not null check (total_minutes > 0),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'withdrawn', 'cancelled')),
  employee_note text check (employee_note is null or char_length(employee_note) <= 2000),
  decision_note text check (decision_note is null or char_length(decision_note) <= 2000),
  decided_by_user_id uuid references auth.users(id),
  decided_at timestamptz,
  coverage_risk text not null default 'unknown'
    check (coverage_risk in ('green', 'amber', 'red', 'unknown')),
  coverage_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(coverage_snapshot) = 'object'),
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, id),
  unique (store_id, client_request_id),
  foreign key (store_id, employee_id)
    references public.workforce_employees(store_id, id) on delete restrict,
  foreign key (store_id, leave_type_id)
    references public.leave_types(store_id, id) on delete restrict,
  check (end_date >= start_date),
  check (end_date - start_date <= 365)
);

create index leave_requests_store_status_dates_idx
  on public.leave_requests (store_id, status, start_date, end_date);
create index leave_requests_employee_idx
  on public.leave_requests (store_id, employee_id, submitted_at desc);

create table public.leave_request_segments (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  request_id uuid not null,
  leave_account_id uuid,
  segment_year integer not null check (segment_year between 2000 and 2200),
  minutes integer not null check (minutes > 0),
  created_at timestamptz not null default now(),
  unique (store_id, id),
  unique (store_id, request_id, segment_year),
  foreign key (store_id, request_id)
    references public.leave_requests(store_id, id) on delete cascade,
  foreign key (store_id, leave_account_id)
    references public.leave_accounts(store_id, id) on delete restrict
);

create table public.leave_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  leave_account_id uuid not null,
  request_id uuid,
  entry_kind text not null
    check (entry_kind in ('grant', 'adjustment', 'reservation', 'reservation_release', 'consumption', 'consumption_reversal')),
  amount_minutes integer not null check (amount_minutes <> 0),
  reason text not null check (char_length(btrim(reason)) between 1 and 500),
  actor_user_id uuid references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key (store_id, leave_account_id)
    references public.leave_accounts(store_id, id) on delete restrict,
  foreign key (store_id, request_id)
    references public.leave_requests(store_id, id) on delete restrict
);

create index leave_ledger_account_idx
  on public.leave_ledger_entries (store_id, leave_account_id, created_at);
create unique index leave_ledger_request_kind_account_unique
  on public.leave_ledger_entries (store_id, request_id, leave_account_id, entry_kind)
  where request_id is not null;

create table public.leave_request_events (
  id bigint generated always as identity primary key,
  store_id uuid not null,
  request_id uuid not null,
  event_type text not null
    check (event_type in ('submitted', 'approved', 'rejected', 'withdrawn', 'cancelled', 'coverage_recalculated')),
  from_status text,
  to_status text,
  actor_user_id uuid references auth.users(id),
  note text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  foreign key (store_id, request_id)
    references public.leave_requests(store_id, id) on delete cascade
);

create index leave_request_events_request_idx
  on public.leave_request_events (store_id, request_id, created_at);

create trigger store_module_settings_set_updated_at before update on public.store_module_settings
  for each row execute function private.set_updated_at();
create trigger workforce_employees_set_updated_at before update on public.workforce_employees
  for each row execute function private.set_updated_at();
create trigger employee_work_patterns_set_updated_at before update on public.employee_work_patterns
  for each row execute function private.set_updated_at();
create trigger leave_types_set_updated_at before update on public.leave_types
  for each row execute function private.set_updated_at();
create trigger workforce_calendar_days_set_updated_at before update on public.workforce_calendar_days
  for each row execute function private.set_updated_at();
create trigger workforce_competencies_set_updated_at before update on public.workforce_competencies
  for each row execute function private.set_updated_at();
create trigger workforce_employee_competencies_set_updated_at before update on public.workforce_employee_competencies
  for each row execute function private.set_updated_at();
create trigger workforce_coverage_rules_set_updated_at before update on public.workforce_coverage_rules
  for each row execute function private.set_updated_at();
create trigger leave_accounts_set_updated_at before update on public.leave_accounts
  for each row execute function private.set_updated_at();
create trigger leave_requests_set_updated_at before update on public.leave_requests
  for each row execute function private.set_updated_at();

create or replace function private.easter_sunday(target_year integer)
returns date
language plpgsql
immutable
set search_path = ''
as $$
declare
  a integer := target_year % 19;
  b integer := target_year / 100;
  c integer := target_year % 100;
  d integer := b / 4;
  e integer := b % 4;
  f integer := (b + 8) / 25;
  g integer := (b - f + 1) / 3;
  h integer;
  i integer := c / 4;
  k integer := c % 4;
  l integer;
  m integer;
  easter_month integer;
  easter_day integer;
begin
  h := (19 * a + b - d - g + 15) % 30;
  l := (32 + 2 * e + 2 * i - h - k) % 7;
  m := (a + 11 * h + 22 * l) / 451;
  easter_month := (h + l - 7 * m + 114) / 31;
  easter_day := ((h + l - 7 * m + 114) % 31) + 1;
  return make_date(target_year, easter_month, easter_day);
end;
$$;

create or replace function private.ensure_workforce_defaults(target_store_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_year integer;
  easter date;
  store_config jsonb;
begin
  select onboarding_config into store_config from public.stores where id = target_store_id;
  insert into public.store_module_settings (store_id, module_key, enabled, sort_order, visible_roles)
  values
    (target_store_id, 'pos', true, 10, array['owner', 'manager', 'cashier']),
    (target_store_id, 'service', coalesce(store_config #>> '{modules,service}' = 'true', true), 20, array['owner', 'manager', 'cashier']),
    (target_store_id, 'workforce', coalesce(store_config #>> '{modules,workforce}' = 'true', true), 30, array['owner', 'manager', 'cashier']),
    (target_store_id, 'customers', coalesce(store_config #>> '{modules,customers}' = 'true', true), 40, array['owner', 'manager', 'cashier']),
    (target_store_id, 'integration-hub', coalesce(store_config #>> '{modules,catalog}' = 'true', true), 50, array['owner', 'manager']),
    (target_store_id, 'insights', coalesce(store_config #>> '{modules,insights}' = 'true', true), 60, array['owner', 'manager']),
    (target_store_id, 'z-report', true, 70, array['owner', 'manager', 'cashier']),
    (target_store_id, 'audit-log', true, 80, array['owner', 'manager']),
    (target_store_id, 'webshop', coalesce(store_config #>> '{modules,webshop}' = 'true', true), 90, array['owner', 'manager'])
  on conflict (store_id, module_key) do nothing;

  insert into public.workforce_employees (
    store_id, user_id, employee_number, display_name, email, employment_status
  )
  select membership.store_id, membership.user_id,
         'EMP-' || upper(substr(replace(membership.user_id::text, '-', ''), 1, 8)),
         coalesce(profile.display_name, split_part(account.email, '@', 1), 'Medewerker'),
         account.email, 'active'
  from public.store_memberships membership
  join auth.users account on account.id = membership.user_id
  left join public.profiles profile on profile.id = membership.user_id
  where membership.store_id = target_store_id and membership.status = 'active'
  on conflict (store_id, user_id) do update
    set display_name = excluded.display_name,
        email = excluded.email;

  insert into public.leave_types (
    store_id, code, name, color, requires_balance, is_paid,
    allows_negative_balance, approval_required, minimum_notice_days
  ) values
    (target_store_id, 'statutory-vacation', 'Wettelijke vakantie', '#0ea5e9', true, true, false, true, 0),
    (target_store_id, 'extra-legal', 'Extralegaal verlof', '#8b5cf6', true, true, false, true, 0),
    (target_store_id, 'unpaid', 'Onbetaald verlof', '#64748b', false, false, true, true, 0),
    (target_store_id, 'sick', 'Ziekte', '#f43f5e', false, true, true, false, 0)
  on conflict (store_id, code) do nothing;

  insert into public.employee_work_patterns (
    store_id, employee_id, weekday, scheduled_minutes, effective_from
  )
  select employee.store_id, employee.id, weekday, 456, employee.employment_start_date
  from public.workforce_employees employee
  cross join generate_series(1, 5) weekday
  where employee.store_id = target_store_id
    and employee.employment_status = 'active'
    and not exists (
      select 1 from public.employee_work_patterns pattern
      where pattern.store_id = employee.store_id and pattern.employee_id = employee.id
    );

  insert into public.workforce_coverage_rules (
    store_id, name, weekday, minimum_present
  )
  select target_store_id, 'Minimale basisbezetting', null, 1
  where not exists (
    select 1 from public.workforce_coverage_rules rule where rule.store_id = target_store_id
  );

  for target_year in extract(year from current_date)::integer - 1
                     .. extract(year from current_date)::integer + 1 loop
    easter := private.easter_sunday(target_year);
    insert into public.workforce_calendar_days (
      store_id, calendar_date, name, day_type, consumes_leave, source
    ) values
      (target_store_id, make_date(target_year, 1, 1), 'Nieuwjaar', 'public_holiday', false, 'belgian_calendar'),
      (target_store_id, easter + 1, 'Paasmaandag', 'public_holiday', false, 'belgian_calendar'),
      (target_store_id, make_date(target_year, 5, 1), 'Dag van de Arbeid', 'public_holiday', false, 'belgian_calendar'),
      (target_store_id, easter + 39, 'Onze-Lieve-Heer-Hemelvaart', 'public_holiday', false, 'belgian_calendar'),
      (target_store_id, easter + 50, 'Pinkstermaandag', 'public_holiday', false, 'belgian_calendar'),
      (target_store_id, make_date(target_year, 7, 21), 'Nationale feestdag', 'public_holiday', false, 'belgian_calendar'),
      (target_store_id, make_date(target_year, 8, 15), 'Onze-Lieve-Vrouw-Hemelvaart', 'public_holiday', false, 'belgian_calendar'),
      (target_store_id, make_date(target_year, 11, 1), 'Allerheiligen', 'public_holiday', false, 'belgian_calendar'),
      (target_store_id, make_date(target_year, 11, 11), 'Wapenstilstand', 'public_holiday', false, 'belgian_calendar'),
      (target_store_id, make_date(target_year, 12, 25), 'Kerstmis', 'public_holiday', false, 'belgian_calendar')
    on conflict (store_id, calendar_date) do nothing;
  end loop;

  insert into public.leave_accounts (
    store_id, employee_id, leave_type_id, balance_year, entitlement_status, opening_minutes
  )
  select employee.store_id, employee.id, leave_type.id, years.generated_year, 'estimated',
         coalesce((
           select sum(latest.scheduled_minutes)::integer * 4
           from (
             select distinct on (pattern.weekday) pattern.weekday, pattern.scheduled_minutes
             from public.employee_work_patterns pattern
             where pattern.store_id = employee.store_id
               and pattern.employee_id = employee.id
               and pattern.effective_from <= make_date(years.generated_year, 12, 31)
               and (pattern.effective_until is null or pattern.effective_until >= make_date(years.generated_year, 1, 1))
             order by pattern.weekday, pattern.effective_from desc
           ) latest
         ), 0)
  from public.workforce_employees employee
  join public.leave_types leave_type
    on leave_type.store_id = employee.store_id and leave_type.code = 'statutory-vacation'
  cross join generate_series(
    extract(year from current_date)::integer,
    extract(year from current_date)::integer + 1
  ) as years(generated_year)
  where employee.store_id = target_store_id and employee.employment_status = 'active'
  on conflict (store_id, employee_id, leave_type_id, balance_year) do nothing;

  insert into public.leave_ledger_entries (
    store_id, leave_account_id, entry_kind, amount_minutes, reason
  )
  select account.store_id, account.id, 'grant', account.opening_minutes,
         'Automatische raming: vier werkweken. Nog te bevestigen door de werkgever.'
  from public.leave_accounts account
  where account.store_id = target_store_id
    and account.opening_minutes > 0
    and not exists (
      select 1 from public.leave_ledger_entries entry
      where entry.store_id = account.store_id and entry.leave_account_id = account.id
    );
end;
$$;

create or replace function private.workforce_minutes_for_day(
  target_store_id uuid,
  target_employee_id uuid,
  target_date date
)
returns integer
language sql
stable
set search_path = ''
as $$
  select case
    when exists (
      select 1 from public.workforce_calendar_days calendar
      where calendar.store_id = target_store_id
        and calendar.calendar_date = target_date
        and not calendar.consumes_leave
    ) then 0
    else coalesce((
      select pattern.scheduled_minutes
      from public.employee_work_patterns pattern
      where pattern.store_id = target_store_id
        and pattern.employee_id = target_employee_id
        and pattern.weekday = extract(isodow from target_date)::integer
        and pattern.effective_from <= target_date
        and (pattern.effective_until is null or pattern.effective_until >= target_date)
      order by pattern.effective_from desc
      limit 1
    ), 0)
  end;
$$;

create or replace function private.evaluate_leave_coverage(
  target_store_id uuid,
  target_employee_id uuid,
  target_start date,
  target_end date,
  ignored_request_id uuid default null
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  day_record record;
  rule_record record;
  scheduled_count integer;
  unavailable_count integer;
  remaining_count integer;
  worst_risk text := 'green';
  detail_items jsonb := '[]'::jsonb;
  day_risk text;
begin
  for day_record in select day::date as work_date
                    from generate_series(target_start, target_end, interval '1 day') day loop
    if private.workforce_minutes_for_day(target_store_id, target_employee_id, day_record.work_date) = 0 then
      continue;
    end if;

    for rule_record in
      select rule.id, rule.name, rule.minimum_present, rule.competency_id
      from public.workforce_coverage_rules rule
      where rule.store_id = target_store_id and rule.is_active
        and (rule.weekday is null or rule.weekday = extract(isodow from day_record.work_date)::integer)
    loop
      select count(*)::integer into scheduled_count
      from public.workforce_employees employee
      where employee.store_id = target_store_id and employee.employment_status = 'active'
        and employee.employment_start_date <= day_record.work_date
        and (employee.employment_end_date is null or employee.employment_end_date >= day_record.work_date)
        and private.workforce_minutes_for_day(target_store_id, employee.id, day_record.work_date) > 0
        and (
          rule_record.competency_id is null or exists (
            select 1 from public.workforce_employee_competencies competency
            where competency.store_id = target_store_id
              and competency.employee_id = employee.id
              and competency.competency_id = rule_record.competency_id
              and (competency.valid_until is null or competency.valid_until >= day_record.work_date)
          )
        );

      select count(distinct request.employee_id)::integer into unavailable_count
      from public.leave_requests request
      where request.store_id = target_store_id
        and request.status = 'approved'
        and request.start_date <= day_record.work_date and request.end_date >= day_record.work_date
        and request.id is distinct from ignored_request_id
        and private.workforce_minutes_for_day(target_store_id, request.employee_id, day_record.work_date) > 0
        and (
          rule_record.competency_id is null or exists (
            select 1 from public.workforce_employee_competencies competency
            where competency.store_id = target_store_id
              and competency.employee_id = request.employee_id
              and competency.competency_id = rule_record.competency_id
              and (competency.valid_until is null or competency.valid_until >= day_record.work_date)
          )
        );

      remaining_count := scheduled_count - unavailable_count - case
        when rule_record.competency_id is null or exists (
          select 1 from public.workforce_employee_competencies competency
          where competency.store_id = target_store_id
            and competency.employee_id = target_employee_id
            and competency.competency_id = rule_record.competency_id
            and (competency.valid_until is null or competency.valid_until >= day_record.work_date)
        ) then 1 else 0 end;
      remaining_count := greatest(remaining_count, 0);
      day_risk := case
        when remaining_count < rule_record.minimum_present then 'red'
        when remaining_count = rule_record.minimum_present then 'amber'
        else 'green' end;
      if day_risk = 'red' then worst_risk := 'red';
      elsif day_risk = 'amber' and worst_risk = 'green' then worst_risk := 'amber';
      end if;
      if day_risk <> 'green' then
        detail_items := detail_items || jsonb_build_array(jsonb_build_object(
          'date', day_record.work_date,
          'ruleId', rule_record.id,
          'rule', rule_record.name,
          'remaining', remaining_count,
          'minimum', rule_record.minimum_present,
          'risk', day_risk
        ));
      end if;
    end loop;
  end loop;
  return jsonb_build_object(
    'risk', worst_risk,
    'summary', case worst_risk
      when 'red' then 'Mogelijk onvoldoende bezetting of competentiedekking.'
      when 'amber' then 'Bezetting blijft exact op de ingestelde minimumgrens.'
      else 'Geen conflict met de huidige bezettingsregels gevonden.' end,
    'details', detail_items,
    'calculatedAt', now(),
    'advisoryOnly', true
  );
end;
$$;

create or replace function private.leave_request_json(target_request_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', request.id,
    'employeeId', request.employee_id,
    'employeeName', employee.display_name,
    'leaveTypeId', request.leave_type_id,
    'leaveTypeName', leave_type.name,
    'leaveTypeColor', leave_type.color,
    'startDate', request.start_date,
    'endDate', request.end_date,
    'totalMinutes', request.total_minutes,
    'status', request.status,
    'employeeNote', request.employee_note,
    'decisionNote', request.decision_note,
    'coverageRisk', request.coverage_risk,
    'coverageSnapshot', request.coverage_snapshot,
    'submittedAt', request.submitted_at,
    'decidedAt', request.decided_at
  )
  from public.leave_requests request
  join public.workforce_employees employee
    on employee.store_id = request.store_id and employee.id = request.employee_id
  join public.leave_types leave_type
    on leave_type.store_id = request.store_id and leave_type.id = request.leave_type_id
  where request.id = target_request_id;
$$;

create or replace function public.get_module_navigation(target_store_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  if (select auth.uid()) is null or not private.is_store_member(target_store_id) then
    raise exception using errcode = '42501', message = 'modules:forbidden:Geen toegang tot deze winkel.';
  end if;
  perform private.ensure_workforce_defaults(target_store_id);
  select coalesce(jsonb_agg(jsonb_build_object(
    'key', setting.module_key,
    'enabled', setting.enabled,
    'order', setting.sort_order,
    'customLabel', setting.custom_label,
    'visibleRoles', to_jsonb(setting.visible_roles)
  ) order by setting.sort_order, setting.module_key), '[]'::jsonb)
  into result
  from public.store_module_settings setting
  where setting.store_id = target_store_id;
  return result;
end;
$$;

create or replace function public.save_module_navigation(target_store_id uuid, payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare item jsonb;
declare module_key text;
declare module_roles text[];
declare order_value integer;
declare enabled_value boolean;
begin
  if (select auth.uid()) is null or not private.has_store_role(target_store_id, array['owner']) then
    raise exception using errcode = '42501', message = 'modules:forbidden:Alleen de zaakvoerder kan modules beheren.';
  end if;
  if jsonb_typeof(payload) <> 'array' or jsonb_array_length(payload) = 0 then
    raise exception using errcode = 'P0001', message = 'modules:invalid:Ongeldige moduleconfiguratie.';
  end if;
  perform private.ensure_workforce_defaults(target_store_id);
  for item in select value from jsonb_array_elements(payload) loop
    module_key := nullif(btrim(item ->> 'key'), '');
    if module_key is null or module_key not in ('pos', 'service', 'workforce', 'customers', 'integration-hub', 'insights', 'z-report', 'audit-log', 'webshop') then
      raise exception using errcode = 'P0001', message = 'modules:invalid:Onbekende module.';
    end if;
    begin
      order_value := (item ->> 'order')::integer;
      enabled_value := (item ->> 'enabled')::boolean;
      select coalesce(array_agg(value), array[]::text[]) into module_roles
      from jsonb_array_elements_text(item -> 'visibleRoles');
    exception when others then
      raise exception using errcode = 'P0001', message = 'modules:invalid:Ongeldige moduleconfiguratie.';
    end;
    if order_value not between 0 and 1000
       or cardinality(module_roles) = 0
       or not (module_roles <@ array['owner', 'manager', 'cashier']::text[]) then
      raise exception using errcode = 'P0001', message = 'modules:invalid:Ongeldige volgorde of roltoegang.';
    end if;
    if module_key in ('pos', 'z-report', 'audit-log') then enabled_value := true; end if;
    if module_key = 'pos' then module_roles := array['owner', 'manager', 'cashier']::text[]; end if;
    update public.store_module_settings
    set enabled = enabled_value,
        sort_order = order_value,
        custom_label = nullif(btrim(item ->> 'customLabel'), ''),
        visible_roles = module_roles
    where store_id = target_store_id and store_module_settings.module_key = module_key;
  end loop;
  perform public.append_audit(target_store_id, 'modules.updated', jsonb_build_object('modules', payload));
  return public.get_module_navigation(target_store_id);
end;
$$;

create or replace function public.get_workforce_bootstrap(target_store_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare actor_id uuid := (select auth.uid());
declare own_employee_id uuid;
declare can_manage boolean;
declare result jsonb;
begin
  if actor_id is null or not private.is_store_member(target_store_id) then
    raise exception using errcode = '42501', message = 'workforce:forbidden:Geen toegang tot deze winkel.';
  end if;
  perform private.ensure_workforce_defaults(target_store_id);
  select id into own_employee_id from public.workforce_employees
  where store_id = target_store_id and user_id = actor_id;
  can_manage := private.has_store_role(target_store_id, array['owner', 'manager']);

  select jsonb_build_object(
    'employee', (select jsonb_build_object(
      'id', employee.id, 'displayName', employee.display_name,
      'employeeNumber', employee.employee_number, 'status', employee.employment_status,
      'weeklyMinutes', (select coalesce(sum(pattern.scheduled_minutes), 0)::integer
        from public.employee_work_patterns pattern
        where pattern.store_id = employee.store_id and pattern.employee_id = employee.id
          and pattern.effective_from <= current_date
          and (pattern.effective_until is null or pattern.effective_until >= current_date)
          and not exists (
            select 1 from public.employee_work_patterns newer
            where newer.store_id = pattern.store_id and newer.employee_id = pattern.employee_id
              and newer.weekday = pattern.weekday and newer.effective_from <= current_date
              and (newer.effective_until is null or newer.effective_until >= current_date)
              and newer.effective_from > pattern.effective_from
          )),
      'scheduledDays', (select count(*)::integer
        from public.employee_work_patterns pattern
        where pattern.store_id = employee.store_id and pattern.employee_id = employee.id
          and pattern.scheduled_minutes > 0 and pattern.effective_from <= current_date
          and (pattern.effective_until is null or pattern.effective_until >= current_date)
          and not exists (
            select 1 from public.employee_work_patterns newer
            where newer.store_id = pattern.store_id and newer.employee_id = pattern.employee_id
              and newer.weekday = pattern.weekday and newer.effective_from <= current_date
              and (newer.effective_until is null or newer.effective_until >= current_date)
              and newer.effective_from > pattern.effective_from
          ))
    ) from public.workforce_employees employee where employee.id = own_employee_id),
    'canManage', can_manage,
    'leaveTypes', (select coalesce(jsonb_agg(jsonb_build_object(
      'id', leave_type.id, 'code', leave_type.code, 'name', leave_type.name,
      'color', leave_type.color, 'requiresBalance', leave_type.requires_balance,
      'paid', leave_type.is_paid, 'approvalRequired', leave_type.approval_required,
      'minimumNoticeDays', leave_type.minimum_notice_days
    ) order by leave_type.name), '[]'::jsonb)
      from public.leave_types leave_type
      where leave_type.store_id = target_store_id and leave_type.is_active),
    'balances', (select coalesce(jsonb_agg(jsonb_build_object(
      'accountId', account.id, 'employeeId', account.employee_id,
      'leaveTypeId', account.leave_type_id, 'leaveTypeName', leave_type.name,
      'year', account.balance_year, 'status', account.entitlement_status,
      'grantedMinutes', account.opening_minutes,
      'availableMinutes', coalesce((select sum(entry.amount_minutes)
        from public.leave_ledger_entries entry
        where entry.store_id = account.store_id and entry.leave_account_id = account.id), 0)
    ) order by account.balance_year, leave_type.name), '[]'::jsonb)
      from public.leave_accounts account
      join public.leave_types leave_type
        on leave_type.store_id = account.store_id and leave_type.id = account.leave_type_id
      where account.store_id = target_store_id
        and (can_manage or account.employee_id = own_employee_id)),
    'requests', (select coalesce(jsonb_agg(private.leave_request_json(request.id)
      order by request.submitted_at desc), '[]'::jsonb)
      from public.leave_requests request
      where request.store_id = target_store_id
        and (can_manage or request.employee_id = own_employee_id)),
    'team', (select case when can_manage then coalesce(jsonb_agg(jsonb_build_object(
      'id', employee.id, 'displayName', employee.display_name,
      'employeeNumber', employee.employee_number, 'email', employee.email,
      'status', employee.employment_status
    ) order by employee.display_name), '[]'::jsonb) else '[]'::jsonb end
      from public.workforce_employees employee where employee.store_id = target_store_id),
    'competencies', (select case when can_manage then coalesce(jsonb_agg(jsonb_build_object(
      'id', competency.id, 'code', competency.code, 'name', competency.name,
      'description', competency.description, 'active', competency.is_active
    ) order by competency.name), '[]'::jsonb) else '[]'::jsonb end
      from public.workforce_competencies competency where competency.store_id = target_store_id),
    'coverageRules', (select case when can_manage then coalesce(jsonb_agg(jsonb_build_object(
      'id', rule.id, 'name', rule.name, 'weekday', rule.weekday,
      'competencyId', rule.competency_id, 'minimumPresent', rule.minimum_present,
      'active', rule.is_active
    ) order by rule.name), '[]'::jsonb) else '[]'::jsonb end
      from public.workforce_coverage_rules rule where rule.store_id = target_store_id)
  ) into result;
  return result;
end;
$$;

create or replace function public.submit_leave_request(target_store_id uuid, payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare actor_id uuid := (select auth.uid());
declare employee_id uuid;
declare leave_type public.leave_types%rowtype;
declare request_id uuid;
declare client_id text := nullif(btrim(payload ->> 'clientRequestId'), '');
declare start_on date;
declare end_on date;
declare total integer;
declare year_record record;
declare account_record public.leave_accounts%rowtype;
declare available integer;
declare coverage jsonb;
begin
  if actor_id is null or not private.is_store_member(target_store_id) then
    raise exception using errcode = '42501', message = 'leave:forbidden:Geen toegang tot deze winkel.';
  end if;
  perform private.ensure_workforce_defaults(target_store_id);
  if client_id is null then
    raise exception using errcode = 'P0001', message = 'leave:invalid:Een aanvraag-ID ontbreekt.';
  end if;
  select id into request_id from public.leave_requests
  where store_id = target_store_id and client_request_id = client_id;
  if request_id is not null then return private.leave_request_json(request_id); end if;
  begin
    start_on := (payload ->> 'startDate')::date;
    end_on := (payload ->> 'endDate')::date;
  exception when others then
    raise exception using errcode = 'P0001', message = 'leave:invalid:Controleer de gekozen datums.';
  end;
  if end_on < start_on or end_on - start_on > 365 then
    raise exception using errcode = 'P0001', message = 'leave:invalid:De periode is ongeldig of langer dan één jaar.';
  end if;
  select id into employee_id from public.workforce_employees
  where store_id = target_store_id and user_id = actor_id and employment_status = 'active';
  if employee_id is null then
    raise exception using errcode = 'P0001', message = 'leave:no-employee:Je gebruikersaccount is niet aan een actieve medewerker gekoppeld.';
  end if;
  -- Serialize requests per employee. This closes the race between the overlap
  -- check and balance reservation without requiring a blocking table lock.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(target_store_id::text || ':' || employee_id::text, 0)
  );
  select id into request_id from public.leave_requests
  where store_id = target_store_id and client_request_id = client_id;
  if request_id is not null then return private.leave_request_json(request_id); end if;
  select * into leave_type from public.leave_types
  where store_id = target_store_id and id = (payload ->> 'leaveTypeId')::uuid and is_active;
  if leave_type.id is null then
    raise exception using errcode = 'P0001', message = 'leave:invalid-type:Dit verloftype is niet beschikbaar.';
  end if;
  if start_on < current_date + leave_type.minimum_notice_days then
    raise exception using errcode = 'P0001', message = 'leave:notice:Deze aanvraag voldoet niet aan de minimumtermijn.';
  end if;
  if exists (
    select 1 from public.leave_requests request
    where request.store_id = target_store_id and request.employee_id = employee_id
      and request.status in ('pending', 'approved')
      and daterange(request.start_date, request.end_date, '[]') && daterange(start_on, end_on, '[]')
  ) then
    raise exception using errcode = 'P0001', message = 'leave:overlap:Er bestaat al een aanvraag in deze periode.';
  end if;
  select sum(private.workforce_minutes_for_day(target_store_id, employee_id, day::date))::integer
  into total from generate_series(start_on, end_on, interval '1 day') day;
  if coalesce(total, 0) <= 0 then
    raise exception using errcode = 'P0001', message = 'leave:no-workdays:Deze periode bevat geen geplande werkuren.';
  end if;
  coverage := private.evaluate_leave_coverage(target_store_id, employee_id, start_on, end_on, null);
  insert into public.leave_requests (
    store_id, employee_id, leave_type_id, client_request_id, start_date, end_date,
    total_minutes, employee_note, coverage_risk, coverage_snapshot
  ) values (
    target_store_id, employee_id, leave_type.id, client_id, start_on, end_on, total,
    nullif(btrim(payload ->> 'note'), ''), coverage ->> 'risk', coverage
  ) returning id into request_id;

  for year_record in
    select extract(year from day)::integer as segment_year,
           sum(private.workforce_minutes_for_day(target_store_id, employee_id, day::date))::integer as minutes
    from generate_series(start_on, end_on, interval '1 day') day
    group by extract(year from day)::integer
  loop
    if year_record.minutes <= 0 then continue; end if;
    if leave_type.requires_balance then
      select * into account_record from public.leave_accounts account
      where account.store_id = target_store_id and account.employee_id = employee_id
        and account.leave_type_id = leave_type.id and account.balance_year = year_record.segment_year
      for update;
      if account_record.id is null then
        raise exception using errcode = 'P0001', message = 'leave:no-balance:Voor dit jaar is nog geen verlofsaldo ingesteld.';
      end if;
      select coalesce(sum(entry.amount_minutes), 0)::integer into available
      from public.leave_ledger_entries entry
      where entry.store_id = target_store_id and entry.leave_account_id = account_record.id;
      if not leave_type.allows_negative_balance and available < year_record.minutes then
        raise exception using errcode = 'P0001', message = 'leave:insufficient-balance:Onvoldoende beschikbaar verlofsaldo.';
      end if;
    else
      account_record.id := null;
    end if;
    insert into public.leave_request_segments (
      store_id, request_id, leave_account_id, segment_year, minutes
    ) values (target_store_id, request_id, account_record.id, year_record.segment_year, year_record.minutes);
    if account_record.id is not null then
      insert into public.leave_ledger_entries (
        store_id, leave_account_id, request_id, entry_kind, amount_minutes, reason, actor_user_id
      ) values (
        target_store_id, account_record.id, request_id, 'reservation', -year_record.minutes,
        'Saldo gereserveerd voor verlofaanvraag.', actor_id
      );
    end if;
  end loop;
  insert into public.leave_request_events (
    store_id, request_id, event_type, to_status, actor_user_id, metadata
  ) values (target_store_id, request_id, 'submitted', 'pending', actor_id, coverage);
  perform public.append_audit(target_store_id, 'leave.submitted', jsonb_build_object(
    'requestId', request_id, 'startDate', start_on, 'endDate', end_on, 'minutes', total
  ));
  return private.leave_request_json(request_id);
end;
$$;

create or replace function public.decide_leave_request(target_store_id uuid, payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare actor_id uuid := (select auth.uid());
declare request_record public.leave_requests%rowtype;
declare employee_user_id uuid;
declare decision text := payload ->> 'decision';
declare note text := nullif(btrim(payload ->> 'note'), '');
declare coverage jsonb;
declare segment record;
begin
  if actor_id is null or not private.has_store_role(target_store_id, array['owner', 'manager']) then
    raise exception using errcode = '42501', message = 'leave:forbidden:Alleen een manager of zaakvoerder kan beslissen.';
  end if;
  if decision not in ('approved', 'rejected') then
    raise exception using errcode = 'P0001', message = 'leave:invalid-decision:Ongeldige beslissing.';
  end if;
  -- Coverage decisions are serialized per store so two simultaneous approvals
  -- cannot both rely on the same outdated remaining-headcount snapshot.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(target_store_id::text || ':workforce-coverage', 0)
  );
  select * into request_record from public.leave_requests
  where store_id = target_store_id and id = (payload ->> 'requestId')::uuid for update;
  if request_record.id is null or request_record.status <> 'pending' then
    raise exception using errcode = 'P0001', message = 'leave:not-pending:Deze aanvraag is al verwerkt.';
  end if;
  select user_id into employee_user_id from public.workforce_employees
  where store_id = target_store_id and id = request_record.employee_id;
  if employee_user_id = actor_id then
    raise exception using errcode = '42501', message = 'leave:self-approval:Je kunt je eigen verlofaanvraag niet goedkeuren.';
  end if;
  if decision = 'rejected' and note is null then
    raise exception using errcode = 'P0001', message = 'leave:reason-required:Geef een reden voor de afwijzing.';
  end if;
  coverage := private.evaluate_leave_coverage(
    target_store_id, request_record.employee_id, request_record.start_date, request_record.end_date, request_record.id
  );
  if decision = 'approved' and coverage ->> 'risk' = 'red' and note is null then
    raise exception using errcode = 'P0001', message = 'leave:override-required:De dekking is rood. Motiveer waarom je toch goedkeurt.';
  end if;

  for segment in select * from public.leave_request_segments
                 where store_id = target_store_id and request_id = request_record.id loop
    if segment.leave_account_id is not null then
      insert into public.leave_ledger_entries (
        store_id, leave_account_id, request_id, entry_kind, amount_minutes, reason, actor_user_id
      ) values (
        target_store_id, segment.leave_account_id, request_record.id, 'reservation_release', segment.minutes,
        case when decision = 'approved' then 'Reservatie omgezet naar opgenomen verlof.' else 'Reservatie vrijgegeven na afwijzing.' end,
        actor_id
      );
      if decision = 'approved' then
        insert into public.leave_ledger_entries (
          store_id, leave_account_id, request_id, entry_kind, amount_minutes, reason, actor_user_id
        ) values (
          target_store_id, segment.leave_account_id, request_record.id, 'consumption', -segment.minutes,
          'Goedgekeurd verlof.', actor_id
        );
      end if;
    end if;
  end loop;
  update public.leave_requests set
    status = decision, decision_note = note, decided_by_user_id = actor_id,
    decided_at = now(), coverage_risk = coverage ->> 'risk', coverage_snapshot = coverage
  where id = request_record.id;
  insert into public.leave_request_events (
    store_id, request_id, event_type, from_status, to_status, actor_user_id, note, metadata
  ) values (
    target_store_id, request_record.id, decision, 'pending', decision, actor_id, note, coverage
  );
  perform public.append_audit(target_store_id, 'leave.' || decision, jsonb_build_object(
    'requestId', request_record.id, 'coverageRisk', coverage ->> 'risk', 'note', note
  ));
  return private.leave_request_json(request_record.id);
end;
$$;

create or replace function public.withdraw_leave_request(target_store_id uuid, target_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare actor_id uuid := (select auth.uid());
declare request_record public.leave_requests%rowtype;
declare next_status text;
declare segment record;
begin
  select request.* into request_record
  from public.leave_requests request
  join public.workforce_employees employee
    on employee.store_id = request.store_id and employee.id = request.employee_id
  where request.store_id = target_store_id and request.id = target_request_id
    and employee.user_id = actor_id
  for update of request;
  if request_record.id is null then
    raise exception using errcode = '42501', message = 'leave:forbidden:Deze aanvraag behoort niet tot jouw dossier.';
  end if;
  if request_record.status not in ('pending', 'approved')
     or (request_record.status = 'approved' and request_record.start_date <= current_date) then
    raise exception using errcode = 'P0001', message = 'leave:not-withdrawable:Deze aanvraag kan niet meer worden ingetrokken.';
  end if;
  next_status := case when request_record.status = 'pending' then 'withdrawn' else 'cancelled' end;
  for segment in select * from public.leave_request_segments
                 where store_id = target_store_id and request_id = request_record.id loop
    if segment.leave_account_id is not null then
      insert into public.leave_ledger_entries (
        store_id, leave_account_id, request_id, entry_kind, amount_minutes, reason, actor_user_id
      ) values (
        target_store_id, segment.leave_account_id, request_record.id,
        case when request_record.status = 'pending' then 'reservation_release' else 'consumption_reversal' end,
        segment.minutes, 'Saldo vrijgegeven na intrekking.', actor_id
      );
    end if;
  end loop;
  update public.leave_requests set status = next_status where id = request_record.id;
  insert into public.leave_request_events (
    store_id, request_id, event_type, from_status, to_status, actor_user_id
  ) values (target_store_id, request_record.id, next_status, request_record.status, next_status, actor_id);
  perform public.append_audit(target_store_id, 'leave.' || next_status, jsonb_build_object('requestId', request_record.id));
  return private.leave_request_json(request_record.id);
end;
$$;

create or replace function public.adjust_leave_balance(target_store_id uuid, payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare actor_id uuid := (select auth.uid());
declare account_record public.leave_accounts%rowtype;
declare delta integer;
declare adjustment_reason text := nullif(btrim(payload ->> 'reason'), '');
begin
  if actor_id is null or not private.has_store_role(target_store_id, array['owner']) then
    raise exception using errcode = '42501', message = 'leave:forbidden:Alleen de zaakvoerder kan saldi corrigeren.';
  end if;
  begin delta := (payload ->> 'deltaMinutes')::integer;
  exception when others then
    raise exception using errcode = 'P0001', message = 'leave:invalid-adjustment:Ongeldige correctie.';
  end;
  if delta = 0 or abs(delta) > 100000 or adjustment_reason is null then
    raise exception using errcode = 'P0001', message = 'leave:invalid-adjustment:Een bedrag en reden zijn verplicht.';
  end if;
  select * into account_record from public.leave_accounts
  where store_id = target_store_id and id = (payload ->> 'accountId')::uuid for update;
  if account_record.id is null then
    raise exception using errcode = 'P0001', message = 'leave:account-not-found:Verlofsaldo niet gevonden.';
  end if;
  insert into public.leave_ledger_entries (
    store_id, leave_account_id, entry_kind, amount_minutes, reason, actor_user_id
  ) values (target_store_id, account_record.id, 'adjustment', delta, adjustment_reason, actor_id);
  update public.leave_accounts set entitlement_status = 'confirmed' where id = account_record.id;
  perform public.append_audit(target_store_id, 'leave.balance-adjusted', jsonb_build_object(
    'accountId', account_record.id, 'deltaMinutes', delta, 'reason', adjustment_reason
  ));
  return jsonb_build_object('accountId', account_record.id, 'adjustedMinutes', delta);
end;
$$;

create or replace function private.on_membership_ensure_workforce()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'active' then
    update public.workforce_employees
    set employment_status = 'active', employment_end_date = null
    where store_id = new.store_id and user_id = new.user_id;
    perform private.ensure_workforce_defaults(new.store_id);
  elsif tg_op = 'UPDATE' and old.status = 'active' then
    update public.workforce_employees
    set employment_status = 'inactive', employment_end_date = coalesce(employment_end_date, current_date)
    where store_id = new.store_id and user_id = new.user_id;
  end if;
  return new;
end;
$$;

create trigger store_membership_ensure_workforce
  after insert or update of status on public.store_memberships
  for each row execute function private.on_membership_ensure_workforce();

-- RLS is defensive even though operational writes are RPC-only.
alter table public.store_module_settings enable row level security;
alter table public.workforce_employees enable row level security;
alter table public.employee_work_patterns enable row level security;
alter table public.leave_types enable row level security;
alter table public.workforce_calendar_days enable row level security;
alter table public.workforce_competencies enable row level security;
alter table public.workforce_employee_competencies enable row level security;
alter table public.workforce_coverage_rules enable row level security;
alter table public.leave_accounts enable row level security;
alter table public.leave_requests enable row level security;
alter table public.leave_request_segments enable row level security;
alter table public.leave_ledger_entries enable row level security;
alter table public.leave_request_events enable row level security;

create policy store_module_settings_read on public.store_module_settings
  for select to authenticated using (private.is_store_member(store_id));
create policy workforce_employees_read on public.workforce_employees
  for select to authenticated using (
    private.has_store_role(store_id, array['owner', 'manager']) or user_id = (select auth.uid())
  );
create policy employee_work_patterns_read on public.employee_work_patterns
  for select to authenticated using (
    private.has_store_role(store_id, array['owner', 'manager']) or exists (
      select 1 from public.workforce_employees employee
      where employee.store_id = employee_work_patterns.store_id
        and employee.id = employee_work_patterns.employee_id and employee.user_id = (select auth.uid())
    )
  );
create policy leave_types_read on public.leave_types
  for select to authenticated using (private.is_store_member(store_id));
create policy workforce_calendar_days_read on public.workforce_calendar_days
  for select to authenticated using (private.is_store_member(store_id));
create policy workforce_competencies_read on public.workforce_competencies
  for select to authenticated using (private.is_store_member(store_id));
create policy workforce_employee_competencies_read on public.workforce_employee_competencies
  for select to authenticated using (
    private.has_store_role(store_id, array['owner', 'manager']) or exists (
      select 1 from public.workforce_employees employee
      where employee.store_id = workforce_employee_competencies.store_id
        and employee.id = workforce_employee_competencies.employee_id and employee.user_id = (select auth.uid())
    )
  );
create policy workforce_coverage_rules_read on public.workforce_coverage_rules
  for select to authenticated using (private.is_store_member(store_id));
create policy leave_accounts_read on public.leave_accounts
  for select to authenticated using (
    private.has_store_role(store_id, array['owner', 'manager']) or exists (
      select 1 from public.workforce_employees employee
      where employee.store_id = leave_accounts.store_id
        and employee.id = leave_accounts.employee_id and employee.user_id = (select auth.uid())
    )
  );
create policy leave_requests_read on public.leave_requests
  for select to authenticated using (
    private.has_store_role(store_id, array['owner', 'manager']) or exists (
      select 1 from public.workforce_employees employee
      where employee.store_id = leave_requests.store_id
        and employee.id = leave_requests.employee_id and employee.user_id = (select auth.uid())
    )
  );
create policy leave_request_segments_read on public.leave_request_segments
  for select to authenticated using (
    private.has_store_role(store_id, array['owner', 'manager']) or exists (
      select 1 from public.leave_requests request
      join public.workforce_employees employee
        on employee.store_id = request.store_id and employee.id = request.employee_id
      where request.store_id = leave_request_segments.store_id
        and request.id = leave_request_segments.request_id and employee.user_id = (select auth.uid())
    )
  );
create policy leave_ledger_entries_read on public.leave_ledger_entries
  for select to authenticated using (
    private.has_store_role(store_id, array['owner', 'manager']) or exists (
      select 1 from public.leave_accounts account
      join public.workforce_employees employee
        on employee.store_id = account.store_id and employee.id = account.employee_id
      where account.store_id = leave_ledger_entries.store_id
        and account.id = leave_ledger_entries.leave_account_id and employee.user_id = (select auth.uid())
    )
  );
create policy leave_request_events_read on public.leave_request_events
  for select to authenticated using (
    private.has_store_role(store_id, array['owner', 'manager']) or exists (
      select 1 from public.leave_requests request
      join public.workforce_employees employee
        on employee.store_id = request.store_id and employee.id = request.employee_id
      where request.store_id = leave_request_events.store_id
        and request.id = leave_request_events.request_id and employee.user_id = (select auth.uid())
    )
  );

grant select on public.store_module_settings, public.workforce_employees,
  public.employee_work_patterns, public.leave_types, public.workforce_calendar_days,
  public.workforce_competencies, public.workforce_employee_competencies,
  public.workforce_coverage_rules, public.leave_accounts, public.leave_requests,
  public.leave_request_segments, public.leave_ledger_entries, public.leave_request_events
to authenticated;

revoke insert, update, delete on public.store_module_settings, public.workforce_employees,
  public.employee_work_patterns, public.leave_types, public.workforce_calendar_days,
  public.workforce_competencies, public.workforce_employee_competencies,
  public.workforce_coverage_rules, public.leave_accounts, public.leave_requests,
  public.leave_request_segments, public.leave_ledger_entries, public.leave_request_events
from authenticated;

grant usage, select on sequence public.leave_request_events_id_seq to authenticated;
revoke all on function private.easter_sunday(integer) from public;
revoke all on function private.ensure_workforce_defaults(uuid) from public;
revoke all on function private.workforce_minutes_for_day(uuid, uuid, date) from public;
revoke all on function private.evaluate_leave_coverage(uuid, uuid, date, date, uuid) from public;
revoke all on function private.leave_request_json(uuid) from public;
revoke all on function private.on_membership_ensure_workforce() from public;

revoke all on function public.get_module_navigation(uuid) from public, anon;
revoke all on function public.save_module_navigation(uuid, jsonb) from public, anon;
revoke all on function public.get_workforce_bootstrap(uuid) from public, anon;
revoke all on function public.submit_leave_request(uuid, jsonb) from public, anon;
revoke all on function public.decide_leave_request(uuid, jsonb) from public, anon;
revoke all on function public.withdraw_leave_request(uuid, uuid) from public, anon;
revoke all on function public.adjust_leave_balance(uuid, jsonb) from public, anon;

grant execute on function public.get_module_navigation(uuid) to authenticated;
grant execute on function public.save_module_navigation(uuid, jsonb) to authenticated;
grant execute on function public.get_workforce_bootstrap(uuid) to authenticated;
grant execute on function public.submit_leave_request(uuid, jsonb) to authenticated;
grant execute on function public.decide_leave_request(uuid, jsonb) to authenticated;
grant execute on function public.withdraw_leave_request(uuid, uuid) to authenticated;
grant execute on function public.adjust_leave_balance(uuid, jsonb) to authenticated;

insert into public.billing_features (feature_key, name, category, value_type)
values ('workforce.core', 'Medewerkers, uren en verlof', 'workforce', 'boolean')
on conflict (feature_key) do nothing;
insert into public.billing_plan_features (plan_code, feature_key, enabled)
select code, 'workforce.core', true from public.billing_plans
on conflict (plan_code, feature_key) do update set enabled = excluded.enabled;

do $$
declare store_record record;
begin
  for store_record in select distinct store_id from public.store_memberships where status = 'active' loop
    perform private.ensure_workforce_defaults(store_record.store_id);
  end loop;
end;
$$;

commit;
