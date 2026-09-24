import { Trash2 } from 'lucide-react';
import { Logo } from './Logo';
import { TelegramButton } from './TelegramButton';
import { ThemeToggle } from './ThemeToggle';
import type { SkinName, ThemeMode } from '../types/chat';

interface Props {
  mode: ThemeMode;
  skin: SkinName;
  canClear: boolean;
  onToggleMode: () => void;
  onClear: () => void;
}

export function AppHeader({
  mode,
  skin,
  canClear,
  onToggleMode,
  onClear,
}: Props) {
  return (
    <header className="header">
      <div className="header__brand">
        {/*
          Both sizes are measured off saldo.chat rather than eyeballed: the
          wordmark is 32px tall there (Tailwind `h-8`, rendered 142x32) and the
          Telegram pill is 44px tall with 20px side padding and a 17px icon.
          The `md` variant already carries exactly those numbers, so the header
          uses it instead of inventing a third size.
        */}
        {/*
          The wordmark leads to the service it belongs to, the way a logo
          normally does. The accessible name says where it goes: "Салдо" alone
          reads as a heading, and a link that only repeats the brand leaves a
          screen reader user guessing whether it is a link at all.
        */}
        <a
          className="header__logo-link"
          href="https://saldo.chat/"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Салдо: открыть основной сайт"
          title="Открыть saldo.chat"
        >
          <Logo className="header__logo" height={32} />
        </a>
        <span className="header__divider" aria-hidden="true" />
        <h1 className="header__title">
          чат с <em>Амалией</em>
        </h1>
      </div>

      <div className="header__actions">
        {/*
          The Telegram pill is last, and therefore the rightmost thing in the
          header, exactly as on saldo.chat. The chat has two controls the site
          does not (brightness, clear), and putting them after the CTA pushed
          the pill 84px to the left of where it sits on the main site - a jump
          you see every time you move between the two pages.
        */}
        {/*
          The portfolio design has one brightness, so in that skin there is
          nothing for this button to switch and it is not rendered. Hiding a
          control is normally the wrong answer; here the alternative would be a
          button that does nothing, which is worse.
        */}
        {skin === 'saldo' ? (
          <ThemeToggle mode={mode} onToggle={onToggleMode} />
        ) : null}

        {/*
          Not rendered at all while the dialog is empty: an always-present
          disabled button on the first screen is noise. It appears as soon as
          there is something to clear.
        */}
        {canClear ? (
          <button
            type="button"
            className="icon-button"
            onClick={onClear}
            aria-label="Очистить диалог"
            title="Очистить диалог"
          >
            <Trash2 size={16} aria-hidden="true" />
          </button>
        ) : null}

        <TelegramButton size="md" />
      </div>
    </header>
  );
}
