import net from 'node:net';
import { ProxyAgent, type Dispatcher } from 'undici';
import { config, isProxyConfigured } from '../config.js';
import { SseDecoder } from '../lib/sse.js';
import { AppError, fromUpstreamStatus } from '../lib/errors.js';
import type { ChatMessage, ModelStatus } from '../types/chat.js';

/**
 * Where OpenRouter is reached from. Normally openrouter.ai; through a relay
 * (see `worker/`) when `OPENROUTER_BASE_URL` points somewhere else, which is how
 * the app works on a network that cannot reach OpenRouter directly.
 */
const BASE_URL = config.openrouterBaseUrl;

/**
 * The relay's shared secret. Must match the Worker's `RELAY_TOKEN`.
 *
 * Declared on both sides on purpose: they are two runtimes with no module in
 * common, and a header name that differs by one character produces a 403 that
 * looks like a broken relay.
 */
const RELAY_TOKEN_HEADER = 'X-Relay-Token';

const APP_TITLE = 'Saldo Chat';
const APP_URL = 'https://github.com/CityStas/saldo';

let cachedDispatcher: Dispatcher | null = null;

/**
 * Whether the configured proxy is actually listening.
 *
 * `null` means "not checked yet": until the startup check runs, a configured
 * proxy is used as-is, so the behaviour of an already working setup does not
 * change. After the check, `false` means the proxy port refused a connection
 * and the direct route is used instead.
 *
 * This matters because `OUTBOUND_PROXY` usually points at a local VPN client.
 * With the VPN off, the port is dead, and a hard-wired proxy turned that into
 * "nothing works" even on a machine that could reach OpenRouter directly.
 */
let proxyUsable: boolean | null = null;

function parseProxy(url: string): { host: string; port: number } | null {
  try {
    const parsed = new URL(url);
    const port = Number(parsed.port || (parsed.protocol === 'https:' ? 443 : 80));
    if (!parsed.hostname || !Number.isFinite(port)) return null;
    return { host: parsed.hostname, port };
  } catch {
    return null;
  }
}

/** TCP-connect test with a short deadline. No HTTP, no TLS, no credentials. */
export async function checkProxy(): Promise<boolean> {
  const target = config.outboundProxy ? parseProxy(config.outboundProxy) : null;

  if (!target) {
    proxyUsable = false;
    return false;
  }

  const reachable = await new Promise<boolean>((resolve) => {
    const socket = net.connect({ host: target.host, port: target.port });
    let settled = false;

    const finish = (ok: boolean): void => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(ok);
    };

    socket.setTimeout(config.proxyCheckTimeoutMs, () => finish(false));
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
  });

  proxyUsable = reachable;
  return reachable;
}

/**
 * True when a proxy is configured, was reachable at the last check, and is
 * actually the route in use - a relay replaces it, see `isProxyConfigured`.
 */
export function isProxyInUse(): boolean {
  return isProxyConfigured() && proxyUsable !== false;
}

/**
 * Optional outbound proxy. On networks where Cloudflare rejects non-browser
 * TLS fingerprints (or where the API host is unreachable) the whole backend is
 * dead without this, so it is a first-class config knob rather than a hack.
 *
 * It applies only when OpenRouter is the target. With a relay configured the
 * request goes to the relay, and routing that through the proxy breaks it: the
 * proxy cannot resolve a host on this machine.
 */
function dispatcher(): Dispatcher | undefined {
  if (!isProxyConfigured()) return undefined;
  if (proxyUsable === false) return undefined;
  cachedDispatcher ??= new ProxyAgent(config.outboundProxy);
  return cachedDispatcher;
}

/**
 * Adds the relay's shared secret to whatever headers the call already has.
 *
 * Done here rather than in `headers()` so that every upstream call carries it -
 * including the two GETs that build their own headers - and so there is a single
 * place to look when the relay starts answering 403.
 */
function withRelayToken(headers: HeadersInit | undefined): HeadersInit | undefined {
  if (!config.relayToken) return headers;

  const merged = new Headers(headers);
  merged.set(RELAY_TOKEN_HEADER, config.relayToken);
  return merged;
}

export function upstreamFetch(
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  const agent = dispatcher();
  const headers = withRelayToken(init.headers);
  const request: RequestInit = headers === init.headers ? init : { ...init, headers };

  if (!agent) return fetch(url, request);
  return fetch(url, { ...request, dispatcher: agent } as RequestInit);
}

/**
 * Which key the next upstream call uses.
 *
 * The free tier gives 50 requests per day per key. When the window is spent the
 * key answers 429 for every model until it resets - which the API reports as
 * hours away. Rotating keys is the only thing that keeps a free-tier chat alive
 * past its first fifty questions, and it is what the reference implementation
 * does.
 */
