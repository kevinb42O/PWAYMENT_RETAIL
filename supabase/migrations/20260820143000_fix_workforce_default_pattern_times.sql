begin;

-- `ensure_workforce_defaults` predates the start/end-time columns. When it
-- creates a default pattern for a newly active member, normalize missing time
-- values before the roster-grid constraint is evaluated.
create or replace function private.set_employee_work_pattern_time_defaults()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.scheduled_minutes > 0 and new.start_time is null then
    new.start_time := time '09:00';
  end if;

  if new.scheduled_minutes > 0 and new.end_time is null then
    new.end_time := new.start_time + make_interval(
      mins => new.scheduled_minutes + coalesce(new.break_minutes, 0)
    );
  end if;

  return new;
end;
$$;

drop trigger if exists employee_work_patterns_set_time_defaults
  on public.employee_work_patterns;

create trigger employee_work_patterns_set_time_defaults
  before insert or update of scheduled_minutes, start_time, end_time, break_minutes
  on public.employee_work_patterns
  for each row execute function private.set_employee_work_pattern_time_defaults();

revoke all on function private.set_employee_work_pattern_time_defaults()
  from public, anon, authenticated;

commit;
