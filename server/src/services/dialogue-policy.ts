import type { ChatMessage } from '../types/chat.js';

/**
 * Dialogue policy: the two cases where an answer must not depend on a model.
 *
 * A bare "привет" and a "кто ты" have exactly one correct reply, and that reply
 * should not cost a request from the shared free-tier budget, should not fail
 * when every model is on cooldown, and should not drift between sessions. So
 * they are answered from here, deterministically, before any upstream call.
 *
 * Everything else is a question and goes to the model.
 */
export type DialogueIntent = 'greeting' | 'identity' | 'question';

export const GREETING_OPENING =
  'Здравствуйте! Я администратор Амалия, чем могу вам помочь?';

/** Same reply mid-dialog, where greeting again would be out of place. */
export const GREETING_ONGOING = 'Я администратор Амалия, чем могу вам помочь?';

export const IDENTITY_ANSWER =
  'Я администратор Амалия. Помогаю по бухгалтерскому и налоговому учёту сервиса САЛЬДО: ' +
  'отчётность и налоговый учёт, расходы и первичные документы, учёт входящего НДС. ' +
  'Опишите задачу - уточню, что нужно, и подскажу следующий шаг.';

const GREETING_WORD =
  'здравствуйте|здравствуй|приветствую|приветик|привет|доброе\\s+утро|добрый\\s+день|' +
  'добрый\\s+вечер|доброй\\s+ночи|доброго\\s+дня|доброго\\s+времени\\s+суток|салют|хай|ку|hi|hello|hey';

/**
 * Words that ride along with a greeting without making it a question:
 * "Всем привет", "Привет ещё раз". Only they are allowed to survive the strip;
 * anything else means the message carries a real question.
 */
const GREETING_FILLER = 'ещё|еще|раз|снова|опять|всем|все|all|again|there';

const GREETING_STRIP = new RegExp(`${GREETING_WORD}|${GREETING_FILLER}`, 'giu');
const GREETING_PRESENT = new RegExp(GREETING_WORD, 'iu');

