import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Markdown } from './Markdown';
import { formatDuration, formatTime } from '../lib/format';
import type { ChatMessage } from '../types/chat';

interface Props {
  message: ChatMessage;
}

const STATUS_LABEL: Record<ChatMessage['status'], string | null> = {
  complete: null,
  streaming: 'печатает',
  stopped: 'остановлено',
  failed: 'ошибка',
};

export function MessageBubble({ message }: Props) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';
  const statusLabel = STATUS_LABEL[message.status];

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // ignore
    }
  };

  return (
    <article
      className="message"
      data-role={message.role}
      data-status={message.status}
      aria-label={isUser ? 'Твоё сообщение' : 'Ответ Амалии'}
    >
      <div className="message__bubble">
        {isUser ? (
          <p className="message__text">{message.content}</p>
        ) : message.content ? (
          <Markdown>{message.content}</Markdown>
        ) : (
          <span className="message__caret" aria-hidden="true" />
        )}

        {message.status === 'streaming' && message.content ? (
          <span className="message__caret" aria-hidden="true" />
        ) : null}
      </div>

      <div className="message__meta">
        <time dateTime={new Date(message.createdAt).toISOString()}>
          {formatTime(message.createdAt)}
        </time>

        {message.elapsedMs ? (
          <span>{formatDuration(message.elapsedMs)}</span>
        ) : null}

        {statusLabel ? (
          <span className="message__status" data-status={message.status}>
            {statusLabel}
          </span>
        ) : null}

        {message.content ? (
          <button
            type="button"
            className="message__copy"
            onClick={() => void copy()}
            aria-label="Скопировать сообщение"
          >
            {copied ? (
              <Check size={12} aria-hidden="true" />
            ) : (
              <Copy size={12} aria-hidden="true" />
            )}
          </button>
        ) : null}
      </div>
    </article>
  );
}
