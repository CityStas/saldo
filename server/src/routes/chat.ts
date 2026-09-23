import { randomUUID } from 'node:crypto';
import {
  Router,
  type Request as ExpressRequest,
  type Response as ExpressResponse,
} from 'express';
import { config } from '../config.js';
import {
  AppError,
  fromUpstreamStatus,
  isAbortError,
  isRetryable,
} from '../lib/errors.js';
import { encodeSse } from '../lib/sse.js';
import { validateChatRequest } from '../lib/validation.js';
import {
  AUTH_KEY_PARK_MS,
  apiKeyCount,
  currentKeyNumber,
  openChatStream,
  readChatStream,
  rotateApiKey,
} from '../services/openrouter.js';
import { withSystemPrompt } from '../services/system-prompt.js';
import {
  cannedAnswer,
  detectIntent,
  lastUserMessage,
  userTurnCount,
} from '../services/dialogue-policy.js';
import {
  ensureDiscovered,
  markCooldown,
  markWorking,
  noteGlobalLimit,
  selectCandidates,
} from '../services/registry.js';
import type { ChatMessage, ChatRequestBody, ServerEvent } from '../types/chat.js';

export const chatRouter = Router();

/** Stop after this many upstream attempts, even if more models are listed. */
const MAX_ATTEMPTS = 4;

/** Reported as the model name for answers that never touched a model. */
const SCRIPT_SOURCE = 'saldo';

interface OpenedStream {
  response: Response;
  model: string;
  attempts: number;
}

/**
 * Try candidate models until one accepts the request.
 *
 * A model that answers 429 or 5xx is put on cooldown and we move on - for a
 * `:free` catalog that is the difference between "the app works" and "the app
 * shows a rate limit error half the time".
 */
async function tryCandidates(
  messages: ChatMessage[],
  requestedModel: string | undefined,
  signal: AbortSignal,
): Promise<OpenedStream> {
  const query =
    [...messages].reverse().find((message) => message.role === 'user')?.content ??
    '';
  const candidates = selectCandidates(query, requestedModel);

  if (candidates.length === 0) {
    throw new AppError(
      'NO_MODELS',
      'No free models are available right now. Try again in a minute.',
      503,
    );
  }

  const attempts = candidates.slice(0, MAX_ATTEMPTS);
  let lastError: AppError | null = null;

  for (let index = 0; index < attempts.length; index += 1) {
    const candidate = attempts[index];
    if (candidate === undefined) continue;

    if (signal.aborted) throw new AppError('CANCELLED', 'Request aborted.', 499);

    try {
      const response = await openChatStream({
        model: candidate.id,
        messages,
        signal,
      });

      if (response.ok && response.body) {
        // Deliberately NOT marked as working here. Accepting the request is not
        // answering it: a model that only emits reasoning and never produces
        // content would otherwise earn `okCount > 0` and be tried first on every
        // later request. It is marked working when the first content token
        // arrives, and put on cooldown if none ever does.
        return { response, model: candidate.id, attempts: index + 1 };
      }

      const text = await response.text().catch(() => '');
      lastError = fromUpstreamStatus(response.status, text);
      markCooldown(candidate.id);

      if (!isRetryable(lastError)) throw lastError;
    } catch (error) {
      if (isAbortError(error)) {
        if (signal.aborted) {
          throw new AppError('CANCELLED', 'Request aborted.', 499);
        }
        lastError = new AppError('TIMEOUT', 'Upstream request timed out.', 504);
      } else if (error instanceof AppError) {
        lastError = error;
      } else {
        lastError = new AppError(
          'NETWORK',
          error instanceof Error ? error.message : 'Upstream connection failed.',
          502,
        );
      }

      markCooldown(candidate.id);
      if (!isRetryable(lastError)) throw lastError;
    }
  }

  throw (
    lastError ?? new AppError('UPSTREAM_ERROR', 'Every candidate model failed.', 502)
  );
}

/**
 * True when the failure is about the KEY rather than the model, and another key
 * might therefore do better.
 *
 * A model-scoped 429 means "this model is busy, try another" and rotating keys
 * would not help. An AUTH failure or a key-wide daily limit means every model
 * behind this key will fail the same way.
 */
function isKeyScoped(error: AppError): boolean {
  if (error.code === 'AUTH') return true;
  return error.code === 'RATE_LIMIT' && error.scope === 'global';
}

/**
 * Walk the model list, and when the whole key is spent, walk the next key.
 *
 * The free tier allows 50 requests per day per key, and when that is gone every
 * model answers 429 for hours. Without a second key the honest answer is "the
 * limit is spent, it resets at such a time" - with one, the chat simply keeps
 * working, which is what the reference implementation does.
 */
