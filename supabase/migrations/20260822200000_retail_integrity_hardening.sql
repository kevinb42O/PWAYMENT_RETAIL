-- Final integrity hardening after the additive retail rollout.
--
-- The generic VAT migration installs its check as NOT VALID so a rolling
-- deployment can inspect historic rows before taking a table-wide validation
-- lock. The release audit has now proven every historic row valid, so mark the
-- constraint fully validated. The private deep-inventory ledger already has
-- every client privilege revoked; RLS adds defense in depth for future grants.

begin;

alter table public.transactions
  validate constraint transactions_retail_vat_breakdown_check;

alter table private.inventory_ledger_entries enable row level security;

comment on table private.inventory_ledger_entries is
  'Private append-only evidence for location, lot, serial and measured inventory movements. No client role has direct write access.';

commit;
