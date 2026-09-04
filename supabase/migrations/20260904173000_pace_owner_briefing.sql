begin;

-- A concise, evidence-first briefing for owners and managers. It reports only
-- live tenant facts with a deterministic rule behind each item; the model is
-- not asked to discover or prioritize operational problems on its own.
create or replace function public.get_pace_owner_briefing(target_store_id uuid)
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
  store_timezone text;
  local_today date;
  today_start timestamptz;
  yesterday_start timestamptz;
  result jsonb;
begin
  if actor_id is null or not private.is_store_member(target_store_id) then
    raise exception using errcode = '42501', message = 'pace-ai:forbidden:Geen toegang tot deze winkel.';
  end if;
  select membership.role, store.is_demo, store.timezone into actor_role, include_demo, store_timezone
  from public.store_memberships membership
  join public.stores store on store.id = membership.store_id
  where membership.store_id = target_store_id and membership.user_id = actor_id and membership.status = 'active';
  if coalesce(actor_role, '') not in ('owner', 'manager') then
    raise exception using errcode = '42501', message = 'pace-ai:role-restricted:Deze briefing vereist manager- of eigenaarstoegang.';
  end if;

  local_today := (pg_catalog.statement_timestamp() at time zone store_timezone)::date;
  today_start := local_today::timestamp at time zone store_timezone;
  yesterday_start := (local_today - 1)::timestamp at time zone store_timezone;

  with
  inventory as (
    select
      pg_catalog.count(*) filter (where product.stock_qty = 0)::integer as out_of_stock_count,
      pg_catalog.count(*) filter (where product.min_stock_qty is not null and product.stock_qty <= product.min_stock_qty)::integer as at_or_below_minimum_count
    from public.products product
    where product.store_id = target_store_id and product.is_active and product.stock_qty is not null
      and (include_demo or not product.is_demo)
  ),
  operations as (
    select
      (select pg_catalog.count(*)::integer from public.webshop_orders order_row
        where order_row.store_id = target_store_id and (include_demo or not order_row.is_demo)
          and order_row.status in ('pending', 'confirmed')
          and order_row.payment_status = 'paid'
          and order_row.fulfillment_status in ('unfulfilled', 'processing')) as paid_webshop_waiting_count,
      (select pg_catalog.count(*)::integer from public.service_orders service_row
        where service_row.store_id = target_store_id and service_row.status = 'blocked') as blocked_service_count,
      (select pg_catalog.count(*)::integer from public.purchase_orders purchase_row
        where purchase_row.store_id = target_store_id and (include_demo or not purchase_row.is_demo)
          and purchase_row.status in ('ordered', 'partially-received')
          and purchase_row.expected_delivery_at is not null and purchase_row.expected_delivery_at < pg_catalog.statement_timestamp()) as overdue_purchase_count
  ),
  sales as (
    select
      coalesce(pg_catalog.sum(case when txn.occurred_at >= today_start then case when txn.kind = 'refund' then -pg_catalog.abs(txn.total_cents) else pg_catalog.abs(txn.total_cents) end else 0 end), 0)::bigint as today_revenue_cents,
      coalesce(pg_catalog.sum(case when txn.occurred_at >= yesterday_start and txn.occurred_at < today_start then case when txn.kind = 'refund' then -pg_catalog.abs(txn.total_cents) else pg_catalog.abs(txn.total_cents) end else 0 end), 0)::bigint as yesterday_revenue_cents
    from public.transactions txn
    where txn.store_id = target_store_id and txn.is_finalized and txn.kind in ('sale', 'refund')
      and (include_demo or not coalesce(txn.is_demo, false)) and txn.occurred_at >= yesterday_start
  ),
  items as (
    select 1 as priority, 'inventory.out_of_stock'::text as id,
      pg_catalog.format('%s producten zonder voorraad', inventory.out_of_stock_count) as title,
      'Actieve producten staan op nul voorraad.'::text as detail,
      'Welke producten hebben precies nul stuks op voorraad?'::text as next_question
    from inventory where inventory.out_of_stock_count > 0
    union all
    select 2, 'inventory.at_or_below_minimum',
      pg_catalog.format('%s producten op of onder minimumvoorraad', inventory.at_or_below_minimum_count),
      'Deze producten kunnen een bestelling of voorraadcontrole vragen.',
      'Welke artikelen staan op of onder de minimumvoorraad?'
    from inventory where inventory.at_or_below_minimum_count > 0
    union all
    select 2, 'webshop.paid_waiting',
      pg_catalog.format('%s betaalde webshoporders wachten op verwerking', operations.paid_webshop_waiting_count),
      'Betaalde orders staan nog niet klaar voor afhaling of verzending.',
      'Welke webshoporders staan open?'
    from operations where operations.paid_webshop_waiting_count > 0
    union all
    select 1, 'service.blocked',
      pg_catalog.format('%s herstellingen zijn geblokkeerd', operations.blocked_service_count),
      'Deze servicedossiers hebben een blokkade als status.',
      'Welke herstellingen zijn geblokkeerd?'
    from operations where operations.blocked_service_count > 0
    union all
    select 2, 'purchasing.overdue',
      pg_catalog.format('%s inkooporders zijn over hun verwachte leverdatum', operations.overdue_purchase_count),
      'Bestelde goederen zijn nog niet volledig ontvangen.',
      'Welke inkooporders staan nog open?'
    from operations where operations.overdue_purchase_count > 0
    union all
    select 2, 'sales.drop_today',
      'De omzet van vandaag loopt duidelijk achter op gisteren',
      pg_catalog.format('Vandaag: %s cent; gisteren: %s cent.', sales.today_revenue_cents, sales.yesterday_revenue_cents),
      'Vergelijk mijn omzet van vandaag met gisteren.'
    from sales where sales.yesterday_revenue_cents > 0 and sales.today_revenue_cents < sales.yesterday_revenue_cents * 0.8
  )
  select pg_catalog.jsonb_build_object(
    'version', 1,
    'generatedAt', pg_catalog.statement_timestamp(),
    'timezone', store_timezone,
    'basis', 'current stock and operational queue states, plus finalized sales today compared with yesterday in the store timezone',
    'items', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id', id, 'priority', priority, 'title', title, 'detail', detail, 'nextQuestion', next_question
    ) order by priority, id) from items), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

revoke all on function public.get_pace_owner_briefing(uuid) from public, anon;
grant execute on function public.get_pace_owner_briefing(uuid) to authenticated;

alter table public.pace_evidence_items
  drop constraint if exists pace_evidence_items_source_name_check;
alter table public.pace_evidence_items
  add constraint pace_evidence_items_source_name_check check (source_name in (
    'tenant.context', 'inventory.action', 'inventory.low_stock', 'inventory.query', 'owner.briefing', 'analytics.query', 'records.lookup',
    'sales.vat_breakdown', 'sales.tender_breakdown', 'gift_cards.summary', 'workforce.leave_summary',
    'inventory.location_stock', 'product.knowledge', 'ui.context'
  ));

commit;
