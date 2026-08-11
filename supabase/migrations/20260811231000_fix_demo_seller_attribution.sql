-- Demo sellers are historical attribution, not login-capable Auth identities.
-- The initial seed incorrectly assigned every fixture sale to Kevin's Auth UUID,
-- while retaining the actual seller only in user_name. Preserve all sales and
-- restore their intended attribution without touching live account activity.
begin;

do $fix$
declare
  demo_user_id uuid;
  demo_store_id uuid;
begin
  select id into strict demo_user_id
  from auth.users
  where lower(email) = lower('kevin@webaanzee.be');

  select membership.store_id into strict demo_store_id
  from public.store_memberships membership
  join public.stores store on store.id = membership.store_id
  where membership.user_id = demo_user_id
    and membership.role = 'owner'
    and membership.status = 'active'
    and store.is_demo = true;

  update public.transactions
  set user_id = null
  where store_id = demo_store_id
    and source = 'demo'
    and user_name in ('Lina', 'Noah', 'Sam');

  update public.gift_card_events
  set user_id = null
  where store_id = demo_store_id
    and source = 'demo'
    and user_name in ('Lina', 'Noah', 'Sam');
end;
$fix$;

commit;
