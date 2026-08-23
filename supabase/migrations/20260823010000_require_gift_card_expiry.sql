-- All newly issued cards are valid only until an explicit future date. Existing
-- historical cards are untouched; this applies at write time only.
create or replace function private.require_gift_card_expiry()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.expires_at is null or new.expires_at <= clock_timestamp() then
    raise exception using errcode = 'P0001', message = 'giftcard:expiry-required:Een nieuwe cadeaubon heeft een toekomstige vervaldatum nodig.';
  end if;
  return new;
end $$;

drop trigger if exists require_gift_card_expiry_before_insert on public.gift_cards;
create trigger require_gift_card_expiry_before_insert
  before insert on public.gift_cards
  for each row execute function private.require_gift_card_expiry();
