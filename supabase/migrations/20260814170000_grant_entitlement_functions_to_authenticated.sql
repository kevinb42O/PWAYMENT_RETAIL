begin;

-- Grant usage on schema private and execute on entitlement checking functions
-- so authenticated users evaluating RLS policies (e.g. audit_entries, service_orders, workforce tables)
-- do not fail with 42501 (permission denied / HTTP 403).
grant usage on schema private to authenticated;
grant execute on function private.has_entitlement(uuid, text) to authenticated;
grant execute on function private.effective_plan(uuid) to authenticated;
grant execute on function private.entitlement_limit(uuid, text) to authenticated;

commit;
