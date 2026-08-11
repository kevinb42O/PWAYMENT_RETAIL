import { isSupabaseConfigured, requireSupabaseConfiguration, supabase } from '../lib/supabase';

export interface PublicLeadInput {
  requestType: 'demo' | 'contact';
  firstName: string;
  lastName: string;
  email: string;
  company: string;
  locations?: string;
  currentSystem?: string;
  message: string;
  sourcePath: string;
  consentedAt: string;
}

type PublicLeadRpcClient = {
  rpc: (
    fn: 'submit_public_lead',
    args: {
      lead_request_type: string;
      lead_first_name: string;
      lead_last_name: string;
      lead_email: string;
      lead_company: string;
      lead_locations: string;
      lead_current_system: string;
      lead_message: string;
      lead_source_path: string;
      lead_consented_at: string;
    },
  ) => Promise<{ data: string | null; error: { message?: string } | null }>;
};

const leadRpc = supabase as unknown as PublicLeadRpcClient;

export const publicLeadStorageAvailable = (): boolean => isSupabaseConfigured;

export const submitPublicLead = async (input: PublicLeadInput): Promise<string> => {
  requireSupabaseConfiguration();
  const { data, error } = await leadRpc.rpc('submit_public_lead', {
    lead_request_type: input.requestType,
    lead_first_name: input.firstName,
    lead_last_name: input.lastName,
    lead_email: input.email,
    lead_company: input.company,
    lead_locations: input.locations ?? '',
    lead_current_system: input.currentSystem ?? '',
    lead_message: input.message,
    lead_source_path: input.sourcePath,
    lead_consented_at: input.consentedAt,
  });
  if (error || !data) {
    throw new Error(error?.message || 'De aanvraag kon niet veilig worden opgeslagen.');
  }
  return data;
};
