import { config } from '../config.js';
import {
  fetchFreeQuota,
  listFreeModels,
  probeModel,
  type FreeQuota,
  type OpenRouterModel,
} from './openrouter.js';
import type { ModelInfo, ModelStatus } from '../types/chat.js';

/** Router model that picks a free model upstream. Always kept as last resort. */
const ROUTER_MODEL = 'openrouter/free';

const WORKING_RECHECK_MS = 5 * 60_000;

/** How long a quota reading stays usable before it is asked for again. */
const QUOTA_TTL_MS = 15_000;

interface RegistryState {
  models: ModelInfo[];
  refreshedAt: number;
  discovery: Promise<void> | null;
  probing: Promise<void> | null;
  lastError: string | null;
  quota: FreeQuota | null;
  quotaCheckedAt: number;
  /** No key can serve a request before this moment. Stops pointless probing. */
  limitUntil: number;
}

const state: RegistryState = {
  models: [],
  refreshedAt: 0,
  discovery: null,
  probing: null,
  lastError: null,
  quota: null,
  quotaCheckedAt: 0,
  limitUntil: 0,
};

/** Round-robin cursor, so consecutive requests do not hammer one model. */
let cursor = 0;

function isBlocked(id: string): boolean {
  if (config.modelBlocklist.includes(id)) return true;
  if (config.modelAllowlist.length > 0) {
    return !config.modelAllowlist.includes(id);
  }
  return false;
}

function toModelInfo(model: OpenRouterModel): ModelInfo {
  return {
    id: model.id,
    name: model.name,
    contextLength: model.context_length ?? 0,
    status: 'unknown',
    checkedAt: 0,
    cooldownUntil: 0,
    supportsReasoning: (model.supported_parameters ?? []).includes(
      'include_reasoning',
    ),
    latencyMs: null,
    okCount: 0,
    failCount: 0,
  };
}

/**
 * Discover the free catalog. One cheap GET, no probing - probing runs in the
 * background so the first user request is never blocked by it.
 */
async function discover(): Promise<void> {
  const free = await listFreeModels(AbortSignal.timeout(config.probeTimeoutMs));
  const usable = free.filter((model) => !isBlocked(model.id));

  if (usable.length === 0) {
    throw new Error('OpenRouter reported no free text models.');
  }

  const previous = new Map(state.models.map((model) => [model.id, model]));

  const next = usable.map((model) => {
    const known = previous.get(model.id);
    return known ? { ...known, name: model.name, contextLength: model.context_length ?? known.contextLength } : toModelInfo(model);
  });

  // The router is not part of the advertised free list filter in every
  // response, but it is a very useful last resort.
  if (!next.some((model) => model.id === ROUTER_MODEL) && !isBlocked(ROUTER_MODEL)) {
    const router = free.find((model) => model.id === ROUTER_MODEL);
    if (router) next.push(toModelInfo(router));
  }

  state.models = next;
  state.refreshedAt = Date.now();
  state.lastError = null;

  void probeAll();
}

export async function ensureDiscovered(force = false): Promise<ModelInfo[]> {
  const stale = Date.now() - state.refreshedAt > config.registryTtlMs;
  const hasData = state.models.length > 0;

  if (!force && hasData && !stale) return state.models;

  if (!state.discovery) {
    state.discovery = discover()
      .catch((error: unknown) => {
        state.lastError =
          error instanceof Error ? error.message : 'Model discovery failed.';
        // Keep serving the previous list instead of failing hard.
      })
      .finally(() => {
        state.discovery = null;
      });
  }

  await state.discovery;
  return state.models;
}

/**
 * Cached free-tier daily counter. DIAGNOSTIC ONLY - never a gate.
 *
 * Measured 2026-09: this counter reported `{used: 51, limit: 50, remaining: 0}`
 * while free models answered normally with HTTP 200 and `cost: 0`. It lags and
 * can run past its own limit, so treating it as a ceiling blocks working
 * requests. It is exposed on `/api/models` and nowhere else; the chat path
 * decides on the actual upstream response.
 *
 * On failure the previous reading is kept rather than dropping to null - a
 * stale number is more useful than no number.
 */
