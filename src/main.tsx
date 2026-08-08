import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { ensureSeedUsers } from './auth/useAuth';
import { useProducts } from './store/useProducts';
import { applyThemeMode, readInitialThemeMode } from './utils/theme';

applyThemeMode(readInitialThemeMode());

// Seed default users (idempotent) before first render.
void ensureSeedUsers();
// Load (and seed-on-first-run) the product catalog.
void useProducts.getState().hydrate();

const presentationMode = new URLSearchParams(window.location.search).get('presentation') === '1';
const presentationBuild = import.meta.env.VITE_PRESENTATION_BUILD === 'true';

// Presentation builds deliberately avoid a service worker: a stale app shell
// must never interfere with a live embedded demo.
if ('serviceWorker' in navigator && (presentationMode || presentationBuild)) {
  void navigator.serviceWorker.getRegistrations().then((registrations) =>
    Promise.all(registrations.map((registration) => registration.unregister())),
  );
} else if ('serviceWorker' in navigator && import.meta.env.PROD) {
  void import('virtual:pwa-register').then(({ registerSW }) => {
    registerSW({ immediate: true });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
