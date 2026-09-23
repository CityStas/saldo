import type { ReactNode } from 'react';

interface Props {
  onSuggestion: (value: string) => void;
  /**
   * The message composer, passed in rather than rendered by the layout, so that
   * on an empty dialog it can sit right under the example questions instead of
   * at the bottom of the column. The examples read as a menu of what to ask,
   * and the field closes the list - the same order a person scans the screen in.
   * It stays high on the page: the whole block is anchored near the top, not
   * pushed to the bottom edge where a chat input normally waits.
   */
  composer?: ReactNode;
}

const SUGGESTIONS = [
  'Какие документы нужны для учёта входящего НДС?',
  'Что проверить в первичке перед сдачей отчётности?',
  'Мы на УСН. Что нужно для годовой отчётности?',
  'Можно ли исправить учёт за прошлый период?',
];

export function EmptyState({ onSuggestion, composer }: Props) {
  return (
    <div className="empty">
      {/*
        One large statement and nothing above it. The mono line naming the
        service used to sit here, and before that a decorative glyph: on a first
        screen with nothing in it, every line before the heading is one more
        thing to read before the thing that matters.
      */}
      <h2 className="empty__title">
        С чего <em>начать</em>?
      </h2>

      <p className="empty__lead">
        Опишите задачу: вид деятельности, налоговый режим и период. Амалия уточнит,
        каких документов не хватает, и подскажет следующий шаг.
      </p>

      <ul className="empty__suggestions">
        {SUGGESTIONS.map((suggestion) => (
          <li key={suggestion}>
            <button
              type="button"
              className="chip"
              onClick={() => onSuggestion(suggestion)}
            >
              {suggestion}
            </button>
          </li>
        ))}
      </ul>

      {composer ? <div className="empty__composer">{composer}</div> : null}
    </div>
  );
}
