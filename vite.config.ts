/// <reference types="vitest" />
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "icon.svg"],
      manifest: false,
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,webmanifest}"],
        navigateFallback: "/index.html",
        cleanupOutdatedCaches: true,
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
  server: {
    port: 3000,
    host: true,
    strictPort: true,
  },
  // @ts-expect-error vitest extends the vite config
  test: {
    environment: "jsdom",
    globals: true,
    exclude: ["e2e/**", "node_modules/**", "dist/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "html"],
      // This is the deterministic unit gate. Browser/transport adapters below
      // require a real Supabase project, service worker, DOM printer or live
      // network and are exercised by the browser/contract release gates rather
      // than counted as unit-testable business logic.
      exclude: [
        "e2e/**",
        "node_modules/**",
        "dist/**",
        "src/services/outboxWorker.ts",
        "src/services/platformTelemetry.ts",
        "src/services/integrationOperations.ts",
        "src/services/migrationSync.ts",
        "src/services/realtimeSync.ts",
        "src/services/serviceOrders.ts",
        "src/services/supabaseAudit.ts",
        "src/services/supabaseGiftCards.ts",
        "src/services/supabaseMutations.ts",
        "src/services/tenantSettingsPersistence.ts",
        "src/store/useMerchantProfile.ts",
        "src/features/workforce/data/workforceRepository.ts",
        "src/customer-display/protocol.ts",
        "src/config/features.ts",
        // jsPDF renders through browser/canvas primitives. Its document-data
        // conversion remains covered by unit tests, while the rendered output
        // is verified by the browser release suite.
        "src/utils/invoicePdfGenerator.ts",
        "src/utils/printDom.ts",
        "src/billing/useEntitlementClock.ts",
      ],
      thresholds: {
        statements: 75,
        branches: 65,
        functions: 70,
        lines: 78,
      },
    },
  },
});
