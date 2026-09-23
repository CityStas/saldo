export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ChatRequestBody {
  /** Full conversation history, oldest first. */
  messages: ChatMessage[];
  /** Optional explicit model override, e.g. "openrouter/free". */
  model?: string;
}

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

export interface ApiErrorBody {
  error: {
    code: ChatErrorCode;
    message: string;
    /** Present for RATE_LIMIT: how long to wait before retrying, in ms. */
    retryAfterMs?: number;
  };
}

export type ModelStatus = 'unknown' | 'working' | 'rate_limited' | 'error';

export interface ModelInfo {
  id: string;
  name: string;
  contextLength: number;
  status: ModelStatus;
  /** Epoch ms of the last probe. */
  checkedAt: number;
  /** Epoch ms until which the model is skipped after a failure. */
  cooldownUntil: number;
  supportsReasoning: boolean;
  /** Rolling average of time-to-first-token, learned from real requests. */
  latencyMs: number | null;
  okCount: number;
  failCount: number;
}

export interface ModelsResponse {
  models: ModelInfo[];
  refreshedAt: number;
  source: 'openrouter';
}

/** Server -> client events, framed as SSE. */
export type ServerEvent =
  | { event: 'meta'; data: { model: string; requestId: string } }
  | { event: 'delta'; data: { text: string } }
  | { event: 'reasoning'; data: { text: string } }
  | { event: 'error'; data: { code: ChatErrorCode; message: string } }
  | {
      event: 'done';
      data: {
        model: string;
        finishReason: string | null;
        elapsedMs: number;
        attempts: number;
      };
    };
