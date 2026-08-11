import { describe, expect, it } from 'vitest';
import { defaultGiftCardSelectionId } from './giftCards';

describe('defaultGiftCardSelectionId', () => {
  it('selects the only available gift card', () => {
    expect(defaultGiftCardSelectionId([{ id: 'gc-1' }])).toBe('gc-1');
  });

  it('never silently combines multiple gift cards', () => {
    expect(defaultGiftCardSelectionId([{ id: 'gc-1' }, { id: 'gc-2' }])).toBe('');
  });
});
