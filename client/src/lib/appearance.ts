import type { SkinName, ThemeMode } from '../types/chat';

/**
 * The two appearance axes, in one place.
 *
 * They are independent on purpose. Brightness (`data-mode`) is a property of
 * the palette; appearance (`data-skin`) is a whole design system. That is why
 * they are two attributes on <html> rather than one `theme` string: a person can
 * want the САЛЬДО palette after dark without that also meaning "the other
 * design", and vice versa. Both are applied by the inline script in index.html
 * before the first paint, so neither flashes.
 */

/**
 * Light is the default, and it is the main site's scheme rather than the
 * operating system's preference: the chat is meant to read as part of
 * saldo.chat on arrival, and the dark variant is one click away in the header.
 *
 * There used to be three palettes on a second axis (`cream | indigo | mint`)
 * with a row of swatches in the header. It was removed: the chat is a client
 * of САЛЬДО, and offering three colourways of someone else's brand made the
 * screen look like a theme demo rather than a product. What is left is the one
 * palette the service actually uses, in the two brightnesses the assignment
 * asked for.
 */
export const DEFAULT_MODE: ThemeMode = 'light';

export interface Skin {
  name: SkinName;
  label: string;
}

/**
 * Two appearances for the same chat.
 *
 * `saldo` is the product: the palette and typography of saldo.chat, which is
 * what a client of САЛЬДО should see. `portfolio` is the same components
 * dressed in the visual language of a personal portfolio page - near-black
 * paper, hairline rules, Playfair Display headings, wide-tracked monospace
 * labels, square corners, a pale sand accent.
 *
 * It exists because the assignment asks to judge taste as well as code, and
 * because it is the honest way to show what "themeable" means here: not a
 * colour swap, but the same markup carrying two design systems. Nothing in the
 * React tree branches on the skin - only `data-skin` on <html> changes.
 */
export const SKINS: Skin[] = [
  { name: 'saldo', label: 'САЛЬДО Original' },
  { name: 'portfolio', label: 'САЛЬДО New' },
];

export const DEFAULT_SKIN: SkinName = 'saldo';
