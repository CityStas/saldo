import { useCallback, useEffect, useState } from 'react';
import { loadTheme, saveTheme } from '../lib/storage';
import { SITE_THEME, THEME_PICKER_ENABLED } from '../lib/theme';
import type { ThemeMode, ThemeName } from '../types/chat';

function systemMode(): ThemeMode {
  if (typeof window === 'undefined' || !window.matchMedia) return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

export interface ThemeState {
  theme: ThemeName;
  mode: ThemeMode;
  setTheme: (theme: ThemeName) => void;
  setMode: (mode: ThemeMode) => void;
  toggleMode: () => void;
}

/**
 * Theme is two independent axes: palette (`cream | indigo | mint`) and
 * brightness (`light | dark`), applied as data attributes on <html> so all
 * styling stays in CSS and nothing re-renders on switch.
 *
 * While the picker is hidden the state is pinned to the site's scheme and the
 * stored value is neither read nor written, so an old preference from an
 * earlier session cannot leak back in. The setters stay in the API so the
 * header does not have to know about the switch.
 */
export function useTheme(): ThemeState {
  const [state, setState] = useState(() => {
    if (!THEME_PICKER_ENABLED) return { ...SITE_THEME };
    const stored = loadTheme();
    return stored ?? { name: 'cream' as ThemeName, mode: systemMode() };
  });

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = state.name;
    root.dataset.mode = state.mode;
    root.style.colorScheme = state.mode;

    if (THEME_PICKER_ENABLED) saveTheme(state);
  }, [state]);

  const setTheme = useCallback((theme: ThemeName) => {
    if (!THEME_PICKER_ENABLED) return;
    setState((current) => ({ ...current, name: theme }));
  }, []);

  const setMode = useCallback((mode: ThemeMode) => {
    if (!THEME_PICKER_ENABLED) return;
    setState((current) => ({ ...current, mode }));
  }, []);

  const toggleMode = useCallback(() => {
    if (!THEME_PICKER_ENABLED) return;
    setState((current) => ({
      ...current,
      mode: current.mode === 'dark' ? 'light' : 'dark',
    }));
  }, []);

  return { theme: state.name, mode: state.mode, setTheme, setMode, toggleMode };
}
