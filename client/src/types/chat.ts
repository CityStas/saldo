export type MessageRole = 'user' | 'assistant';

export type ChatErrorCode =
  | 'BAD_REQUEST'
  | 'NO_MODELS'
  | 'AUTH'
  | 'RATE_LIMIT'
  | 'TIMEOUT'
  | 'UPSTREAM_ERROR'
  | 'NETWORK'
  | 'CANCELLED'
  | 'UNKNOWN';

export type MessageStatus = 'complete' | 'streaming' | 'stopped' | 'failed';

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  /**
   * Chain-of-thought, when the provider exposes it. Kept in the message shape
   * for stored history, but never rendered - the UI shows a single voice.
   */
  reasoning?: string;
  /**
   * The model has started emitting reasoning. Reasoning text is not shown, but
   * knowing it arrived is what lets the UI say "формулирует ответ" instead of
   * an unexplained spinner while a reasoning model warms up.
   */
  hasReasoning?: boolean;
  status: MessageStatus;
  createdAt: number;
  elapsedMs?: number;
  errorCode?: ChatErrorCode;
}

export interface ChatError {
  code: ChatErrorCode;
  /** Technical message from the server, kept for the "details" toggle. */
  detail?: string;
  /** Milliseconds until the client may retry (rate limit). */
  retryAfterMs?: number;
}

export interface DonePayload {
  model: string;
  finishReason: string | null;
  elapsedMs: number;
  attempts: number;
}

export type ThemeName = 'cream' | 'indigo' | 'mint';
export type ThemeMode = 'light' | 'dark';
