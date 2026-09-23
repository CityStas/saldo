import { describe, expect, it } from 'vitest';
import {
  ASSISTANT_NAME,
  SYSTEM_PROMPT,
  promptFor,
  withSystemPrompt,
} from './system-prompt.js';

describe('withSystemPrompt', () => {
  it('puts the persona first and keeps the conversation order', () => {
    const result = withSystemPrompt([
      { role: 'user', content: 'Привет' },
      { role: 'assistant', content: 'Здравствуйте' },
      { role: 'user', content: 'Вопрос' },
    ]);

    expect(result).toHaveLength(4);
    expect(result[0]).toEqual({ role: 'system', content: SYSTEM_PROMPT });
    expect(result[1]).toEqual({ role: 'user', content: 'Привет' });
    expect(result[3]).toEqual({ role: 'user', content: 'Вопрос' });
  });

  it('does not mutate the caller array', () => {
    const messages = [{ role: 'user' as const, content: 'hi' }];
    withSystemPrompt(messages);
    expect(messages).toHaveLength(1);
  });

  it('names the assistant and keeps the domain rules in the prompt', () => {
    expect(SYSTEM_PROMPT).toContain(ASSISTANT_NAME);
    expect(SYSTEM_PROMPT).toContain('входящего НДС');
    expect(SYSTEM_PROMPT).toContain('САЛЬДО');
  });

  it('uses hyphens only, like the rest of the project', () => {
    // The brief asks for no em dashes anywhere in the product, the persona
    // included - and it has to ask the model for the same.
    expect(SYSTEM_PROMPT).not.toMatch(/[\u2013\u2014]/);
    expect(SYSTEM_PROMPT).toContain('Длинное тире не используй');
  });

  it('teaches the service tags the client renders as a CTA', () => {
    // The client parses exactly these three keys, so the prompt and the
    // catalogue in client/src/lib/services.ts have to agree.
    expect(SYSTEM_PROMPT).toContain('[[услуга: reporting]]');
    expect(SYSTEM_PROMPT).toContain('[[услуга: documents]]');
    expect(SYSTEM_PROMPT).toContain('[[услуга: vat]]');
  });

  it('appends reference material as its own section when given', () => {
    expect(promptFor()).toBe(SYSTEM_PROMPT);

    const withReference = promptFor('  Ст. 169 НК РФ: счёт-фактура.  ');

    expect(withReference.startsWith(SYSTEM_PROMPT)).toBe(true);
    expect(withReference).toContain('# Справочные материалы');
    expect(withReference).toContain('Ст. 169 НК РФ: счёт-фактура.');
    // The trailing whitespace of the caller's string is not carried over.
    expect(withReference.endsWith('счёт-фактура.')).toBe(true);
  });
});
