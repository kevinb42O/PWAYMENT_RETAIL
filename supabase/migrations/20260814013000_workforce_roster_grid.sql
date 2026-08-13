begin;

-- A recurring work pattern describes the employee's normal local workday.
-- Concrete roster shifts remain separate so historical and published weeks never
-- change when a pattern is edited later.
alter table public.employee_work_patterns
  add column if not exists start_time time,
  add column if not exists end_time time,
  add column if not exists break_minutes integer not null default 0,
  add column if not exists role_label text,
  add column if not exists location_label text;

update public.employee_work_patterns
set start_time = time '09:00',
    break_minutes = case when scheduled_minutes >= 240 then 24 else 0 end,
    end_time = time '09:00'
      + make_interval(mins => scheduled_minutes + case when scheduled_minutes >= 240 then 24 else 0 end)
where scheduled_minutes > 0
  and (start_time is null or end_time is null);

alter table public.employee_work_patterns
  drop constraint if exists employee_work_patterns_break_minutes_check,
  add constraint employee_work_patterns_break_minutes_check
    check (break_minutes between 0 and 720),
  drop constraint if exists employee_work_patterns_time_check,
  add constraint employee_work_patterns_time_check check (
    (scheduled_minutes = 0 and start_time is null and end_time is null)
    or
    (scheduled_minutes > 0 and start_time is not null and end_time is not null and end_time > start_time)
  );

create table public.workforce_rosters (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  week_start date not null,
  status text not null default 'draft' check (status in ('draft', 'published', 'locked')),
  version integer not null default 1 check (version > 0),
  published_at timestamptz,
  published_by_user_id uuid references auth.users(id),
  created_by_user_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, id),
  unique (store_id, week_start),
  check (extract(isodow from week_start) = 1),
  check ((status = 'draft') or published_at is not null)
);

create index workforce_rosters_store_week_idx
  on public.workforce_rosters (store_id, week_start desc);

create table public.workforce_shifts (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  roster_id uuid not null,
  employee_id uuid not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  break_minutes integer not null default 0 check (break_minutes between 0 and 720),
  role_label text check (role_label is null or char_length(btrim(role_label)) between 1 and 80),
  location_label text check (location_label is null or char_length(btrim(location_label)) between 1 and 120),
  note text check (note is null or char_length(note) <= 1000),
  source text not null default 'manual' check (source in ('manual', 'pattern', 'copied', 'imported')),
  version integer not null default 1 check (version > 0),
  created_by_user_id uuid not null references auth.users(id),
  updated_by_user_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, id),
  foreign key (store_id, roster_id)
    references public.workforce_rosters(store_id, id) on delete cascade,
  foreign key (store_id, employee_id)
    references public.workforce_employees(store_id, id) on delete restrict,
  check (ends_at > starts_at),
  check (ends_at - starts_at <= interval '36 hours'),
  check (break_minutes < extract(epoch from (ends_at - starts_at)) / 60)
);

create index workforce_shifts_range_idx
  on public.workforce_shifts (store_id, starts_at, ends_at);
create index workforce_shifts_employee_range_idx
  on public.workforce_shifts (store_id, employee_id, starts_at, ends_at);

create table public.workforce_availability_exceptions (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null,
  employee_id uuid not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  availability text not null check (availability in ('available', 'unavailable', 'preferred')),
  note text check (note is null or char_length(note) <= 500),
  created_by_user_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, id),
  foreign key (store_id, employee_id)
    references public.workforce_employees(store_id, id) on delete cascade,
  check (ends_at > starts_at),
  check (ends_at - starts_at <= interval '62 days')
);

create index workforce_availability_range_idx
  on public.workforce_availability_exceptions (store_id, employee_id, starts_at, ends_at);

create table public.workforce_roster_events (
  id bigint generated always as identity primary key,
  store_id uuid not null,
  roster_id uuid not null,
  shift_id uuid,
  event_type text not null check (event_type in (
    'shift_created', 'shift_updated', 'shift_deleted', 'patterns_applied',
    'week_copied', 'published', 'reopened'
  )),
  actor_user_id uuid not null references auth.users(id),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  foreign key (store_id, roster_id)
    references public.workforce_rosters(store_id, id) on delete cascade
);

create index workforce_roster_events_roster_idx
  on public.workforce_roster_events (store_id, roster_id, created_at desc);

create trigger workforce_rosters_set_updated_at before update on public.workforce_rosters
  for each row execute function private.set_updated_at();
create trigger workforce_shifts_set_updated_at before update on public.workforce_shifts
  for each row execute function private.set_updated_at();
create trigger workforce_availability_set_updated_at before update on public.workforce_availability_exceptions
  for each row execute function private.set_updated_at();

create or replace function private.workforce_week_start(target_date date)
returns date
language sql
immutable
set search_path = ''
as $$
  select target_date - (extract(isodow from target_date)::integer - 1);
$$;

create or replace function private.workforce_pattern_minutes(
  pattern_start time,
  pattern_end time,
  pattern_break integer
)
returns integer
language sql
immutable
set search_path = ''
as $$
  select greatest(
    0,
    floor(extract(epoch from (pattern_end - pattern_start)) / 60)::integer - pattern_break
  );
$$;

create or replace function private.workforce_shift_json(target_shift_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', shift.id,
    'rosterId', shift.roster_id,
    'employeeId', shift.employee_id,
    'startsAt', shift.starts_at,
    'endsAt', shift.ends_at,
    'breakMinutes', shift.break_minutes,
    'paidMinutes', greatest(0, floor(extract(epoch from (shift.ends_at - shift.starts_at)) / 60)::integer - shift.break_minutes),
    'roleLabel', shift.role_label,
    'locationLabel', shift.location_label,
    'note', shift.note,
    'source', shift.source,
    'version', shift.version,
    'rosterStatus', roster.status,
    'rosterVersion', roster.version,
    'weekStart', roster.week_start
  )
  from public.workforce_shifts shift
  join public.workforce_rosters roster
    on roster.store_id = shift.store_id and roster.id = shift.roster_id
  where shift.id = target_shift_id;
$$;

