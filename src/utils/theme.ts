export type ThemeMode = 'dark' | 'light';

const THEME_STORAGE_KEY = 'pwayment-theme';

export const isThemeMode = (value: unknown): value is ThemeMode => value === 'dark' || value === 'light';

export const readInitialThemeMode = (): ThemeMode => {
  if (typeof window === 'undefined') return 'light';

  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (!raw) return 'light';
    const parsed = JSON.parse(raw) as { state?: { mode?: unknown } } | null;
    return isThemeMode(parsed?.state?.mode) ? parsed.state.mode : 'light';
  } catch {
    return 'light';
  }
};

export const applyThemeMode = (mode: ThemeMode): void => {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;
  root.dataset.theme = mode;
  root.classList.toggle('theme-light', mode === 'light');
  root.classList.toggle('theme-dark', mode === 'dark');
  root.style.colorScheme = mode;

  const themeColor = mode === 'light' ? '#f4f8fb' : '#07111f';
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) meta.content = themeColor;
};
