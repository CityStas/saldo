import { Moon, Sun } from 'lucide-react';
import type { ThemeMode } from '../types/chat';

interface Props {
  mode: ThemeMode;
  onToggle: () => void;
}

/**
 * Light and dark, one button.
 *
 * There used to be a second axis here - three palettes chosen with a row of
 * swatches - and it was removed. The chat is a client of САЛЬДО, and offering
 * three colourways of someone else's brand made the header read as a theme
 * demo. What is left is the one palette the service uses, in the two
 * brightnesses the assignment asked for.
 *
 * The label names the theme the button switches *to*, which is what a person
 * is looking for when they reach for it.
 */
export function ThemeToggle({ mode, onToggle }: Props) {
  const next = mode === 'dark' ? 'светлую' : 'тёмную';

  return (
    <button
      type="button"
      className="icon-button"
      onClick={onToggle}
      aria-label={`Включить ${next} тему`}
      title={`Включить ${next} тему`}
    >
      {mode === 'dark' ? (
        <Moon size={16} aria-hidden="true" />
      ) : (
        <Sun size={16} aria-hidden="true" />
      )}
    </button>
  );
}