create or replace function private.ensure_workforce_roster(
  target_store_id uuid,
  target_week_start date,
  actor_id uuid
)
returns public.workforce_rosters
language plpgsql
security definer
set search_path = ''
as $$
declare roster_record public.workforce_rosters%rowtype;
begin
  if target_week_start <> private.workforce_week_start(target_week_start) then
    raise exception using errcode = 'P0001', message = 'roster:invalid-week:De roosterweek moet op maandag starten.';
  end if;
  insert into public.workforce_rosters (store_id, week_start, created_by_user_id)
  values (target_store_id, target_week_start, actor_id)
  on conflict (store_id, week_start) do nothing;
  select * into roster_record
  from public.workforce_rosters
  where store_id = target_store_id and week_start = target_week_start
  for update;
  return roster_record;
end;
$$;

create or replace function public.get_workforce_roster(
  target_store_id uuid,
  range_start date,
  range_end date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare actor_id uuid := (select auth.uid());
declare own_employee_id uuid;
declare can_manage boolean;
declare store_timezone text;
declare result jsonb;
begin
  if actor_id is null or not private.is_store_member(target_store_id) then
    raise exception using errcode = '42501', message = 'roster:forbidden:Geen toegang tot deze winkel.';
  end if;
  if range_start is null or range_end is null or range_end < range_start or range_end - range_start > 41 then
    raise exception using errcode = 'P0001', message = 'roster:invalid-range:Kies een periode van maximaal 42 dagen.';
  end if;

  select id into own_employee_id
  from public.workforce_employees
  where store_id = target_store_id and user_id = actor_id;
  can_manage := private.has_store_role(target_store_id, array['owner', 'manager']);
  select timezone into store_timezone from public.stores where id = target_store_id;

  select jsonb_build_object(
    'schemaVersion', 2,
    'rangeStart', range_start,
    'rangeEnd', range_end,
    'timezone', coalesce(store_timezone, 'Europe/Brussels'),
    'canManage', can_manage,
    'employees', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', employee.id,
        'displayName', employee.display_name,
        'employeeNumber', employee.employee_number,
        'email', employee.email,
        'status', employee.employment_status,
        'weeklyMinutes', coalesce((
          select sum(latest.scheduled_minutes)::integer
          from (
            select distinct on (pattern.weekday) pattern.weekday, pattern.scheduled_minutes
            from public.employee_work_patterns pattern
            where pattern.store_id = employee.store_id
              and pattern.employee_id = employee.id
              and pattern.effective_from <= range_end
              and (pattern.effective_until is null or pattern.effective_until >= range_start)
            order by pattern.weekday, pattern.effective_from desc
          ) latest
        ), 0),
        'competencyIds', coalesce((
          select jsonb_agg(link.competency_id order by link.competency_id)
          from public.workforce_employee_competencies link
          where link.store_id = employee.store_id
            and link.employee_id = employee.id
            and (link.valid_until is null or link.valid_until >= range_start)
        ), '[]'::jsonb)
      ) order by employee.display_name), '[]'::jsonb)
      from public.workforce_employees employee
      where employee.store_id = target_store_id
        and employee.employment_status <> 'inactive'
        and employee.employment_start_date <= range_end
        and (employee.employment_end_date is null or employee.employment_end_date >= range_start)
        and (can_manage or employee.id = own_employee_id)
    ),
    'patterns', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', pattern.id,
        'employeeId', pattern.employee_id,
        'weekday', pattern.weekday,
        'scheduledMinutes', pattern.scheduled_minutes,
        'startTime', to_char(pattern.start_time, 'HH24:MI'),
        'endTime', to_char(pattern.end_time, 'HH24:MI'),
        'breakMinutes', pattern.break_minutes,
        'roleLabel', pattern.role_label,
        'locationLabel', pattern.location_label,
        'effectiveFrom', pattern.effective_from,
        'effectiveUntil', pattern.effective_until
      ) order by pattern.employee_id, pattern.weekday, pattern.effective_from desc), '[]'::jsonb)
      from public.employee_work_patterns pattern
      where pattern.store_id = target_store_id
        and pattern.effective_from <= range_end
        and (pattern.effective_until is null or pattern.effective_until >= range_start)
        and (can_manage or pattern.employee_id = own_employee_id)
    ),
    'rosters', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', roster.id,
        'weekStart', roster.week_start,
        'status', roster.status,
        'version', roster.version,
        'publishedAt', roster.published_at
      ) order by roster.week_start), '[]'::jsonb)
      from public.workforce_rosters roster
      where roster.store_id = target_store_id
        and roster.week_start <= range_end
        and roster.week_start + 6 >= range_start
        and (can_manage or roster.status in ('published', 'locked'))
    ),
    'shifts', (
      select coalesce(jsonb_agg(private.workforce_shift_json(shift.id)
        order by shift.starts_at, shift.employee_id), '[]'::jsonb)
      from public.workforce_shifts shift
      join public.workforce_rosters roster
        on roster.store_id = shift.store_id and roster.id = shift.roster_id
      where shift.store_id = target_store_id
        and shift.starts_at < ((range_end + 1)::timestamp at time zone coalesce(store_timezone, 'Europe/Brussels'))
        and shift.ends_at > (range_start::timestamp at time zone coalesce(store_timezone, 'Europe/Brussels'))
        and (can_manage or (shift.employee_id = own_employee_id and roster.status in ('published', 'locked')))
    ),
    'leave', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'requestId', request.id,
        'employeeId', request.employee_id,
        'startDate', request.start_date,
        'endDate', request.end_date,
        'status', request.status,
        'leaveTypeName', leave_type.name,
        'leaveTypeColor', leave_type.color,
        'coverageRisk', request.coverage_risk
      ) order by request.start_date, request.employee_id), '[]'::jsonb)
      from public.leave_requests request
      join public.leave_types leave_type
        on leave_type.store_id = request.store_id and leave_type.id = request.leave_type_id
      where request.store_id = target_store_id
        and request.status in ('pending', 'approved')
        and request.start_date <= range_end
        and request.end_date >= range_start
        and (can_manage or request.employee_id = own_employee_id)
    ),
    'calendarDays', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'date', day.calendar_date,
        'name', day.name,
        'type', day.day_type,
        'consumesLeave', day.consumes_leave
      ) order by day.calendar_date), '[]'::jsonb)
      from public.workforce_calendar_days day
      where day.store_id = target_store_id
        and day.calendar_date between range_start and range_end
    ),
    'availability', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', exception.id,
        'employeeId', exception.employee_id,
        'startsAt', exception.starts_at,
        'endsAt', exception.ends_at,
        'availability', exception.availability,
        'note', exception.note
      ) order by exception.starts_at), '[]'::jsonb)
      from public.workforce_availability_exceptions exception
      where exception.store_id = target_store_id
        and exception.starts_at < ((range_end + 1)::timestamp at time zone coalesce(store_timezone, 'Europe/Brussels'))
        and exception.ends_at > (range_start::timestamp at time zone coalesce(store_timezone, 'Europe/Brussels'))
        and (can_manage or exception.employee_id = own_employee_id)
    ),
    'coverage', (
      select case when can_manage then coalesce(jsonb_agg(jsonb_build_object(
        'date', day.target_date,
        'scheduled', day.scheduled_count,
        'minimum', day.minimum_count,
        'risk', case
          when day.scheduled_count < day.minimum_count then 'red'
          when day.scheduled_count = day.minimum_count then 'amber'
          else 'green'
        end,
        'missingCompetencies', day.missing_competencies
      ) order by day.target_date), '[]'::jsonb) else '[]'::jsonb end
      from (
        select generated.target_date,
          (
            select count(distinct employee.id)::integer
            from public.workforce_employees employee
            where employee.store_id = target_store_id
              and employee.employment_status = 'active'
              and employee.employment_start_date <= generated.target_date
              and (employee.employment_end_date is null or employee.employment_end_date >= generated.target_date)
              and not exists (
                select 1 from public.leave_requests request
                where request.store_id = target_store_id
                  and request.employee_id = employee.id
                  and request.status = 'approved'
                  and generated.target_date between request.start_date and request.end_date
              )
              and (
                exists (
                  select 1 from public.workforce_shifts shift
                  join public.workforce_rosters roster
                    on roster.store_id = shift.store_id and roster.id = shift.roster_id
                  where shift.store_id = target_store_id
                    and shift.employee_id = employee.id
                    and (shift.starts_at at time zone coalesce(store_timezone, 'Europe/Brussels'))::date = generated.target_date
                )
                or (
                  not exists (
                    select 1 from public.workforce_shifts shift
                    where shift.store_id = target_store_id
                      and shift.employee_id = employee.id
                      and (shift.starts_at at time zone coalesce(store_timezone, 'Europe/Brussels'))::date = generated.target_date
                  )
                  and exists (
                    select 1 from public.employee_work_patterns pattern
                    where pattern.store_id = target_store_id
                      and pattern.employee_id = employee.id
                      and pattern.weekday = extract(isodow from generated.target_date)::integer
                      and pattern.scheduled_minutes > 0
                      and pattern.effective_from <= generated.target_date
                      and (pattern.effective_until is null or pattern.effective_until >= generated.target_date)
                      and not exists (
                        select 1 from public.employee_work_patterns newer
                        where newer.store_id = pattern.store_id and newer.employee_id = pattern.employee_id
                          and newer.weekday = pattern.weekday
                          and newer.effective_from <= generated.target_date
                          and (newer.effective_until is null or newer.effective_until >= generated.target_date)
                          and newer.effective_from > pattern.effective_from
                      )
                  )
                )
              )
          ) as scheduled_count,
          coalesce((
            select max(rule.minimum_present)::integer
            from public.workforce_coverage_rules rule
            where rule.store_id = target_store_id and rule.is_active
              and rule.competency_id is null
              and (rule.weekday is null or rule.weekday = extract(isodow from generated.target_date)::integer)
          ), 0) as minimum_count,
          coalesce((
            select jsonb_agg(competency.name order by competency.name)
            from public.workforce_coverage_rules rule
            join public.workforce_competencies competency
              on competency.store_id = rule.store_id and competency.id = rule.competency_id
            where rule.store_id = target_store_id and rule.is_active
              and rule.competency_id is not null
              and (rule.weekday is null or rule.weekday = extract(isodow from generated.target_date)::integer)
              and (
                select count(distinct link.employee_id)
                from public.workforce_employee_competencies link
                where link.store_id = target_store_id and link.competency_id = rule.competency_id
                  and (link.valid_until is null or link.valid_until >= generated.target_date)
                  and not exists (
                    select 1 from public.leave_requests request
                    where request.store_id = target_store_id and request.employee_id = link.employee_id
                      and request.status = 'approved'
                      and generated.target_date between request.start_date and request.end_date
                  )
                  and (
                    exists (
                      select 1 from public.workforce_shifts shift
                      where shift.store_id = target_store_id and shift.employee_id = link.employee_id
                        and (shift.starts_at at time zone coalesce(store_timezone, 'Europe/Brussels'))::date = generated.target_date
                    )
                    or exists (
                      select 1 from public.employee_work_patterns pattern
                      where pattern.store_id = target_store_id and pattern.employee_id = link.employee_id
                        and pattern.weekday = extract(isodow from generated.target_date)::integer
                        and pattern.scheduled_minutes > 0
                        and pattern.effective_from <= generated.target_date
                        and (pattern.effective_until is null or pattern.effective_until >= generated.target_date)
                    )
                  )
              ) < rule.minimum_present
          ), '[]'::jsonb) as missing_competencies
        from generate_series(range_start, range_end, interval '1 day') generated(target_date)
      ) day
    )
  ) into result;
  return result;
