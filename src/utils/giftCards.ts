import { GiftCard } from '../types';
import { endOfStoreDate } from './time';

/** Missing expiry means unlimited validity; an invalid or reached expiry is unsafe to redeem. */
export const isGiftCardExpired = (giftCard: Pick<GiftCard, 'expiresAt'>, now = Date.now()): boolean => {
  if (!giftCard.expiresAt) return false;
  const dateOnlyEnd = endOfStoreDate(giftCard.expiresAt);
  const expiresAt = dateOnlyEnd ?? Date.parse(giftCard.expiresAt);
  return !Number.isFinite(expiresAt) || expiresAt < now;
};

/** Auto-select only when there is exactly one possible card. */
export const defaultGiftCardSelectionId = <T extends Pick<GiftCard, 'id'>>(
  cards: T[],
): string => (cards.length === 1 ? cards[0].id : '');
