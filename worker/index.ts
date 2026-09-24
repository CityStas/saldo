/**
 * OpenRouter relay - a Cloudflare Worker that forwards requests to
 * openrouter.ai from a network that can reach Cloudflare but not OpenRouter.
 *
 * Why this exists
 * ---------------
 * openrouter.ai is not reachable from Russia without a VPN. A VPN works, and the
 * server already supports one through `OUTBOUND_PROXY`, but it is a poor answer
 * for a reviewed project: it has to be running on the reviewer's machine, it is
 * per-machine, and it cannot be shared. A Worker sits on the edge, is reachable
 * from anywhere, costs nothing at this volume, and needs no software installed.
 *
 * What it is NOT
 * --------------
 * It is not a second backend. The API key does not live here, the model registry
 * does not live here, nothing is cached or rewritten. It reads a request, swaps
 * the host, and streams the response back untouched. Everything that makes the
 * chat work stays in `server/`, in one place, with one test suite.
 *
 * Configuration
 * -------------
 *   wrangler secret put RELAY_TOKEN     # any long random string
 *
 * then on the server side, in the root `.env`:
 *
 *   OPENROUTER_BASE_URL=https://<worker>.<account>.workers.dev
 *   OPENROUTER_RELAY_TOKEN=<the same string>
 *
 * Without `RELAY_TOKEN` the Worker refuses every request: a relay with no secret
 * is an open proxy to OpenRouter, and whoever finds the URL spends the key
 * behind it.
 */

/** Where the request is forwarded to. `/api/v1` is the OpenAI-compatible base. */
const DEFAULT_UPSTREAM = 'https://openrouter.ai/api/v1';

/** Must match `RELAY_TOKEN_HEADER` in `server/src/services/openrouter.ts`. */
const TOKEN_HEADER = 'X-Relay-Token';

export interface Env {
  RELAY_TOKEN?: string;
}

/** Headers that belong to the hop and must not be passed on. */
const HOP_BY_HOP = [
  'host',
  'connection',
  'keep-alive',
  'transfer-encoding',
  'upgrade',
  'content-length',
  'cf-connecting-ip',
  'cf-ipcountry',
  'cf-ray',
  'cf-visitor',
  'x-forwarded-for',
  'x-forwarded-proto',
  'x-real-ip',
];

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

export interface Relay {
  fetch(request: Request, env: Env): Promise<Response>;
}

/**
 * The relay, with the upstream as an argument.
 *
 * It is a factory rather than a bare handler so the test can point it at a local
 * server and check the parts that are easy to get wrong - the path rewrite, the
 * token, and the fact that the response body is still a stream and not a buffer.
 */
export function createRelay(upstream: string = DEFAULT_UPSTREAM): Relay {
  return {
    async fetch(request: Request, env: Env): Promise<Response> {
      const url = new URL(request.url);

      /*
       * A reachability probe, deliberately unauthenticated and deliberately
       * empty. The first question when this setup does not work is "can my ISP
       * reach the Worker at all", and answering it should not require a token or
       * reveal anything: `curl https://<worker>/` says yes or says nothing.
       */
      if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '')) {
        return json(200, { ok: true, service: 'openrouter-relay' });
      }

      if (!env.RELAY_TOKEN) {
        return json(500, {
          error: 'RELAY_TOKEN is not set on the Worker, so nothing is forwarded.',
        });
      }

      if (request.headers.get(TOKEN_HEADER) !== env.RELAY_TOKEN) {
        return json(403, { error: 'Bad or missing relay token.' });
      }

      const headers = new Headers(request.headers);
      for (const name of HOP_BY_HOP) headers.delete(name);
      // The token is for this Worker. It has no business travelling to OpenRouter.
      headers.delete(TOKEN_HEADER);

      /*
       * Ask upstream for an uncompressed body, on purpose.
       *
       * The two runtimes this file runs in disagree about compression: Node's
       * fetch decodes `content-encoding: gzip` and hands back plain bytes while
       * leaving the header in place, and the Workers runtime does not. Either
       * way the pair can end up inconsistent, and an inconsistent pair is not a
       * loud error - it is a body that never finishes, because the client's
       * decompressor keeps waiting for bytes that were already decoded.
       * Measured locally: `fetch().status` returned 403 in 25 ms while
       * `fetch().text()` hung until the test deadline.
       *
       * `identity` removes the ambiguity: nothing to decode, nothing to lie
       * about. It costs one gzip on a server-to-server hop and saves a class of
       * bug that is invisible until it is fatal.
       */
      headers.set('accept-encoding', 'identity');

      const target = `${upstream}${url.pathname}${url.search}`;
      const hasBody = request.method !== 'GET' && request.method !== 'HEAD';

      /*
       * `request.body` is passed through as a stream and the response is returned
       * as it arrives. Buffering either side would break streaming: the whole
       * point of the chat is that tokens appear while they are being generated.
       *
       * `duplex: 'half'` is not a Cloudflare option - the Workers runtime ignores
       * it - but Node requires it for a streamed request body, and the same file
       * runs under Node in `worker/dev.mjs` for testing the relay without
       * deploying it.
       */
      const init: RequestInit & { duplex?: string } = {
        method: request.method,
        headers,
        ...(hasBody ? { body: request.body, duplex: 'half' } : {}),
      };

      return fetch(target, init);
    },
  };
}

export default createRelay();