end;
$$;

create or replace function public.save_workforce_shift(target_store_id uuid, payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare actor_id uuid := (select auth.uid());
declare employee_record public.workforce_employees%rowtype;
declare roster_record public.workforce_rosters%rowtype;
declare shift_record public.workforce_shifts%rowtype;
declare shift_id uuid;
declare starts_at_value timestamptz;
declare ends_at_value timestamptz;
declare local_start_date date;
declare local_end_date date;
declare target_week date;
declare break_value integer;
declare expected_roster_version integer;
declare expected_shift_version integer;
declare event_name text;
begin
  if actor_id is null or not private.has_store_role(target_store_id, array['owner', 'manager']) then
    raise exception using errcode = '42501', message = 'roster:forbidden:Alleen een manager of zaakvoerder kan het rooster wijzigen.';
  end if;
  begin
    starts_at_value := (payload ->> 'startsAt')::timestamptz;
    ends_at_value := (payload ->> 'endsAt')::timestamptz;
    break_value := coalesce((payload ->> 'breakMinutes')::integer, 0);
    shift_id := nullif(payload ->> 'shiftId', '')::uuid;
    expected_roster_version := nullif(payload ->> 'expectedRosterVersion', '')::integer;
    expected_shift_version := nullif(payload ->> 'expectedShiftVersion', '')::integer;
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception using errcode = 'P0001', message = 'roster:invalid-shift:Controleer de medewerker en de ingevoerde uren.';
  end;
  select * into employee_record
  from public.workforce_employees
  where store_id = target_store_id and id = (payload ->> 'employeeId')::uuid
    and employment_status = 'active';
  if employee_record.id is null then
    raise exception using errcode = 'P0001', message = 'roster:employee-not-found:De medewerker is niet actief in deze winkel.';
  end if;
  if ends_at_value <= starts_at_value or ends_at_value - starts_at_value > interval '36 hours'
     or break_value < 0 or break_value >= extract(epoch from (ends_at_value - starts_at_value)) / 60 then
    raise exception using errcode = 'P0001', message = 'roster:invalid-shift:De eindtijd moet na de starttijd liggen en de pauze moet korter zijn dan de shift.';
  end if;
  local_start_date := (starts_at_value at time zone employee_record.timezone)::date;
  local_end_date := ((ends_at_value - interval '1 second') at time zone employee_record.timezone)::date;
  if local_end_date - local_start_date > 1 then
    raise exception using errcode = 'P0001', message = 'roster:invalid-shift:Een shift kan maximaal één kalendernacht overspannen.';
  end if;
  target_week := private.workforce_week_start(local_start_date);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    target_store_id::text || ':roster:' || target_week::text, 0
  ));
  roster_record := private.ensure_workforce_roster(target_store_id, target_week, actor_id);
  if roster_record.status <> 'draft' then
    raise exception using errcode = 'P0001', message = 'roster:published:Heropen de gepubliceerde week voordat je shifts wijzigt.';
  end if;
  if expected_roster_version is not null and roster_record.version <> expected_roster_version then
    raise exception using errcode = '40001', message = 'roster:version-conflict:Iemand anders heeft deze week gewijzigd. Vernieuw het rooster.';
  end if;
  if exists (
    select 1 from public.workforce_shifts other
    where other.store_id = target_store_id and other.employee_id = employee_record.id
      and other.id <> coalesce(shift_id, '00000000-0000-0000-0000-000000000000'::uuid)
      and other.starts_at < ends_at_value and other.ends_at > starts_at_value
  ) then
    raise exception using errcode = 'P0001', message = 'roster:overlap:Deze medewerker heeft al een overlappende shift.';
  end if;
  if exists (
    select 1 from public.leave_requests request
    where request.store_id = target_store_id and request.employee_id = employee_record.id
      and request.status = 'approved'
      and request.start_date <= local_end_date and request.end_date >= local_start_date
  ) then
    raise exception using errcode = 'P0001', message = 'roster:leave-conflict:Deze medewerker heeft goedgekeurd verlof tijdens de gekozen shift.';
  end if;
  if exists (
    select 1 from public.workforce_availability_exceptions exception
    where exception.store_id = target_store_id and exception.employee_id = employee_record.id
      and exception.availability = 'unavailable'
      and exception.starts_at < ends_at_value and exception.ends_at > starts_at_value
  ) then
    raise exception using errcode = 'P0001', message = 'roster:availability-conflict:Deze medewerker staat als niet beschikbaar aangeduid.';
  end if;

  if shift_id is null then
    insert into public.workforce_shifts (
      store_id, roster_id, employee_id, starts_at, ends_at, break_minutes,
      role_label, location_label, note, source, created_by_user_id, updated_by_user_id
    ) values (
      target_store_id, roster_record.id, employee_record.id, starts_at_value, ends_at_value, break_value,
      nullif(btrim(payload ->> 'roleLabel'), ''), nullif(btrim(payload ->> 'locationLabel'), ''),
      nullif(btrim(payload ->> 'note'), ''), 'manual', actor_id, actor_id
    ) returning * into shift_record;
    event_name := 'shift_created';
  else
    select * into shift_record from public.workforce_shifts
    where store_id = target_store_id and id = shift_id for update;
    if shift_record.id is null or shift_record.roster_id <> roster_record.id then
      raise exception using errcode = 'P0001', message = 'roster:shift-not-found:De shift bestaat niet meer in deze week.';
    end if;
    if expected_shift_version is not null and shift_record.version <> expected_shift_version then
      raise exception using errcode = '40001', message = 'roster:version-conflict:Iemand anders heeft deze shift gewijzigd. Vernieuw het rooster.';
    end if;
    update public.workforce_shifts set
      employee_id = employee_record.id,
      starts_at = starts_at_value,
      ends_at = ends_at_value,
      break_minutes = break_value,
      role_label = nullif(btrim(payload ->> 'roleLabel'), ''),
      location_label = nullif(btrim(payload ->> 'locationLabel'), ''),
      note = nullif(btrim(payload ->> 'note'), ''),
      source = 'manual',
      version = version + 1,
      updated_by_user_id = actor_id
    where id = shift_record.id
    returning * into shift_record;
    event_name := 'shift_updated';
  end if;
  update public.workforce_rosters set version = version + 1 where id = roster_record.id;
  insert into public.workforce_roster_events (
    store_id, roster_id, shift_id, event_type, actor_user_id, metadata
  ) values (
    target_store_id, roster_record.id, shift_record.id, event_name, actor_id,
    jsonb_build_object('employeeId', employee_record.id, 'startsAt', starts_at_value, 'endsAt', ends_at_value)
  );
  perform public.append_audit(target_store_id, 'roster.' || event_name, jsonb_build_object(
    'rosterId', roster_record.id, 'shiftId', shift_record.id, 'employeeId', employee_record.id
  ));
  return private.workforce_shift_json(shift_record.id);
