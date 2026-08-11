import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_MERCHANT, MerchantInfo } from '../data/merchant';

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
      version: 2,
      migrate: (persistedState: any, version: number) => {
        const state = persistedState as MerchantProfileState | undefined;
        if (state?.profile) {
          if (state.profile.name === 'PWAyment Skate Shop') {
            state.profile.name = 'PWAYMENT';
          }
          if (state.profile.legalName === 'PWAyment Retail BV' || state.profile.legalName === 'PWAyment Skate Shop') {
            state.profile.legalName = 'PWAYMENT';
          }
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
