/**
 * Minimal Server-Sent Events codec.
 *
 * `SseDecoder` is a pure incremental parser (no I/O), so it can be unit tested
 * with arbitrary chunk boundaries - the upstream stream splits events in
 * places we do not control.
 */

export interface SseEvent {
  event: string;
  data: string;
}

export function encodeSse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export class SseDecoder {
  private buffer = '';
  private eventName = '';
  private dataLines: string[] = [];

  /** Feed a decoded chunk, get back every complete event it contained. */
  push(chunk: string): SseEvent[] {
    this.buffer += chunk;

    const events: SseEvent[] = [];
    let newline = this.buffer.indexOf('\n');

    while (newline !== -1) {
      const rawLine = this.buffer.slice(0, newline);
      this.buffer = this.buffer.slice(newline + 1);

      const event = this.consumeLine(
        rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine,
      );
      if (event) events.push(event);

      newline = this.buffer.indexOf('\n');
    }

    return events;
  }

  /** Call once the stream ended to emit a trailing event without a blank line. */
  flush(): SseEvent[] {
    if (this.buffer) {
      const event = this.consumeLine(this.buffer.replace(/\r$/, ''));
      this.buffer = '';
      if (event) return [event];
    }

    const event = this.dispatch();
    return event ? [event] : [];
  }

  private consumeLine(line: string): SseEvent | null {
    // A blank line dispatches the buffered event.
    if (line === '') return this.dispatch();
    // Comment / heartbeat (`: keep-alive`).
    if (line.startsWith(':')) return null;

    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);

    if (field === 'event') this.eventName = value;
    else if (field === 'data') this.dataLines.push(value);

    return null;
  }

  private dispatch(): SseEvent | null {
    if (this.dataLines.length === 0) {
      this.eventName = '';
      return null;
    }

    const event: SseEvent = {
      event: this.eventName || 'message',
      data: this.dataLines.join('\n'),
    };

    this.eventName = '';
    this.dataLines = [];
    return event;
  }
}
