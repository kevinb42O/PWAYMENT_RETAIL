begin;

-- Basis includes a usable, 30-day sales history. Keep this separate from
-- `history.full`, which unlocks the extended history window on paid plans,
-- and from the Enterprise-only raw audit viewer.
insert into public.billing_features (feature_key, name, category, value_type)
values ('history.viewer', 'Verkoopshistoriek', 'reports', 'boolean')
on conflict (feature_key) do update set
  name = excluded.name,
  category = excluded.category,
  value_type = excluded.value_type;

insert into public.billing_plan_features (plan_code, feature_key, enabled, limit_value)
select code, 'history.viewer', true, null
from public.billing_plans
on conflict (plan_code, feature_key) do update set
  enabled = excluded.enabled,
  limit_value = excluded.limit_value;

commit;