export async function getQuota(): Promise<FreeQuota | null> {
  if (Date.now() - state.quotaCheckedAt < QUOTA_TTL_MS) return state.quota;

  try {
    state.quota = await fetchFreeQuota(
      AbortSignal.timeout(config.probeTimeoutMs),
    );
  } catch {
    // keep the previous reading
  }

  state.quotaCheckedAt = Date.now();
  return state.quota;
}

/** Background liveness probing, so the UI can show real model availability and,
 * more importantly, so the first message of a session has a proven model to go
 * to instead of a round-robin draw that may land on something dead.
 *
 * Probes run in parallel with a bounded worker pool rather than one at a time.
 * The reference implementation fans out all thirty at once; a cap of four keeps
 * the shape of that approach without opening thirty sockets at startup.
 */
export async function probeAll(force = false): Promise<void> {
  if (state.probing) return state.probing;

  const now = Date.now();

  if (!force && config.probeLimit <= 0) return;

  // Probing while the whole key is spent cannot succeed: every probe would
  // answer 429, mark a healthy model as broken, and spend the next key's budget
  // to learn nothing.
  if (now < state.limitUntil) return;

  const targets = state.models
    .filter(
      (model) =>
        force ||
        model.status === 'unknown' ||
        now - model.checkedAt > WORKING_RECHECK_MS,
    )
    .slice(0, force ? state.models.length : config.probeLimit);

  if (targets.length === 0) return;

  const probeOne = async (model: ModelInfo): Promise<ModelStatus> => {
    const status: ModelStatus = await probeModel(
      model.id,
      AbortSignal.timeout(config.probeTimeoutMs),
    );

    model.status = status;
    model.checkedAt = Date.now();

    // `rate_limited` means "busy right now", not "broken". Parking a healthy
    // model because it answered 429 would take the whole pool out of rotation
    // for a minute every time the key is being throttled.
    model.cooldownUntil =
      status === 'working' || status === 'rate_limited'
        ? 0
        : Date.now() + config.modelCooldownMs;

    if (config.probeSpacingMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, config.probeSpacingMs));
    }

    return status;
  };

  state.probing = (async () => {
    const queue = [...targets];
    const workers = Math.max(1, Math.min(config.probeConcurrency, queue.length));
    const results: ModelStatus[] = [];

    await Promise.all(
      Array.from({ length: workers }, async () => {
        for (let model = queue.shift(); model; model = queue.shift()) {
          // A dead model must not take the whole pool down with it.
          const status = await probeOne(model).catch(
            () => 'error' as ModelStatus,
          );
          results.push(status);
        }
      }),
    );

    // Every probe throttled at once is not twenty broken models, it is one
    // spent key. Say so and stop probing instead of branding the pool as dead.
    if (results.length > 0 && results.every((s) => s === 'rate_limited')) {
      noteGlobalLimit();
    }
  })()
    .catch(() => undefined)
    .finally(() => {
      state.probing = null;
    });

  return state.probing;
}

export type QueryType = 'code' | 'math' | 'text';

const CODE_HINTS = [
  'код', 'code', 'function', 'функц', 'класс', 'class', 'typescript', 'javascript',
  'python', 'react', 'vue', 'sql', 'debug', 'баг', 'bug', 'fix', 'исправ',
  'рефактор', 'refactor', 'api', 'regex', 'regexp', 'bash', 'css', 'html',
  'component', 'компонент', 'алгоритм', 'algorithm', 'git', 'docker', 'тест', 'test',
];

const MATH_HINTS = [
  'посчитай', 'вычисли', 'реши', 'уравнен', 'производн', 'интеграл',
  'math', 'calculate', 'compute', 'solve', 'integral', 'derivative', 'probability',
];

export function detectQueryType(text: string): QueryType {
  const lower = text.toLowerCase();

  if (CODE_HINTS.some((hint) => lower.includes(hint))) return 'code';
  if (MATH_HINTS.some((hint) => lower.includes(hint))) return 'math';
  return 'text';
}

const CODE_MODEL_HINTS = ['code', 'coder', 'codestral', 'instruct', 'devstral'];

