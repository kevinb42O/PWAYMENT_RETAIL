-- A store must be operational immediately after signup, before its first
-- asynchronous offline-outbox checkout reaches the server. Provision the
-- canonical register at the store boundary and repair stores created earlier.

create or replace function private.provision_default_register()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.registers (store_id, external_id, name, is_active)
  values (new.id, 'retail-register-1', 'Kassa 1', true)
  on conflict (store_id, external_id) do update
    set is_active = true;
  return new;
end;
$$;

revoke all on function private.provision_default_register() from public;

drop trigger if exists stores_provision_default_register on public.stores;
create trigger stores_provision_default_register
  after insert on public.stores
  for each row execute function private.provision_default_register();

insert into public.registers (store_id, external_id, name, is_active)
select store.id, 'retail-register-1', 'Kassa 1', true
from public.stores as store
where not exists (
  select 1
  from public.registers as register
  where register.store_id = store.id
    and register.external_id = 'retail-register-1'
)
on conflict (store_id, external_id) do update
  set is_active = true;
