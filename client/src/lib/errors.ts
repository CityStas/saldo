import { ChatRequestError } from './api';
import type { ChatError, ChatErrorCode } from '../types/chat';

interface ErrorCopy {
  title: string;
  body: string;
  /** Whether showing a "Повторить" action makes sense. */
  retryable: boolean;
}

/**
 * How long a rate limit has to last before it stops being "wait a bit" and
 * becomes "the free daily window is spent".
 */
const DAILY_LIMIT_HINT_MS = 30 * 60_000;

const COPY: Record<ChatErrorCode, ErrorCopy> = {
  RATE_LIMIT: {
    title: 'Лимит бесплатных запросов исчерпан',
    body: 'У бесплатных моделей общий лимит на все модели сразу: минутный или суточный. Подожди и отправь сообщение снова.',
    retryable: true,
  },
  TIMEOUT: {
    title: 'Ответ не пришёл вовремя',
    body: 'Запрос прерван по таймауту - попробуй ещё раз.',
    retryable: true,
  },
  NETWORK: {
    title: 'Соединение потеряно',
    body: 'Не удалось связаться с сервером приложения. Проверь подключение и повтори.',
    retryable: true,
  },
  NO_MODELS: {
    title: 'Амалия отошла',
    body: 'Но скоро вернётся и сразу ответит. Отправь сообщение ещё раз через минуту.',
    retryable: true,
  },
  /*
   * The provider refused the request before it reached a model - a blocked
   * address, most often. It is not the user's question and not something they
   * can fix, so the copy says who is at fault instead of hinting at their
   * input, and it deliberately does NOT read like `NO_MODELS`: "Амалия отошла"
   * would suggest she is merely busy, and here she is unreachable.
   */
  UPSTREAM_BLOCKED: {
    title: 'Амалия не может ответить',
    body: 'Сервис моделей отклонил запрос с этого адреса, поэтому ответить сейчас нечем. Дело не в твоём вопросе - попробуй позже.',
    retryable: true,
  },
  AUTH: {
    title: 'Ключ OpenRouter отклонён',
    body: 'Сервер получил 401/403 от OpenRouter. Проверь ключи в OPENROUTER_API_KEY и OPENROUTER_API_KEYS в файле .env - отклонённый ключ отключается на сутки, остальные продолжают работать.',
    retryable: false,
  },
  BAD_REQUEST: {
    title: 'Запрос отклонён',
    body: 'Сервер не принял запрос. Обычно это значит, что диалог слишком длинный - попробуй начать новый.',
    retryable: false,
  },
  UPSTREAM_ERROR: {
    title: 'Не удалось получить ответ',
    body: 'Запрос можно повторить - сервис попробует другой маршрут.',
    retryable: true,
  },
  CANCELLED: {
    title: 'Генерация остановлена',
    body: 'Запрос отменён.',
    retryable: true,
  },
  UNKNOWN: {
    title: 'Что-то пошло не так',
    body: 'Неожиданная ошибка. Попробуй отправить сообщение ещё раз.',
    retryable: true,
  },
};

/**
 * A rate limit that lasts for hours is not a rate limit, it is the spent daily
 * window - and "подожди и отправь снова" is then actively misleading advice.
 * The upstream message names the real remedy, so the copy says the same thing.
 */
const DAILY_LIMIT_COPY: ErrorCopy = {
  title: 'Суточный лимит бесплатных запросов исчерпан',
  body: 'У бесплатных моделей OpenRouter 50 запросов в сутки на ключ, и на сегодня они израсходованы. Ждать до сброса окна. Если нужно больше, пополни ключ на 10 кредитов - тогда лимит станет 1000 запросов в сутки. Либо добавь второй ключ в OPENROUTER_API_KEYS: сервер переключается между ними сам.',
  retryable: false,
};

export function errorCopy(code: ChatErrorCode, retryAfterMs?: number): ErrorCopy {
  if (
    code === 'RATE_LIMIT' &&
    retryAfterMs !== undefined &&
    retryAfterMs > DAILY_LIMIT_HINT_MS
  ) {
    return DAILY_LIMIT_COPY;
  }

  return COPY[code];
}

/**
 * Turn anything thrown by the transport into a typed, displayable error.
 * An aborted request is not an error - the caller handles that case first.
 */
export function classifyError(error: unknown): ChatError {
  if (error instanceof ChatRequestError) {
    return {
      code: error.code,
      detail: error.message,
      retryAfterMs: error.retryAfterMs,
    };
  }

  if (error instanceof TypeError) {
    return { code: 'NETWORK', detail: error.message };
  }

  return {
    code: 'UNKNOWN',
    detail: error instanceof Error ? error.message : String(error),
  };
}

export function formatRetryAfter(ms: number): string {
  const seconds = Math.max(1, Math.ceil(ms / 1000));
  if (seconds < 60) return `${seconds} с`;
  if (seconds < 3600) return `${Math.ceil(seconds / 60)} мин`;
  return `${Math.ceil(seconds / 3600)} ч`;
}
