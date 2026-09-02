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
  const setMode = useTheme((state) => state.setMode);
  const toggleMode = useTheme((state) => state.toggleMode);
  const isDark = mode === 'dark';
  const label = isDark ? 'Schakel naar lichte modus' : 'Schakel naar donkere modus';

  if (menu) {
    return (
      <section className="theme-mode-picker" aria-label="Weergave kiezen">
        <div className="theme-mode-picker__heading">
          <span className="theme-mode-picker__icon" aria-hidden="true">
            {isDark ? <Moon size={15} /> : <Sun size={15} />}
          </span>
          <span>
            <span className="theme-mode-picker__title">Weergave</span>
            <span className="theme-mode-picker__description">
              {isDark ? 'Donkere modus is actief' : 'Lichte modus is actief'}
            </span>
          </span>
        </div>
        <div className="theme-mode-picker__choices" role="group" aria-label="Kies lichte of donkere modus">
          <button
            type="button"
            role="menuitemradio"
            aria-checked={!isDark}
            onClick={() => setMode('light')}
            className={`theme-mode-picker__choice ${!isDark ? 'theme-mode-picker__choice--active' : ''}`}
          >
            <Sun size={14} aria-hidden="true" />
            Licht
          </button>
          <button
            type="button"
            role="menuitemradio"
            aria-checked={isDark}
            onClick={() => setMode('dark')}
            className={`theme-mode-picker__choice ${isDark ? 'theme-mode-picker__choice--active' : ''}`}
          >
            <Moon size={14} aria-hidden="true" />
            Donker
          </button>
        </div>
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