end;
$$;


-- The bootstrap is now a pure read. Defaults are provisioned by migrations and
-- membership triggers; opening the Workforce screen can no longer fail because
-- a read attempted hidden writes.
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
  select id into own_employee_id from public.workforce_employees
  where store_id = target_store_id and user_id = actor_id;
  can_manage := private.has_store_role(target_store_id, array['owner', 'manager']);

  select jsonb_build_object(
    'schemaVersion', 2,
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
      'status', employee.employment_status,
      'weeklyMinutes', coalesce((select sum(pattern.scheduled_minutes)::integer
        from public.employee_work_patterns pattern
        where pattern.store_id = employee.store_id and pattern.employee_id = employee.id
          and pattern.effective_from <= current_date
          and (pattern.effective_until is null or pattern.effective_until >= current_date)), 0)
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

create or replace function public.delete_workforce_shift(target_store_id uuid, payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare actor_id uuid := (select auth.uid());
declare shift_record public.workforce_shifts%rowtype;
declare roster_record public.workforce_rosters%rowtype;
declare shift_id uuid;
declare expected_roster_version integer;
declare expected_shift_version integer;
begin
  if actor_id is null or not private.has_store_role(target_store_id, array['owner', 'manager']) then
    raise exception using errcode = '42501', message = 'roster:forbidden:Alleen een manager of zaakvoerder kan het rooster wijzigen.';
  end if;
  begin
    shift_id := (payload ->> 'shiftId')::uuid;
    expected_roster_version := nullif(payload ->> 'expectedRosterVersion', '')::integer;
    expected_shift_version := nullif(payload ->> 'expectedShiftVersion', '')::integer;
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception using errcode = 'P0001', message = 'roster:shift-not-found:De shift bestaat niet meer.';
  end;
  select * into shift_record from public.workforce_shifts
  where store_id = target_store_id and id = shift_id for update;
  if shift_record.id is null then
    raise exception using errcode = 'P0001', message = 'roster:shift-not-found:De shift bestaat niet meer.';
  end if;
  select * into roster_record from public.workforce_rosters
  where store_id = target_store_id and id = shift_record.roster_id for update;
  if roster_record.status <> 'draft' then
    raise exception using errcode = 'P0001', message = 'roster:published:Heropen de gepubliceerde week voordat je shifts wijzigt.';
  end if;
  if expected_roster_version is not null and roster_record.version <> expected_roster_version
     or expected_shift_version is not null and shift_record.version <> expected_shift_version then
    raise exception using errcode = '40001', message = 'roster:version-conflict:Iemand anders heeft deze week gewijzigd. Vernieuw het rooster.';
  end if;
  delete from public.workforce_shifts where id = shift_record.id;
  update public.workforce_rosters set version = version + 1 where id = roster_record.id;
  insert into public.workforce_roster_events (
    store_id, roster_id, event_type, actor_user_id, metadata
  ) values (
    target_store_id, roster_record.id, 'shift_deleted', actor_id,
    jsonb_build_object('shiftId', shift_record.id, 'employeeId', shift_record.employee_id)
  );
  perform public.append_audit(target_store_id, 'roster.shift_deleted', jsonb_build_object(
    'rosterId', roster_record.id, 'shiftId', shift_record.id
  ));
  return jsonb_build_object('shiftId', shift_record.id, 'deleted', true);
end;
$$;

create or replace function public.apply_workforce_patterns(target_store_id uuid, payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare actor_id uuid := (select auth.uid());
declare target_week date;
declare roster_record public.workforce_rosters%rowtype;
declare selected_employee_ids uuid[];
declare inserted_count integer := 0;
begin
  if actor_id is null or not private.has_store_role(target_store_id, array['owner', 'manager']) then
    raise exception using errcode = '42501', message = 'roster:forbidden:Alleen een manager of zaakvoerder kan werkpatronen toepassen.';
  end if;
  begin
    target_week := (payload ->> 'weekStart')::date;
    select coalesce(array_agg(value::uuid), array[]::uuid[]) into selected_employee_ids
    from jsonb_array_elements_text(coalesce(payload -> 'employeeIds', '[]'::jsonb));
  exception when invalid_text_representation then
    raise exception using errcode = 'P0001', message = 'roster:invalid-week:De gekozen week of medewerker is ongeldig.';
  end;
  if target_week <> private.workforce_week_start(target_week) then
    raise exception using errcode = 'P0001', message = 'roster:invalid-week:De roosterweek moet op maandag starten.';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    target_store_id::text || ':roster:' || target_week::text, 0
  ));
  roster_record := private.ensure_workforce_roster(target_store_id, target_week, actor_id);
  if roster_record.status <> 'draft' then
    raise exception using errcode = 'P0001', message = 'roster:published:Heropen de week voordat je werkpatronen toepast.';
  end if;
  if nullif(payload ->> 'expectedRosterVersion', '') is not null
     and roster_record.version <> (payload ->> 'expectedRosterVersion')::integer then
    raise exception using errcode = '40001', message = 'roster:version-conflict:Iemand anders heeft deze week gewijzigd. Vernieuw het rooster.';
  end if;

  delete from public.workforce_shifts shift
  where shift.store_id = target_store_id and shift.roster_id = roster_record.id
    and shift.source = 'pattern'
    and (cardinality(selected_employee_ids) = 0 or shift.employee_id = any(selected_employee_ids));

  insert into public.workforce_shifts (
    store_id, roster_id, employee_id, starts_at, ends_at, break_minutes,
    role_label, location_label, source, created_by_user_id, updated_by_user_id
  )
  select target_store_id, roster_record.id, employee.id,
    ((target_week + (pattern.weekday - 1))::date + pattern.start_time) at time zone employee.timezone,
    ((target_week + (pattern.weekday - 1))::date + pattern.end_time) at time zone employee.timezone,
    pattern.break_minutes, pattern.role_label, pattern.location_label,
    'pattern', actor_id, actor_id
  from public.workforce_employees employee
  join lateral (
    select candidate.*
    from public.employee_work_patterns candidate
    where candidate.store_id = target_store_id and candidate.employee_id = employee.id
      and candidate.scheduled_minutes > 0
      and candidate.start_time is not null and candidate.end_time is not null
      and candidate.effective_from <= target_week + (candidate.weekday - 1)
      and (candidate.effective_until is null or candidate.effective_until >= target_week + (candidate.weekday - 1))
    order by candidate.effective_from desc
  ) pattern on true
  where employee.store_id = target_store_id and employee.employment_status = 'active'
    and (cardinality(selected_employee_ids) = 0 or employee.id = any(selected_employee_ids))
    and not exists (
      select 1 from public.employee_work_patterns newer
      where newer.store_id = pattern.store_id and newer.employee_id = pattern.employee_id
        and newer.weekday = pattern.weekday
        and newer.effective_from <= target_week + (newer.weekday - 1)
        and (newer.effective_until is null or newer.effective_until >= target_week + (newer.weekday - 1))
        and newer.effective_from > pattern.effective_from
    )
    and not exists (
      select 1 from public.leave_requests request
      where request.store_id = target_store_id and request.employee_id = employee.id
        and request.status = 'approved'
        and target_week + (pattern.weekday - 1) between request.start_date and request.end_date
    )
    and not exists (
      select 1 from public.workforce_shifts existing
      where existing.store_id = target_store_id and existing.roster_id = roster_record.id
        and existing.employee_id = employee.id
        and (existing.starts_at at time zone employee.timezone)::date = target_week + (pattern.weekday - 1)
    );
  get diagnostics inserted_count = row_count;
  update public.workforce_rosters set version = version + 1 where id = roster_record.id;
  insert into public.workforce_roster_events (
    store_id, roster_id, event_type, actor_user_id, metadata
  ) values (
    target_store_id, roster_record.id, 'patterns_applied', actor_id,
    jsonb_build_object('insertedShifts', inserted_count, 'employeeIds', to_jsonb(selected_employee_ids))
  );
  perform public.append_audit(target_store_id, 'roster.patterns_applied', jsonb_build_object(
    'rosterId', roster_record.id, 'weekStart', target_week, 'insertedShifts', inserted_count
  ));
  return jsonb_build_object('rosterId', roster_record.id, 'insertedShifts', inserted_count);
end;
$$;

create or replace function public.copy_workforce_week(target_store_id uuid, payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare actor_id uuid := (select auth.uid());
declare source_week date;
declare target_week date;
declare day_delta integer;
declare source_roster public.workforce_rosters%rowtype;
declare target_roster public.workforce_rosters%rowtype;
declare copied_count integer := 0;
begin
  if actor_id is null or not private.has_store_role(target_store_id, array['owner', 'manager']) then
    raise exception using errcode = '42501', message = 'roster:forbidden:Alleen een manager of zaakvoerder kan een week kopiëren.';
  end if;
  begin
    source_week := (payload ->> 'sourceWeekStart')::date;
    target_week := (payload ->> 'targetWeekStart')::date;
  exception when invalid_text_representation then
    raise exception using errcode = 'P0001', message = 'roster:invalid-week:De gekozen week is ongeldig.';
  end;
  if source_week <> private.workforce_week_start(source_week)
     or target_week <> private.workforce_week_start(target_week)
     or source_week = target_week then
    raise exception using errcode = 'P0001', message = 'roster:invalid-week:Kies twee verschillende weken die op maandag starten.';
  end if;
  select * into source_roster from public.workforce_rosters
  where store_id = target_store_id and week_start = source_week;
  if source_roster.id is null then
    raise exception using errcode = 'P0001', message = 'roster:source-empty:De bronweek bevat nog geen concrete shifts.';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    target_store_id::text || ':roster:' || target_week::text, 0
  ));
  target_roster := private.ensure_workforce_roster(target_store_id, target_week, actor_id);
  if target_roster.status <> 'draft' then
    raise exception using errcode = 'P0001', message = 'roster:published:Heropen de doelweek voordat je een week kopieert.';
  end if;
  if nullif(payload ->> 'expectedRosterVersion', '') is not null
     and target_roster.version <> (payload ->> 'expectedRosterVersion')::integer then
    raise exception using errcode = '40001', message = 'roster:version-conflict:Iemand anders heeft de doelweek gewijzigd. Vernieuw het rooster.';
  end if;
  day_delta := target_week - source_week;
  delete from public.workforce_shifts
  where store_id = target_store_id and roster_id = target_roster.id and source = 'copied';
  insert into public.workforce_shifts (
    store_id, roster_id, employee_id, starts_at, ends_at, break_minutes,
    role_label, location_label, note, source, created_by_user_id, updated_by_user_id
  )
  select source.store_id, target_roster.id, source.employee_id,
    source.starts_at + make_interval(days => day_delta),
    source.ends_at + make_interval(days => day_delta),
    source.break_minutes, source.role_label, source.location_label, source.note,
    'copied', actor_id, actor_id
  from public.workforce_shifts source
  join public.workforce_employees employee
    on employee.store_id = source.store_id and employee.id = source.employee_id
  where source.store_id = target_store_id and source.roster_id = source_roster.id
    and not exists (
      select 1 from public.leave_requests request
      where request.store_id = target_store_id and request.employee_id = source.employee_id
        and request.status = 'approved'
        and (source.starts_at at time zone employee.timezone)::date + day_delta
          between request.start_date and request.end_date
    )
    and not exists (
      select 1 from public.workforce_shifts existing
      where existing.store_id = target_store_id and existing.roster_id = target_roster.id
        and existing.employee_id = source.employee_id
        and existing.starts_at < source.ends_at + make_interval(days => day_delta)
        and existing.ends_at > source.starts_at + make_interval(days => day_delta)
    );
  get diagnostics copied_count = row_count;
  update public.workforce_rosters set version = version + 1 where id = target_roster.id;
  insert into public.workforce_roster_events (
    store_id, roster_id, event_type, actor_user_id, metadata
  ) values (
    target_store_id, target_roster.id, 'week_copied', actor_id,
    jsonb_build_object('sourceWeekStart', source_week, 'copiedShifts', copied_count)
  );
  perform public.append_audit(target_store_id, 'roster.week_copied', jsonb_build_object(
    'sourceWeekStart', source_week, 'targetWeekStart', target_week, 'copiedShifts', copied_count
  ));
  return jsonb_build_object('rosterId', target_roster.id, 'copiedShifts', copied_count);
