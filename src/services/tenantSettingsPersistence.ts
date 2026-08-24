import { supabase } from "../lib/supabase";
import { useMerchantProfile } from "../store/useMerchantProfile";
import { useWebshopStore } from "../store/useWebshopStore";
import type { Json } from "../types/database.generated";

let stopCurrentPersistence: (() => void) | null = null;

export const stopTenantSettingsPersistence = (): void => {
  stopCurrentPersistence?.();
  stopCurrentPersistence = null;
};

/** Persist synchronous Zustand settings with a small per-tenant debounce. */
export const startTenantSettingsPersistence = (storeId: string): void => {
  stopTenantSettingsPersistence();

  let merchantTimer: number | undefined;
  let webshopTimer: number | undefined;

  const unsubscribeMerchant = useMerchantProfile.subscribe((state, previous) => {
    if (state.profile === previous.profile) return;
    window.clearTimeout(merchantTimer);
    merchantTimer = window.setTimeout(() => {
      const profile = useMerchantProfile.getState().profile;
      void supabase
        .from("stores")
        .update({
          name: profile.name,
          legal_name: profile.legalName ?? null,
          address_line_1: profile.addressLine1 || null,
          address_line_2: profile.addressLine2 || null,
          vat_number: profile.vatNumber || null,
          phone: profile.phone || null,
          email: profile.email || null,
          website: profile.website || null,
          receipt_footer: profile.footer || null,
          return_policy: profile.returnPolicy || null,
          commercial_return_policy: (profile.commercialReturnPolicy ?? null) as unknown as Json | null,
          customer_insight_settings: (profile.customerInsightSettings ?? null) as unknown as Json | null,
          pace_recommendation_rules: (profile.paceRecommendationRules ?? []) as unknown as Json,
        })
        .eq("id", storeId)
        .then(({ error }) => {
          if (error) console.error("Winkelinstellingen synchroniseren mislukt", error);
        });
    }, 500);
  });

  const unsubscribeWebshop = useWebshopStore.subscribe((state, previous) => {
    if (state === previous) return;
    window.clearTimeout(webshopTimer);
    webshopTimer = window.setTimeout(() => {
      const stateSnapshot = useWebshopStore.getState();
      const settings = JSON.parse(JSON.stringify(stateSnapshot)) as Record<string, unknown>;
      // Subscription state has its own protected table. Never persist a legacy
      // client-controlled activePlan field back into tenant webshop settings.
      delete settings.activePlan;
      void supabase
        .from("webshop_settings")
        .upsert(
          {
            store_id: storeId,
            settings: settings as Json,
            is_enabled: stateSnapshot.isEnabled,
            subdomain: stateSnapshot.subdomain.trim() || null,
            custom_domain: stateSnapshot.customDomain.trim() || null,
            is_demo: false,
          },
          { onConflict: "store_id" },
        )
        .then(({ error }) => {
          if (error) console.error("Webshopinstellingen synchroniseren mislukt", error);
        });
    }, 500);
  });

  stopCurrentPersistence = () => {
    window.clearTimeout(merchantTimer);
    window.clearTimeout(webshopTimer);
    unsubscribeMerchant();
    unsubscribeWebshop();
  };
};
