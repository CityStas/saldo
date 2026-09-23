import { ArrowRight, Send } from 'lucide-react';
import { TELEGRAM_URL } from '../lib/services';

interface Props {
  label?: string;
  /**
   * Shown instead of `label` on narrow screens, where the full wording would
   * push the rest of the header off. The accessible name always stays `label`.
   */
  shortLabel?: string;
  /**
   * `sm` matches the 34px controls in the header. `md` reproduces the site's
   * hero pill: label at roughly 0.3 of the height, side padding at roughly
   * 0.44, fully rounded.
   */
  size?: 'sm' | 'md';
  /** Trailing arrow, as on the site's section CTAs. */
  arrow?: boolean;
  className?: string;
}

/**
 * The Telegram CTA. One link, one appearance: wherever it shows up it should
 * read as the same button the site uses, so the proportions are shared instead
 * of being re-invented per placement.
 */
export function TelegramButton({
  label = 'Написать в Telegram',
  shortLabel = 'Telegram',
  size = 'sm',
  arrow = false,
  className,
}: Props) {
  const classes = ['tg-button', `tg-button--${size}`, className]
    .filter(Boolean)
    .join(' ');

  return (
    <a
      className={classes}
      href={TELEGRAM_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      title={label}
    >
      <Send className="tg-button__icon" aria-hidden="true" />
      <span className="tg-button__label">{label}</span>
      <span className="tg-button__label tg-button__label--short" aria-hidden="true">
        {shortLabel}
      </span>
      {arrow ? (
        <ArrowRight className="tg-button__arrow" aria-hidden="true" />
      ) : null}
    </a>
  );
}
