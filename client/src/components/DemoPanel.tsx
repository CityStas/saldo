import { useState } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
import { saveAnswerMode } from '../lib/storage';
import type { AnswerMode } from '../types/chat';

interface Props {
  mode: AnswerMode;
  onModeChange: (mode: AnswerMode) => void;
}

const MODES: { value: AnswerMode; title: string; text: string }[] = [
  {
    value: 'consult',
    title: 'С предложением услуг',
    text: 'Ответ по существу, а когда задача требует работы по документам - карточка направления услуг и кнопка Telegram.',
  },
  {
    value: 'full',
    title: 'Полный ответ',
    text: 'Развёрнутый ответ без карточки услуг и без кнопок: ассистент старается закрыть вопрос сам.',
  },
];

/**
 * The demo switch, floating on the side of the page.
 *
 * It exists because the two modes answer the same question differently, and a
 * reviewer should be able to compare them on the spot instead of reading about
 * the difference. The choice is applied to the next message, not to the ones
 * already in the dialog.
 */
export function DemoPanel({ mode, onModeChange }: Props) {
  const [open, setOpen] = useState(false);

  const select = (next: AnswerMode): void => {
    saveAnswerMode(next);
    onModeChange(next);
  };

  return (
    <div className="demo" data-open={open}>
      {open ? (
        <div className="demo__panel" role="group" aria-label="Демо-режим">
          <div className="demo__head">
            <p className="demo__title">Демо-режим</p>
            <button
              type="button"
              className="demo__close"
              onClick={() => setOpen(false)}
              aria-label="Свернуть демо-режим"
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>

          <fieldset className="demo__options">
            <legend className="sr-only">Как отвечать на вопросы</legend>

            {MODES.map((entry) => (
              <label
                key={entry.value}
                className="demo__option"
                data-active={mode === entry.value}
              >
                <input
                  type="radio"
                  name="answer-mode"
                  value={entry.value}
                  checked={mode === entry.value}
                  onChange={() => select(entry.value)}
                  className="sr-only"
                />
                <span className="demo__option-title">{entry.title}</span>
                <span className="demo__option-text">{entry.text}</span>
              </label>
            ))}
          </fieldset>

          <p className="demo__hint">
            Режим применится к следующему сообщению. История диалога хранится
            только в этой вкладке и сбрасывается при её закрытии.
          </p>
        </div>
      ) : (
        <button
          type="button"
          className="demo__toggle"
          onClick={() => setOpen(true)}
          aria-expanded={false}
        >
          <SlidersHorizontal size={14} aria-hidden="true" />
          Демо-режим
        </button>
      )}
    </div>
  );
}
