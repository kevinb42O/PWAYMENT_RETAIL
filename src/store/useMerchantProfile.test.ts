import { describe, expect, it, beforeEach } from 'vitest';
import { useMerchantProfile } from './useMerchantProfile';
import { DEFAULT_MERCHANT } from '../data/merchant';

describe('useMerchantProfile', () => {
  beforeEach(() => {
    useMerchantProfile.getState().resetProfile();
  });

  it('defaults to PWAYMENT merchant profile', () => {
    const profile = useMerchantProfile.getState().profile;
    expect(profile.name).toBe('PWAYMENT');
    expect(profile.legalName).toBe('PWAYMENT');
  });

  it('resets to DEFAULT_MERCHANT with PWAYMENT', () => {
    useMerchantProfile.getState().updateProfile({ name: 'Custom Store' });
    expect(useMerchantProfile.getState().profile.name).toBe('Custom Store');

    useMerchantProfile.getState().resetProfile();
    expect(useMerchantProfile.getState().profile.name).toBe('PWAYMENT');
  });
});
