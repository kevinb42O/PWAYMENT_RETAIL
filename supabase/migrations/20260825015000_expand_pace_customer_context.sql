begin;

-- Expand the verified Pace projection with bounded top-customer context. The caller's auth.uid()
-- must be an active member of the requested store. No service-role key is used
-- by the Pace endpoint, and no contact details, free notes, credentials or
-- private ledger rows leave this function.
create or replace function public.get_pace_ai_context(
  target_store_id uuid,
  user_query text default ''
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
  store_name text;
  store_timezone text;
  store_currency text;
  normalized_query text := pg_catalog.lower(pg_catalog.left(coalesce(user_query, ''), 240));
  local_today date;
  result jsonb;
begin
  if actor_id is null or not private.is_store_member(target_store_id) then
    raise exception using errcode = '42501', message = 'pace-ai:forbidden:Geen toegang tot deze winkel.';
  end if;

  select membership.role, store.name, store.timezone, store.currency
    into actor_role, store_name, store_timezone, store_currency
  from public.store_memberships membership
  join public.stores store on store.id = membership.store_id
  where membership.store_id = target_store_id
    and membership.user_id = actor_id
    and membership.status = 'active';

  local_today := (pg_catalog.clock_timestamp() at time zone store_timezone)::date;

  select pg_catalog.jsonb_build_object(
    'version', 1,
    'generatedAt', pg_catalog.clock_timestamp(),
    'store', pg_catalog.jsonb_build_object(
      'id', target_store_id,
      'name', store_name,
      'timezone', store_timezone,
      'currency', store_currency,
      'role', actor_role,
      'localDate', local_today
    ),
    'subscription', coalesce((
      select pg_catalog.jsonb_build_object(
        'plan', subscription.plan_code,
        'status', subscription.status,
        'trialEndsAt', subscription.trial_ends_at,
        'periodEndsAt', subscription.current_period_ends_at,
        'cancelAtPeriodEnd', subscription.cancel_at_period_end
      )
      from public.store_subscriptions subscription
      where subscription.store_id = target_store_id
    ), '{}'::jsonb),
    'modules', coalesce((
      select pg_catalog.jsonb_object_agg(setting.module_key, pg_catalog.jsonb_build_object(
        'enabled', setting.enabled,
        'visibleForRole', actor_role = any(setting.visible_roles)
      ))
      from public.store_module_settings setting
      where setting.store_id = target_store_id
    ), '{}'::jsonb),
    'catalog', pg_catalog.jsonb_build_object(
      'activeProducts', (select pg_catalog.count(*) from public.products product where product.store_id = target_store_id and product.is_active and not product.is_demo),
      'archivedProducts', (select pg_catalog.count(*) from public.products product where product.store_id = target_store_id and not product.is_active and not product.is_demo),
      'activeCategories', (select pg_catalog.count(*) from public.categories category where category.store_id = target_store_id and category.is_active and not category.is_demo),
      'lowStockProducts', (select pg_catalog.count(*) from public.products product where product.store_id = target_store_id and product.is_active and not product.is_demo and product.stock_qty is not null and product.min_stock_qty is not null and product.stock_qty <= product.min_stock_qty),
      'matchingProducts', coalesce((
        select pg_catalog.jsonb_agg(match_row.payload order by match_row.name)
        from (
          select product.name, pg_catalog.jsonb_build_object(
            'id', product.id,
            'name', product.name,
            'sku', product.sku,
            'barcode', product.barcode,
            'brand', product.brand,
            'category', product.category_name,
            'variant', product.variant,
            'priceCents', product.price_cents,
            'stockQty', product.stock_qty,
            'minStockQty', product.min_stock_qty,
            'active', product.is_active
          ) as payload
          from public.products product
          where product.store_id = target_store_id
            and not product.is_demo
            and normalized_query <> ''
            and exists (
              select 1
              from pg_catalog.regexp_split_to_table(normalized_query, '[^a-z0-9]+') token
              where pg_catalog.char_length(token) >= 3
                and token <> all(array['hoeveel','welke','waarom','wanneer','product','artikel','voorraad','prijs','heeft','hebben','toon','zoek','vind'])
                and pg_catalog.lower(pg_catalog.concat_ws(' ', product.name, product.sku, product.barcode, product.brand, product.category_name, product.variant)) like '%' || token || '%'
            )
          order by product.is_active desc, product.name
          limit 25
        ) match_row
      ), '[]'::jsonb),
      'lowestStock', coalesce((
        select pg_catalog.jsonb_agg(low_row.payload order by low_row.stock_qty, low_row.name)
        from (
          select product.name, product.stock_qty, pg_catalog.jsonb_build_object(
            'name', product.name,
            'sku', product.sku,
            'stockQty', product.stock_qty,
            'minStockQty', product.min_stock_qty
          ) as payload
          from public.products product
          where product.store_id = target_store_id
            and product.is_active
            and not product.is_demo
            and product.stock_qty is not null
          order by product.stock_qty, product.name
          limit 15
        ) low_row
      ), '[]'::jsonb)
    ),
    'sales', pg_catalog.jsonb_build_object(
      'today', coalesce((
        select pg_catalog.jsonb_build_object(
          'transactionCount', pg_catalog.count(*) filter (where txn.kind = 'sale'),
          'refundCount', pg_catalog.count(*) filter (where txn.kind = 'refund'),
          'netTotalCents', coalesce(pg_catalog.sum(case when txn.kind = 'refund' then -pg_catalog.abs(txn.total_cents) else txn.total_cents end), 0)
        )
        from public.transactions txn
        where txn.store_id = target_store_id
          and not coalesce(txn.is_demo, false)
          and txn.occurred_at >= (local_today::timestamp at time zone store_timezone)
          and txn.occurred_at < ((local_today + 1)::timestamp at time zone store_timezone)
      ), '{}'::jsonb),
      'last30Days', coalesce((
        select pg_catalog.jsonb_build_object(
          'transactionCount', pg_catalog.count(*) filter (where txn.kind = 'sale'),
          'refundCount', pg_catalog.count(*) filter (where txn.kind = 'refund'),
          'netTotalCents', coalesce(pg_catalog.sum(case when txn.kind = 'refund' then -pg_catalog.abs(txn.total_cents) else txn.total_cents end), 0),
          'discountCents', coalesce(pg_catalog.sum(txn.discount_cents), 0)
        )
        from public.transactions txn
        where txn.store_id = target_store_id
          and not coalesce(txn.is_demo, false)
          and txn.occurred_at >= pg_catalog.clock_timestamp() - interval '30 days'
      ), '{}'::jsonb),
      'paymentMix30Days', coalesce((
        select pg_catalog.jsonb_object_agg(mix.payment_method, mix.total_cents)
        from (
          select txn.payment_method, pg_catalog.sum(txn.total_cents) as total_cents
          from public.transactions txn
          where txn.store_id = target_store_id
            and not coalesce(txn.is_demo, false)
            and txn.kind = 'sale'
            and txn.occurred_at >= pg_catalog.clock_timestamp() - interval '30 days'
          group by txn.payment_method
        ) mix
      ), '{}'::jsonb),
      'recentTransactions', coalesce((
        select pg_catalog.jsonb_agg(recent.payload order by recent.occurred_at desc)
        from (
          select txn.occurred_at, pg_catalog.jsonb_build_object(
            'documentNumber', txn.document_number,
            'occurredAt', txn.occurred_at,
            'kind', txn.kind,
            'totalCents', txn.total_cents,
            'paymentMethod', txn.payment_method,
            'cashier', txn.user_name,
            'source', txn.source,
            'finalized', txn.is_finalized
          ) as payload
          from public.transactions txn
          where txn.store_id = target_store_id and not coalesce(txn.is_demo, false)
          order by txn.occurred_at desc
          limit 12
        ) recent
      ), '[]'::jsonb),
      'matchingTransactions', coalesce((
        select pg_catalog.jsonb_agg(found.payload order by found.occurred_at desc)
        from (
          select txn.occurred_at, pg_catalog.jsonb_build_object(
            'documentNumber', txn.document_number,
            'occurredAt', txn.occurred_at,
            'kind', txn.kind,
            'totalCents', txn.total_cents,
            'paymentMethod', txn.payment_method,
            'cashier', txn.user_name,
            'source', txn.source,
            'finalized', txn.is_finalized
          ) as payload
          from public.transactions txn
          where txn.store_id = target_store_id
            and not coalesce(txn.is_demo, false)
            and normalized_query <> ''
            and exists (
              select 1
              from pg_catalog.regexp_split_to_table(normalized_query, '[^a-z0-9-]+') token
              where pg_catalog.char_length(token) >= 4
                and pg_catalog.lower(pg_catalog.concat_ws(' ', txn.document_number, txn.external_id, txn.user_name)) like '%' || token || '%'
            )
          order by txn.occurred_at desc
          limit 12
        ) found
      ), '[]'::jsonb)
    ),
    'customers', pg_catalog.jsonb_build_object(
      'activeCount', (select pg_catalog.count(*) from public.customers customer where customer.store_id = target_store_id and customer.is_active and not customer.is_demo),
      'topCustomersBySpend', coalesce((
        select pg_catalog.jsonb_agg(ranked.payload order by ranked.total_spent_cents desc, ranked.name)
        from (
          select customer.name, customer.total_spent_cents, pg_catalog.jsonb_build_object(
            'name', customer.name,
            'totalSpentCents', customer.total_spent_cents,
            'visitCount', customer.visit_count,
            'lastVisitAt', customer.last_visit_at,
            'priceGroup', customer.price_group
          ) as payload
          from public.customers customer
          where customer.store_id = target_store_id
            and customer.is_active
            and not customer.is_demo
          order by customer.total_spent_cents desc, customer.name
          limit 10
        ) ranked
      ), '[]'::jsonb),
      'matchingCustomers', coalesce((
        select pg_catalog.jsonb_agg(found.payload order by found.name)
        from (
          select customer.name, pg_catalog.jsonb_build_object(
            'name', customer.name,
            'totalSpentCents', customer.total_spent_cents,
            'visitCount', customer.visit_count,
            'lastVisitAt', customer.last_visit_at,
            'priceGroup', customer.price_group,
            'active', customer.is_active
          ) as payload
          from public.customers customer
          where customer.store_id = target_store_id
            and not customer.is_demo
            and normalized_query <> ''
            and exists (
              select 1
              from pg_catalog.regexp_split_to_table(normalized_query, '[^a-z0-9]+') token
              where pg_catalog.char_length(token) >= 3
                and token <> all(array['klant','zoek','toon','heeft','hoeveel','aankoop','omzet','bezoek'])
                and pg_catalog.lower(customer.name) like '%' || token || '%'
            )
          order by customer.is_active desc, customer.name
          limit 15
        ) found
      ), '[]'::jsonb)
    ),
    'operations', pg_catalog.jsonb_build_object(
      'webshopOrdersByStatus', coalesce((select pg_catalog.jsonb_object_agg(grouped.status, grouped.total) from (select webshop.status, pg_catalog.count(*) total from public.webshop_orders webshop where webshop.store_id = target_store_id and not coalesce(webshop.is_demo, false) group by webshop.status) grouped), '{}'::jsonb),
      'serviceOrdersByStatus', coalesce((select pg_catalog.jsonb_object_agg(grouped.status, grouped.total) from (select service.status, pg_catalog.count(*) total from public.service_orders service where service.store_id = target_store_id group by service.status) grouped), '{}'::jsonb),
      'purchaseOrdersByStatus', coalesce((select pg_catalog.jsonb_object_agg(grouped.status, grouped.total) from (select purchase.status, pg_catalog.count(*) total from public.purchase_orders purchase where purchase.store_id = target_store_id and not purchase.is_demo group by purchase.status) grouped), '{}'::jsonb),
      'workforce', pg_catalog.jsonb_build_object(
        'activeEmployees', (select pg_catalog.count(*) from public.workforce_employees employee where employee.store_id = target_store_id and employee.employment_status = 'active'),
        'pendingLeaveRequests', (select pg_catalog.count(*) from public.leave_requests leave_request where leave_request.store_id = target_store_id and leave_request.status = 'pending')
      ),
      'latestDailyReport', coalesce((
        select pg_catalog.jsonb_build_object(
          'reportNumber', report.report_number,
          'occurredAt', report.occurred_at,
          'cashDifferenceCents', report.cash_difference_cents,
          'closedBy', report.closed_by_user_name
        )
        from public.daily_reports report
        where report.store_id = target_store_id and not report.is_demo
        order by report.report_number desc
        limit 1
      ), '{}'::jsonb)
    )
  ) into result;

  return result;
end;
$$;

revoke all on function public.get_pace_ai_context(uuid, text) from public, anon;
grant execute on function public.get_pace_ai_context(uuid, text) to authenticated;

comment on function public.get_pace_ai_context(uuid, text) is
  'Returns bounded, tenant-authorized operational context for Pace AI. Excludes contact details, notes, secrets and private ledgers.';

commit;
