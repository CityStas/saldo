/**
 * Palette picker switch.
 *
 * The app ships with the scheme saldo.chat itself uses, so the controls are
 * hidden for now. Nothing behind them was removed: the three palettes, the
 * light/dark axis, the tokens and the persistence all still work.
 *
 * To bring the picker back:
 *   1. flip this to true;
 *   2. restore the stored-theme lookup in the inline script in index.html;
 *   3. restore `<meta name="color-scheme" content="light dark">`.
 *
 * Typed as `boolean` on purpose: a literal `false` would let the compiler
 * narrow the guarded branches away and flag them as unreachable.
 */
export const THEME_PICKER_ENABLED: boolean = false;

/** cream + light - the palette and brightness of the main site. */
export const SITE_THEME = { name: 'cream', mode: 'light' } as const;
