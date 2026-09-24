interface Props {
  /** What the assistant is doing right now, when we know more than "busy". */
  label?: string;
}

export function TypingIndicator({ label = 'Печатает…' }: Props) {
  return (
    <div className="typing">
      <span className="typing__dots" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <span className="typing__label">{label}</span>
    </div>
  );
}
