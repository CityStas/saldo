import { ArrowRight, Send } from 'lucide-react';
import { TELEGRAM_URL } from '../lib/services';

interface Props {
  /**
   * The label, as on the site: "Написать в Telegram". The service card passes
   * the action of its own direction instead ("Проверить документы"), because
   * there the button is part of a sentence about that work.
   */
  label?: string;
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
 *
 * The wording is the site's own, verbatim, and it does not change with the
 * viewport. A shorter "Telegram" was tried twice - once as the label itself and
 * once as a second span swapped in at narrow widths - and removed both times:
 * the button sits in the same place on both pages, and a person moving between
 * them should not see it change under their cursor. On a phone the header drops
 * the text altogether and keeps the icon, with the name still in `aria-label`.
 */
export function TelegramButton({
  label = 'Написать в Telegram',
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
      {arrow ? (
        <ArrowRight className="tg-button__arrow" aria-hidden="true" />
      ) : null}
    </a>
  );
}