end;
$$;

create or replace function public.publish_workforce_roster(target_store_id uuid, payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare actor_id uuid := (select auth.uid());
declare target_week date;
declare roster_record public.workforce_rosters%rowtype;
begin
  if actor_id is null or not private.has_store_role(target_store_id, array['owner', 'manager']) then
    raise exception using errcode = '42501', message = 'roster:forbidden:Alleen een manager of zaakvoerder kan een rooster publiceren.';
  end if;
  begin target_week := (payload ->> 'weekStart')::date;
  exception when invalid_text_representation then
    raise exception using errcode = 'P0001', message = 'roster:invalid-week:De gekozen week is ongeldig.';
  end;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    target_store_id::text || ':roster:' || target_week::text, 0
  ));
  select * into roster_record from public.workforce_rosters
  where store_id = target_store_id and week_start = target_week for update;
  if roster_record.id is null or not exists (
    select 1 from public.workforce_shifts shift
    where shift.store_id = target_store_id and shift.roster_id = roster_record.id
  ) then
    raise exception using errcode = 'P0001', message = 'roster:empty:Voeg eerst minstens één concrete shift toe.';
  end if;
  if roster_record.status <> 'draft' then
    return jsonb_build_object('rosterId', roster_record.id, 'status', roster_record.status, 'version', roster_record.version);
  end if;
  if nullif(payload ->> 'expectedRosterVersion', '') is not null
     and roster_record.version <> (payload ->> 'expectedRosterVersion')::integer then
    raise exception using errcode = '40001', message = 'roster:version-conflict:Iemand anders heeft deze week gewijzigd. Vernieuw het rooster.';
  end if;
  if exists (
    select 1 from public.workforce_shifts shift
    join public.workforce_employees employee
      on employee.store_id = shift.store_id and employee.id = shift.employee_id
    join public.leave_requests request
      on request.store_id = shift.store_id and request.employee_id = shift.employee_id
      and request.status = 'approved'
      and (shift.starts_at at time zone employee.timezone)::date between request.start_date and request.end_date
    where shift.store_id = target_store_id and shift.roster_id = roster_record.id
  ) then
    raise exception using errcode = 'P0001', message = 'roster:leave-conflict:Los de shifts met goedgekeurd verlof op voordat je publiceert.';
  end if;
  update public.workforce_rosters set
    status = 'published', version = version + 1,
    published_at = now(), published_by_user_id = actor_id
  where id = roster_record.id
  returning * into roster_record;
  insert into public.workforce_roster_events (
    store_id, roster_id, event_type, actor_user_id, metadata
  ) values (target_store_id, roster_record.id, 'published', actor_id, jsonb_build_object('version', roster_record.version));
  perform public.append_audit(target_store_id, 'roster.published', jsonb_build_object(
    'rosterId', roster_record.id, 'weekStart', target_week, 'version', roster_record.version
  ));
  return jsonb_build_object('rosterId', roster_record.id, 'status', roster_record.status, 'version', roster_record.version);
