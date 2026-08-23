-- Durable PSP reconciliation proof for Mollie in-person payments. The checkout
-- RPC remains provider-agnostic; this narrowly scoped follow-up RPC is retried
-- by the same durable outbox item after the sale exists on the server.

alter table public.transactions
  add column if not exists payment_provider text,
  add column if not exists payment_provider_reference text;

alter table public.transactions
  drop constraint if exists transactions_payment_provider_check;
alter table public.transactions
  add constraint transactions_payment_provider_check
  check (payment_provider is null or payment_provider = 'mollie');

create unique index if not exists transactions_mollie_reference_unique
  on public.transactions (payment_provider, payment_provider_reference)
  where payment_provider_reference is not null;

create or replace function public.record_payment_provider_reference(
  target_store_id uuid,
  request_id text,
  provider_name text,
  provider_reference text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  sale public.transactions%rowtype;
begin
  if not (select private.is_store_member(target_store_id)) then
    raise exception 'forbidden';
  end if;
  if provider_name <> 'mollie'
     or provider_reference !~ '^tr_[A-Za-z0-9]+$'
     or nullif(btrim(request_id), '') is null then
    raise exception 'invalid payment provider reference';
  end if;

  select * into sale
  from public.transactions
  where store_id = target_store_id and client_request_id = request_id
  for update;
  if not found then raise exception 'transaction not found'; end if;
  if sale.payment_method not in ('PIN', 'Split') then
    raise exception 'electronic tender required';
  end if;
  if sale.payment_provider_reference is not null
     and (sale.payment_provider <> provider_name
       or sale.payment_provider_reference <> provider_reference) then
    raise exception 'payment provider reference conflict';
  end if;

  update public.transactions
  set payment_provider = provider_name,
      payment_provider_reference = provider_reference
  where id = sale.id;
end;
$$;

revoke all on function public.record_payment_provider_reference(uuid, text, text, text) from public;
grant execute on function public.record_payment_provider_reference(uuid, text, text, text) to authenticated;
