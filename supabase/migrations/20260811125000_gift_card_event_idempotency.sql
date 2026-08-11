-- A single sale may redeem multiple cards. Idempotency therefore belongs to
-- the request/card/event tuple, not to the request alone.
drop index if exists public.gift_card_events_idempotency_unique;
create unique index gift_card_events_idempotency_per_card_unique
  on public.gift_card_events (store_id, client_request_id, gift_card_id, event_type)
  where client_request_id is not null;
