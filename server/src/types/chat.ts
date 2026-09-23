export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

/**
 * How the assistant should answer.
 *
 * `consult` is the product default: answer the question and, when the task
 * really needs work under a contract, point at the matching service.
 * `full` is the demo's second mode: answer as completely as possible, with no
 * service offer and no contact button.
 */
export type AnswerMode = 'consult' | 'full';

export const ANSWER_MODES: readonly AnswerMode[] = ['consult', 'full'];

export interface ChatRequestBody {
  /** Full conversation history, oldest first. */
  messages: ChatMessage[];
  /** Optional explicit model override, e.g. "openrouter/free". */
  model?: string;
  /** Defaults to `consult` when omitted. */
  mode?: AnswerMode;
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
  | {
      event: 'meta';
      data: {
        model: string;
        requestId: string;
        /** `script` when the answer came from the canned dialogue policy. */
        source?: 'model' | 'script';
      };
    }
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
