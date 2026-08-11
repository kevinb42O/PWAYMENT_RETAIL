import { isSupabaseConfigured, supabase } from '../lib/supabase';

export type PublicMarketingEvent =
  | 'cta_clicked'
  | 'pricing_cycle_changed'
  | 'lead_form_started'
  | 'lead_form_succeeded'
  | 'lead_form_failed';

type PublicAnalyticsRpcClient = {
  rpc: (
    fn: 'submit_public_event',
    args: {
      marketing_event_name: PublicMarketingEvent;
      marketing_source_path: string;
      marketing_target: string;
    },
  ) => Promise<{ error: { message?: string } | null }>;
};

const analyticsRpc = supabase as unknown as PublicAnalyticsRpcClient;

export const trackPublicEvent = async (event: PublicMarketingEvent, target = ''): Promise<void> => {
  if (!isSupabaseConfigured || typeof window === 'undefined') return;
  try {
    const { error } = await analyticsRpc.rpc('submit_public_event', {
      marketing_event_name: event,
      marketing_source_path: window.location.pathname,
      marketing_target: target.slice(0, 300),
    });
    if (error) return;
  } catch {
    // Marketing telemetry may never interrupt a public user flow.
  }
};
