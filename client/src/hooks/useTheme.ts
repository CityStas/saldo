import { useCallback, useEffect, useState } from 'react';
import { loadTheme, saveTheme } from '../lib/storage';
import { DEFAULT_MODE } from '../lib/appearance';
import type { ThemeMode } from '../types/chat';

export interface ThemeState {
  mode: ThemeMode;
  toggleMode: () => void;
}

/**
 * Brightness is applied as a `data-mode` attribute on <html> so all styling
 * stays in CSS and nothing re-renders on switch.
 *
 * The stored choice is read again by the inline script in index.html, so the
 * right palette is painted before the bundle runs and a reload does not flash
 * the wrong one.
 */
export function useTheme(): ThemeState {
  const [mode, setMode] = useState<ThemeMode>(() => loadTheme() ?? DEFAULT_MODE);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.mode = mode;
    root.style.colorScheme = mode;

    saveTheme(mode);
  }, [mode]);

  const toggleMode = useCallback(() => {
    setMode((current) => (current === 'dark' ? 'light' : 'dark'));
  }, []);

  return { mode, toggleMode };
}
