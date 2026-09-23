import { describe, expect, it } from 'vitest';
import { SseDecoder, encodeSse } from './sse.js';

describe('encodeSse', () => {
  it('frames an event with a JSON payload', () => {
    expect(encodeSse('delta', { text: 'hi' })).toBe(
      'event: delta\ndata: {"text":"hi"}\n\n',
    );
  });
});

describe('SseDecoder', () => {
  it('parses events regardless of chunk boundaries', () => {
    const decoder = new SseDecoder();
    const payload = 'data: {"a":1}\n\ndata: {"b":2}\n\n';

    const events = [
      ...decoder.push(payload.slice(0, 7)),
      ...decoder.push(payload.slice(7, 13)),
      ...decoder.push(payload.slice(13)),
    ];

    expect(events).toEqual([
      { event: 'message', data: '{"a":1}' },
      { event: 'message', data: '{"b":2}' },
    ]);
  });

  it('handles CRLF line endings', () => {
    const decoder = new SseDecoder();
    expect(decoder.push('event: delta\r\ndata: {"text":"x"}\r\n\r\n')).toEqual([
      { event: 'delta', data: '{"text":"x"}' },
    ]);
  });

  it('ignores comments and heartbeats', () => {
    const decoder = new SseDecoder();
    expect(decoder.push(': keep-alive\n\n')).toEqual([]);
  });

  it('joins multi-line data fields', () => {
    const decoder = new SseDecoder();
    expect(decoder.push('data: one\ndata: two\n\n')).toEqual([
      { event: 'message', data: 'one\ntwo' },
    ]);
  });

  it('does not emit an event before the blank line arrives', () => {
    const decoder = new SseDecoder();
    expect(decoder.push('data: partial\n')).toEqual([]);
    expect(decoder.push('\n')).toEqual([
      { event: 'message', data: 'partial' },
    ]);
  });

  it('flushes a trailing event without a terminating blank line', () => {
    const decoder = new SseDecoder();
    decoder.push('data: tail');
    expect(decoder.flush()).toEqual([{ event: 'message', data: 'tail' }]);
  });

  it('keeps the event name scoped to a single event', () => {
    const decoder = new SseDecoder();
    const events = decoder.push('event: delta\ndata: 1\n\ndata: 2\n\n');
    expect(events).toEqual([
      { event: 'delta', data: '1' },
      { event: 'message', data: '2' },
    ]);
  });
});
