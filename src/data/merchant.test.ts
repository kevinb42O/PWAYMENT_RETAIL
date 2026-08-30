import { describe, expect, it } from 'vitest';
import { DEFAULT_MERCHANT, merchantIdentityIssues, type MerchantInfo } from './merchant';

describe('merchantIdentityIssues', () => {
  it('rejects the bundled example identity', () => {
    expect(merchantIdentityIssues(DEFAULT_MERCHANT)).toEqual(expect.arrayContaining([
      'winkelnaam',
      'officiële bedrijfsnaam',
      'straat en nummer',
      'postcode en gemeente',
      'geldig Belgisch btw-nummer',
    ]));
  });

  it('accepts a complete non-placeholder Belgian merchant identity', () => {
    const merchant: MerchantInfo = {
      ...DEFAULT_MERCHANT,
      name: 'Voorbeeldboetiek',
      legalName: 'Voorbeeldboetiek BV',
      addressLine1: 'Markt 12',
      addressLine2: '1000 Brussel',
      vatNumber: 'BE0746.123.456',
    };
    expect(merchantIdentityIssues(merchant)).toEqual([]);
  });
});
