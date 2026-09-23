import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import { assertConfig, config } from './config.js';
import { AppError, redactSecrets } from './lib/errors.js';
import { rateLimit } from './middleware/rate-limit.js';
import { chatRouter } from './routes/chat.js';
import { modelsRouter } from './routes/models.js';
import { isProxyInUse } from './services/openrouter.js';
import { snapshot } from './services/registry.js';
import { reportOutboundRoute, warmRegistry } from './startup.js';

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
    proxy: isProxyInUse(),
    /** Where upstream calls actually go. The relay's host when one is set. */
    upstream: config.openrouterBaseUrl,
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

  // An AppError redacts at construction; this is the net for everything else
  // that can reach the handler, including errors thrown by middleware and by
  // the HTTP layer, whose text nobody here wrote.
  const message = redactSecrets(
    error instanceof Error ? error.message : 'Unexpected error.',
  );
  console.error('[api] unhandled error:', message);
  res.status(500).json({ error: { code: 'UNKNOWN', message } });
});

const server = app.listen(config.port, async () => {
  console.log(`[api] listening on http://localhost:${config.port}`);

  await reportOutboundRoute();

  // Deliberately not awaited: the port is open and the server can answer while
  // the catalog is still being filled in.
  void warmRegistry();
});

function shutdown(signal: string): void {
  console.log(`[api] ${signal} received, closing server`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
