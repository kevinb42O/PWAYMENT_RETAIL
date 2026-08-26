begin;

-- Cover the bounded Pace query shapes without introducing a separate analytics
-- warehouse. These indexes also benefit Insights and record lookup screens.
create index if not exists transaction_lines_store_product_transaction_idx
  on public.transaction_lines (store_id, product_id, transaction_id)
  where product_id is not null;

create index if not exists transactions_store_finalized_kind_occurred_idx
  on public.transactions (store_id, kind, occurred_at desc)
  where is_finalized;

create index if not exists transactions_store_customer_occurred_idx
  on public.transactions (store_id, customer_id, occurred_at desc)
  where is_finalized and customer_id is not null;

create index if not exists stock_movements_store_product_occurred_idx
  on public.stock_movements (store_id, product_id, occurred_at desc);

create index if not exists daily_reports_store_occurred_idx
  on public.daily_reports (store_id, occurred_at desc);

create index if not exists void_entries_store_occurred_idx
  on public.void_entries (store_id, occurred_at desc);

create index if not exists purchase_orders_store_created_idx
  on public.purchase_orders (store_id, created_at desc);

create index if not exists webshop_orders_store_created_idx
  on public.webshop_orders (store_id, created_at desc);

commit;