end;
$$;

create or replace function public.reopen_workforce_roster(target_store_id uuid, payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare actor_id uuid := (select auth.uid());
declare target_week date;
declare roster_record public.workforce_rosters%rowtype;
begin
  if actor_id is null or not private.has_store_role(target_store_id, array['owner', 'manager']) then
    raise exception using errcode = '42501', message = 'roster:forbidden:Alleen een manager of zaakvoerder kan een rooster heropenen.';
  end if;
  begin target_week := (payload ->> 'weekStart')::date;
  exception when invalid_text_representation then
    raise exception using errcode = 'P0001', message = 'roster:invalid-week:De gekozen week is ongeldig.';
  end;
  select * into roster_record from public.workforce_rosters
  where store_id = target_store_id and week_start = target_week for update;
  if roster_record.id is null then
    raise exception using errcode = 'P0001', message = 'roster:not-found:Voor deze week bestaat nog geen rooster.';
  end if;
  if roster_record.status = 'locked' then
    raise exception using errcode = 'P0001', message = 'roster:locked:Deze week is definitief vergrendeld.';
  end if;
  if roster_record.status = 'draft' then
    return jsonb_build_object('rosterId', roster_record.id, 'status', roster_record.status, 'version', roster_record.version);
  end if;
  update public.workforce_rosters set status = 'draft', version = version + 1
  where id = roster_record.id returning * into roster_record;
  insert into public.workforce_roster_events (
    store_id, roster_id, event_type, actor_user_id, metadata
  ) values (target_store_id, roster_record.id, 'reopened', actor_id, jsonb_build_object('version', roster_record.version));
  perform public.append_audit(target_store_id, 'roster.reopened', jsonb_build_object(
    'rosterId', roster_record.id, 'weekStart', target_week, 'version', roster_record.version
  ));
  return jsonb_build_object('rosterId', roster_record.id, 'status', roster_record.status, 'version', roster_record.version);
end;
$$;

create or replace function public.save_workforce_pattern(target_store_id uuid, payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare actor_id uuid := (select auth.uid());
declare target_employee_id uuid;
declare effective_on date;
declare start_value time;
declare end_value time;
declare break_value integer;
declare scheduled_value integer;
declare selected_weekdays integer[];
declare target_weekday integer;
begin
  if actor_id is null or not private.has_store_role(target_store_id, array['owner', 'manager']) then
    raise exception using errcode = '42501', message = 'roster:forbidden:Alleen een manager of zaakvoerder kan werkpatronen beheren.';
  end if;
  begin
    target_employee_id := (payload ->> 'employeeId')::uuid;
    effective_on := coalesce(nullif(payload ->> 'effectiveFrom', '')::date, current_date);
    start_value := (payload ->> 'startTime')::time;
    end_value := (payload ->> 'endTime')::time;
    break_value := coalesce((payload ->> 'breakMinutes')::integer, 0);
    select coalesce(array_agg(value::integer), array[]::integer[]) into selected_weekdays
    from jsonb_array_elements_text(coalesce(payload -> 'weekdays', '[]'::jsonb));
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception using errcode = 'P0001', message = 'roster:invalid-pattern:Controleer de werkdagen en uren.';
  end;
  if not exists (
    select 1 from public.workforce_employees
    where store_id = target_store_id and id = target_employee_id and employment_status = 'active'
  ) then
    raise exception using errcode = 'P0001', message = 'roster:employee-not-found:De medewerker is niet actief in deze winkel.';
  end if;
  if cardinality(selected_weekdays) = 0
     or exists (select 1 from unnest(selected_weekdays) day where day not between 1 and 7)
     or end_value <= start_value or break_value < 0 then
    raise exception using errcode = 'P0001', message = 'roster:invalid-pattern:Kies minstens één werkdag en geldige uren.';
  end if;
  scheduled_value := private.workforce_pattern_minutes(start_value, end_value, break_value);
  if scheduled_value <= 0 then
    raise exception using errcode = 'P0001', message = 'roster:invalid-pattern:De pauze moet korter zijn dan de werkdag.';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    target_store_id::text || ':pattern:' || target_employee_id::text, 0
  ));
  update public.employee_work_patterns pattern
  set effective_until = effective_on - 1
  where pattern.store_id = target_store_id and pattern.employee_id = target_employee_id
    and pattern.effective_from < effective_on
    and (pattern.effective_until is null or pattern.effective_until >= effective_on);

  for target_weekday in 1..7 loop
    insert into public.employee_work_patterns (
      store_id, employee_id, weekday, scheduled_minutes, start_time, end_time,
      break_minutes, role_label, location_label, effective_from
    ) values (
      target_store_id, target_employee_id, target_weekday,
      case when target_weekday = any(selected_weekdays) then scheduled_value else 0 end,
      case when target_weekday = any(selected_weekdays) then start_value else null end,
      case when target_weekday = any(selected_weekdays) then end_value else null end,
      case when target_weekday = any(selected_weekdays) then break_value else 0 end,
      case when target_weekday = any(selected_weekdays) then nullif(btrim(payload ->> 'roleLabel'), '') else null end,
      case when target_weekday = any(selected_weekdays) then nullif(btrim(payload ->> 'locationLabel'), '') else null end,
      effective_on
    )
    on conflict (store_id, employee_id, weekday, effective_from) do update set
      scheduled_minutes = excluded.scheduled_minutes,
      start_time = excluded.start_time,
      end_time = excluded.end_time,
      break_minutes = excluded.break_minutes,
      role_label = excluded.role_label,
      location_label = excluded.location_label,
      effective_until = null;
  end loop;
  perform public.append_audit(target_store_id, 'roster.pattern_saved', jsonb_build_object(
    'employeeId', target_employee_id, 'weekdays', to_jsonb(selected_weekdays),
    'startTime', start_value, 'endTime', end_value, 'effectiveFrom', effective_on
  ));
  return jsonb_build_object('employeeId', target_employee_id, 'saved', true, 'effectiveFrom', effective_on);
