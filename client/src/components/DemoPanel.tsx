import { useEffect, useRef, useState } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
import { SKINS } from '../lib/appearance';
import type { AnswerMode, SkinName } from '../types/chat';

interface Props {
  mode: AnswerMode;
  skin: SkinName;
  onModeChange: (mode: AnswerMode) => void;
  onSkinChange: (skin: SkinName) => void;
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
 * Two independent things a reviewer should be able to compare on the spot
 * instead of reading about: how the assistant answers (with a service offer or
 * without), and how the chat looks (the product's design or the portfolio's).
 * Both choices are applied to what comes next, never retroactively.
 */
export function DemoPanel({ mode, skin, onModeChange, onSkinChange }: Props) {
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const openedOnce = useRef(false);

  /*
   * The panel replaces the toggle in the DOM, so opening it unmounts whatever
   * had focus and leaves the caret on <body>: a keyboard user then has to tab
   * from the top of the page to reach the options they just opened. Focus is
   * moved into the panel instead, and handed back to the toggle on close - the
   * standard disclosure behaviour.
   */
  useEffect(() => {
    if (open) {
      openedOnce.current = true;
      const first = panelRef.current?.querySelector<HTMLInputElement>(
        'input[type="radio"]',
      );
      (first ?? panelRef.current)?.focus();
      return;
    }

    // Not on first paint: focusing the toggle on mount would pull the caret
    // out of the composer before the user has typed anything.
    if (openedOnce.current) toggleRef.current?.focus();
  }, [open]);

  return (
    <div className="demo" data-open={open}>
      {open ? (
        <div
          className="demo__panel"
          role="group"
          aria-label="Демо-режим"
          ref={panelRef}
          tabIndex={-1}
        >
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
            <legend className="demo__legend">Оформление</legend>

            {SKINS.map((entry) => (
              <label
                key={entry.name}
                className="demo__option"
                data-active={skin === entry.name}
              >
                <input
                  type="radio"
                  name="skin"
                  value={entry.name}
                  checked={skin === entry.name}
                  onChange={() => onSkinChange(entry.name)}
                  className="sr-only"
                />
                <span className="demo__option-title">{entry.label}</span>
              </label>
            ))}
          </fieldset>

          <fieldset className="demo__options">
            <legend className="demo__legend">Как отвечать</legend>

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
                  onChange={() => onModeChange(entry.value)}
                  className="sr-only"
                />
                <span className="demo__option-title">{entry.title}</span>
                <span className="demo__option-text">{entry.text}</span>
              </label>
            ))}
          </fieldset>

          <p className="demo__hint">
            Оба выбора применяются сразу: оформление - ко всему экрану, режим
            ответа - к следующему сообщению. История диалога хранится только в
            этой вкладке и сбрасывается при её закрытии.
          </p>
        </div>
      ) : (
        <button
          type="button"
          className="demo__toggle"
          onClick={() => setOpen(true)}
          aria-expanded={false}
          ref={toggleRef}
        >
          <SlidersHorizontal size={14} aria-hidden="true" />
          Демо-режим
        </button>
      )}
    </div>
  );
}
