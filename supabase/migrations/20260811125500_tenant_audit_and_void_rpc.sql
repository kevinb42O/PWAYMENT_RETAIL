alter table public.void_entries add column client_request_id text;
create unique index void_entries_store_request_unique
  on public.void_entries (store_id, client_request_id)
  where client_request_id is not null;

create or replace function public.append_audit(
  target_store_id uuid,
  event_action text,
  event_detail jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  actor_name text;
  audit_id uuid;
begin
  if actor_id is null or not private.is_store_member(target_store_id) then
    raise exception using errcode = '42501', message = 'audit:forbidden:Geen toegang tot deze winkel.';
  end if;
  if nullif(btrim(event_action), '') is null or length(event_action) > 100 then
    raise exception using errcode = 'P0001', message = 'audit:invalid-action:Ongeldige auditactie.';
  end if;
  select coalesce(p.display_name, split_part(u.email, '@', 1), 'Gebruiker')
  into actor_name from auth.users u
  left join public.profiles p on p.id = u.id where u.id = actor_id;
  insert into public.audit_entries (
    store_id, user_id, user_name, action, detail, source
  ) values (
    target_store_id, actor_id, actor_name, event_action, event_detail, 'app'
  ) returning id into audit_id;
  return audit_id;
end;
$$;

create or replace function public.record_void(
  target_store_id uuid,
  payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  actor_name text;
  request_id text := nullif(btrim(payload ->> 'client_request_id'), '');
  product_external_id text := nullif(btrim(payload ->> 'product_id'), '');
  product_id uuid;
  quantity integer;
  amount_cents bigint;
  table_id integer;
  void_id uuid;
begin
  if actor_id is null or not private.has_store_role(target_store_id, array['owner', 'manager', 'cashier']) then
    raise exception using errcode = '42501', message = 'void:forbidden:Geen toegang tot deze winkel.';
  end if;
  if request_id is null or nullif(btrim(payload ->> 'reason'), '') is null then
    raise exception using errcode = 'P0001', message = 'void:invalid-request:Een reden is verplicht.';
  end if;
  select id into void_id from public.void_entries
  where store_id = target_store_id and client_request_id = request_id;
  if void_id is not null then return void_id; end if;
  begin
    quantity := (payload ->> 'quantity')::integer;
    amount_cents := (payload ->> 'amount_cents')::bigint;
    table_id := (payload ->> 'table_id')::integer;
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception using errcode = 'P0001', message = 'void:invalid-request:Ongeldige annulering.';
  end;
  if quantity <= 0 or amount_cents < 0 or table_id <= 0 then
    raise exception using errcode = 'P0001', message = 'void:invalid-request:Ongeldige annulering.';
  end if;
  select id into product_id from public.products
  where store_id = target_store_id
    and (external_id = product_external_id or id::text = product_external_id);
  if product_id is null then
    raise exception using errcode = 'P0001', message = 'void:product-not-found:Product bestaat niet meer.';
  end if;
  select coalesce(p.display_name, split_part(u.email, '@', 1), 'Gebruiker')
  into actor_name from auth.users u
  left join public.profiles p on p.id = u.id where u.id = actor_id;
  insert into public.void_entries (
    store_id, occurred_at, table_id, product_id, product_name, quantity,
    amount_cents, reason, by_user_id, by_user_name, client_request_id
  ) values (
    target_store_id, clock_timestamp(), table_id, product_id,
    coalesce(nullif(payload ->> 'product_name', ''), 'Product'), quantity,
    amount_cents, btrim(payload ->> 'reason'), actor_id, actor_name, request_id
  ) returning id into void_id;
  return void_id;
end;
$$;

revoke all on function public.append_audit(uuid, text, jsonb) from public, anon;
grant execute on function public.append_audit(uuid, text, jsonb) to authenticated;
revoke all on function public.record_void(uuid, jsonb) from public, anon;
grant execute on function public.record_void(uuid, jsonb) to authenticated;
