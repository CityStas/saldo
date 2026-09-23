import type { ChatMessage, ThemeMode, ThemeName } from '../types/chat';

const HISTORY_KEY = 'saldo-chat:history:v1';
const THEME_KEY = 'saldo-chat:theme:v1';
const MAX_STORED_MESSAGES = 60;

/**
 * sessionStorage, not localStorage: the assignment scopes history to the
 * current session, and sessionStorage survives an accidental reload while
 * dying with the tab. Nothing leaves the device.
 */
export function loadHistory(): ChatMessage[] {
  try {
    const raw = sessionStorage.getItem(HISTORY_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    return (parsed as ChatMessage[])
      .filter(
        (message) =>
          message &&
          typeof message.id === 'string' &&
          (message.role === 'user' || message.role === 'assistant') &&
          typeof message.content === 'string',
      )
      .map((message) => ({
        ...message,
        // A generation that was in flight when the tab was reloaded can never
        // finish, so it must not come back as "streaming".
        status: message.status === 'streaming' ? 'stopped' : message.status,
      }));
  } catch {
    return [];
  }
}

export function saveHistory(messages: ChatMessage[]): void {
  try {
    const trimmed = messages.slice(-MAX_STORED_MESSAGES);
    sessionStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
  } catch {
    // Quota or privacy mode - history persistence is a nice-to-have.
  }
}

export function clearStoredHistory(): void {
  try {
    sessionStorage.removeItem(HISTORY_KEY);
  } catch {
    // ignore
  }
}

export interface StoredTheme {
  name: ThemeName;
  mode: ThemeMode;
}

export function loadTheme(): StoredTheme | null {
  try {
    const raw = localStorage.getItem(THEME_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<StoredTheme>;
    const names: ThemeName[] = ['cream', 'indigo', 'mint'];

    if (!parsed.name || !names.includes(parsed.name)) return null;
    if (parsed.mode !== 'light' && parsed.mode !== 'dark') return null;

    return { name: parsed.name, mode: parsed.mode };
  } catch {
    return null;
  }
}

export function saveTheme(theme: StoredTheme): void {
  try {
    localStorage.setItem(THEME_KEY, JSON.stringify(theme));
  } catch {
    // ignore
  }
}
