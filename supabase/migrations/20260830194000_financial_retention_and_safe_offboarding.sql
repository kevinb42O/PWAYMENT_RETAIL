begin;

alter table public.stores
  add column if not exists lifecycle_status text not null default 'active'
    check (lifecycle_status in ('active', 'offboarded', 'purge_eligible')),
  add column if not exists offboarded_at timestamptz,
  add column if not exists retention_until timestamptz,
  add column if not exists offboarding_reason text;

create index if not exists stores_lifecycle_retention_idx
  on public.stores (lifecycle_status, retention_until);

create or replace function private.prevent_store_financial_evidence_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.transactions sale
    where sale.store_id = old.id and sale.source <> 'demo'
  ) or exists (
    select 1 from public.daily_reports report
    where report.store_id = old.id and report.is_demo is not true
  ) then
    raise exception using errcode = '23503',
      message = 'retention:financial-evidence:Een winkel met financiële bewijsdata moet gecontroleerd worden gearchiveerd en mag niet rechtstreeks worden verwijderd.';
  end if;
  return old;
end;
$$;

drop trigger if exists stores_prevent_financial_evidence_delete on public.stores;
create trigger stores_prevent_financial_evidence_delete
before delete on public.stores
for each row execute function private.prevent_store_financial_evidence_delete();
revoke all on function private.prevent_store_financial_evidence_delete() from public, anon, authenticated;

create or replace function public.platform_delete_store(target_store_id uuid, expected_store_name text, deletion_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  store_name text;
  orphan_user_ids uuid[];
  deleted_users integer := 0;
  has_financial_evidence boolean;
  evidence_last_at timestamptz;
  keep_until timestamptz;
begin
  perform private.require_platform_scope('lifecycle.delete', true);
  if length(btrim(coalesce(deletion_reason, ''))) < 8 then raise exception 'STORE_DELETE_REASON_REQUIRED' using errcode = '22023'; end if;
  select name into store_name from public.stores where id = target_store_id for update;
  if store_name is null then raise exception 'STORE_NOT_FOUND' using errcode = 'P0002'; end if;
  if store_name <> btrim(coalesce(expected_store_name, '')) then raise exception 'STORE_DELETE_CONFIRMATION_MISMATCH' using errcode = '22023'; end if;

  select exists (
    select 1 from public.transactions where store_id = target_store_id and source <> 'demo'
  ) or exists (
    select 1 from public.daily_reports where store_id = target_store_id and is_demo is not true
  ) into has_financial_evidence;

  if has_financial_evidence then
    select max(moment) into evidence_last_at from (
      select max(occurred_at) as moment from public.transactions where store_id = target_store_id and source <> 'demo'
      union all
      select max(occurred_at) from public.daily_reports where store_id = target_store_id and is_demo is not true
    ) evidence;
    keep_until := date_trunc('year', coalesce(evidence_last_at, now())) + interval '11 years';

    update public.stores set
      lifecycle_status = 'offboarded',
      offboarded_at = now(),
      retention_until = greatest(coalesce(retention_until, keep_until), keep_until),
      offboarding_reason = left(btrim(deletion_reason), 1000),
      updated_at = now()
    where id = target_store_id;
    update public.store_memberships set status = 'suspended', updated_at = now()
    where store_id = target_store_id;
    update public.store_subscriptions set
      status = 'canceled', cancel_at_period_end = false, updated_at = now(), version = version + 1
    where store_id = target_store_id;

    insert into private.platform_audit_entries (actor_user_id, action, reason, detail)
    values ((select auth.uid()), 'store.offboarded', left(btrim(deletion_reason), 1000), jsonb_build_object(
      'store_id', target_store_id, 'store_name', store_name,
      'retention_until', keep_until, 'financial_evidence_retained', true
    ));
    return jsonb_build_object(
      'deleted_store_id', target_store_id,
      'deleted_store_name', store_name,
      'deleted_orphan_users', 0,
      'archived', true,
      'retention_until', keep_until
    );
  end if;

  select coalesce(array_agg(member.user_id), '{}'::uuid[]) into orphan_user_ids
  from public.store_memberships member
  where member.store_id = target_store_id
    and not exists (select 1 from public.store_memberships other_member where other_member.user_id = member.user_id and other_member.store_id <> target_store_id)
    and not exists (select 1 from private.platform_memberships platform_member where platform_member.user_id = member.user_id);
  delete from public.stores where id = target_store_id;
  if cardinality(orphan_user_ids) > 0 then
    delete from auth.users where id = any(orphan_user_ids);
    get diagnostics deleted_users = row_count;
  end if;
  insert into private.platform_audit_entries (actor_user_id, action, reason, detail)
  values ((select auth.uid()), 'store.deleted_without_financial_evidence', left(btrim(deletion_reason), 1000), jsonb_build_object('store_id', target_store_id, 'store_name', store_name, 'deleted_orphan_users', deleted_users));
  return jsonb_build_object('deleted_store_id', target_store_id, 'deleted_store_name', store_name, 'deleted_orphan_users', deleted_users, 'archived', false, 'retention_until', null);
end;
$$;

revoke all on function public.platform_delete_store(uuid, text, text) from public, anon;
grant execute on function public.platform_delete_store(uuid, text, text) to authenticated;

commit;