let keyIndex = 0;

/** Per-key "do not use before" marks, in ms since epoch. */
const keyCooldownUntil = new Map<number, number>();

/**
 * How long a key is parked after upstream rejects its credentials.
 *
 * A 401 is terminal by design everywhere else in this codebase (`isRetryable`
 * refuses to retry it), and here it means the same thing: this key will not
 * start working again on the next message. Without parking it, every request
 * would begin on the dead key, fail, rotate, and only then reach a working one.
 */
export const AUTH_KEY_PARK_MS = 24 * 60 * 60_000;

export function apiKeyCount(): number {
  return config.apiKeys.length;
}

export function currentApiKey(): string {
  return config.apiKeys[keyIndex] ?? '';
}

/** Index of the current key, 1-based, for logging. Never the key itself. */
export function currentKeyNumber(): number {
  return keyIndex + 1;
}

/**
 * Move to the next key that is not on cooldown.
 *
 * Returns false when there is only one key, or when every other key is still
 * inside its daily window. It never "rotates" onto the current key: reporting a
 * successful rotation that changes nothing would hide the real error behind a
 * second identical attempt.
 */
export function rotateApiKey(retryAfterMs?: number): boolean {
  const total = config.apiKeys.length;
  if (total <= 1) return false;

  if (retryAfterMs !== undefined) {
    keyCooldownUntil.set(keyIndex, Date.now() + retryAfterMs);
  }

  const now = Date.now();

  for (let step = 1; step < total; step += 1) {
    const candidate = (keyIndex + step) % total;
    if ((keyCooldownUntil.get(candidate) ?? 0) <= now) {
      keyIndex = candidate;
      return true;
    }
  }

  return false;
}