async function openFirstWorkingStream(
  messages: ChatMessage[],
  requestedModel: string | undefined,
  signal: AbortSignal,
): Promise<OpenedStream> {
  const keysToTry = Math.max(1, apiKeyCount());
  let lastError: AppError | null = null;

  for (let attempt = 0; attempt < keysToTry; attempt += 1) {
    try {
      return await tryCandidates(messages, requestedModel, signal);
    } catch (error) {
      if (!(error instanceof AppError) || !isKeyScoped(error)) throw error;

      lastError = error;
      noteGlobalLimit(error.retryAfterMs);

      // A rejected key is parked for a day, a spent one until its window
      // resets. Read the number BEFORE rotating, or the log names the key that
      // was just switched to and reads as nonsense.
      const failedKey = currentKeyNumber();
      const parkMs =
        error.code === 'AUTH' ? AUTH_KEY_PARK_MS : error.retryAfterMs;

      if (!rotateApiKey(parkMs)) throw error;

      console.warn(
        `[api] key ${failedKey} failed (${error.code}), switched to key ${currentKeyNumber()} of ${keysToTry}`,
      );
    }
  }

  throw (
    lastError ?? new AppError('UPSTREAM_ERROR', 'Every candidate model failed.', 502)
  );
}

/**
 * Cut a fixed answer into a few deltas so the client still goes through its
 * normal stream path instead of a special case. Boundaries fall on spaces, so
 * no word is split.
 */
function sliceForStream(text: string, size = 28): string[] {
  const words = text.split(' ');
  const chunks: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current === '' ? word : `${current} ${word}`;
    if (candidate.length > size && current !== '') {
      chunks.push(`${current} `);
      current = word;
    } else {
      current = candidate;
    }
  }

  if (current !== '') chunks.push(current);
  return chunks;
}

