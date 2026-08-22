-- A single POS receipt may issue/recharge multiple cards.  `external_id` is
-- already tenant-unique and is the precise idempotency key per ledger event;
-- request id remains indexed for receipt-level lookup.
drop index if exists public.gift_card_events_idempotency_unique;
create index if not exists gift_card_events_request_lookup_idx
  on public.gift_card_events (store_id, client_request_id)
  where client_request_id is not null;
