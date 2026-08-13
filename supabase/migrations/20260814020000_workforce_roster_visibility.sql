begin;

drop policy if exists workforce_rosters_read on public.workforce_rosters;
create policy workforce_rosters_read on public.workforce_rosters
  for select to authenticated using (
    private.has_store_role(store_id, array['owner', 'manager'])
    or (
      status in ('published', 'locked')
      and exists (
        select 1 from public.workforce_employees employee
        where employee.store_id = workforce_rosters.store_id
          and employee.user_id = (select auth.uid())
      )
    )
  );

commit;
