import { useEffect, useMemo } from 'react';
import { ArrowDown } from 'lucide-react';
import { AppHeader } from './components/AppHeader';
import { DemoPanel } from './components/DemoPanel';
import { EmptyState } from './components/EmptyState';
import { ErrorNotice } from './components/ErrorNotice';
import { MessageBubble } from './components/MessageBubble';
import { MessageComposer } from './components/MessageComposer';
import { TypingIndicator } from './components/TypingIndicator';
import { useAnswerMode } from './hooks/useAnswerMode';
import { useChat } from './hooks/useChat';
import { useMediaQuery } from './hooks/useMediaQuery';
import { useSkin } from './hooks/useSkin';
import { useStickToBottom } from './hooks/useStickToBottom';
import { useTheme } from './hooks/useTheme';
import { errorCopy } from './lib/errors';
import type { ChatMessage } from './types/chat';

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
  const { mode: answerMode, setMode: setAnswerMode } = useAnswerMode();

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

  const { mode, toggleMode } = useTheme();
  const { skin, setSkin } = useSkin();

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

  // With nothing in the dialog the composer belongs inside the empty state,
  // under the example questions, so it stays high on the page; once the
  // conversation starts it moves to the bottom of the column where a chat input
  // is expected to be.
  const isBlank = visibleMessages.length === 0 && !isGenerating;

  /*
   * On a phone the empty state is taller than the log, so anything inside it
   * can end up below the fold - and the field is the one thing that must never
   * be. Below the same breakpoint the stylesheet switches to the phone layout,
   * so the field becomes a row of the column there, pinned to the bottom, and
   * the example questions scroll above it. The breakpoint is the stylesheet's
   * 680px; the two have to agree.
   */
  const narrow = useMediaQuery('(max-width: 680px)');

  // `!isBlank` and not `true`: sticking to the bottom of an empty log scrolls
  // the centred empty state up under the header. See the hook for the numbers.
  const { containerRef, isPinned, onScroll, scrollToBottom } = useStickToBottom(
    messages,
    !isBlank,
  );

  const errorCopyText = error ? errorCopy(error.code, error.retryAfterMs) : null;

  const liveStatus = errorCopyText
    ? `${errorCopyText.title}. ${errorCopyText.body}`
    : statusFor(messages, isGenerating, isFormulating);

  const composer = (
    <MessageComposer
      isGenerating={isGenerating}
      onSend={sendMessage}
      onStop={stopGeneration}
    />
  );

  return (
    <div className="app">
      <a className="skip-link" href="#composer-input">
        Перейти к полю ввода
      </a>

      <AppHeader
        mode={mode}
        skin={skin}
        canClear={!isGenerating && messages.length > 0}
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
          data-blank={isBlank}
        >
          {isBlank ? (
            <EmptyState
              onSuggestion={sendMessage}
              composer={narrow ? undefined : composer}
            />
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

        {isBlank && !narrow ? null : composer}

        {/*
          The last row of the chat column. On a wide screen the stylesheet pins
          it to the side of the page, which takes it out of flow and costs the
          grid nothing; on a phone it comes back into flow and sits under the
          field, where there is nothing left for it to cover.
        */}
        <DemoPanel
          mode={answerMode}
          skin={skin}
          onModeChange={setAnswerMode}
          onSkinChange={setSkin}
        />
      </main>

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
