import { useEffect, useMemo, useState } from 'react';
import { ArrowDown } from 'lucide-react';
import { AppHeader } from './components/AppHeader';
import { DemoPanel } from './components/DemoPanel';
import { EmptyState } from './components/EmptyState';
import { ErrorNotice } from './components/ErrorMessage';
import { MessageBubble } from './components/MessageBubble';
import { MessageComposer } from './components/MessageComposer';
import { TypingIndicator } from './components/TypingIndicator';
import { useChat } from './hooks/useChat';
import { useStickToBottom } from './hooks/useStickToBottom';
import { useTheme } from './hooks/useTheme';
import { errorCopy } from './lib/errors';
import { initialAnswerMode } from './lib/storage';
import type { AnswerMode, ChatMessage } from './types/chat';

function statusFor(
  messages: ChatMessage[],
  isGenerating: boolean,
  isFormulating: boolean,
): string {
  if (isFormulating) return 'Амалия формулирует ответ';
  if (isGenerating) return 'Амалия печатает ответ';

  const last = messages[messages.length - 1];
  if (!last) return '';

  if (last.role === 'user') return 'Сообщение отправлено';
  if (last.status === 'stopped') return 'Генерация остановлена, часть ответа сохранена';
  if (last.status === 'failed') return 'Ошибка при получении ответа';
  return 'Ответ готов';
}

export default function App() {
  const [answerMode, setAnswerMode] = useState<AnswerMode>(initialAnswerMode);

  const {
    messages,
    isGenerating,
    error,
    canRetry,
    sendMessage,
    stopGeneration,
    retryLast,
    clearChat,
    dismissError,
  } = useChat(answerMode);

  const { theme, mode, setTheme, toggleMode } = useTheme();
  const { containerRef, isPinned, onScroll, scrollToBottom } =
    useStickToBottom(messages);

  // Esc stops generation from anywhere on the page, including while the
  // textarea has focus - the assignment calls this out explicitly.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || !isGenerating) return;
      event.preventDefault();
      stopGeneration();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isGenerating, stopGeneration]);

  // An assistant message with no text yet has nothing to show. The typing
  // indicator already covers the waiting state, and a failed or stopped empty
  // bubble would just be a box with no content.
  const visibleMessages = useMemo(
    () =>
      messages.filter(
        (message) => !(message.role === 'assistant' && message.content === ''),
      ),
    [messages],
  );

  // A reasoning model can spend a while thinking before the first visible
  // token. Reasoning text is never shown, but saying that it is thinking beats
  // a spinner that looks stuck.
  const isFormulating = useMemo(() => {
    const last = messages[messages.length - 1];
    return (
      last?.role === 'assistant' &&
      last.status === 'streaming' &&
      last.hasReasoning === true
    );
  }, [messages]);

  const liveStatus = error
    ? `${errorCopy(error.code).title}. ${errorCopy(error.code).body}`
    : statusFor(messages, isGenerating, isFormulating);

  return (
    <div className="app">
      <a className="skip-link" href="#composer-input">
        Перейти к полю ввода
      </a>

      <AppHeader
        theme={theme}
        mode={mode}
        canClear={!isGenerating && messages.length > 0}
        onThemeChange={setTheme}
        onToggleMode={toggleMode}
        onClear={clearChat}
      />

      <main className="chat">
        <section
          className="chat__log"
          ref={containerRef}
          onScroll={onScroll}
          aria-label="История диалога"
          aria-busy={isGenerating}
        >
          {visibleMessages.length === 0 && !isGenerating ? (
            <EmptyState onSuggestion={sendMessage} />
          ) : (
            <div className="chat__thread">
              {visibleMessages.map((message) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  answerMode={answerMode}
                />
              ))}

              {isGenerating ? (
                <TypingIndicator
                  label={isFormulating ? 'Формулирует ответ…' : undefined}
                />
              ) : null}
            </div>
          )}
        </section>

        {!isPinned ? (
          <button
            type="button"
            className="to-bottom"
            onClick={() => scrollToBottom()}
          >
            <ArrowDown size={14} aria-hidden="true" />
            Вниз
          </button>
        ) : null}

        {error ? (
          <ErrorNotice
            error={error}
            canRetry={canRetry}
            onRetry={retryLast}
            onDismiss={dismissError}
          />
        ) : null}

        <MessageComposer
          isGenerating={isGenerating}
          onSend={sendMessage}
          onStop={stopGeneration}
        />
      </main>

      <DemoPanel mode={answerMode} onModeChange={setAnswerMode} />

      {/*
        A dedicated live region. Putting aria-live on the message list itself
        would make a screen reader re-read the whole conversation on every
        streamed token.
      */}
      <p className="sr-only" role="status" aria-live="polite">
        {liveStatus}
      </p>
    </div>
  );
}