end;
$$;

alter table public.workforce_rosters enable row level security;
alter table public.workforce_shifts enable row level security;
alter table public.workforce_availability_exceptions enable row level security;
alter table public.workforce_roster_events enable row level security;

create policy workforce_rosters_read on public.workforce_rosters
  for select to authenticated using (private.is_store_member(store_id));
create policy workforce_shifts_read on public.workforce_shifts
  for select to authenticated using (
    private.has_store_role(store_id, array['owner', 'manager']) or (
      exists (
        select 1 from public.workforce_employees employee
        where employee.store_id = workforce_shifts.store_id
          and employee.id = workforce_shifts.employee_id and employee.user_id = (select auth.uid())
      )
      and exists (
        select 1 from public.workforce_rosters roster
        where roster.store_id = workforce_shifts.store_id and roster.id = workforce_shifts.roster_id
          and roster.status in ('published', 'locked')
      )
    )
  );
create policy workforce_availability_read on public.workforce_availability_exceptions
  for select to authenticated using (
    private.has_store_role(store_id, array['owner', 'manager']) or exists (
      select 1 from public.workforce_employees employee
      where employee.store_id = workforce_availability_exceptions.store_id
        and employee.id = workforce_availability_exceptions.employee_id
        and employee.user_id = (select auth.uid())
    )
  );
