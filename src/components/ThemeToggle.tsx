import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../store/useTheme';

interface ThemeToggleProps {
  compact?: boolean;
}

export const ThemeToggle: React.FC<ThemeToggleProps> = ({ compact = false }) => {
  const mode = useTheme((state) => state.mode);
  const toggleMode = useTheme((state) => state.toggleMode);
  const isLight = mode === 'light';

  return (
    <button
      type="button"
      onClick={toggleMode}
      className={`theme-toggle inline-flex items-center rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-300 shadow-sm transition-colors hover:bg-zinc-800 hover:text-white ${
        compact ? 'gap-0 p-2' : 'gap-2 px-3 py-2'
      }`}
      title={isLight ? 'Schakel naar dark mode' : 'Schakel naar light mode'}
      aria-label={isLight ? 'Schakel naar dark mode' : 'Schakel naar light mode'}
      aria-pressed={isLight}
    >
      {isLight ? <Moon size={18} /> : <Sun size={18} />}
      {!compact && (
        <span className="hidden text-sm font-semibold sm:inline">
          {isLight ? 'Dark' : 'Light'}
        </span>
      )}
    </button>
  );
};
