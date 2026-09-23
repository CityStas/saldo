import { useCallback, useEffect, useRef, useState } from 'react';
import { streamChat } from '../lib/api';
import { classifyError } from '../lib/errors';
import { clearStoredHistory, loadHistory, saveHistory } from '../lib/storage';
import type { ChatError, ChatErrorCode, ChatMessage, DonePayload } from '../types/chat';

function createId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/** Minimum gap between two writes to sessionStorage while streaming. */
const SAVE_INTERVAL_MS = 800;

export interface UseChatResult {
  messages: ChatMessage[];
  isGenerating: boolean;
  error: ChatError | null;
  canRetry: boolean;
  sendMessage: (text: string) => void;
  stopGeneration: () => void;
  retryLast: () => void;
  clearChat: () => void;
  dismissError: () => void;
}

export function useChat(): UseChatResult {
  const [messages, setMessages] = useState<ChatMessage[]>(loadHistory);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<ChatError | null>(null);

  const controllerRef = useRef<AbortController | null>(null);
  const messagesRef = useRef(messages);
  const lastSaveRef = useRef(0);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Persist history, but not once per streamed token.
  //
  // This is a throttle, not a debounce. A debounce that waits for a quiet gap
  // never fires while tokens keep arriving faster than the gap, so a long
  // stream interrupted by a reload would lose the whole conversation. Here the
  // first write happens immediately and the next one no sooner than
  // SAVE_INTERVAL_MS later, and a finished generation always flushes.
  useEffect(() => {
    if (isGenerating) {
      if (Date.now() - lastSaveRef.current < SAVE_INTERVAL_MS) return;
    }

    lastSaveRef.current = Date.now();
    saveHistory(messages);
  }, [messages, isGenerating]);

  // A reload or a tab close can land in the middle of a generation, between two
  // throttled writes. `pagehide` is the last reliable moment to flush.
  useEffect(() => {
    const flush = (): void => saveHistory(messagesRef.current);
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, []);

  const update = useCallback(
    (
      id: string,
      patch:
        | Partial<ChatMessage>
        | ((message: ChatMessage) => Partial<ChatMessage>),
    ) => {
      setMessages((current) =>
        current.map((message) =>
          message.id === id
            ? {
                ...message,
                ...(typeof patch === 'function' ? patch(message) : patch),
              }
            : message,
        ),
      );
    },
    [],
  );

  const runGeneration = useCallback(
    async (history: ChatMessage[], userText: string) => {
      if (controllerRef.current) return;

      const userMessage: ChatMessage = {
        id: createId(),
        role: 'user',
        content: userText,
        status: 'complete',
        createdAt: Date.now(),
      };

      const assistantId = createId();
      const assistantMessage: ChatMessage = {
        id: assistantId,
        role: 'assistant',
        content: '',
        status: 'streaming',
        createdAt: Date.now(),
      };

      const outgoing = [...history, userMessage];
      const startedAt = Date.now();

      setMessages([...outgoing, assistantMessage]);
      setError(null);
      setIsGenerating(true);

      const controller = new AbortController();
      controllerRef.current = controller;

      // Held in an object so TypeScript does not narrow the closures' writes away.
      const outcome: {
        streamError: { code: ChatErrorCode; message: string } | null;
        done: DonePayload | null;
        receivedChars: number;
        sawReasoning: boolean;
      } = { streamError: null, done: null, receivedChars: 0, sawReasoning: false };

      // Set when the request failed before any stream existed (connection
      // refused, DNS, a 5xx from a gateway). Held outside the try so the code
      // below can tell a transport failure from an empty but healthy stream.
      let transportError: ChatError | null = null;

      try {
        await streamChat(
          outgoing,
          controller.signal,
          {
            onDelta: (text) => {
              outcome.receivedChars += text.length;
              update(assistantId, (message) => ({
                content: message.content + text,
              }));
            },
            // Reasoning text is dropped: the answer is shown as one voice,
            // without exposing the model's chain of thought. Only the fact that
            // it started is kept, so the UI can say what is happening. Guarded
            // by a flag because a reasoning model can emit hundreds of these.
            onReasoning: () => {
              if (outcome.sawReasoning) return;
              outcome.sawReasoning = true;
              update(assistantId, { hasReasoning: true });
            },
            onStreamError: (streamError) => {
              outcome.streamError = streamError;
            },
            onDone: (payload) => {
              outcome.done = payload;
            },
          },
        );
      } catch (caught) {
        if (!controller.signal.aborted) {
          transportError = classifyError(caught);
          setError(transportError);
        }
      } finally {
        controllerRef.current = null;
        setIsGenerating(false);
      }

      // Stopped by the user: keep whatever arrived, drop an empty bubble.
      if (controller.signal.aborted) {
        setMessages((current) =>
          current.flatMap((message) => {
            if (message.id !== assistantId) return [message];
            if (message.content.trim() === '') return [];
            return [{ ...message, status: 'stopped' as const }];
          }),
        );
        return;
      }

      const elapsed = outcome.done?.elapsedMs ?? Date.now() - startedAt;

      // The request died before a stream existed. `classifyError` already set
      // the notice - returning here keeps the empty-stream branch below from
      // overwriting the real cause with a generic upstream error.
      if (transportError) {
        update(assistantId, {
          status: 'failed',
          errorCode: transportError.code,
          elapsedMs: elapsed,
        });
        return;
      }

      if (outcome.streamError) {
        setError({
          code: outcome.streamError.code,
          detail: outcome.streamError.message,
        });
        update(assistantId, {
          status: 'failed',
          errorCode: outcome.streamError.code,
          elapsedMs: elapsed,
        });
        return;
      }

      // A 200 with zero tokens is a failure the user must see, not an empty
      // bubble they have to interpret.
      if (outcome.receivedChars === 0) {
        setError({
          code: 'UPSTREAM_ERROR',
          detail: 'The stream closed without producing any content.',
        });
        update(assistantId, {
          status: 'failed',
          errorCode: 'UPSTREAM_ERROR',
          elapsedMs: elapsed,
        });
        return;
      }

      update(assistantId, { status: 'complete', elapsedMs: elapsed });
    },
    [update],
  );

  const sendMessage = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || controllerRef.current) return;
      void runGeneration(messagesRef.current, trimmed);
    },
    [runGeneration],
  );

  const stopGeneration = useCallback(() => {
    controllerRef.current?.abort();
  }, []);

  const retryLast = useCallback(() => {
    if (controllerRef.current) return;

    const list = messagesRef.current;
    let lastUserIndex = -1;
    for (let index = list.length - 1; index >= 0; index -= 1) {
      if (list[index]?.role === 'user') {
        lastUserIndex = index;
        break;
      }
    }

    if (lastUserIndex === -1) return;

    const lastUser = list[lastUserIndex];
    if (!lastUser) return;

    const history = list.slice(0, lastUserIndex);
    setError(null);
    void runGeneration(history, lastUser.content);
  }, [runGeneration]);

  const clearChat = useCallback(() => {
    if (controllerRef.current) return;
    setMessages([]);
    setError(null);
    clearStoredHistory();
  }, []);

  const dismissError = useCallback(() => setError(null), []);

  const lastMessage = messages[messages.length - 1];
  const canRetry =
    !isGenerating &&
    messages.some((message) => message.role === 'user') &&
    (error !== null || lastMessage?.status === 'failed');

  return {
    messages,
    isGenerating,
    error,
    canRetry,
    sendMessage,
    stopGeneration,
    retryLast,
    clearChat,
    dismissError,
  };
}
