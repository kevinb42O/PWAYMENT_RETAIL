/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
	readonly VITE_SEED_DEMO_PRODUCTS?: string;
	readonly VITE_PUBLIC_WEBSHOP_IDENTIFIER?: string;
	readonly VITE_AUTO_RESET_LEGACY_CATALOG?: string;
	readonly VITE_SUPABASE_URL?: string;
	readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
}
