export type ThemeMode = 'dark' | 'light';

const THEME_STORAGE_KEY = 'pwayment-theme';

export const isThemeMode = (value: unknown): value is ThemeMode => value === 'dark' || value === 'light';

export const readInitialThemeMode = (): ThemeMode => {
  if (typeof window === 'undefined') return 'dark';

  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (!raw) return 'dark';
    const parsed = JSON.parse(raw) as { state?: { mode?: unknown } } | null;
    return isThemeMode(parsed?.state?.mode) ? parsed.state.mode : 'dark';
  } catch {
    return 'dark';
  }
};

export const applyThemeMode = (mode: ThemeMode): void => {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;
  root.dataset.theme = mode;
  root.classList.toggle('theme-light', mode === 'light');
  root.classList.toggle('theme-dark', mode === 'dark');
  root.style.colorScheme = mode;

  const themeColor = mode === 'light' ? '#f8fafc' : '#0a0a0a';
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) meta.content = themeColor;
};