/**
 * Order the models we are willing to try for this request, best first.
 *
 * Priority: explicit user choice -> configured default -> a model that matches
 * the query type -> models proven to work, fastest first -> the rest in
 * round-robin order -> the upstream router last.
 * Pure on purpose: the stateful wrapper below is the only thing that mutates.
 */
export function orderCandidates(
  pool: ModelInfo[],
  query: string,
  requestedModel: string | undefined,
  rotationStart: number,
): ModelInfo[] {
  if (pool.length === 0) return [];

  const ordered: ModelInfo[] = [];
  const seen = new Set<string>();

  const push = (model: ModelInfo | undefined): void => {
    if (!model || seen.has(model.id)) return;
    seen.add(model.id);
    ordered.push(model);
  };

  const byId = (id: string): ModelInfo | undefined =>
    pool.find((model) => model.id === id);

  push(requestedModel ? byId(requestedModel) : undefined);
  push(byId(config.preferredModel));

  if (detectQueryType(query) === 'code') {
    const codeModel = pool.find((model) =>
      CODE_MODEL_HINTS.some((hint) => model.id.toLowerCase().includes(hint)),
    );
    push(codeModel);
  }

  // Models that already answered for this process go next, fastest first.
  // Without this a round-robin over 21 free models keeps landing on slow
  // "pro" variants that can take a minute to emit the first token.
  const proven = pool
    .filter((model) => model.okCount > 0)
    .sort((a, b) => (a.latencyMs ?? Infinity) - (b.latencyMs ?? Infinity));

  for (const model of proven) push(model);

  for (let offset = 0; offset < pool.length; offset += 1) {
    push(pool[(rotationStart + offset) % pool.length]);
  }

  // Router last: it adds latency and hides which model actually answered.
  const routerIndex = ordered.findIndex((model) => model.id === ROUTER_MODEL);
  if (routerIndex !== -1) ordered.push(...ordered.splice(routerIndex, 1));

  return ordered;
}

export function selectCandidates(
  query: string,
  requestedModel?: string,
): ModelInfo[] {
  const now = Date.now();
  const all = state.models;
  if (all.length === 0) return [];

  const healthy = all.filter((model) => model.cooldownUntil <= now);
  // If everything is cooling down, still try rather than refuse to answer.
  const pool = healthy.length > 0 ? healthy : all;

  const rotationStart = cursor % pool.length;
  cursor += 1;

  return orderCandidates(pool, query, requestedModel, rotationStart);
}

export function markCooldown(modelId: string, ms = config.modelCooldownMs): void {
  const model = state.models.find((entry) => entry.id === modelId);
  if (!model) return;
  model.cooldownUntil = Date.now() + ms;
  model.failCount += 1;
  if (model.status !== 'working') model.status = 'error';
}

export function markWorking(modelId: string, latencyMs?: number): void {
  const model = state.models.find((entry) => entry.id === modelId);
  if (!model) return;

  model.status = 'working';
  model.checkedAt = Date.now();
  model.cooldownUntil = 0;
  model.okCount += 1;

  if (latencyMs !== undefined) {
    // Exponential moving average: recent behaviour matters more, but one slow
    // cold start should not permanently brand a model as slow.
    model.latencyMs =
      model.latencyMs === null
        ? latencyMs
        : Math.round(model.latencyMs * 0.6 + latencyMs * 0.4);
  }
}

/**
 * Record that upstream refused every key with a daily-limit 429.
 *
 * Used only to pause probing. Chat itself never refuses on this signal: the
 * counter that reports the limit is unreliable, so the request path always
 * tries and reports whatever upstream actually says.
 */
export function noteGlobalLimit(retryAfterMs?: number): void {
  const window = retryAfterMs ?? config.probeBackoffMs;
  const until = Date.now() + Math.min(window, config.probeBackoffMs);
  if (until > state.limitUntil) state.limitUntil = until;
}

export function snapshot(): {
  models: ModelInfo[];
  refreshedAt: number;
  lastError: string | null;
  quota: FreeQuota | null;
} {
  return {
    models: [...state.models],
    refreshedAt: state.refreshedAt,
    lastError: state.lastError,
    quota: state.quota,
  };
}

export function isKnownModel(modelId: string): boolean {
  return state.models.some((model) => model.id === modelId);
}