create policy workforce_roster_events_read on public.workforce_roster_events
  for select to authenticated using (private.has_store_role(store_id, array['owner', 'manager']));

grant select on public.workforce_rosters, public.workforce_shifts,
  public.workforce_availability_exceptions, public.workforce_roster_events
to authenticated;
revoke insert, update, delete on public.workforce_rosters, public.workforce_shifts,
  public.workforce_availability_exceptions, public.workforce_roster_events
from authenticated;
grant usage, select on sequence public.workforce_roster_events_id_seq to authenticated;

revoke all on function private.workforce_week_start(date) from public;
revoke all on function private.workforce_pattern_minutes(time, time, integer) from public;
revoke all on function private.workforce_shift_json(uuid) from public;
revoke all on function private.ensure_workforce_roster(uuid, date, uuid) from public;

revoke all on function public.get_workforce_roster(uuid, date, date) from public, anon;
revoke all on function public.save_workforce_shift(uuid, jsonb) from public, anon;
revoke all on function public.delete_workforce_shift(uuid, jsonb) from public, anon;
revoke all on function public.apply_workforce_patterns(uuid, jsonb) from public, anon;
revoke all on function public.copy_workforce_week(uuid, jsonb) from public, anon;
revoke all on function public.publish_workforce_roster(uuid, jsonb) from public, anon;
revoke all on function public.reopen_workforce_roster(uuid, jsonb) from public, anon;
revoke all on function public.save_workforce_pattern(uuid, jsonb) from public, anon;

grant execute on function public.get_workforce_roster(uuid, date, date) to authenticated;
grant execute on function public.save_workforce_shift(uuid, jsonb) to authenticated;
grant execute on function public.delete_workforce_shift(uuid, jsonb) to authenticated;
grant execute on function public.apply_workforce_patterns(uuid, jsonb) to authenticated;
grant execute on function public.copy_workforce_week(uuid, jsonb) to authenticated;
grant execute on function public.publish_workforce_roster(uuid, jsonb) to authenticated;
grant execute on function public.reopen_workforce_roster(uuid, jsonb) to authenticated;
grant execute on function public.save_workforce_pattern(uuid, jsonb) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'workforce_rosters'
  ) then
    alter publication supabase_realtime add table public.workforce_rosters;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'workforce_shifts'
  ) then
    alter publication supabase_realtime add table public.workforce_shifts;
  end if;
end;
$$;

commit;
