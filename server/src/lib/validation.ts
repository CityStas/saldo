import { config } from '../config.js';
import { AppError } from './errors.js';
import type { ChatMessage, ChatRequestBody } from '../types/chat.js';

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

  const { messages, model } = body as Partial<ChatRequestBody>;

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

  const cleaned: ChatMessage[] = messages.map((message, index) => {
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
    return { role, content };
  });

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

  return { messages: cleaned, model };
}
