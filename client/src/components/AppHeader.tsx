import { Trash2 } from 'lucide-react';
import { Logo } from './Logo';
import { ThemeSwitcher } from './ThemeSwitcher';
import type { ThemeMode, ThemeName } from '../types/chat';

interface Props {
  theme: ThemeName;
  mode: ThemeMode;
  canClear: boolean;
  onThemeChange: (theme: ThemeName) => void;
  onToggleMode: () => void;
  onClear: () => void;
}

export function AppHeader({
  theme,
  mode,
  canClear,
  onThemeChange,
  onToggleMode,
  onClear,
}: Props) {
  return (
    <header className="header">
      <div className="header__brand">
        <Logo className="header__logo" height={19} />
        <span className="header__divider" aria-hidden="true" />
        <h1 className="header__title">
          чат с <em>Амалией</em>
        </h1>
      </div>

      <div className="header__actions">
        <ThemeSwitcher
          theme={theme}
          mode={mode}
          onThemeChange={onThemeChange}
          onToggleMode={onToggleMode}
        />

        <button
          type="button"
          className="icon-button"
          onClick={onClear}
          disabled={!canClear}
          aria-label="Очистить диалог"
          title="Очистить диалог"
        >
          <Trash2 size={16} aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}
