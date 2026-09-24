import { useEffect, useState } from 'react';

/**
 * Whether a media query currently matches, kept in sync with the window.
 *
 * The layout is otherwise pure CSS, and this is the one place that is not. It
 * exists for a difference that CSS cannot express: on a wide screen the field
 * belongs inside the empty state, under the example questions, where it reads
 * as the end of the list; on a phone that same block is taller than the screen,
 * and a field that scrolls with it is a field a person has to go looking for.
 * There the field has to be a row of the chat column like any other, pinned to
 * the bottom, and that means rendering it in a different place - which is a
 * decision React has to make, not the stylesheet.
 *
 * `change` rather than a resize listener: it fires once per crossing of the
 * breakpoint, not once per pixel, and it keeps the query string in one place.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window === 'undefined' ? false : window.matchMedia(query).matches,
  );

  useEffect(() => {
    const list = window.matchMedia(query);

    // Read it once on mount as well: the query can have changed between the
    // first render and the effect running, and the listener only reports
    // changes from here on.
    setMatches(list.matches);

    const onChange = (event: MediaQueryListEvent): void => setMatches(event.matches);

    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}
