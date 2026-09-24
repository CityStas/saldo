/**
 * Run the relay on this machine, without Cloudflare.
 *
 * The Worker is a `fetch` handler, so it needs almost nothing to run locally:
 * this file turns that handler into an HTTP server. It exists so the relay can
 * be tested - and the whole chain verified - before anything is deployed, and so
 * that a failure can be attributed to the right half. If the chat works through
 * this and not through the deployed Worker, the problem is Cloudflare, not the
 * relay.
 *
 * Usage:
 *   RELAY_TOKEN=dev-secret node worker/dev.mjs [port]
 *
 * then in the root `.env`:
 *   OPENROUTER_BASE_URL=http://localhost:8787
 *   OPENROUTER_RELAY_TOKEN=dev-secret
 *
 * Node 22.18+ strips the types itself, so `index.ts` can be imported directly.
 * On an older Node, run it with `npx tsx worker/dev.mjs`.
 */
import { createServer } from 'node:http';

import worker from './index.ts';

const port = Number(process.argv[2] ?? 8787);
const token = process.env.RELAY_TOKEN ?? 'dev-secret';

/**
 * Response headers Node must own, because it is the one writing the HTTP reply.
 * See the note at the point of use.
 */
const RESPONSE_FRAMING_HEADERS = new Set([
  'connection',
  'keep-alive',
  'transfer-encoding',
  'content-length',
  'upgrade',
]);

const server = createServer(async (req, res) => {
  const url = `http://localhost:${port}${req.url ?? '/'}`;

  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') headers.set(name, value);
    else if (Array.isArray(value)) headers.set(name, value.join(', '));
  }

  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
  const request = new Request(url, {
    method: req.method,
    headers,
    ...(hasBody ? { body: req, duplex: 'half' } : {}),
  });

  /*
   * Logged BEFORE the forward, not after. A relay that never answers is the
   * failure this harness gets used for, and logging the result only once the
   * upstream replies makes that failure look like "the request never arrived".
   * One line per request, no headers and no bodies: enough to tell "the server
   * never called the relay" from "the relay answered 403" from "OpenRouter is
   * not answering at all". Headers would put the API key in the console.
   */
  console.log(`[relay] -> ${req.method} ${req.url}`);

  let response;
  try {
    response = await worker.fetch(request, { RELAY_TOKEN: token });
  } catch (error) {
    console.error('[relay] handler threw:', error);
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Relay failed to forward the request.' }));
    return;
  }

  console.log(`[relay] <- ${response.status}`);

  /*
   * Framing headers from the upstream response must NOT be copied.
   *
   * OpenRouter answers with `transfer-encoding: chunked`, and Node manages that
   * itself: passing the header through as well produced a stream the client
   * could never finish reading - `fetch().text()` hung forever while
   * `fetch().status` came back fine, which is a confusing way to lose an hour.
   * The Workers runtime forbids these headers on an outgoing response and
   * re-frames the body itself, so on Cloudflare there is nothing to strip; this
   * is a Node-harness detail.
   *
 * `content-encoding` is passed through, and in this harness that is safe only
 * because the handler asks upstream for `accept-encoding: identity`. Node's
 * fetch decompresses a gzip body on its own and leaves the header behind, so a
 * compressed response would reach the client as "this is gzip" over plaintext,
 * and the client would wait for a decompressor that never runs. Measured:
 * `fetch().status` answered in 25 ms while `fetch().text()` never finished.
 */
  const out = {};
  response.headers.forEach((value, name) => {
    if (RESPONSE_FRAMING_HEADERS.has(name.toLowerCase())) return;
    out[name] = value;
  });
  res.writeHead(response.status, out);

  if (!response.body) {
    res.end();
    return;
  }

  // Piped, not buffered: the point of the relay is that tokens keep flowing.
  const reader = response.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    res.write(Buffer.from(value));
  }
  res.end();
});

server.listen(port, () => {
  console.log(`[relay] listening on http://localhost:${port}`);
  console.log(`[relay] token: ${token === 'dev-secret' ? 'dev-secret (default)' : 'from RELAY_TOKEN'}`);
  console.log('[relay] point the server at it with:');
  console.log(`[relay]   OPENROUTER_BASE_URL=http://localhost:${port}`);
  console.log(`[relay]   OPENROUTER_RELAY_TOKEN=${token}`);
});
