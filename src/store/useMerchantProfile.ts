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
      version: 1,
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