/** Punctuation and spacing that may surround a bare greeting. */
const SEPARATORS = /[\s!?.,;:…()"'«»`~*_\-–—+=[\]{}]+/gu;

/**
 * Lowercase, `ё` folded to `е`, everything that is not a letter or a digit
 * turned into a space. Lets identity phrases be compared as plain strings
 * instead of with a pile of regexes.
 */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Identity and capability questions. Matched against the whole normalised
 * message, so "чем ты можешь помочь с НДС" stays a question for the model
 * while "чем ты можешь помочь" gets the canned introduction.
 */
const IDENTITY_PHRASES = new Set([
  'кто ты',
  'ты кто',
  'кто ты такой',
  'кто ты такая',
  'ты кто такой',
  'ты кто такая',
  'кто вы',
  'вы кто',
  'кто вы такие',
  'вы кто такие',
  'что ты',
  'что вы',
  'что ты такое',
  'что вы такое',
  'ты что такое',
  'ты бот',
  'ты робот',
  'ты человек',
  'ты живой',
  'ты ии',
  'ты ai',
  'ты нейросеть',
  'ты программа',
  'ты ассистент',
  'ты модель',
  'какая ты модель',
  'какая у тебя модель',
  'какая модель',
  'что ты за модель',
  'ты какая модель',
  'какую модель ты используешь',
  'как тебя зовут',
  'как вас зовут',
  'как тебя звать',
  'твое имя',
  'ваше имя',
  'чем ты занимаешься',
  'что ты умеешь',
  'что ты можешь',
  'чем ты можешь помочь',
  'чем вы можете помочь',
  'чем можешь помочь',
  'who are you',
  'what are you',
  'what model are you',
]);

/**
 * True when the message is nothing but a greeting. "Привет, у нас ОСНО" is a
 * question that happens to start with a greeting, and must reach the model.
 */
export function isBareGreeting(text: string): boolean {
  if (!GREETING_PRESENT.test(text)) return false;
  return text.replace(GREETING_STRIP, ' ').replace(SEPARATORS, '') === '';
}

/**
 * "ты бот", "ты нейросеть или человек", "вы это модель" - the same question
 * asked with a different noun. Kept as a pattern rather than an exhaustive list
 * of phrases, because the combinations are open-ended. The trailing group takes
 * an optional conjunction, so "живой человек" and "живой или человек" both fit.
 */
const SELF = '(?:ты|вы)';
const NATURE =
  '(?:бот|робот|человек|нейросеть|нейронка|ии|ai|живой|живая|настоящий|настоящая|программа|ассистент|модель|алгоритм)';
const JOIN = '(?:или|либо|и|это|же|что)';
const TAIL = `(?:\\s+(?:${JOIN}\\s+)?${NATURE})*`;

const NATURE_RE = new RegExp(`^${SELF}(?:\\s+${JOIN})?\\s+${NATURE}${TAIL}$`, 'u');

/** "кто ты бот", "что вы за модель": the self-reference is only a prefix. */
const SELF_PREFIX_RE = /^(?:кто|что)\s+(?:ты|вы)\s+/u;

/** "И что ты умеешь?" - the second sentence often opens with a conjunction. */
const LEADING_CONJUNCTION_RE = /^(?:и|а|но)\s+/u;

/** The noun phrase alone, optionally joined: "бот", "бот или человек". */
const NATURE_ONLY_RE = new RegExp(`^(?:${JOIN}\\s+)?${NATURE}${TAIL}$`, 'u');

/**
 * People write the same question as two short sentences: "Кто ты? Ты нейросеть
 * или человек?". Classifying the whole string as one phrase would miss it, so
 * it is split into sentences first. Only sentence punctuation splits - a comma
 * must not, or "Привет, у нас ОСНО" would look like a greeting plus a fragment.
 */
const CLAUSE_SPLIT = /[.!?;…\n]+/gu;

function clauseIntent(clause: string): DialogueIntent | null {
  const normalized = normalize(clause);
  if (normalized === '') return null;

  const withoutConjunction = normalized.replace(LEADING_CONJUNCTION_RE, '');
  const variants =
    withoutConjunction === normalized ? [normalized] : [normalized, withoutConjunction];

  for (const variant of variants) {
    if (IDENTITY_PHRASES.has(variant) || NATURE_RE.test(variant)) {
      return 'identity';
    }

    const rest = variant.replace(SELF_PREFIX_RE, '');
    if (rest === variant) continue;
    if (IDENTITY_PHRASES.has(rest) || NATURE_ONLY_RE.test(rest)) return 'identity';
  }

  if (isBareGreeting(clause)) return 'greeting';
  return null;
}

export function isIdentityQuestion(text: string): boolean {
  return detectIntent(text) === 'identity';
}

export function detectIntent(text: string): DialogueIntent {
  let sawIdentity = false;

  for (const clause of text.split(CLAUSE_SPLIT)) {
    if (normalize(clause) === '') continue;

    const intent = clauseIntent(clause);
    // One sentence we cannot classify means there is a real question in there,
    // and a real question belongs to the model.
    if (intent === null) return 'question';
    if (intent === 'identity') sawIdentity = true;
  }

  if (sawIdentity) return 'identity';
  return isBareGreeting(text) ? 'greeting' : 'question';
}

/** The last thing the user said, or an empty string. */
export function lastUserMessage(messages: ChatMessage[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === 'user') return message.content;
  }
  return '';
}

/** How many times the user has written in this conversation. */
export function userTurnCount(messages: ChatMessage[]): number {
  return messages.filter((message) => message.role === 'user').length;
}

/**
 * The canned reply for an intent, or null when the question needs a model.
 *
 * `opening` marks the first user message of the conversation: only there does
 * the answer start with "Здравствуйте!".
 */
export function cannedAnswer(
  intent: DialogueIntent,
  opening: boolean,
): string | null {
  if (intent === 'identity') return IDENTITY_ANSWER;
  if (intent === 'greeting') return opening ? GREETING_OPENING : GREETING_ONGOING;
  return null;
}
