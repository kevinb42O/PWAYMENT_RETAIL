begin;

-- The private deduplication ledger must follow the lifecycle of the source
-- tenant data. Cascades prevent obsolete transaction/product IDs from
-- accumulating when a store or transaction is permanently removed.
alter table private.pace_processed_products
  add constraint pace_processed_products_transaction_fk
    foreign key (store_id, transaction_id)
    references public.transactions(store_id, id)
    on delete cascade,
  add constraint pace_processed_products_product_fk
    foreign key (store_id, product_id)
    references public.products(store_id, id)
    on delete cascade;

alter table private.pace_processed_pairs
  add constraint pace_processed_pairs_transaction_fk
    foreign key (store_id, transaction_id)
    references public.transactions(store_id, id)
    on delete cascade,
  add constraint pace_processed_pairs_first_product_fk
    foreign key (store_id, first_product_id)
    references public.products(store_id, id)
    on delete cascade,
  add constraint pace_processed_pairs_second_product_fk
    foreign key (store_id, second_product_id)
    references public.products(store_id, id)
    on delete cascade;

commit;
