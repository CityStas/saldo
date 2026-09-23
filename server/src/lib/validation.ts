import { config } from '../config.js';
import { AppError } from './errors.js';
import { ANSWER_MODES } from '../types/chat.js';
import type { AnswerMode, ChatMessage, ChatRequestBody } from '../types/chat.js';

/**
 * Roles the browser may send. `system` is deliberately absent: the assistant
 * persona is set on the server, and accepting a client-supplied system message
 * would let anyone replace it.
 */
const CLIENT_ROLES = new Set(['user', 'assistant']);

/**
 * Validate and normalise the chat request. Kept as a pure function so it can be
 * unit tested without booting the server.
 */
export function validateChatRequest(body: unknown): ChatRequestBody {
  if (typeof body !== 'object' || body === null) {
    throw new AppError('BAD_REQUEST', 'Body must be a JSON object.', 400);
  }

  const { messages, model, mode } = body as Partial<ChatRequestBody>;

  if (!Array.isArray(messages) || messages.length === 0) {
    throw new AppError('BAD_REQUEST', 'messages must be a non-empty array.', 400);
  }

  if (messages.length > config.maxMessages) {
    throw new AppError(
      'BAD_REQUEST',
      `messages must contain at most ${config.maxMessages} items.`,
      400,
    );
  }

  let totalChars = 0;

  // An assistant turn that produced nothing carries no information: the user
  // pressed Stop, or the request failed before the first token. Such a turn is
  // dropped rather than forwarded, so one failed request cannot poison every
  // later one in the same conversation.
  const cleaned: ChatMessage[] = [];

  messages.forEach((message, index) => {
    if (typeof message !== 'object' || message === null) {
      throw new AppError('BAD_REQUEST', `messages[${index}] is not an object.`, 400);
    }

    const { role, content } = message as ChatMessage;

    if (typeof role !== 'string' || !CLIENT_ROLES.has(role)) {
      throw new AppError(
        'BAD_REQUEST',
        `messages[${index}].role must be "user" or "assistant".`,
        400,
      );
    }

    if (typeof content !== 'string') {
      throw new AppError(
        'BAD_REQUEST',
        `messages[${index}].content must be a string.`,
        400,
      );
    }

    totalChars += content.length;

    if (role === 'assistant' && content.trim() === '') return;
    cleaned.push({ role, content });
  });

  if (cleaned.length === 0) {
    throw new AppError(
      'BAD_REQUEST',
      'messages must contain at least one non-empty message.',
      400,
    );
  }

  if (totalChars > config.maxMessageChars) {
    throw new AppError(
      'BAD_REQUEST',
      `Conversation is too long (${totalChars} chars).`,
      413,
    );
  }

  if (model !== undefined && typeof model !== 'string') {
    throw new AppError('BAD_REQUEST', 'model must be a string.', 400);
  }

  // Omitted mode keeps the previous behaviour: a consultation that may point at
  // the matching service. Anything unrecognised is rejected rather than
  // silently coerced, so a typo in the client shows up immediately.
  if (mode !== undefined && !ANSWER_MODES.includes(mode as AnswerMode)) {
    throw new AppError(
      'BAD_REQUEST',
      `mode must be one of: ${ANSWER_MODES.join(', ')}.`,
      400,
    );
  }

  return { messages: cleaned, model, mode: mode as AnswerMode | undefined };
}
