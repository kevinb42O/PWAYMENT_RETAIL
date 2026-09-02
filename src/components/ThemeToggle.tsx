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
      <button
        type="button"
        role="menuitemcheckbox"
        aria-checked={isDark}
        aria-label="Donkere modus"
        onClick={toggleMode}
        className="theme-toggle theme-toggle--menu w-full rounded-xl px-3 py-2.5 text-left transition-colors"
      >
        <span className="flex items-center gap-2.5">
          <span className="theme-toggle__icon grid h-8 w-8 shrink-0 place-items-center rounded-lg" aria-hidden="true">
            {isDark ? <Moon size={16} /> : <Sun size={16} />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-bold">Donkere modus</span>
            <span className="theme-toggle__hint mt-0.5 block text-[10px] font-medium">
              {isDark ? 'Aangenaam voor gebruik bij weinig licht' : 'Gebruik de rustige lichte weergave'}
            </span>
          </span>
          <span className={`theme-toggle__switch ${isDark ? 'theme-toggle__switch--on' : ''}`} aria-hidden="true">
            <span className="theme-toggle__thumb" />
          </span>
        </span>
      </button>
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
