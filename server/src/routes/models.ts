import { Router } from 'express';
import {
  ensureDiscovered,
  getQuota,
  probeAll,
  snapshot,
} from '../services/registry.js';
import { isProxyInUse } from '../services/openrouter.js';

export const modelsRouter = Router();

/**
 * Current model pool with liveness status. Not used by the UI on purpose - the
 * chat does not expose which model answered - but it is the fastest way to see
 * what the selector has learned while debugging.
 *
 * The free-tier counter is included as a diagnostic, NOT as a decision: it lags
 * and can report `remaining: 0` while models answer normally. Nothing in the
 * request path reads it.
 */
modelsRouter.get('/models', async (_req, res) => {
  const models = await ensureDiscovered();
  const quota = await getQuota();
  const { refreshedAt, lastError } = snapshot();

  res.json({
    source: 'openrouter',
    refreshedAt,
    proxy: isProxyInUse(),
    lastError,
    quota,
    models: models.map(
      ({ id, name, contextLength, status, supportsReasoning, latencyMs, okCount, failCount }) => ({
        id,
        name,
        contextLength,
        status,
        supportsReasoning,
        latencyMs,
        okCount,
        failCount,
      }),
    ),
  });
});

/** Force a re-discovery plus a full liveness probe of every candidate. */
modelsRouter.post('/models/refresh', async (_req, res) => {
  const models = await ensureDiscovered(true);
  void probeAll(true);

  res.json({ refreshed: true, count: models.length });
});
