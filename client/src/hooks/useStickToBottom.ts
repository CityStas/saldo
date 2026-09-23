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
 */
export function useStickToBottom(dependency: unknown): StickToBottom {
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
    if (!element || !pinnedRef.current) return;

    element.scrollTo({ top: element.scrollHeight });
  }, [dependency]);

  return { containerRef, isPinned, onScroll: handleScroll, scrollToBottom };
}
