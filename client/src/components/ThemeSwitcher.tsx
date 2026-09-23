import { Moon, Sun } from 'lucide-react';
import type { ThemeMode, ThemeName } from '../types/chat';

const THEMES: { name: ThemeName; label: string }[] = [
  { name: 'cream', label: 'Крем' },
  { name: 'indigo', label: 'Индиго' },
  { name: 'mint', label: 'Мята' },
];

interface Props {
  theme: ThemeName;
  mode: ThemeMode;
  onThemeChange: (theme: ThemeName) => void;
  onToggleMode: () => void;
}

/**
 * Palette and brightness are separate axes, so they get separate controls:
 * three swatches and one day/night toggle.
 *
 * The swatches are real radio inputs rather than buttons with `role="radio"`,
 * so the group behaves natively: one tab stop, arrow keys to switch.
 */
export function ThemeSwitcher({
  theme,
  mode,
  onThemeChange,
  onToggleMode,
}: Props) {
  const nextMode = mode === 'dark' ? 'светлую' : 'тёмную';

  return (
    <div className="theme-bar">
      <fieldset className="theme-bar__swatches">
        <legend className="sr-only">Цветовая схема</legend>

        {THEMES.map((entry) => (
          <label
            key={entry.name}
            className="swatch"
            data-swatch={entry.name}
            title={entry.label}
          >
            <input
              type="radio"
              name="theme"
              value={entry.name}
              checked={theme === entry.name}
              onChange={() => onThemeChange(entry.name)}
              className="sr-only"
            />
            <span className="swatch__dot" aria-hidden="true" />
            <span className="sr-only">Схема «{entry.label}»</span>
          </label>
        ))}
      </fieldset>

      <span className="theme-bar__divider" aria-hidden="true" />

      <button
        type="button"
        className="theme-bar__mode"
        onClick={onToggleMode}
        aria-label={`Включить ${nextMode} тему`}
        title={`Включить ${nextMode} тему`}
      >
        {mode === 'dark' ? (
          <Moon size={15} aria-hidden="true" />
        ) : (
          <Sun size={15} aria-hidden="true" />
        )}
      </button>
    </div>
  );
}
