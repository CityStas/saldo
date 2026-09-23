import { describe, expect, it } from 'vitest';
import { isFreeTextModel, type OpenRouterModel } from './openrouter.js';

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