chatRouter.post('/chat', async (req: ExpressRequest, res: ExpressResponse) => {
  const requestId = randomUUID();
  const startedAt = Date.now();

  let body: ChatRequestBody;
  try {
    body = validateChatRequest(req.body);
  } catch (error) {
    if (error instanceof AppError) {
      res
        .status(error.status)
        .json({ error: { code: error.code, message: error.message } });
      return;
    }
    throw error;
  }

  const controller = new AbortController();
  let clientGone = false;
  let timedOut = false;

  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, config.upstreamTimeoutMs);

  // Client closed the tab or pressed Stop: stop paying for upstream tokens.
  // Listen on the response, not the request: since Node 16 the request stream
  // emits `close` as soon as its body is fully read, which is not a disconnect.
  res.on('close', () => {
    if (!res.writableEnded) {
      clientGone = true;
      controller.abort();
    }
  });

  // Committing the status line means every later problem has to be reported
  // in-band as an SSE `error` event, so both answer paths open the stream the
  // same way and share one `send`.
  const openStream = (): ((event: ServerEvent) => void) => {
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('X-Request-Id', requestId);
    res.flushHeaders();

    return (event: ServerEvent): void => {
      if (clientGone || res.writableEnded) return;
      res.write(encodeSse(event.event, event.data));
    };
  };

  // A bare greeting and a "кто ты" have exactly one right answer. Sending them
  // to a model would spend the shared free-tier budget, would fail whenever
  // every model is cooling down, and would let the wording drift between
  // sessions. Answered here, before the quota check and before model selection.
  const opening = userTurnCount(body.messages) <= 1;
  const intent = detectIntent(lastUserMessage(body.messages));
  const canned = cannedAnswer(intent, opening);

  if (canned !== null) {
    clearTimeout(timeout);
    const send = openStream();

    send({
      event: 'meta',
      data: { model: SCRIPT_SOURCE, requestId, source: 'script' },
    });

    for (const chunk of sliceForStream(canned)) {
      if (clientGone) break;
      send({ event: 'delta', data: { text: chunk } });
    }

    send({
      event: 'done',
      data: {
        model: SCRIPT_SOURCE,
        finishReason: 'stop',
        elapsedMs: Date.now() - startedAt,
        attempts: 0,
      },
    });

    console.log(
      `[api] ${requestId.slice(0, 8)} answered script=${intent} spent=0`,
    );

    if (!clientGone && !res.writableEnded) res.end();
    return;
  }

  let opened: OpenedStream;

  try {
    await ensureDiscovered();

    // Deliberately NO pre-flight quota gate here.
    //
    // An earlier version read `free_model_daily_requests` from `GET /key` and
    // refused to try when `remaining <= 0`. Measured 2026-09: the endpoint
    // reports `{used: 51, limit: 50, remaining: 0}` while free models keep
    // answering with HTTP 200 and `cost: 0`. The counter is a lagging hint that
    // can run past its own limit; it is not an enforced ceiling. Blocking on it
    // turned a working request into "лимит исчерпан" - the worst kind of bug,
    // because the app looked broken while the provider was fine.
    //
    // A real limit arrives as a 429 and is classified in `fromUpstreamStatus`,
    // where `limit_source` decides between a model-scoped and a key-scoped
    // limit. The counter is still exposed on `/api/models` for diagnostics.

    opened = await openFirstWorkingStream(
      withSystemPrompt(body.messages, { opening, mode: body.mode }),
      body.model,
      controller.signal,
    );
  } catch (error) {
    clearTimeout(timeout);

    const appError =
      error instanceof AppError
        ? error
        : new AppError(
            'UNKNOWN',
            error instanceof Error ? error.message : 'Unexpected error.',
            500,
          );

    if (appError.code === 'CANCELLED') {
      if (!res.headersSent) res.status(499).end();
      return;
    }

    if (appError.retryAfterMs !== undefined) {
      res.setHeader('Retry-After', String(Math.ceil(appError.retryAfterMs / 1000)));
    }

    res.status(appError.status).json({
      error: {
        code: appError.code,
        message: appError.message,
        ...(appError.retryAfterMs !== undefined
          ? { retryAfterMs: appError.retryAfterMs }
          : {}),
      },
    });
    return;
  }

  const send = openStream();

  send({
    event: 'meta',
    data: { model: opened.model, requestId, source: 'model' },
  });

  let finishReason: string | null = null;
  let failed: string | null = null;

  // The response is committed, so the outer "connect" timeout is replaced by
  // two streaming watchdogs:
  //   firstToken - no content yet, a cold free model must not stall forever
  //   idle       - content started, then the provider went quiet
  clearTimeout(timeout);

  let firstTokenTimer: NodeJS.Timeout | null = null;
  let idleTimer: NodeJS.Timeout | null = null;

  const armIdleTimer = (): void => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, config.upstreamTimeoutMs);
  };

  const clearFirstTokenTimer = (): void => {
    if (!firstTokenTimer) return;
    clearTimeout(firstTokenTimer);
    firstTokenTimer = null;
  };

  // The first attempt gets the full budget. Failover attempts get half of it,
  // so a run of unusable models cannot hold the user for minutes. A model that
  // answers at all will have answered well inside this window.
  const firstTokenBudgetMs =
    opened.attempts <= 1
      ? config.firstTokenTimeoutMs
      : Math.round(config.firstTokenTimeoutMs / 2);

  firstTokenTimer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, firstTokenBudgetMs);

  let contentChars = 0;

  try {
    const stream = opened.response.body as ReadableStream<Uint8Array>;

    for await (const delta of readChatStream(stream)) {
      // Heartbeats prove the connection is alive, but they must not reset the
      // first-token deadline - otherwise a cold model could heartbeat forever.
      if (delta.tick) {
        if (!firstTokenTimer) armIdleTimer();
        continue;
      }

      if (delta.error) {
        failed = delta.error;
        break;
      }

      if (delta.reasoning) {
        // Reasoning proves the model is alive, so it restarts the idle clock.
        // It deliberately does NOT clear the first-token deadline: a model that
        // only thinks is not answering, and a chat must not wait on it forever.
        // Failover moves on to the next candidate instead.
        armIdleTimer();
        send({ event: 'reasoning', data: { text: delta.reasoning } });
      }

      if (delta.text) {
        contentChars += delta.text.length;

        if (firstTokenTimer) {
          clearFirstTokenTimer();
          markWorking(opened.model, Date.now() - startedAt);
        }

        armIdleTimer();
        send({ event: 'delta', data: { text: delta.text } });
      }

      if (delta.finishReason) finishReason = delta.finishReason;
    }
  } catch (error) {
    if (timedOut) {
      failed = firstTokenTimer
        ? 'The model did not send a first token in time.'
        : 'The model stopped responding mid-stream.';
    } else if (clientGone) {
      // User pressed Stop - nothing to report, the socket is gone.
    } else if (isAbortError(error)) {
      failed = 'The upstream connection was interrupted.';
    } else {
      failed = error instanceof Error ? error.message : 'Streaming failed.';
    }
  } finally {
    clearFirstTokenTimer();
    if (idleTimer) clearTimeout(idleTimer);
  }

  if (failed && !clientGone) {
    send({
      event: 'error',
      data: {
        code: timedOut ? 'TIMEOUT' : 'UPSTREAM_ERROR',
        message: failed,
      },
    });
  }

  // A model that never produced a single content token is not usable for a
  // chat, whether it reasoned in circles or simply went silent. Park it so the
  // next round-robin draw does not land on it again.
  if (!clientGone && contentChars === 0) {
    markCooldown(opened.model);
  }

  // One line per answered request, because the free tier is metered and the
  // only way to answer "where did the day's budget go" is to write it down.
  // Attempts beyond the first are failed calls, which upstream does not count.
  console.log(
    `[api] ${requestId.slice(0, 8)} answered model=${opened.model} attempts=${opened.attempts} chars=${contentChars} elapsed=${Date.now() - startedAt}ms key=${currentKeyNumber()}`,
  );

  send({
    event: 'done',
    data: {
      model: opened.model,
      finishReason,
      elapsedMs: Date.now() - startedAt,
      attempts: opened.attempts,
    },
  });

  if (!clientGone && !res.writableEnded) res.end();
});
