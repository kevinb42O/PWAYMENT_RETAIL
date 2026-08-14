-- Migration: save_workforce_employee RPC
-- Allows store owners and managers to create or update workforce employees with
-- their contract hours, competencies, and automated leave account provisioning.

create or replace function public.save_workforce_employee(
  target_store_id uuid,
  payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  employee_id uuid;
  input_id text := payload ->> 'id';
  input_display_name text := btrim(coalesce(payload ->> 'displayName', ''));
  input_employee_number text := nullif(btrim(coalesce(payload ->> 'employeeNumber', '')), '');
  input_email text := nullif(lower(btrim(coalesce(payload ->> 'email', ''))), '');
  input_status text := coalesce(nullif(payload ->> 'status', ''), 'active');
  input_start_date date := coalesce((payload ->> 'startDate')::date, current_date);
  input_weekly_minutes integer := coalesce((payload ->> 'weeklyMinutes')::integer, 2280);
  current_year integer := extract(year from now())::integer;
  competency_item text;
  statutory_type_id uuid;
begin
  if actor_id is null
     or not private.has_store_role(target_store_id, array['owner', 'manager']) then
    raise exception using errcode = '42501', message = 'workforce:forbidden:Je hebt geen rechten om personeelsleden te beheren.';
  end if;

  if not private.has_entitlement(target_store_id, 'workforce.core') then
    raise exception using errcode = 'P0001', message = 'entitlement:plan-required:workforce.core';
  end if;

  if char_length(input_display_name) < 1 or char_length(input_display_name) > 160 then
    raise exception using errcode = 'P0001', message = 'workforce:invalid-name:Vul een geldige naam in van maximaal 160 tekens.';
  end if;

  if input_employee_number is null then
    input_employee_number := 'EMP-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
  end if;

  if input_id is not null and input_id ~ '^[0-9a-fA-F-]{36}$' then
    employee_id := input_id::uuid;
    update public.workforce_employees
    set display_name = input_display_name,
        employee_number = input_employee_number,
        email = input_email,
        employment_status = input_status,
        employment_start_date = input_start_date,
        updated_at = now()
    where id = employee_id and store_id = target_store_id;
  else
    insert into public.workforce_employees (
      store_id,
      display_name,
      employee_number,
      email,
      employment_status,
      employment_start_date
    ) values (
      target_store_id,
      input_display_name,
      input_employee_number,
      input_email,
      input_status,
      input_start_date
    )
    returning id into employee_id;
  end if;

  -- Ensure leave types exist and provision initial leave accounts for current & next year
  select id into statutory_type_id from public.leave_types
  where store_id = target_store_id and code = 'statutory-vacation'
  limit 1;

  if statutory_type_id is not null then
    insert into public.leave_accounts (
      store_id, employee_id, leave_type_id, balance_year, entitlement_status, opening_minutes
    ) values
      (target_store_id, employee_id, statutory_type_id, current_year, 'confirmed', (input_weekly_minutes * 4)),
      (target_store_id, employee_id, statutory_type_id, current_year + 1, 'estimated', (input_weekly_minutes * 4))
    on conflict (store_id, employee_id, leave_type_id, balance_year) do update
      set opening_minutes = excluded.opening_minutes;
  end if;

  -- Sync competencies if provided in payload
  if payload ? 'competencyIds' and jsonb_typeof(payload -> 'competencyIds') = 'array' then
    delete from public.workforce_employee_competencies
    where store_id = target_store_id and employee_id = employee_id;

    for competency_item in select jsonb_array_elements_text(payload -> 'competencyIds')
    loop
      if competency_item ~ '^[0-9a-fA-F-]{36}$' then
        insert into public.workforce_employee_competencies (
          store_id, employee_id, competency_id
        ) values (
          target_store_id, employee_id, competency_item::uuid
        ) on conflict do nothing;
      end if;
    end loop;
  end if;

  return jsonb_build_object(
    'id', employee_id,
    'displayName', input_display_name,
    'employeeNumber', input_employee_number,
    'email', input_email,
    'status', input_status,
    'startDate', input_start_date,
    'weeklyMinutes', input_weekly_minutes
  );
end;
$$;

grant execute on function public.save_workforce_employee(uuid, jsonb) to authenticated;
