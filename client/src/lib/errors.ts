import { ChatRequestError } from './api';
import type { ChatError, ChatErrorCode } from '../types/chat';

interface ErrorCopy {
  title: string;
  body: string;
  /** Whether showing a "Повторить" action makes sense. */
  retryable: boolean;
}

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
    title: 'Сервис недоступен',
    body: 'Свободных исполнителей сейчас нет. Подожди минуту - список обновляется автоматически.',
    retryable: true,
  },
  AUTH: {
    title: 'Ключ OpenRouter отклонён',
    body: 'Сервер получил 401/403 от OpenRouter. Проверь OPENROUTER_API_KEY в файле .env.',
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

export function errorCopy(code: ChatErrorCode): ErrorCopy {
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
  return `${Math.ceil(seconds / 60)} мин`;
}
