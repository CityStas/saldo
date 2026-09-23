interface Props {
  onSuggestion: (value: string) => void;
}

const SUGGESTIONS = [
  'Какие документы нужны для учёта входящего НДС?',
  'Что проверить в первичке перед сдачей отчётности?',
  'Мы на УСН. Что нужно для годовой отчётности?',
  'Можно ли исправить учёт за прошлый период?',
];

export function EmptyState({ onSuggestion }: Props) {
  return (
    <div className="empty">
      <div className="empty__mark" aria-hidden="true">
        <svg viewBox="0 0 44 44" width="44" height="44" role="presentation">
          <circle cx="22" cy="22" r="21" fill="none" stroke="currentColor" strokeOpacity="0.25" />
          <path
            d="M22 11c1.1 6.1 3.8 8.9 10 10-6.2 1.1-8.9 3.9-10 10-1.1-6.1-3.8-8.9-10-10 6.2-1.1 8.9-3.9 10-10Z"
            fill="currentColor"
          />
        </svg>
      </div>

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
    </div>
  );
}
