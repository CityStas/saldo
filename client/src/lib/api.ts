import { SseDecoder } from './sse';
import type { ChatErrorCode, ChatMessage, DonePayload } from '../types/chat';

/** Thrown for a non-2xx response, before any streaming has started. */
export class ChatRequestError extends Error {
  readonly code: ChatErrorCode;
  readonly status: number;
  readonly retryAfterMs?: number;

  constructor(
    code: ChatErrorCode,
    message: string,
    status: number,
    retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'ChatRequestError';
    this.code = code;
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

export interface StreamHandlers {
  onMeta?: (payload: { model: string; requestId: string }) => void;
  onDelta: (text: string) => void;
  onReasoning?: (text: string) => void;
  onDone?: (payload: DonePayload) => void;
  /** Reported in-band, after the HTTP 200 has already been sent. */
  onStreamError?: (error: { code: ChatErrorCode; message: string }) => void;
}

interface ErrorBody {
  error?: {
    code?: ChatErrorCode;
    message?: string;
    retryAfterMs?: number;
  };
}

/**
 * POST /api/chat and consume the SSE stream.
 *
 * The API key never appears here - the browser only ever talks to our own
 * server, which is the whole point of the BFF.
 */
export async function streamChat(
  messages: ChatMessage[],
  signal: AbortSignal,
  handlers: StreamHandlers,
  model?: string,
): Promise<void> {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: messages.map(({ role, content }) => ({ role, content })),
      ...(model ? { model } : {}),
    }),
    signal,
  });

  if (!response.ok) {
    const raw = await response.text().catch(() => '');

    let body: ErrorBody = {};
    if (raw) {
      try {
        body = JSON.parse(raw) as ErrorBody;
      } catch {
        // Not our error envelope - a gateway or dev proxy answered instead.
      }
    }

    // Our API always replies with `{ error: { code, message } }`. Anything else
    // (empty body, HTML page, 5xx from a proxy) means the request never reached
    // the chat route, so it is a transport problem, not a model failure.
    const code: ChatErrorCode = body.error?.code ?? 'NETWORK';

    throw new ChatRequestError(
      code,
      body.error?.message ?? `Request failed with status ${response.status}`,
      response.status,
      body.error?.retryAfterMs,
    );
  }

  if (!response.body) {
    throw new ChatRequestError(
      'NETWORK',
      'The response has no body to stream.',
      response.status,
    );
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('text/event-stream')) {
    throw new ChatRequestError(
      'NETWORK',
      `Expected an event stream, got "${contentType || 'no content type'}".`,
      response.status,
    );
  }

  const reader = response.body.getReader();
  const textDecoder = new TextDecoder();
  const sse = new SseDecoder();

  const handle = (event: { event: string; data: string }): void => {
    let payload: unknown;
    try {
      payload = JSON.parse(event.data) as unknown;
    } catch {
      return;
    }

    switch (event.event) {
      case 'meta':
        handlers.onMeta?.(payload as { model: string; requestId: string });
        break;
      case 'delta':
        handlers.onDelta((payload as { text: string }).text);
        break;
      case 'reasoning':
        handlers.onReasoning?.((payload as { text: string }).text);
        break;
      case 'error':
        handlers.onStreamError?.(
          payload as { code: ChatErrorCode; message: string },
        );
        break;
      case 'done':
        handlers.onDone?.(payload as DonePayload);
        break;
      default:
        break;
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      for (const event of sse.push(textDecoder.decode(value, { stream: true }))) {
        handle(event);
      }
    }

    for (const event of sse.flush()) handle(event);
  } finally {
    reader.releaseLock();
  }
}
