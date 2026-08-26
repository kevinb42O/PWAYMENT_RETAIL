begin;

create or replace function public.get_pace_record_context(
  target_store_id uuid,
  record_plan jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  actor_role text;
  include_demo boolean;
  requested_entity text := coalesce(record_plan->>'entity', '');
  requested_limit integer := least(20, greatest(1, coalesce((record_plan->>'limit')::integer, 10)));
  requested_search text := pg_catalog.lower(pg_catalog.left(coalesce(record_plan->>'search', ''), 240));
  search_tokens text[] := '{}'::text[];
  result jsonb;
begin
  if actor_id is null or not private.is_store_member(target_store_id) then
    raise exception using errcode = '42501', message = 'pace-ai:forbidden:Geen toegang tot deze winkel.';
  end if;

  select membership.role, store.is_demo into actor_role, include_demo
  from public.store_memberships membership
  join public.stores store on store.id = membership.store_id
  where membership.store_id = target_store_id and membership.user_id = actor_id and membership.status = 'active';

  if requested_entity <> all(array['transaction','product','customer','gift_card','daily_report','purchase_order','webshop_order','service_order','stock_movement','employee','leave_request','audit_entry']) then
    raise exception using errcode = '22023', message = 'pace-ai:invalid-record-entity';
  end if;
  if actor_role = 'cashier' and requested_entity in ('audit_entry', 'purchase_order') then
    raise exception using errcode = '42501', message = 'pace-ai:role-restricted:Deze gegevens vereisen manager- of eigenaarstoegang.';
  end if;

  select coalesce(pg_catalog.array_agg(token), '{}'::text[]) into search_tokens
  from pg_catalog.regexp_split_to_table(requested_search, '[^a-z0-9-]+') token
  where pg_catalog.char_length(token) >= 3
    and token <> all(array['zoek','vind','toon','open','status','detail','details','welke','waar','wat','laatste','recent','historiek','saldo','mijn','deze','voor','van','met','heeft','product','artikel','klant','customer','medewerker','werknemer','kassier','ticket','transactie','factuur','webshoporder','order','herstel','service','cadeaubon','gift','card','rapport','audit','verlofaanvraag','voorraadbeweging']);

  if requested_entity = 'product' then
    select pg_catalog.jsonb_build_object('entity', requested_entity, 'basis', 'active and archived catalog products', 'rows', coalesce(pg_catalog.jsonb_agg(payload order by rank, label), '[]'::jsonb)) into result
    from (
      select case when product.is_active then 0 else 1 end as rank, product.name as label,
        pg_catalog.jsonb_build_object('id', product.id, 'name', product.name, 'sku', product.sku, 'barcode', product.barcode, 'variant', product.variant, 'brand', product.brand, 'category', product.category_name, 'priceCents', product.price_cents, 'costPriceCents', case when actor_role in ('owner','manager') then product.cost_price_cents else null end, 'stockQty', product.stock_qty, 'minStockQty', product.min_stock_qty, 'supplier', product.supplier, 'active', product.is_active, 'updatedAt', product.updated_at) as payload
      from public.products product where product.store_id = target_store_id and (include_demo or not product.is_demo)
        and (pg_catalog.cardinality(search_tokens) = 0 or exists (select 1 from pg_catalog.unnest(search_tokens) token where pg_catalog.lower(pg_catalog.concat_ws(' ', product.name, product.sku, product.barcode, product.variant, product.brand, product.category_name, product.supplier)) like '%' || token || '%'))
      order by rank, label limit requested_limit
    ) rows;
  elsif requested_entity = 'transaction' then
    select pg_catalog.jsonb_build_object('entity', requested_entity, 'basis', 'finalized and pending transaction headers with bounded line summaries', 'rows', coalesce(pg_catalog.jsonb_agg(payload order by occurred_at desc), '[]'::jsonb)) into result
    from (
      select txn.occurred_at,
        pg_catalog.jsonb_build_object('id', txn.id, 'documentNumber', txn.document_number, 'invoiceNumber', txn.invoice_number, 'kind', txn.kind, 'occurredAt', txn.occurred_at, 'totalCents', txn.total_cents, 'discountCents', txn.discount_cents, 'paymentMethod', txn.payment_method, 'source', txn.source, 'cashier', txn.user_name, 'finalized', txn.is_finalized, 'returnDisposition', txn.return_disposition, 'originalTransactionId', txn.original_transaction_id, 'lines', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('name', line.product_name, 'sku', line.sku, 'quantity', line.quantity, 'unitPriceCents', line.unit_price_cents, 'lineTotalCents', line.line_total_cents) order by line.created_at) from (select product_name, sku, quantity, unit_price_cents, line_total_cents, created_at from public.transaction_lines where store_id = target_store_id and transaction_id = txn.id order by created_at limit 25) line), '[]'::jsonb)) as payload
      from public.transactions txn where txn.store_id = target_store_id and (include_demo or not coalesce(txn.is_demo, false))
        and (pg_catalog.cardinality(search_tokens) = 0 or exists (select 1 from pg_catalog.unnest(search_tokens) token where pg_catalog.lower(pg_catalog.concat_ws(' ', txn.document_number, txn.invoice_number, txn.receipt_barcode, txn.external_id, txn.user_name)) like '%' || token || '%'))
      order by txn.occurred_at desc limit requested_limit
    ) rows;
  elsif requested_entity = 'customer' then
    select pg_catalog.jsonb_build_object('entity', requested_entity, 'basis', 'customer business summaries; contact details and notes excluded', 'rows', coalesce(pg_catalog.jsonb_agg(payload order by label), '[]'::jsonb)) into result
    from (
      select customer.name as label, pg_catalog.jsonb_build_object('id', customer.id, 'name', customer.name, 'active', customer.is_active, 'priceGroup', customer.price_group, 'totalSpentCents', customer.total_spent_cents, 'visitCount', customer.visit_count, 'lastVisitAt', customer.last_visit_at, 'createdAt', customer.created_at) as payload
      from public.customers customer where customer.store_id = target_store_id and (include_demo or not customer.is_demo)
        and (pg_catalog.cardinality(search_tokens) = 0 or exists (select 1 from pg_catalog.unnest(search_tokens) token where pg_catalog.lower(customer.name) like '%' || token || '%'))
      order by customer.is_active desc, customer.total_spent_cents desc limit requested_limit
    ) rows;
  elsif requested_entity = 'gift_card' then
    select pg_catalog.jsonb_build_object('entity', requested_entity, 'basis', 'gift-card balance and lifecycle; bearer code is masked', 'rows', coalesce(pg_catalog.jsonb_agg(payload order by issued_at desc), '[]'::jsonb)) into result
    from (
      select card.issued_at, pg_catalog.jsonb_build_object('id', card.id, 'maskedCode', '•••• ' || pg_catalog.right(card.code, 4), 'balanceCents', card.balance_cents, 'initialCents', card.initial_cents, 'active', card.is_active, 'issuedAt', card.issued_at, 'expiresAt', card.expires_at, 'customerId', card.customer_id) as payload
      from public.gift_cards card where card.store_id = target_store_id and (include_demo or not card.is_demo)
        and (pg_catalog.cardinality(search_tokens) = 0 or exists (select 1 from pg_catalog.unnest(search_tokens) token where pg_catalog.lower(card.code) like '%' || token || '%'))
      order by card.issued_at desc limit requested_limit
    ) rows;
  elsif requested_entity = 'daily_report' then
    select pg_catalog.jsonb_build_object('entity', requested_entity, 'basis', 'finalized Z-report headers and cash reconciliation', 'rows', coalesce(pg_catalog.jsonb_agg(payload order by occurred_at desc), '[]'::jsonb)) into result
    from (
      select report.occurred_at, pg_catalog.jsonb_build_object('id', report.id, 'reportNumber', report.report_number, 'occurredAt', report.occurred_at, 'closedBy', report.closed_by_user_name, 'expectedCashCents', report.expected_cash_cents, 'countedCashCents', report.counted_cash_cents, 'cashDifferenceCents', report.cash_difference_cents, 'cashDifferenceReason', report.cash_difference_reason, 'totals', report.totals) as payload
      from public.daily_reports report where report.store_id = target_store_id and (include_demo or not report.is_demo)
        and (pg_catalog.cardinality(search_tokens) = 0 or exists (select 1 from pg_catalog.unnest(search_tokens) token where report.report_number::text = token or pg_catalog.lower(coalesce(report.closed_by_user_name, '')) like '%' || token || '%'))
      order by report.occurred_at desc limit requested_limit
    ) rows;
  elsif requested_entity = 'purchase_order' then
    select pg_catalog.jsonb_build_object('entity', requested_entity, 'basis', 'purchase-order status with bounded product lines', 'rows', coalesce(pg_catalog.jsonb_agg(payload order by created_at desc), '[]'::jsonb)) into result
    from (
      select purchase.created_at, pg_catalog.jsonb_build_object('id', purchase.id, 'reference', purchase.reference, 'supplier', purchase.supplier, 'status', purchase.status, 'source', purchase.source, 'orderedAt', purchase.ordered_at, 'expectedDeliveryAt', purchase.expected_delivery_at, 'receivedAt', purchase.received_at, 'owner', purchase.owner_name, 'lines', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('name', line.product_name, 'sku', line.sku, 'orderedQty', line.ordered_qty, 'receivedQty', line.received_qty, 'unitCostCents', line.unit_cost_cents) order by line.product_name) from (select product_name, sku, ordered_qty, received_qty, unit_cost_cents from public.purchase_order_lines where store_id = target_store_id and purchase_order_id = purchase.id order by product_name limit 25) line), '[]'::jsonb)) as payload
      from public.purchase_orders purchase where purchase.store_id = target_store_id and (include_demo or not purchase.is_demo)
        and (pg_catalog.cardinality(search_tokens) = 0 or exists (select 1 from pg_catalog.unnest(search_tokens) token where pg_catalog.lower(pg_catalog.concat_ws(' ', purchase.reference, purchase.supplier, purchase.external_id, purchase.status)) like '%' || token || '%'))
      order by purchase.created_at desc limit requested_limit
    ) rows;
  elsif requested_entity = 'webshop_order' then
    select pg_catalog.jsonb_build_object('entity', requested_entity, 'basis', 'webshop order lifecycle; customer and address snapshots excluded', 'rows', coalesce(pg_catalog.jsonb_agg(payload order by created_at desc), '[]'::jsonb)) into result
    from (
      select webshop.created_at, pg_catalog.jsonb_build_object('id', webshop.id, 'orderNumber', webshop.order_number, 'status', webshop.status, 'paymentStatus', webshop.payment_status, 'inventoryStatus', webshop.inventory_status, 'fulfillmentStatus', webshop.fulfillment_status, 'deliveryMode', webshop.delivery_mode, 'subtotalCents', webshop.subtotal_cents, 'discountCents', webshop.discount_cents, 'shippingCents', webshop.shipping_cents, 'totalCents', webshop.total_cents, 'createdAt', webshop.created_at, 'updatedAt', webshop.updated_at) as payload
      from public.webshop_orders webshop where webshop.store_id = target_store_id and (include_demo or not coalesce(webshop.is_demo, false))
        and (pg_catalog.cardinality(search_tokens) = 0 or exists (select 1 from pg_catalog.unnest(search_tokens) token where pg_catalog.lower(pg_catalog.concat_ws(' ', webshop.order_number, webshop.external_id, webshop.status, webshop.payment_reference)) like '%' || token || '%'))
      order by webshop.created_at desc limit requested_limit
    ) rows;
  elsif requested_entity = 'service_order' then
    select pg_catalog.jsonb_build_object('entity', requested_entity, 'basis', 'service workflow status; private payload and contact details excluded', 'rows', coalesce(pg_catalog.jsonb_agg(payload order by updated_at desc), '[]'::jsonb)) into result
    from (
      select service.updated_at, pg_catalog.jsonb_build_object('id', service.id, 'number', service.number, 'customerName', case when actor_role in ('owner','manager') then service.customer_name else null end, 'assetType', service.asset_type, 'identifier', service.identifier_value, 'route', service.route, 'status', service.status, 'substatus', service.substatus, 'createdAt', service.created_at, 'updatedAt', service.updated_at) as payload
      from public.service_orders service where service.store_id = target_store_id
        and (pg_catalog.cardinality(search_tokens) = 0 or exists (select 1 from pg_catalog.unnest(search_tokens) token where pg_catalog.lower(pg_catalog.concat_ws(' ', service.number, service.customer_name, service.identifier_value, service.status, service.substatus)) like '%' || token || '%'))
      order by service.updated_at desc limit requested_limit
    ) rows;
  elsif requested_entity = 'stock_movement' then
    select pg_catalog.jsonb_build_object('entity', requested_entity, 'basis', 'inventory ledger movements with actor and reason', 'rows', coalesce(pg_catalog.jsonb_agg(payload order by occurred_at desc), '[]'::jsonb)) into result
    from (
      select movement.occurred_at, pg_catalog.jsonb_build_object('id', movement.id, 'productId', movement.product_id, 'productName', movement.product_name, 'quantityDelta', movement.quantity_delta, 'quantityBefore', movement.quantity_before, 'quantityAfter', movement.quantity_after, 'reason', movement.reason, 'adjustmentReason', movement.adjustment_reason, 'returnDisposition', movement.return_disposition, 'user', movement.user_name, 'occurredAt', movement.occurred_at, 'transactionId', movement.transaction_id, 'purchaseOrderId', movement.purchase_order_id) as payload
      from public.stock_movements movement where movement.store_id = target_store_id and (include_demo or not movement.is_demo)
        and (pg_catalog.cardinality(search_tokens) = 0 or exists (select 1 from pg_catalog.unnest(search_tokens) token where pg_catalog.lower(pg_catalog.concat_ws(' ', movement.product_name, movement.reason, movement.adjustment_reason, movement.user_name)) like '%' || token || '%'))
      order by movement.occurred_at desc limit requested_limit
    ) rows;
  elsif requested_entity = 'employee' then
    select pg_catalog.jsonb_build_object('entity', requested_entity, 'basis', 'workforce employee status; email excluded', 'rows', coalesce(pg_catalog.jsonb_agg(payload order by label), '[]'::jsonb)) into result
    from (
      select employee.display_name as label, pg_catalog.jsonb_build_object('id', employee.id, 'name', employee.display_name, 'employeeNumber', employee.employee_number, 'status', employee.employment_status, 'startDate', employee.employment_start_date, 'endDate', employee.employment_end_date, 'timezone', employee.timezone) as payload
      from public.workforce_employees employee where employee.store_id = target_store_id
        and (pg_catalog.cardinality(search_tokens) = 0 or exists (select 1 from pg_catalog.unnest(search_tokens) token where pg_catalog.lower(pg_catalog.concat_ws(' ', employee.display_name, employee.employee_number, employee.employment_status)) like '%' || token || '%'))
      order by employee.employment_status, employee.display_name limit requested_limit
    ) rows;
  elsif requested_entity = 'leave_request' then
    select pg_catalog.jsonb_build_object('entity', requested_entity, 'basis', 'leave request status; employee notes and coverage details excluded', 'rows', coalesce(pg_catalog.jsonb_agg(payload order by submitted_at desc), '[]'::jsonb)) into result
    from (
      select request.submitted_at, pg_catalog.jsonb_build_object('id', request.id, 'employeeId', request.employee_id, 'employeeName', employee.display_name, 'leaveType', leave_type.name, 'startDate', request.start_date, 'endDate', request.end_date, 'totalMinutes', request.total_minutes, 'status', request.status, 'coverageRisk', request.coverage_risk, 'submittedAt', request.submitted_at, 'decidedAt', request.decided_at) as payload
      from public.leave_requests request
      join public.workforce_employees employee on employee.store_id = request.store_id and employee.id = request.employee_id
      join public.leave_types leave_type on leave_type.store_id = request.store_id and leave_type.id = request.leave_type_id
      where request.store_id = target_store_id and (actor_role in ('owner','manager') or employee.user_id = actor_id)
        and (pg_catalog.cardinality(search_tokens) = 0 or exists (select 1 from pg_catalog.unnest(search_tokens) token where pg_catalog.lower(pg_catalog.concat_ws(' ', employee.display_name, leave_type.name, request.status)) like '%' || token || '%'))
      order by request.submitted_at desc limit requested_limit
    ) rows;
  else
    select pg_catalog.jsonb_build_object('entity', requested_entity, 'basis', 'immutable store audit trail; detail payload is excluded', 'rows', coalesce(pg_catalog.jsonb_agg(payload order by occurred_at desc), '[]'::jsonb)) into result
    from (
      select audit.occurred_at, pg_catalog.jsonb_build_object('id', audit.id, 'action', audit.action, 'source', audit.source, 'user', audit.user_name, 'occurredAt', audit.occurred_at) as payload
      from public.audit_entries audit where audit.store_id = target_store_id and (include_demo or not audit.is_demo)
        and (pg_catalog.cardinality(search_tokens) = 0 or exists (select 1 from pg_catalog.unnest(search_tokens) token where pg_catalog.lower(pg_catalog.concat_ws(' ', audit.action, audit.source, audit.user_name)) like '%' || token || '%'))
      order by audit.occurred_at desc limit requested_limit
    ) rows;
  end if;

  return result || pg_catalog.jsonb_build_object('version', 1, 'generatedAt', pg_catalog.statement_timestamp(), 'query', record_plan);
end;
$$;

revoke all on function public.get_pace_record_context(uuid, jsonb) from public, anon;
grant execute on function public.get_pace_record_context(uuid, jsonb) to authenticated;

comment on function public.get_pace_record_context(uuid, jsonb) is
  'Returns one bounded, role-aware record projection selected from an enum; excludes secrets, contact details and unrestricted payloads.';

commit;
