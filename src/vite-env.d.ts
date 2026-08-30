/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
	readonly VITE_SEED_DEMO_PRODUCTS?: string;
	readonly VITE_PUBLIC_WEBSHOP_IDENTIFIER?: string;
	readonly VITE_AUTO_RESET_LEGACY_CATALOG?: string;
	readonly VITE_SUPABASE_URL?: string;
	readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
	readonly VITE_ENABLE_PACE_AI?: string;
	readonly VITE_LEGAL_NAME?: string;
	readonly VITE_LEGAL_TRADE_NAME?: string;
	readonly VITE_LEGAL_FORM?: string;
	readonly VITE_LEGAL_ADDRESS?: string;
	readonly VITE_LEGAL_ENTERPRISE_NUMBER?: string;
	readonly VITE_LEGAL_VAT_NUMBER?: string;
	readonly VITE_LEGAL_RPR?: string;
	readonly VITE_LEGAL_EMAIL?: string;
	readonly VITE_PRIVACY_EMAIL?: string;
	readonly VITE_SUPPORT_EMAIL?: string;
	readonly VITE_LEGAL_PHONE?: string;
}