function headers(): Record<string, string> {
  return {
    Authorization: `Bearer ${currentApiKey()}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': APP_URL,
    'X-Title': APP_TITLE,
  };
}

export interface OpenRouterModel {
  id: string;
  name: string;
  context_length: number;
  pricing: { prompt: string; completion: string };
  architecture?: { output_modalities?: string[] };
  supported_parameters?: string[];
}

/**
 * Free models as advertised by OpenRouter: zero prompt price, zero completion
 * price, text-only output.
 *
 * Membership is decided by PRICE, not by the `:free` suffix. Most free models
 * carry the suffix, but not all of them do: stealth previews such as
 * `stealth/space-bunny-alpha` are priced at zero without it and are just as
 * free. Filtering on the suffix would silently drop them.
 *
 * Verified against the live catalog 2026-09: 456 models total, 24 priced at
 * zero, of which 4 have no suffix - one stealth text model, two audio previews
 * and the router. The audio ones are removed by the modality check.
 */
export function isFreeTextModel(model: OpenRouterModel): boolean {
  const zeroPriced =
    Number(model.pricing?.prompt) === 0 &&
    Number(model.pricing?.completion) === 0;
  if (!zeroPriced) return false;

  const outputs = model.architecture?.output_modalities ?? ['text'];
  return outputs.includes('text') && outputs.length === 1;
}

export async function listFreeModels(
  signal?: AbortSignal,
): Promise<OpenRouterModel[]> {
  const response = await upstreamFetch(`${BASE_URL}/models`, {
    headers: { Authorization: `Bearer ${currentApiKey()}` },
    signal,
  });

  if (!response.ok) {
    throw fromUpstreamStatus(response.status, await response.text());
  }

  const payload = (await response.json()) as { data?: OpenRouterModel[] };
  return (payload.data ?? []).filter(isFreeTextModel);
}

export interface FreeQuota {
  isFreeTier: boolean;
  /** Requests already spent today across every `:free` model. */
  used: number;
  limit: number;
  remaining: number;
}

interface KeyPayload {
  data?: {
    is_free_tier?: boolean;
    free_model_daily_requests?: {
      used?: number;
      limit?: number;
      remaining?: number;
    };
  };
}

/**
 * The free tier has one DAILY request cap shared by every `:free` model, and
 * OpenRouter reports it on the key endpoint.
 *
 * This is the check that stops the server from burning four model attempts
 * against an exhausted quota and then reporting a vague provider error. One
 * cheap call answers "may we even try right now?".
 *
 * Returns null when the key is not on the free tier or the field is absent,
 * in which case the caller simply proceeds without a quota gate.
 */
export async function fetchFreeQuota(
  signal?: AbortSignal,
): Promise<FreeQuota | null> {
  const response = await upstreamFetch(`${BASE_URL}/key`, {
    headers: { Authorization: `Bearer ${currentApiKey()}` },
    signal,
  });

  if (!response.ok) return null;

  const payload = (await response.json()) as KeyPayload;
  const daily = payload.data?.free_model_daily_requests;
  if (!daily || typeof daily.limit !== 'number') return null;

  const used = daily.used ?? 0;

  return {
    isFreeTier: payload.data?.is_free_tier === true,
    used,
    limit: daily.limit,
    remaining: daily.remaining ?? Math.max(0, daily.limit - used),
  };
}

export interface ChatStreamOptions {
  model: string;
  messages: ChatMessage[];
  signal: AbortSignal;
}

/** Open a streaming completion. Resolves as soon as headers arrive. */
export function openChatStream({
  model,
  messages,
  signal,
}: ChatStreamOptions): Promise<Response> {
  return upstreamFetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    signal,
    headers: headers(),
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      temperature: 0.7,
      // Ask providers to surface chain-of-thought when they support it.
      include_reasoning: true,
    }),
  });
}

export interface ChatDelta {
  text?: string;
  reasoning?: string;
  finishReason?: string | null;
  /** OpenRouter can report a failure inside the stream, after HTTP 200. */
  error?: string;
  /**
   * Upstream sent bytes we could not turn into content (a `: OPENROUTER
   * PROCESSING` heartbeat while a cold model warms up). The connection is
   * alive, so the caller's idle watchdog should be re-armed.
   */
  tick?: true;
}

interface RawChunk {
  choices?: Array<{
    delta?: { content?: string | null; reasoning?: string | null };
    finish_reason?: string | null;
  }>;
  error?: { message?: string; code?: number | string };
}

/**
 * Parse an OpenRouter chat-completions SSE body into deltas.
 * Chunk boundaries are arbitrary, hence the incremental decoder.
 */
export async function* readChatStream(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<ChatDelta> {
  const reader = body.getReader();
  const textDecoder = new TextDecoder();
  const sse = new SseDecoder();

  const toDelta = (event: {
    event: string;
    data: string;
  }): ChatDelta | null => {
    const payload = event.data.trim();
    if (!payload || payload === '[DONE]') return null;

    let chunk: RawChunk;
    try {
      chunk = JSON.parse(payload) as RawChunk;
    } catch {
      return null; // Ignore keep-alives and malformed frames.
    }

    if (chunk.error) {
      return { error: chunk.error.message ?? 'Upstream stream error.' };
    }

    const choice = chunk.choices?.[0];
    if (!choice) return null;

    return {
      text: choice.delta?.content ?? undefined,
      reasoning: choice.delta?.reasoning ?? undefined,
      finishReason: choice.finish_reason ?? null,
    };
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      let produced = false;

      for (const event of sse.push(
        textDecoder.decode(value, { stream: true }),
      )) {
        const delta = toDelta(event);
        if (delta) {
          produced = true;
          yield delta;
        }
      }

      if (!produced) yield { tick: true };
    }

    for (const event of sse.flush()) {
      const delta = toDelta(event);
      if (delta) yield delta;
    }
  } finally {
    reader.releaseLock();
  }
}

interface ProbePayload {
  choices?: Array<{ message?: { content?: string | null } }>;
}

/**
 * Liveness check: a short completion. 429 means the model exists but is
 * saturated right now, which is a different thing from "broken".
 *
 * HTTP 200 alone is not enough. A model that spends the whole budget on
 * chain-of-thought answers with an empty `content`, and such a model is
 * unusable for this chat - it would stall the first-token watchdog. It is
 * reported as `error` on purpose so it never reaches the pool.
 *
 * The budget is deliberately tiny (`PROBE_MAX_TOKENS`, 24 by default). A model
 * that cannot say "hi" in a couple of dozen tokens is a model that thinks
 * before it talks, and that is the failure this check exists to catch.
 */
export async function probeModel(
  modelId: string,
  signal: AbortSignal,
): Promise<ModelStatus> {
  try {
    const response = await upstreamFetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      signal,
      headers: headers(),
      body: JSON.stringify({
        model: modelId,
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: config.probeMaxTokens,
        temperature: 0.1,
      }),
    });

    if (response.status === 429) return 'rate_limited';
    if (response.status === 401 || response.status === 403) {
      throw new AppError(
        'AUTH',
        `OpenRouter rejected the API key (${response.status}).`,
        502,
      );
    }
    if (!response.ok) return 'error';

    const payload = (await response.json()) as ProbePayload;
    const content = payload.choices?.[0]?.message?.content;

    return typeof content === 'string' && content.trim() !== ''
      ? 'working'
      : 'error';
  } catch (error) {
    if (error instanceof AppError) throw error;
    return 'error';
  }
}
