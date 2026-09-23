import { describe, expect, it } from 'vitest';
import {
  isFreeTextModel,
  readChatStream,
  type ChatDelta,
  type OpenRouterModel,
} from './openrouter.js';

function model(overrides: Partial<OpenRouterModel>): OpenRouterModel {
  return {
    id: 'x/y:free',
    name: 'y',
    context_length: 8192,
    pricing: { prompt: '0', completion: '0' },
    architecture: { output_modalities: ['text'] },
    ...overrides,
  };
}

describe('isFreeTextModel', () => {
  it('accepts a suffixed free text model', () => {
    expect(isFreeTextModel(model({ id: 'z-ai/glm-5.2:free' }))).toBe(true);
  });

  it('accepts a zero-priced model without the :free suffix', () => {
    // Stealth previews are priced at zero without carrying the suffix. They are
    // genuinely free, so filtering on the name would drop them for no reason.
    expect(isFreeTextModel(model({ id: 'stealth/space-bunny-alpha' }))).toBe(true);
  });

  it('accepts the free router', () => {
    expect(isFreeTextModel(model({ id: 'openrouter/free' }))).toBe(true);
  });

  it('rejects a paid model', () => {
    expect(
      isFreeTextModel(
        model({ pricing: { prompt: '0.000001', completion: '0.000002' } }),
      ),
    ).toBe(false);
  });

  it('rejects a model that is only free on the prompt side', () => {
    expect(
      isFreeTextModel(
        model({ pricing: { prompt: '0', completion: '0.000002' } }),
      ),
    ).toBe(false);
  });

  it('rejects an audio model even when it is free', () => {
    expect(
      isFreeTextModel(
        model({
          id: 'google/lyria-3-clip-preview',
          architecture: { output_modalities: ['audio'] },
        }),
      ),
    ).toBe(false);
  });

  it('rejects a model that emits more than text', () => {
    expect(
      isFreeTextModel(
        model({ architecture: { output_modalities: ['text', 'image'] } }),
      ),
    ).toBe(false);
  });
});

async function collect(frames: string[]): Promise<ChatDelta[]> {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const frame of frames) {
        controller.enqueue(new TextEncoder().encode(frame));
      }
      controller.close();
    },
  });

  const deltas: ChatDelta[] = [];
  for await (const delta of readChatStream(body)) deltas.push(delta);
  return deltas;
}

describe('readChatStream', () => {
  it('redacts a key that an upstream stream error happened to contain', async () => {
    // OpenRouter can report a failure after HTTP 200. This text does not become
    // an AppError - it is forwarded to the browser as a delta - so it has to be
    // cleaned on its own, or the Network tab shows the key in the SSE body.
    // Key-shaped and unmistakably not a key: a test fixture only needs the
    // shape, and a working credential must never sit in the repository when the
    // whole point of this code is that a key does not end up somewhere it can
    // be read.
    const key = 'sk-or-v1-fixture-not-a-real-key';
    const frame = `data: ${JSON.stringify({ error: { message: `Bad key ${key}` } })}\n\n`;

    const error = (await collect([frame])).find((d) => d.error)?.error ?? '';

    expect(error).not.toContain('sk-or-v1-');
    expect(error).toContain('[redacted]');
  });

  it('passes content through untouched', async () => {
    const frame = `data: ${JSON.stringify({
      choices: [{ delta: { content: 'НДС' }, finish_reason: null }],
    })}\n\n`;

    expect((await collect([frame]))[0]?.text).toBe('НДС');
  });
});
