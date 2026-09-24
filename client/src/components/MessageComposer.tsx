import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Square } from 'lucide-react';

interface Props {
  isGenerating: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
}

export function MessageComposer({ isGenerating, onSend, onStop }: Props) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  /*
   * The field grows with what is typed, and the browser does the growing:
   * `field-sizing: content` on `.composer__input` is CSS's own answer to "size
   * this box to its text", with `max-height` as the ceiling and the field's own
   * scrollbar past it.
   *
   * This used to be a `useLayoutEffect` that read `scrollHeight` and wrote it
   * back as an inline height, once per mount. A number written once from one
   * measurement is a number that can be written wrong and stay wrong: a box
   * stretched by its parent, an extension that touches the field, a font that
   * arrives after the read - each of them turns that single read into a field
   * locked at the maximum, and only a reload clears it. That is what a
   * one-line field that opens 200px tall is. A height the browser derives from
   * the content every frame cannot get stuck that way, and it costs no
   * JavaScript at all.
   *
   * Where `field-sizing` is not supported yet (Safari, Firefox) the field keeps
   * the single row `rows={1}` asks for and scrolls its own content. Typing more
   * than one line still works; it is the box that does not follow.
   */

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
          placeholder="Опишите Амалии задачу..."
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
