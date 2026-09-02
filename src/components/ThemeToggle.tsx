import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../store/useTheme';

interface ThemeToggleProps {
  compact?: boolean;
  /** A full-width preference row intended for the Kassa settings menu. */
  menu?: boolean;
}

export const ThemeToggle: React.FC<ThemeToggleProps> = ({ compact = false, menu = false }) => {
  const mode = useTheme((state) => state.mode);
  const toggleMode = useTheme((state) => state.toggleMode);
  const isDark = mode === 'dark';
  const label = isDark ? 'Schakel naar lichte modus' : 'Schakel naar donkere modus';

  if (menu) {
    return (
      <section className="theme-mode-slider" aria-label="Weergave kiezen">
        <button
          type="button"
          role="switch"
          aria-checked={isDark}
          aria-label={label}
          onClick={toggleMode}
          className="theme-mode-slider__control w-full rounded-xl p-2.5 text-left"
        >
          <span className="theme-mode-slider__heading">
            <span className="theme-mode-slider__icon" aria-hidden="true">
            {isDark ? <Moon size={15} /> : <Sun size={15} />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="theme-mode-slider__title">{isDark ? 'Donkere modus' : 'Lichte modus'}</span>
              <span className="theme-mode-slider__description">
                {isDark ? 'Rustig voor gebruik bij weinig licht' : 'Heldere weergave voor overdag'}
              </span>
            </span>
          </span>
          <span className={`theme-mode-slider__track ${isDark ? 'theme-mode-slider__track--on' : ''}`} aria-hidden="true">
            <span className="theme-mode-slider__thumb">
              {isDark ? <Moon size={11} /> : <Sun size={11} />}
            </span>
          </span>
        </button>
      </section>
    );
  }

  return (
    <button
      type="button"
      onClick={toggleMode}
      className={`theme-toggle inline-flex items-center rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-300 shadow-sm transition-colors hover:bg-zinc-800 hover:text-white ${
        compact ? 'gap-0 p-2' : 'gap-2 px-3 py-2'
      }`}
      title={label}
      aria-label={label}
      aria-pressed={isDark}
    >
      {isDark ? <Sun size={18} /> : <Moon size={18} />}
      {!compact && (
        <span className="hidden text-sm font-semibold sm:inline">
          {isDark ? 'Light' : 'Dark'}
        </span>
      )}
    </button>
  );
};
