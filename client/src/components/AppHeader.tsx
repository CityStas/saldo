import { Trash2 } from 'lucide-react';
import { Logo } from './Logo';
import { TelegramButton } from './TelegramButton';
import { ThemeSwitcher } from './ThemeSwitcher';
import { THEME_PICKER_ENABLED } from '../lib/theme';
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
        <Logo className="header__logo" height={28} />
        <span className="header__divider" aria-hidden="true" />
        <h1 className="header__title">
          чат с <em>Амалией</em>
        </h1>
      </div>

      <div className="header__actions">
        <TelegramButton size="sm" />

        {THEME_PICKER_ENABLED ? (
          <ThemeSwitcher
            theme={theme}
            mode={mode}
            onThemeChange={onThemeChange}
            onToggleMode={onToggleMode}
          />
        ) : null}

        {/*
          Not rendered at all while the dialog is empty: an always-present
          disabled button on the first screen is noise. It appears as soon as
          there is something to clear.
        */}
        {canClear ? (
          <button
            type="button"
            className="icon-button"
            onClick={onClear}
            aria-label="Очистить диалог"
            title="Очистить диалог"
          >
            <Trash2 size={16} aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </header>
  );
}
