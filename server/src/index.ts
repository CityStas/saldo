import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import { assertConfig, config, isProxyConfigured } from './config.js';
import { AppError } from './lib/errors.js';
import { rateLimit } from './middleware/rate-limit.js';
import { chatRouter } from './routes/chat.js';
import { modelsRouter } from './routes/models.js';
import { ensureDiscovered, probeAll, snapshot } from './services/registry.js';

assertConfig();

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', true);

app.use(
  cors({
    origin: config.corsOrigins.length > 0 ? config.corsOrigins : true,
    methods: ['GET', 'POST'],
  }),
);
app.use(express.json({ limit: '256kb' }));

app.get('/api/health', (_req, res) => {
  const { models, refreshedAt, lastError } = snapshot();
  res.json({
    ok: true,
    proxy: isProxyConfigured(),
    models: models.length,
    working: models.filter((model) => model.status === 'working').length,
    refreshedAt,
    lastError,
  });
});

app.use('/api', rateLimit, chatRouter);
app.use('/api', modelsRouter);

app.use((_req, res) => {
  res.status(404).json({
    error: { code: 'BAD_REQUEST', message: 'Unknown endpoint.' },
  });
});

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof AppError) {
    res.status(error.status).json({
      error: { code: error.code, message: error.message },
    });
    return;
  }

  const message = error instanceof Error ? error.message : 'Unexpected error.';
  console.error('[api] unhandled error:', message);
  res.status(500).json({ error: { code: 'UNKNOWN', message } });
});

const server = app.listen(config.port, () => {
  console.log(`[api] listening on http://localhost:${config.port}`);
  console.log(
    `[api] outbound proxy: ${isProxyConfigured() ? config.outboundProxy : 'direct'}`,
  );

  // Warm the model registry in the background: the first user request should
  // not pay for catalog discovery, and probe results are only advisory.
  void ensureDiscovered()
    .then(() => {
      const { models } = snapshot();
      console.log(`[api] ${models.length} free models discovered`);

      // Probing spends the shared free-tier request budget, so it only runs
      // when PROBE_LIMIT is set explicitly.
      if (config.probeLimit <= 0) {
        console.log('[api] background probing disabled (PROBE_LIMIT=0)');
        return;
      }

      console.log(`[api] probing up to ${config.probeLimit} models...`);
      return probeAll().then(() => {
        const working = snapshot().models.filter(
          (model) => model.status === 'working',
        ).length;
        console.log(`[api] probes done: ${working} working`);
      });
    })
    .catch((error: unknown) => {
      console.error(
        '[api] model discovery failed:',
        error instanceof Error ? error.message : error,
      );
    });
});

function shutdown(signal: string): void {
  console.log(`[api] ${signal} received, closing server`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
