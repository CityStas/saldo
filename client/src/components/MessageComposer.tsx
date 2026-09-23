import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowUp, Square } from 'lucide-react';

const MAX_TEXTAREA_HEIGHT = 200;

interface Props {
  isGenerating: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
}

export function MessageComposer({ isGenerating, onSend, onStop }: Props) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Grow with the content instead of showing a scrollbar after two lines.
  useLayoutEffect(() => {
    const element = textareaRef.current;
    if (!element) return;

    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
  }, [value]);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const submit = (): void => {
    const trimmed = value.trim();
    if (!trimmed || isGenerating) return;

    onSend(trimmed);
    setValue('');
  };

  return (
    <form
      className="composer"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div className="composer__field">
        <label className="sr-only" htmlFor="composer-input">
          Вопрос по учёту
        </label>

        <textarea
          id="composer-input"
          ref={textareaRef}
          className="composer__input"
          value={value}
          rows={1}
          placeholder="Опишите задачу по учёту…"
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            // Never send while an IME composition is in progress.
            if (event.nativeEvent.isComposing) return;

            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
        />

        {isGenerating ? (
          <button
            type="button"
            className="button button--stop"
            onClick={onStop}
            aria-keyshortcuts="Escape"
          >
            <Square size={13} aria-hidden="true" />
            Стоп
          </button>
        ) : (
          <button
            type="submit"
            className="button button--send"
            disabled={value.trim() === ''}
            aria-label="Отправить сообщение"
          >
            <ArrowUp size={16} aria-hidden="true" />
          </button>
        )}
      </div>

      <div className="composer__hints">
        <span className="hint">
          <kbd>Enter</kbd> отправить
        </span>
        <span className="hint">
          <kbd>Shift</kbd>+<kbd>Enter</kbd> перенос
        </span>
        <span className="hint">
          <kbd>Esc</kbd> стоп
        </span>
      </div>
    </form>
  );
}
