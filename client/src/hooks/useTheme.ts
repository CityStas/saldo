import { useCallback, useEffect, useState } from 'react';
import { loadTheme, saveTheme } from '../lib/storage';
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
 */
export function useTheme(): ThemeState {
  const [state, setState] = useState(() => {
    const stored = loadTheme();
    return stored ?? { name: 'cream' as ThemeName, mode: systemMode() };
  });

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = state.name;
    root.dataset.mode = state.mode;
    root.style.colorScheme = state.mode;
    saveTheme(state);
  }, [state]);

  const setTheme = useCallback((theme: ThemeName) => {
    setState((current) => ({ ...current, name: theme }));
  }, []);

  const setMode = useCallback((mode: ThemeMode) => {
    setState((current) => ({ ...current, mode }));
  }, []);

  const toggleMode = useCallback(() => {
    setState((current) => ({
      ...current,
      mode: current.mode === 'dark' ? 'light' : 'dark',
    }));
  }, []);

  return { theme: state.name, mode: state.mode, setTheme, setMode, toggleMode };
}
