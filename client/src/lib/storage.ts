import type { AnswerMode, ChatMessage, SkinName, ThemeMode } from '../types/chat';

const HISTORY_KEY = 'saldo-chat:history:v1';
const THEME_KEY = 'saldo-chat:theme:v1';
const SKIN_KEY = 'saldo-chat:skin:v1';
const ANSWER_MODE_KEY = 'saldo-chat:answer-mode:v1';
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

export function loadTheme(): ThemeMode | null {
  try {
    const raw = localStorage.getItem(THEME_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as unknown;

    // The stored shape used to be `{ name, mode }` with a palette alongside the
    // brightness. Only the brightness is left, and the old records still parse:
    // whatever is in there, the mode field is what this reads.
    const mode =
      typeof parsed === 'string'
        ? parsed
        : ((parsed as { mode?: unknown } | null)?.mode ?? null);

    return mode === 'light' || mode === 'dark' ? mode : null;
  } catch {
    return null;
  }
}

export function saveTheme(mode: ThemeMode): void {
  try {
    localStorage.setItem(THEME_KEY, JSON.stringify({ mode }));
  } catch {
    // ignore
  }
}

/**
 * Appearance is a viewing preference like the theme, not part of the dialog:
 * it survives a reload on its own key and never touches the conversation.
 */
export function loadSkin(): SkinName | null {
  try {
    const raw = localStorage.getItem(SKIN_KEY);
    return raw === 'saldo' || raw === 'portfolio' ? raw : null;
  } catch {
    return null;
  }
}

export function saveSkin(skin: SkinName): void {
  try {
    localStorage.setItem(SKIN_KEY, skin);
  } catch {
    // ignore
  }
}

/**
 * The demo panel's mode is a viewing preference, not part of the dialog, so it
 * survives a reload on its own key and does not touch the conversation.
 */
const DEFAULT_ANSWER_MODE: AnswerMode = 'consult';

function loadAnswerMode(): AnswerMode | null {
  try {
    const raw = localStorage.getItem(ANSWER_MODE_KEY);
    return raw === 'consult' || raw === 'full' ? raw : null;
  } catch {
    return null;
  }
}

/** Stored mode, or the product default. */
export function initialAnswerMode(): AnswerMode {
  return loadAnswerMode() ?? DEFAULT_ANSWER_MODE;
}

export function saveAnswerMode(mode: AnswerMode): void {
  try {
    localStorage.setItem(ANSWER_MODE_KEY, mode);
  } catch {
    // ignore
  }
}
