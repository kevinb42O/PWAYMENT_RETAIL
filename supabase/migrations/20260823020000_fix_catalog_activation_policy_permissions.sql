-- Product/category RLS policies call these private SECURITY DEFINER helpers.
-- PostgreSQL still checks EXECUTE for the caller before evaluating that policy,
-- so revoking it from authenticated users made every product create/update fail
-- with "permission denied for function can_activate_product".
-- The helpers remain schema-private and only return a boolean entitlement check.
grant execute on function private.can_activate_product(uuid, uuid, boolean) to authenticated;
grant execute on function private.can_activate_category(uuid, uuid, boolean) to authenticated;
