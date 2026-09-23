import { useCallback, useEffect, useRef, useState } from 'react';

const PIN_THRESHOLD_PX = 80;

export interface StickToBottom {
  containerRef: React.RefObject<HTMLDivElement | null>;
  isPinned: boolean;
  onScroll: () => void;
  scrollToBottom: (behavior?: ScrollBehavior) => void;
}

/**
 * Keeps the newest message in view while the model streams, but stops
 * hijacking the scroll as soon as the user scrolls up to read something.
 *
 * `enabled` is false while the dialog is blank. That is not a nicety: the empty
 * state is centred in the scroll container by the stylesheet, and jumping to the
 * bottom of a container that has nothing to scroll to pushes that centred block
 * up under the header. On a short window - a phone with the keyboard open, a
 * landscape laptop - the block is taller than the container, so the scroll is
 * real and the heading ends up half off-screen the moment the page loads. With
 * the flag off the log stays at the top, which is where `safe` centring put it.
 */
export function useStickToBottom(dependency: unknown, enabled = true): StickToBottom {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPinned, setIsPinned] = useState(true);
  const pinnedRef = useRef(true);

  const handleScroll = useCallback(() => {
    const element = containerRef.current;
    if (!element) return;

    const distance =
      element.scrollHeight - element.scrollTop - element.clientHeight;
    const pinned = distance <= PIN_THRESHOLD_PX;

    pinnedRef.current = pinned;
    setIsPinned(pinned);
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const element = containerRef.current;
    if (!element) return;
    element.scrollTo({ top: element.scrollHeight, behavior });
    pinnedRef.current = true;
    setIsPinned(true);
  }, []);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    // A cleared dialog can still be scrolled from the previous conversation, so
    // going blank means going back to the top rather than merely not scrolling.
    if (!enabled) {
      element.scrollTo({ top: 0 });
      pinnedRef.current = true;
      setIsPinned(true);
      return;
    }

    if (!pinnedRef.current) return;
    element.scrollTo({ top: element.scrollHeight });
  }, [dependency, enabled]);

  return { containerRef, isPinned, onScroll: handleScroll, scrollToBottom };
}
