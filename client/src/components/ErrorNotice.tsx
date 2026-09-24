import { AlertTriangle, RefreshCw, X } from 'lucide-react';
import { errorCopy, formatRetryAfter } from '../lib/errors';
import type { ChatError } from '../types/chat';

interface Props {
  error: ChatError;
  canRetry: boolean;
  onRetry: () => void;
  onDismiss: () => void;
}

export function ErrorNotice({ error, canRetry, onRetry, onDismiss }: Props) {
  const copy = errorCopy(error.code, error.retryAfterMs);

  return (
    <div className="notice" role="alert" data-code={error.code}>
      <span className="notice__icon" aria-hidden="true">
        <AlertTriangle size={16} />
      </span>

      <div className="notice__body">
        <p className="notice__title">{copy.title}</p>
        <p className="notice__text">
          {copy.body}
          {error.retryAfterMs !== undefined ? (
            <> Повторить можно через {formatRetryAfter(error.retryAfterMs)}.</>
          ) : null}
        </p>

        {error.detail ? (
          <details className="notice__details">
            <summary>Технические детали</summary>
            <p>{error.detail}</p>
          </details>
        ) : null}
      </div>

      <div className="notice__actions">
        {canRetry && copy.retryable ? (
          <button type="button" className="button button--small" onClick={onRetry}>
            <RefreshCw size={13} aria-hidden="true" />
            Повторить
          </button>
        ) : null}

        <button
          type="button"
          className="icon-button icon-button--small"
          onClick={onDismiss}
          aria-label="Скрыть сообщение об ошибке"
        >
          <X size={14} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
