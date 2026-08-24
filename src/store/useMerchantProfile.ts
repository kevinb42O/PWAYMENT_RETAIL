import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  DEFAULT_CUSTOMER_INSIGHT_SETTINGS,
  DEFAULT_MERCHANT,
  DISABLED_COMMERCIAL_RETURN_POLICY,
  MerchantInfo,
} from '../data/merchant';

interface MerchantProfileState {
  profile: MerchantInfo;
  updateProfile: (patch: Partial<MerchantInfo>) => void;
  resetProfile: () => void;
}

export const useMerchantProfile = create<MerchantProfileState>()(
  persist(
    (set) => ({
      profile: DEFAULT_MERCHANT,
      updateProfile: (patch) =>
        set((state) => ({
          profile: {
            ...state.profile,
            ...patch,
          },
        })),
      resetProfile: () => set({ profile: DEFAULT_MERCHANT }),
    }),
    {
      name: 'pwayment:merchant-profile',
      version: 4,
      migrate: (persistedState: any, version: number) => {
        const state = persistedState as MerchantProfileState | undefined;
        if (state?.profile) {
          if (state.profile.name === 'PWAyment Skate Shop') {
            state.profile.name = 'PWAYMENT';
          }
          if (state.profile.legalName === 'PWAyment Retail BV' || state.profile.legalName === 'PWAyment Skate Shop') {
            state.profile.legalName = 'PWAYMENT';
          }
          state.profile.commercialReturnPolicy ??= {
            ...DISABLED_COMMERCIAL_RETURN_POLICY,
          };
          state.profile.customerInsightSettings ??= {
            ...DEFAULT_CUSTOMER_INSIGHT_SETTINGS,
          };
          state.profile.timezone ??= 'Europe/Brussels';
        }
        return state as MerchantProfileState;
      },
    },
  ),
);

export const getMerchantProfileSnapshot = (): MerchantInfo => {
  try {
    return useMerchantProfile.getState().profile;
  } catch {
    return DEFAULT_MERCHANT;
  }
};
