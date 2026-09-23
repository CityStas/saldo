import { describe, expect, it } from 'vitest';
import {
  GREETING_ONGOING,
  GREETING_OPENING,
  IDENTITY_ANSWER,
  cannedAnswer,
  detectIntent,
  isBareGreeting,
  isIdentityQuestion,
  lastUserMessage,
  userTurnCount,
} from './dialogue-policy.js';

describe('isBareGreeting', () => {
  it.each([
    'Здравствуйте!',
    'привет',
    'Привет!',
    'приветствую',
    'Доброе утро',
    'добрый день!',
    'Добрый вечер.',
    'доброго времени суток',
    'Здравствуйте! Привет',
    'Привет)',
    'хай!',
    'Hello!',
    'Всем привет',
    'Привет ещё раз',
  ])('treats %s as a bare greeting', (text) => {
    expect(isBareGreeting(text)).toBe(true);
  });

  it.each([
    'Привет, у нас ОСНО. Что с НДС?',
    'Добрый день, подскажите по первичке',
    'Приветствие в документах',
    'Куда делся вычет?',
    'Здравствуйте! Можно ли принять НДС к вычету по УПД?',
    'Всем привет, у нас ОСНО. Что с НДС?',
    'Привет, все документы собрал, что дальше?',
  ])('does not treat %s as a bare greeting', (text) => {
    expect(isBareGreeting(text)).toBe(false);
  });
});

describe('isIdentityQuestion', () => {
  it.each([
    'Кто ты?',
    'ты кто',
    'Кто вы такие?',
    'Что ты такое?',
    'Что ты за модель?',
    'какая у тебя модель',
    'Ты бот?',
    'Ты нейросеть или человек?',
    'Как тебя зовут?',
    'Что ты умеешь?',
    'Чем ты можешь помочь?',
    'Who are you?',
  ])('treats %s as an identity question', (text) => {
    expect(isIdentityQuestion(text)).toBe(true);
  });

  // People rarely ask it as one clean sentence. Each of these is two of them,
  // and a whole-string lookup used to send all of them to the model.
  it.each([
    'Кто ты? Ты нейросеть или человек?',
    'Привет! Кто вы такие?',
    'Ты кто? И что ты умеешь?',
    'Кто ты, бот?',
    'Здравствуйте! Вы бот или живой человек?',
  ])('treats the compound %s as an identity question', (text) => {
    expect(isIdentityQuestion(text)).toBe(true);
  });

  it.each([
    'Чем ты можешь помочь с входящим НДС за квартал?',
    'Что ты умеешь по первичке?',
    'Кто ты по документам поставщик или покупатель?',
    'Кто ты? У нас ОСНО, что с НДС за квартал?',
  ])('does not treat %s as an identity question', (text) => {
    expect(isIdentityQuestion(text)).toBe(false);
  });
});

describe('detectIntent', () => {
  it('routes a greeting, an identity question and a real question apart', () => {
    expect(detectIntent('Здравствуйте!')).toBe('greeting');
    expect(detectIntent('Что ты за модель?')).toBe('identity');
    expect(detectIntent('Мы на УСН. Что нужно для годовой отчётности?')).toBe(
      'question',
    );
  });

  it('prefers greeting when a message is only a greeting', () => {
    expect(detectIntent('привет')).toBe('greeting');
  });

  it('lets identity win over a greeting that precedes it', () => {
    expect(detectIntent('Здравствуйте! Ты нейросеть?')).toBe('identity');
  });

  it('lets a real question win over the greeting it is attached to', () => {
    expect(detectIntent('Здравствуйте! Что с НДС по УПД?')).toBe('question');
    expect(detectIntent('Привет, у нас ОСНО. Что с НДС?')).toBe('question');
  });
});

describe('cannedAnswer', () => {
  it('greets only when the answer opens the dialog', () => {
    expect(cannedAnswer('greeting', true)).toBe(GREETING_OPENING);
    expect(cannedAnswer('greeting', false)).toBe(GREETING_ONGOING);
    expect(GREETING_OPENING.startsWith('Здравствуйте!')).toBe(true);
    expect(GREETING_ONGOING.startsWith('Здравствуйте!')).toBe(false);
  });

  it('answers identity the same way regardless of the turn', () => {
    expect(cannedAnswer('identity', true)).toBe(IDENTITY_ANSWER);
    expect(cannedAnswer('identity', false)).toBe(IDENTITY_ANSWER);
    expect(IDENTITY_ANSWER).toContain('администратор Амалия');
    expect(IDENTITY_ANSWER).toContain('САЛЬДО');
    expect(IDENTITY_ANSWER).toContain('входящего НДС');
  });

  it('leaves real questions to the model', () => {
    expect(cannedAnswer('question', true)).toBeNull();
    expect(cannedAnswer('question', false)).toBeNull();
  });

  it('uses hyphens only, like the rest of the project', () => {
    for (const text of [GREETING_OPENING, GREETING_ONGOING, IDENTITY_ANSWER]) {
      expect(text).not.toMatch(/[\u2013\u2014]/);
    }
  });
});

describe('conversation helpers', () => {
  it('finds the last user message and counts user turns', () => {
    const messages = [
      { role: 'user' as const, content: 'Первый' },
      { role: 'assistant' as const, content: 'Ответ' },
      { role: 'user' as const, content: 'Второй' },
    ];

    expect(lastUserMessage(messages)).toBe('Второй');
    expect(userTurnCount(messages)).toBe(2);
    expect(userTurnCount([])).toBe(0);
    expect(lastUserMessage([{ role: 'assistant' as const, content: 'x' }])).toBe('');
  });
});
