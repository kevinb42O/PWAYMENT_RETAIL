begin;

alter table public.store_subscriptions
  add column if not exists pace_rollover_enabled boolean not null default false;

create table public.pace_usage (
  store_id uuid primary key references public.stores(id) on delete cascade,
  daily_count integer not null default 0 check (daily_count >= 0),
  monthly_count integer not null default 0 check (monthly_count >= 0),
  rollover_balance integer not null default 0 check (rollover_balance >= 0),
  daily_period_start date not null default (now() at time zone 'UTC')::date,
  monthly_period_start timestamptz not null default (date_trunc('month', now() at time zone 'UTC') at time zone 'UTC'),
  monthly_period_end timestamptz not null default ((date_trunc('month', now() at time zone 'UTC') + interval '1 month') at time zone 'UTC'),
  last_reset_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (monthly_period_end > monthly_period_start)
);

create table public.pace_credits (
  store_id uuid primary key references public.stores(id) on delete cascade,
  balance integer not null default 0 check (balance >= 0),
  lifetime_purchased integer not null default 0 check (lifetime_purchased >= 0),
  lifetime_consumed integer not null default 0 check (lifetime_consumed >= 0),
  updated_at timestamptz not null default now()
);

create table public.pace_credit_transactions (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  amount integer not null check (amount <> 0),
  balance_after integer not null check (balance_after >= 0),
  transaction_type text not null check (transaction_type in ('purchase', 'consume', 'refund', 'adjustment')),
  external_reference text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create unique index pace_credit_transactions_external_unique
  on public.pace_credit_transactions (store_id, external_reference)
  where external_reference is not null and transaction_type in ('purchase', 'refund');
create index pace_credit_transactions_store_created_idx
  on public.pace_credit_transactions (store_id, created_at desc);

create table public.pace_credit_purchases (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  requested_by uuid not null references auth.users(id),
  pack_code text not null check (pack_code = 'pace-50'),
  credits integer not null check (credits = 50),
  amount_cents integer not null check (amount_cents = 500),
  currency text not null default 'EUR' check (currency = 'EUR'),
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed', 'canceled')),
  provider text not null default 'mollie',
  provider_payment_id text,
  checkout_url text,
  idempotency_key uuid not null,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  unique (store_id, idempotency_key),
  unique (provider, provider_payment_id)
);

create table public.pace_role_policies (
  store_id uuid not null references public.stores(id) on delete cascade,
  role text not null check (role in ('owner', 'manager', 'cashier')),
  enabled boolean not null default true,
  monthly_limit integer check (monthly_limit is null or monthly_limit >= 0),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  primary key (store_id, role)
);

create table public.pace_role_usage (
  store_id uuid not null references public.stores(id) on delete cascade,
  role text not null check (role in ('owner', 'manager', 'cashier')),
  period_start timestamptz not null,
  count integer not null default 0 check (count >= 0),
  primary key (store_id, role, period_start)
);

create table public.pace_logs (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  user_role text not null check (user_role in ('owner', 'manager', 'cashier')),
  occurred_at timestamptz not null default now(),
  status text not null default 'reserved' check (status in ('reserved', 'completed', 'failed')),
  source text not null check (source in ('subscription', 'rollover', 'credit')),
  tokens_used integer check (tokens_used is null or tokens_used >= 0),
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  cost_estimate numeric(12,6) check (cost_estimate is null or cost_estimate >= 0),
  execution_time_ms integer check (execution_time_ms is null or execution_time_ms >= 0),
  model text,
  error_code text,
  request_fingerprint text
);

create index pace_logs_store_occurred_idx on public.pace_logs (store_id, occurred_at desc);
create index pace_logs_user_occurred_idx on public.pace_logs (user_id, occurred_at desc);

create trigger pace_usage_set_updated_at before update on public.pace_usage
  for each row execute function private.set_updated_at();
create trigger pace_credits_set_updated_at before update on public.pace_credits
  for each row execute function private.set_updated_at();

alter table public.pace_usage enable row level security;
alter table public.pace_credits enable row level security;
alter table public.pace_credit_transactions enable row level security;
alter table public.pace_credit_purchases enable row level security;
alter table public.pace_role_policies enable row level security;
alter table public.pace_role_usage enable row level security;
alter table public.pace_logs enable row level security;

create policy pace_usage_member_read on public.pace_usage for select to authenticated
  using (private.is_store_member(store_id));
create policy pace_credits_member_read on public.pace_credits for select to authenticated
  using (private.is_store_member(store_id));
create policy pace_credit_transactions_owner_read on public.pace_credit_transactions for select to authenticated
  using (private.has_store_role(store_id, array['owner']));
create policy pace_credit_purchases_owner_read on public.pace_credit_purchases for select to authenticated
  using (private.has_store_role(store_id, array['owner']));
create policy pace_role_policies_member_read on public.pace_role_policies for select to authenticated
  using (private.is_store_member(store_id));
create policy pace_logs_owner_manager_read on public.pace_logs for select to authenticated
  using (private.has_store_role(store_id, array['owner','manager']));

revoke all on public.pace_usage, public.pace_credits, public.pace_credit_transactions,
  public.pace_credit_purchases, public.pace_role_policies, public.pace_role_usage,
  public.pace_logs from anon, authenticated;
grant select on public.pace_usage, public.pace_credits, public.pace_role_policies to authenticated;
grant select on public.pace_credit_transactions, public.pace_credit_purchases, public.pace_logs to authenticated;

create or replace function public.check_and_consume_pace_credit(
  target_store_id uuid,
  request_fingerprint text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  actor_role text;
  tier text;
  quota integer;
  usage_row public.pace_usage%rowtype;
  credits_row public.pace_credits%rowtype;
  subscription public.store_subscriptions%rowtype;
  policy_row public.pace_role_policies%rowtype;
  role_count integer := 0;
  today_utc date := (now() at time zone 'UTC')::date;
  active_period_start timestamptz;
  active_period_end timestamptz;
  source_used text;
  remaining integer;
  reset_at timestamptz;
  log_id uuid := gen_random_uuid();
begin
  select membership.role into actor_role
  from public.store_memberships membership
  where membership.store_id = target_store_id
    and membership.user_id = actor_id
    and membership.status = 'active';
  if actor_id is null or actor_role is null then
    raise exception using errcode = '42501', message = 'pace:forbidden:Geen toegang tot deze winkel.';
  end if;

  tier := private.effective_plan(target_store_id);
  select * into subscription from public.store_subscriptions where store_id = target_store_id;
  active_period_start := case
    when tier in ('pro','enterprise') and subscription.current_period_started_at is not null
      and subscription.current_period_ends_at > now() then subscription.current_period_started_at
    else date_trunc('month', now() at time zone 'UTC') at time zone 'UTC'
  end;
  active_period_end := case
    when tier in ('pro','enterprise') and subscription.current_period_ends_at > now()
      then subscription.current_period_ends_at
    else (date_trunc('month', now() at time zone 'UTC') + interval '1 month') at time zone 'UTC'
  end;
  quota := case tier when 'basic' then 5 when 'pro' then 250 else 2500 end;
  reset_at := case when tier = 'basic' then (today_utc + 1)::timestamp at time zone 'UTC' else active_period_end end;

  insert into public.pace_usage (store_id, daily_period_start, monthly_period_start, monthly_period_end)
  values (target_store_id, today_utc, active_period_start, active_period_end)
  on conflict (store_id) do nothing;
  select * into usage_row from public.pace_usage where store_id = target_store_id for update;

  if usage_row.daily_period_start <> today_utc then
    usage_row.daily_count := 0;
    usage_row.daily_period_start := today_utc;
    usage_row.last_reset_at := now();
  end if;
  if usage_row.monthly_period_start <> active_period_start or now() >= usage_row.monthly_period_end then
    if tier = 'pro' and coalesce(subscription.pace_rollover_enabled, false) then
      usage_row.rollover_balance := usage_row.rollover_balance + greatest(0, 250 - usage_row.monthly_count);
    elsif tier <> 'pro' then
      usage_row.rollover_balance := 0;
    end if;
    usage_row.monthly_count := 0;
    usage_row.monthly_period_start := active_period_start;
    usage_row.monthly_period_end := active_period_end;
    usage_row.last_reset_at := now();
  end if;

  select * into policy_row from public.pace_role_policies
    where store_id = target_store_id and role = actor_role;
  if policy_row.store_id is not null and not policy_row.enabled then
    return jsonb_build_object('allowed', false, 'reason', 'ROLE_DISABLED', 'tier', tier,
      'remaining_credits', 0, 'reset_at', reset_at,
      'reset_in_seconds', greatest(0, extract(epoch from reset_at - now())::integer));
  end if;
  if policy_row.monthly_limit is not null then
    insert into public.pace_role_usage (store_id, role, period_start)
    values (target_store_id, actor_role, active_period_start) on conflict do nothing;
    select role_usage.count into role_count from public.pace_role_usage role_usage
      where role_usage.store_id = target_store_id and role_usage.role = actor_role and role_usage.period_start = active_period_start
      for update;
    if role_count >= policy_row.monthly_limit then
      return jsonb_build_object('allowed', false, 'reason', 'ROLE_QUOTA_EXCEEDED', 'tier', tier,
        'remaining_credits', 0, 'reset_at', active_period_end,
        'reset_in_seconds', greatest(0, extract(epoch from active_period_end - now())::integer));
    end if;
  end if;

  insert into public.pace_credits (store_id) values (target_store_id) on conflict do nothing;
  select * into credits_row from public.pace_credits where store_id = target_store_id for update;

  if tier = 'basic' and usage_row.daily_count < quota then
    usage_row.daily_count := usage_row.daily_count + 1;
    usage_row.monthly_count := usage_row.monthly_count + 1;
    source_used := 'subscription';
    remaining := quota - usage_row.daily_count;
  elsif tier in ('pro','enterprise') and usage_row.monthly_count < quota then
    usage_row.monthly_count := usage_row.monthly_count + 1;
    usage_row.daily_count := usage_row.daily_count + 1;
    source_used := 'subscription';
    remaining := quota - usage_row.monthly_count + case when tier = 'pro' then usage_row.rollover_balance else 0 end;
  elsif tier = 'pro' and usage_row.rollover_balance > 0 then
    usage_row.rollover_balance := usage_row.rollover_balance - 1;
    usage_row.monthly_count := usage_row.monthly_count + 1;
    usage_row.daily_count := usage_row.daily_count + 1;
    source_used := 'rollover';
    remaining := usage_row.rollover_balance;
  elsif credits_row.balance > 0 then
    credits_row.balance := credits_row.balance - 1;
    credits_row.lifetime_consumed := credits_row.lifetime_consumed + 1;
    source_used := 'credit';
    remaining := credits_row.balance;
    insert into public.pace_credit_transactions (store_id, amount, balance_after, transaction_type, metadata)
      values (target_store_id, -1, credits_row.balance, 'consume', jsonb_build_object('user_id', actor_id));
  else
    update public.pace_usage set
      daily_count = usage_row.daily_count, monthly_count = usage_row.monthly_count,
      rollover_balance = usage_row.rollover_balance, daily_period_start = usage_row.daily_period_start,
      monthly_period_start = usage_row.monthly_period_start, monthly_period_end = usage_row.monthly_period_end,
      last_reset_at = usage_row.last_reset_at where store_id = target_store_id;
    return jsonb_build_object('allowed', false, 'reason', 'QUOTA_EXCEEDED', 'tier', tier,
      'remaining_credits', 0, 'credit_balance', credits_row.balance, 'reset_at', reset_at,
      'reset_in_seconds', greatest(0, extract(epoch from reset_at - now())::integer));
  end if;

  update public.pace_usage set
    daily_count = usage_row.daily_count, monthly_count = usage_row.monthly_count,
    rollover_balance = usage_row.rollover_balance, daily_period_start = usage_row.daily_period_start,
    monthly_period_start = usage_row.monthly_period_start, monthly_period_end = usage_row.monthly_period_end,
    last_reset_at = usage_row.last_reset_at where store_id = target_store_id;
  update public.pace_credits set balance = credits_row.balance,
    lifetime_consumed = credits_row.lifetime_consumed where store_id = target_store_id;
  if policy_row.monthly_limit is not null then
    update public.pace_role_usage set count = count + 1
      where pace_role_usage.store_id = target_store_id and pace_role_usage.role = actor_role and pace_role_usage.period_start = active_period_start;
  end if;
  insert into public.pace_logs (id, store_id, user_id, user_role, source, request_fingerprint)
    values (log_id, target_store_id, actor_id, actor_role, source_used, left(request_fingerprint, 128));

  return jsonb_build_object('allowed', true, 'tier', tier, 'source', source_used, 'log_id', log_id,
    'remaining', remaining, 'remaining_credits', credits_row.balance, 'credit_balance', credits_row.balance,
    'daily_count', usage_row.daily_count, 'monthly_count', usage_row.monthly_count,
    'quota', quota, 'rollover_balance', usage_row.rollover_balance, 'reset_at', reset_at,
    'reset_in_seconds', greatest(0, extract(epoch from reset_at - now())::integer));
end;
$$;

create or replace function public.finalize_pace_log(
  target_log_id uuid,
  final_status text,
  input_token_count integer default null,
  output_token_count integer default null,
  estimated_cost numeric default null,
  elapsed_ms integer default null,
  model_name text default null,
  failure_code text default null
)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  if final_status not in ('completed','failed') then raise exception 'pace:invalid-status'; end if;
  update public.pace_logs set status = final_status,
    input_tokens = greatest(0, input_token_count), output_tokens = greatest(0, output_token_count),
    tokens_used = greatest(0, coalesce(input_token_count,0) + coalesce(output_token_count,0)),
    cost_estimate = greatest(0, estimated_cost), execution_time_ms = greatest(0, elapsed_ms),
    model = left(model_name, 120), error_code = left(failure_code, 120)
  where id = target_log_id and user_id = (select auth.uid()) and status = 'reserved';
end;
$$;

create or replace function public.get_pace_billing_overview(target_store_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if not private.is_store_member(target_store_id) then raise exception using errcode = '42501', message = 'pace:forbidden'; end if;
  select jsonb_build_object(
    'tier', private.effective_plan(target_store_id),
    'rollover_enabled', coalesce(subscription.pace_rollover_enabled, false),
    'usage', jsonb_build_object(
      'daily_count', case when usage.daily_period_start = (now() at time zone 'UTC')::date then coalesce(usage.daily_count,0) else 0 end,
      'monthly_count', case when usage.monthly_period_end > now() then coalesce(usage.monthly_count,0) else 0 end,
      'rollover_balance', coalesce(usage.rollover_balance,0), 'period_end', usage.monthly_period_end),
    'credit_balance', coalesce(credits.balance,0),
    'history', coalesce((select jsonb_agg(day_row order by day) from (
      select date_trunc('day', occurred_at)::date as day, count(*)::integer as questions
      from public.pace_logs where store_id = target_store_id and status = 'completed' and occurred_at >= now() - interval '30 days'
      group by 1) day_row), '[]'::jsonb),
    'role_policies', coalesce((select jsonb_agg(jsonb_build_object('role', roles.role, 'enabled', coalesce(policy.enabled,true), 'monthly_limit', policy.monthly_limit) order by roles.role)
      from (values ('owner'),('manager'),('cashier')) roles(role)
      left join public.pace_role_policies policy on policy.store_id = target_store_id and policy.role = roles.role), '[]'::jsonb)
  ) into result
  from (select target_store_id store_id) target
  left join public.store_subscriptions subscription on subscription.store_id = target.store_id
  left join public.pace_usage usage on usage.store_id = target.store_id
  left join public.pace_credits credits on credits.store_id = target.store_id;
  return result;
end;
$$;

create or replace function public.set_pace_rollover(target_store_id uuid, rollover_enabled boolean)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  if not private.has_store_role(target_store_id, array['owner']) then raise exception using errcode = '42501', message = 'pace:owner-required'; end if;
  if private.effective_plan(target_store_id) <> 'pro' then raise exception 'pace:rollover-pro-only'; end if;
  update public.store_subscriptions set pace_rollover_enabled = rollover_enabled where store_id = target_store_id;
end;
$$;

create or replace function public.set_pace_role_policy(target_store_id uuid, target_role text, pace_enabled boolean, role_monthly_limit integer default null)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  if not private.has_store_role(target_store_id, array['owner']) then raise exception using errcode = '42501', message = 'pace:owner-required'; end if;
  if target_role not in ('owner','manager','cashier') or role_monthly_limit < 0 then raise exception 'pace:invalid-policy'; end if;
  insert into public.pace_role_policies (store_id, role, enabled, monthly_limit, updated_by)
  values (target_store_id, target_role, pace_enabled, role_monthly_limit, (select auth.uid()))
  on conflict (store_id, role) do update set enabled = excluded.enabled, monthly_limit = excluded.monthly_limit,
    updated_by = excluded.updated_by, updated_at = now();
end;
$$;

create or replace function public.create_pace_credit_purchase(target_store_id uuid, purchase_idempotency_key uuid)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare purchase_id uuid;
begin
  if not private.has_store_role(target_store_id, array['owner']) then raise exception using errcode = '42501', message = 'pace:owner-required'; end if;
  insert into public.pace_credit_purchases (store_id, requested_by, pack_code, credits, amount_cents, idempotency_key)
  values (target_store_id, (select auth.uid()), 'pace-50', 50, 500, purchase_idempotency_key)
  on conflict (store_id, idempotency_key) do update set idempotency_key = excluded.idempotency_key
  returning id into purchase_id;
  return purchase_id;
end;
$$;

create or replace function public.complete_pace_credit_purchase(target_purchase_id uuid, payment_id text, payment_checkout_url text default null)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare purchase public.pace_credit_purchases%rowtype;
declare credits_row public.pace_credits%rowtype;
begin
  select * into purchase from public.pace_credit_purchases where id = target_purchase_id for update;
  if purchase.id is null then raise exception 'pace:purchase-not-found'; end if;
  if purchase.status = 'paid' then return jsonb_build_object('credited', false, 'balance', (select balance from public.pace_credits where store_id = purchase.store_id)); end if;
  update public.pace_credit_purchases set status = 'paid', provider_payment_id = payment_id,
    checkout_url = payment_checkout_url, paid_at = now() where id = purchase.id;
  insert into public.pace_credits (store_id, balance, lifetime_purchased)
    values (purchase.store_id, purchase.credits, purchase.credits)
    on conflict (store_id) do update set balance = pace_credits.balance + excluded.balance,
      lifetime_purchased = pace_credits.lifetime_purchased + excluded.lifetime_purchased;
  select * into credits_row from public.pace_credits where store_id = purchase.store_id;
  insert into public.pace_credit_transactions (store_id, amount, balance_after, transaction_type, external_reference, metadata)
    values (purchase.store_id, purchase.credits, credits_row.balance, 'purchase', payment_id, jsonb_build_object('purchase_id', purchase.id));
  return jsonb_build_object('credited', true, 'balance', credits_row.balance);
end;
$$;

revoke all on function public.check_and_consume_pace_credit(uuid,text), public.finalize_pace_log(uuid,text,integer,integer,numeric,integer,text,text),
  public.get_pace_billing_overview(uuid), public.set_pace_role_policy(uuid,text,boolean,integer),
  public.set_pace_rollover(uuid,boolean), public.create_pace_credit_purchase(uuid,uuid), public.complete_pace_credit_purchase(uuid,text,text) from public, anon, authenticated;
grant execute on function public.check_and_consume_pace_credit(uuid,text), public.finalize_pace_log(uuid,text,integer,integer,numeric,integer,text,text),
  public.get_pace_billing_overview(uuid), public.set_pace_role_policy(uuid,text,boolean,integer), public.set_pace_rollover(uuid,boolean), public.create_pace_credit_purchase(uuid,uuid) to authenticated;
grant execute on function public.complete_pace_credit_purchase(uuid,text,text) to service_role;

commit;
