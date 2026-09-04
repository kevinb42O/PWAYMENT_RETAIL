begin;

-- Bounded, evidence-first work queues for the Pace Today surface. The function
-- deliberately excludes customer snapshots, addresses, contact data and the
-- service payload. It is read-only and remains scoped to one active tenant.
create or replace function public.get_pace_today_operational_queues(target_store_id uuid)
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
begin
  if actor_id is null or not private.is_store_member(target_store_id) then
    raise exception using errcode = '42501', message = 'pace-ai:forbidden:Geen toegang tot deze winkel.';
  end if;

  select membership.role, store.is_demo into actor_role, include_demo
  from public.store_memberships membership
  join public.stores store on store.id = membership.store_id
  where membership.store_id = target_store_id and membership.user_id = actor_id and membership.status = 'active';

  if coalesce(actor_role, '') not in ('owner', 'manager') then
    raise exception using errcode = '42501', message = 'pace-ai:role-restricted:Deze werkqueues vereisen manager- of eigenaarstoegang.';
  end if;

  return pg_catalog.jsonb_build_object(
    'version', 1,
    'generatedAt', pg_catalog.statement_timestamp(),
    'basis', 'paid webshop orders awaiting fulfillment and service orders with blocked status',
    'webshopOrders', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', order_row.id,
        'number', order_row.order_number,
        'fulfillmentStatus', order_row.fulfillment_status,
        'deliveryMode', order_row.delivery_mode,
        'totalCents', order_row.total_cents,
        'createdAt', order_row.created_at
      ) order by order_row.created_at asc)
      from (
        select * from public.webshop_orders
        where store_id = target_store_id and (include_demo or not is_demo)
          and status in ('pending', 'confirmed')
          and payment_status = 'paid'
          and fulfillment_status in ('unfulfilled', 'processing')
        order by created_at asc
        limit 12
      ) order_row
    ), '[]'::jsonb),
    'blockedServiceOrders', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', service_row.id,
        'number', service_row.number,
        'assetType', service_row.asset_type,
        'route', service_row.route,
        'substatus', service_row.substatus,
        'updatedAt', service_row.updated_at
      ) order by service_row.updated_at asc)
      from (
        select * from public.service_orders
        where store_id = target_store_id and status = 'blocked'
        order by updated_at asc
        limit 12
      ) service_row
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_pace_today_operational_queues(uuid) from public, anon;
grant execute on function public.get_pace_today_operational_queues(uuid) to authenticated;

commit;
