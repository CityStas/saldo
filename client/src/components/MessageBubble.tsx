import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Markdown } from './Markdown';
import { ServiceCta } from './ServiceCta';
import { formatDuration, formatTime } from '../lib/format';
import { splitServiceMarker } from '../lib/service-marker';
import type { AnswerMode, ChatMessage } from '../types/chat';

interface Props {
  message: ChatMessage;
  /** In `full` mode the service card is never rendered, tag or no tag. */
  answerMode?: AnswerMode;
}

const STATUS_LABEL: Record<ChatMessage['status'], string | null> = {
  complete: null,
  streaming: 'печатает',
  stopped: 'остановлено',
  failed: 'ошибка',
};

export function MessageBubble({ message, answerMode = 'consult' }: Props) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';
  const statusLabel = STATUS_LABEL[message.status];

  // The service tag is an instruction to the UI, not part of the answer, so it
  // never reaches the rendered text or the clipboard.
  const { text: body, service } = isUser
    ? { text: message.content, service: null }
    : splitServiceMarker(message.content);

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(body);
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
          <p className="message__text">{body}</p>
        ) : body ? (
          <Markdown>{body}</Markdown>
        ) : (
          <span className="message__caret" aria-hidden="true" />
        )}

        {!isUser && message.status === 'streaming' && body ? (
          <span className="message__caret" aria-hidden="true" />
        ) : null}

        {service && answerMode === 'consult' && message.status !== 'streaming' ? (
          <ServiceCta service={service} />
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

        {body ? (
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
