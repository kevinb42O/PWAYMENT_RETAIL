begin;

-- setup_owner_pos_access uses ON CONFLICT (store_id, account_user_id). The
-- original partial unique index protected the data, but PostgreSQL cannot infer
-- it for that conflict target without repeating the index predicate. A regular
-- UNIQUE constraint has the same intended semantics here because PostgreSQL
-- permits multiple NULL account_user_id values, while making the upsert target
-- unambiguous.
alter table public.pos_operators
  add constraint pos_operators_store_account_key
  unique (store_id, account_user_id);

drop index if exists public.pos_operators_store_account_unique;

commit;
