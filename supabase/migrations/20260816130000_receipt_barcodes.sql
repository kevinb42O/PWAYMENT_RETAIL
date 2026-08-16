-- Immutable, opaque lookup codes for receipt scans. They are deliberately
-- separate from legal document numbers and product EAN/UPC barcodes.
alter table public.transactions
  add column if not exists receipt_barcode text,
  add column if not exists receipt_barcode_version smallint not null default 1
    check (receipt_barcode_version = 1);

create or replace function private.receipt_luhn_check_digit(value text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  idx integer;
  digit integer;
  total integer := 0;
  double_digit boolean := true;
begin
  if value !~ '^\d+$' then return null; end if;
  for idx in reverse length(value)..1 loop
    digit := substring(value from idx for 1)::integer;
    if double_digit then
      digit := digit * 2;
      if digit > 9 then digit := digit - 9; end if;
    end if;
    total := total + digit;
    double_digit := not double_digit;
  end loop;
  return ((10 - total % 10) % 10)::text;
end;
$$;

create or replace function private.is_valid_receipt_barcode(value text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select value ~ '^91[0-9]{18}$'
    and private.receipt_luhn_check_digit(left(value, 19)) = right(value, 1);
$$;

create or replace function private.generate_receipt_barcode()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  body text;
begin
  -- Hex is converted to decimal-looking entropy only; the code is a lookup
  -- value, never an authorisation secret.
  body := '91' || left(translate(encode(extensions.gen_random_bytes(12), 'hex'), 'abcdef', '123456'), 17);
  return body || private.receipt_luhn_check_digit(body);
end;
$$;

create or replace function private.assign_receipt_barcode()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested text := nullif(current_setting('pwayment.receipt_barcode', true), '');
begin
  if new.receipt_barcode is null then
    new.receipt_barcode := coalesce(requested, private.generate_receipt_barcode());
  end if;
  if not private.is_valid_receipt_barcode(new.receipt_barcode) then
    raise exception using errcode = 'P0001', message = 'receipt-barcode:invalid:Ongeldige ticketbarcode.';
  end if;
  new.receipt_barcode_version := 1;
  return new;
end;
$$;

drop trigger if exists transactions_assign_receipt_barcode on public.transactions;
create trigger transactions_assign_receipt_barcode
  before insert on public.transactions
  for each row execute function private.assign_receipt_barcode();

-- Backfill exactly once. Existing paper receipts remain manually searchable;
-- a reprint from now on includes the stable newly assigned code.
update public.transactions
set receipt_barcode = private.generate_receipt_barcode()
where receipt_barcode is null;

alter table public.transactions
  alter column receipt_barcode set not null;

create unique index if not exists transactions_store_receipt_barcode_unique
  on public.transactions (store_id, receipt_barcode);

-- Preserve the current complete financial RPC implementations behind private
-- names. Public wrappers validate the supplied code, bind it transactionally
-- to the insert trigger and expose it to offline clients after sync.
do $$
begin
  if exists (select 1 from pg_proc where proname = 'checkout_sale' and pronamespace = 'public'::regnamespace)
     and not exists (select 1 from pg_proc where proname = 'checkout_sale_v1' and pronamespace = 'public'::regnamespace) then
    alter function public.checkout_sale(uuid, jsonb) rename to checkout_sale_v1;
  end if;
  if exists (select 1 from pg_proc where proname = 'refund_sale' and pronamespace = 'public'::regnamespace)
     and not exists (select 1 from pg_proc where proname = 'refund_sale_v1' and pronamespace = 'public'::regnamespace) then
    alter function public.refund_sale(uuid, jsonb) rename to refund_sale_v1;
  end if;
end;
$$;

create or replace function public.checkout_sale(target_store_id uuid, payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  code text := nullif(btrim(payload ->> 'receipt_barcode'), '');
  result jsonb;
  transaction_id uuid;
begin
  if code is not null and not private.is_valid_receipt_barcode(code) then
    raise exception using errcode = 'P0001', message = 'checkout:invalid-request:Ongeldige ticketbarcode.';
  end if;
  perform set_config('pwayment.receipt_barcode', coalesce(code, ''), true);
  result := public.checkout_sale_v1(target_store_id, payload);
  transaction_id := (result ->> 'transaction_id')::uuid;
  return result || jsonb_build_object(
    'receipt_barcode', (select receipt_barcode from public.transactions where id = transaction_id)
  );
end;
$$;

create or replace function public.refund_sale(target_store_id uuid, payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  code text := nullif(btrim(payload ->> 'receipt_barcode'), '');
  result jsonb;
  transaction_id uuid;
begin
  if code is not null and not private.is_valid_receipt_barcode(code) then
    raise exception using errcode = 'P0001', message = 'refund:invalid-request:Ongeldige ticketbarcode.';
  end if;
  perform set_config('pwayment.receipt_barcode', coalesce(code, ''), true);
  result := public.refund_sale_v1(target_store_id, payload);
  transaction_id := (result ->> 'transaction_id')::uuid;
  return result || jsonb_build_object(
    'receipt_barcode', (select receipt_barcode from public.transactions where id = transaction_id)
  );
end;
$$;

revoke all on function public.checkout_sale(uuid, jsonb) from public, anon;
grant execute on function public.checkout_sale(uuid, jsonb) to authenticated;
revoke all on function public.refund_sale(uuid, jsonb) from public, anon;
grant execute on function public.refund_sale(uuid, jsonb) to authenticated;

create or replace function public.lookup_return_ticket(target_store_id uuid, barcode text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  transaction_record public.transactions%rowtype;
begin
  if not private.has_store_role(target_store_id, array['owner', 'manager', 'cashier']) then
    raise exception using errcode = '42501', message = 'receipt-lookup:forbidden:Geen toegang tot deze winkel.';
  end if;
  if not private.is_valid_receipt_barcode(barcode) then
    raise exception using errcode = 'P0001', message = 'receipt-lookup:invalid:Ongeldige ticketbarcode.';
  end if;
  select * into transaction_record from public.transactions
  where store_id = target_store_id and receipt_barcode = barcode;
  if not found then
    raise exception using errcode = 'P0001', message = 'receipt-lookup:not-found:Ticket niet gevonden in deze winkel.';
  end if;
  return jsonb_build_object(
    'transaction_id', transaction_record.id,
    'document_number', transaction_record.document_number,
    'kind', transaction_record.kind,
    'occurred_at', transaction_record.occurred_at
  );
end;
$$;

revoke all on function public.lookup_return_ticket(uuid, text) from public, anon;
grant execute on function public.lookup_return_ticket(uuid, text) to authenticated;
