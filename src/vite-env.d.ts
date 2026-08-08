/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
	readonly VITE_SEED_DEMO_PRODUCTS?: string;
	readonly VITE_SEED_RETAIL_CATALOG?: string;
	readonly VITE_AUTO_RESET_LEGACY_CATALOG?: string;
}
