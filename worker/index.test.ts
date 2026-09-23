/**
 * Tests for the relay.
 *
 * The upstream is a local server, so nothing here needs the internet, a
 * Cloudflare account or an API key - which is the point: these are the parts of
 * the relay that are easy to get subtly wrong, and they should be checkable
 * before anything is deployed.
 *
 * Run with:  npx vitest run worker
 */
import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createRelay, type Env } from './index.ts';

const TOKEN = 'test-token';

let upstream: Server;
let upstreamUrl = '';
/** Every request the fake OpenRouter received, for assertions. */
const received: { method: string; url: string; headers: Record<string, string>; body: string }[] = [];

beforeAll(async () => {
  upstream = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      received.push({
        method: req.method ?? '',
        url: req.url ?? '',
        headers: req.headers as Record<string, string>,
        body: Buffer.concat(chunks).toString('utf8'),
      });

      if (req.url?.startsWith('/chat/completions')) {
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        // Three separate writes: if the relay buffered, the client would see
        // them as one chunk, or as none until the end.
        res.write('data: {"one":1}\n\n');
        setTimeout(() => {
          res.write('data: {"two":2}\n\n');
          res.end('data: [DONE]\n\n');
        }, 30);
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ data: [] }));
    });
  });

  await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  const address = upstream.address();
  if (address === null || typeof address === 'string') throw new Error('no port');
  upstreamUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => upstream.close(() => resolve()));
});

const env = (token?: string): Env => (token === undefined ? {} : { RELAY_TOKEN: token });

describe('relay', () => {
  it('answers a bare GET / without a token, for reachability checks', async () => {
    const relay = createRelay(upstreamUrl);
    const response = await relay.fetch(new Request('https://relay.example/'), env(TOKEN));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      service: 'openrouter-relay',
    });
  });

  it('refuses everything when RELAY_TOKEN is not configured', async () => {
    const relay = createRelay(upstreamUrl);
    const response = await relay.fetch(
      new Request('https://relay.example/chat/completions', { method: 'POST' }),
      env(),
    );

    expect(response.status).toBe(500);
  });

  it('refuses a request with a wrong token', async () => {
    const relay = createRelay(upstreamUrl);
    const response = await relay.fetch(
      new Request('https://relay.example/chat/completions', {
        method: 'POST',
        headers: { 'X-Relay-Token': 'nope' },
      }),
      env(TOKEN),
    );

    expect(response.status).toBe(403);
  });

  it('rewrites the host, keeps the path and the query', async () => {
    received.length = 0;
    const relay = createRelay(upstreamUrl);

    await relay.fetch(
      new Request('https://relay.example/models?limit=5', {
        headers: { 'X-Relay-Token': TOKEN },
      }),
      env(TOKEN),
    );

    expect(received).toHaveLength(1);
    expect(received[0]?.url).toBe('/models?limit=5');
  });

  it('forwards the method, the body and the API key, and drops the relay token', async () => {
    received.length = 0;
    const relay = createRelay(upstreamUrl);

    await relay.fetch(
      new Request('https://relay.example/chat/completions', {
        method: 'POST',
        headers: {
          'X-Relay-Token': TOKEN,
          Authorization: 'Bearer sk-or-v1-secret',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model: 'x', stream: true }),
      }),
      env(TOKEN),
    );

    const got = received[0];
    expect(got?.method).toBe('POST');
    expect(got?.body).toBe('{"model":"x","stream":true}');
    expect(got?.headers.authorization).toBe('Bearer sk-or-v1-secret');
    // The whole reason the token exists is that it stops at the edge.
    expect(got?.headers['x-relay-token']).toBeUndefined();
  });

  it('streams the response instead of buffering it', async () => {
    const relay = createRelay(upstreamUrl);

    const response = await relay.fetch(
      new Request('https://relay.example/chat/completions', {
        method: 'POST',
        headers: { 'X-Relay-Token': TOKEN, 'Content-Type': 'application/json' },
        body: '{}',
      }),
      env(TOKEN),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/event-stream');
    expect(response.body).not.toBeNull();

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();

    const first = await reader.read();
    expect(decoder.decode(first.value)).toBe('data: {"one":1}\n\n');

    // The second event is written 30 ms later by the fake upstream. Reading it
    // in a separate chunk is what proves nothing was collected in between.
    let rest = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      rest += decoder.decode(value);
    }
    expect(rest).toContain('data: {"two":2}');
    expect(rest).toContain('[DONE]');
  });
});
