import { useCallback, useEffect, useState } from 'react';
import { initialAnswerMode, saveAnswerMode } from '../lib/storage';
import type { AnswerMode } from '../types/chat';

export interface AnswerModeState {
  mode: AnswerMode;
  setMode: (mode: AnswerMode) => void;
}

/**
 * How the assistant answers: with a service offer at the end, or as a plain
 * full answer. The third of the three persisted choices, next to brightness and
 * appearance, and shaped like the other two - read once, written on change.
 *
 * The choice belongs to the chat rather than to the panel that changes it, so
 * the panel does not write to storage itself. It used to, and the two other
 * settings did not, which meant there were two answers to "where is this
 * saved" depending on which switch you looked at.
 */
export function useAnswerMode(): AnswerModeState {
  const [mode, setModeState] = useState<AnswerMode>(initialAnswerMode);

  useEffect(() => {
    saveAnswerMode(mode);
  }, [mode]);

  const setMode = useCallback((next: AnswerMode) => {
    setModeState(next);
  }, []);

  return { mode, setMode };
}
