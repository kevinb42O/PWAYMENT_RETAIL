-- Factures are not a visual preference: a completed invoice must have a
-- durable customer relation and its own immutable recipient snapshot.
alter table public.customers
  add column if not exists billing_profile jsonb;

alter table public.transactions
  add column if not exists document_request jsonb,
  add column if not exists invoice_number text,
  add column if not exists invoice_issued_at timestamptz;

alter table public.transactions
  drop constraint if exists transactions_document_request_valid;
alter table public.transactions
  add constraint transactions_document_request_valid check (
    document_request is null or jsonb_typeof(document_request) = 'object'
  );

create unique index if not exists transactions_invoice_number_unique
  on public.transactions (store_id, invoice_number)
  where invoice_number is not null;

-- Extend the existing authoritative checkout function without duplicating its
-- inventory/payment implementation. The replacements are guarded so schema
-- drift fails deployment loudly rather than silently producing partial invoices.
do $migration$
declare
  definition text;
  rewritten text;
  declaration_needle text := $needle$  customer_id uuid;
  discount_approver_id uuid;$needle$;
  declaration_replacement text := $replacement$  customer_id uuid;
  discount_approver_id uuid;
  invoice_type text := coalesce(payload -> 'document_request' ->> 'type', 'receipt');
  invoice_recipient jsonb := payload -> 'document_request' -> 'recipient';
  invoice_customer jsonb := payload -> 'invoice_customer';
  invoice_number text;
  invoice_sequence bigint;$replacement$;
  customer_needle text := $needle$  if nullif(payload ->> 'customer_id', '') is not null then
    select id into customer_id$needle$;
  customer_replacement text := $replacement$  -- Invoice customers are upserted inside the sale transaction. This makes a
  -- customer, its link and its invoice inseparable at the server boundary.
  if invoice_type not in ('receipt', 'invoice-b2c', 'invoice-b2b') then
    raise exception using errcode = 'P0001', message = 'checkout:invalid-request:Ongeldig documenttype.';
  end if;
  if invoice_type <> 'receipt' then
    if invoice_recipient is null or jsonb_typeof(invoice_recipient) <> 'object'
       or nullif(btrim(invoice_recipient ->> 'name'), '') is null
       or nullif(btrim(invoice_recipient ->> 'addressLine1'), '') is null
       or nullif(btrim(invoice_recipient ->> 'postalCode'), '') is null
       or nullif(btrim(invoice_recipient ->> 'city'), '') is null
       or nullif(btrim(invoice_recipient ->> 'countryCode'), '') is null
       or (invoice_type = 'invoice-b2b' and (
            nullif(btrim(invoice_recipient ->> 'companyName'), '') is null
            or nullif(btrim(invoice_recipient ->> 'vatNumber'), '') is null
          )) then
      raise exception using errcode = 'P0001', message = 'checkout:invalid-request:Volledige factuurgegevens zijn verplicht.';
    end if;
    if invoice_customer is not null and jsonb_typeof(invoice_customer) = 'object'
       and nullif(btrim(invoice_customer ->> 'external_id'), '') is not null then
      insert into public.customers (
        store_id, external_id, name, email, phone, address, billing_profile,
        total_spent_cents, visit_count, is_active
      ) values (
        target_store_id,
        btrim(invoice_customer ->> 'external_id'),
        coalesce(nullif(btrim(invoice_customer ->> 'name'), ''), btrim(invoice_recipient ->> 'name')),
        nullif(btrim(invoice_customer ->> 'email'), ''),
        nullif(btrim(invoice_customer ->> 'phone'), ''),
        nullif(btrim(invoice_customer ->> 'address'), ''),
        jsonb_build_object(
          'type', case when invoice_type = 'invoice-b2b' then 'business' else 'individual' end,
          'companyName', nullif(btrim(invoice_recipient ->> 'companyName'), ''),
          'contactName', btrim(invoice_recipient ->> 'name'),
          'addressLine1', btrim(invoice_recipient ->> 'addressLine1'),
          'postalCode', btrim(invoice_recipient ->> 'postalCode'),
          'city', btrim(invoice_recipient ->> 'city'),
          'countryCode', upper(btrim(invoice_recipient ->> 'countryCode')),
          'vatNumber', nullif(upper(btrim(invoice_recipient ->> 'vatNumber')), ''),
          'email', nullif(lower(btrim(invoice_recipient ->> 'email')), ''),
          'purchaseOrderReference', nullif(btrim(invoice_recipient ->> 'purchaseOrderReference'), '')
        ),
        0, 0, true
      ) on conflict (store_id, external_id) do update set
        name = excluded.name,
        email = coalesce(excluded.email, public.customers.email),
        phone = coalesce(excluded.phone, public.customers.phone),
        address = coalesce(excluded.address, public.customers.address),
        billing_profile = excluded.billing_profile,
        is_active = true,
        updated_at = now();
    end if;
    if nullif(payload ->> 'customer_id', '') is null then
      raise exception using errcode = 'P0001', message = 'checkout:invalid-request:Een factuur vereist een gekoppelde klant.';
    end if;
  end if;

  if nullif(payload ->> 'customer_id', '') is not null then
    select id into customer_id$replacement$;
  insert_needle text := $needle$  insert into public.transactions (
    store_id, external_id, client_request_id, document_number, table_id,$needle$;
  insert_replacement text := $replacement$  if invoice_type <> 'receipt' then
    insert into private.store_counters (store_id, counter_name, value)
    values (
      target_store_id,
      'invoice-' || extract(year from checkout_at)::integer,
      (select count(*) + 1 from public.transactions counted_transaction
        where counted_transaction.store_id = target_store_id
          and counted_transaction.invoice_number is not null
          and extract(year from counted_transaction.occurred_at) = extract(year from checkout_at))
    ) on conflict (store_id, counter_name)
      do update set value = private.store_counters.value + 1
      returning value into invoice_sequence;
    invoice_number := 'INV-' || extract(year from checkout_at)::integer || '-' || lpad(invoice_sequence::text, 8, '0');
  end if;

  insert into public.transactions (
    store_id, external_id, client_request_id, document_number, table_id,$replacement$;
  columns_needle text := $needle$    user_id, user_name, customer_id, source, kind, merchant_snapshot,
    register_id, shift_id$needle$;
  columns_replacement text := $replacement$    user_id, user_name, customer_id, source, kind, merchant_snapshot,
    document_request, invoice_number, invoice_issued_at, register_id, shift_id$replacement$;
  values_needle text := $needle$    coalesce(payload -> 'merchant_snapshot', '{}'::jsonb), target_register_id, shift_id$needle$;
  values_replacement text := $replacement$    coalesce(payload -> 'merchant_snapshot', '{}'::jsonb),
    case when invoice_type = 'receipt' then jsonb_build_object('type', 'receipt')
         else jsonb_build_object('type', invoice_type, 'recipient', invoice_recipient) end,
    invoice_number, case when invoice_number is null then null else checkout_at end,
    target_register_id, shift_id$replacement$;
  return_needle text := $needle$      'document_number', document_number,
      'duplicate', false$needle$;
  return_replacement text := $replacement$      'document_number', document_number,
      'invoice_number', invoice_number,
      'invoice_issued_at', case when invoice_number is null then null else checkout_at end,
      'duplicate', false$replacement$;
begin
  select pg_get_functiondef('public.checkout_sale(uuid,jsonb)'::regprocedure) into strict definition;
  if position('invoice_customer jsonb' in definition) > 0 then return; end if;
  rewritten := replace(definition, declaration_needle, declaration_replacement);
  if rewritten = definition then raise exception 'Could not patch checkout_sale invoice declarations.'; end if;
  definition := rewritten;
  rewritten := replace(definition, customer_needle, customer_replacement);
  if rewritten = definition then raise exception 'Could not patch checkout_sale invoice customer handling.'; end if;
  definition := rewritten;
  rewritten := replace(definition, insert_needle, insert_replacement);
  if rewritten = definition then raise exception 'Could not patch checkout_sale invoice numbering.'; end if;
  definition := rewritten;
  rewritten := replace(definition, columns_needle, columns_replacement);
  if rewritten = definition then raise exception 'Could not patch checkout_sale invoice columns.'; end if;
  definition := rewritten;
  rewritten := replace(definition, values_needle, values_replacement);
  if rewritten = definition then raise exception 'Could not patch checkout_sale invoice values.'; end if;
  definition := rewritten;
  rewritten := replace(definition, return_needle, return_replacement);
  if rewritten = definition then raise exception 'Could not patch checkout_sale invoice response.'; end if;
  execute rewritten;
end;
$migration$;
