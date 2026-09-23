import { isServiceKey, type ServiceKey } from './services';

/**
 * The assistant marks an answer that needs work under a contract with a short
 * machine-readable tag on its own line:
 *
 *   [[услуга: vat]]
 *
 * The client strips it from the text and renders a service card instead. The
 * key is the only thing the model controls; all wording lives in services.ts.
 */
const MARKER = /\[\[\s*услуга\s*:\s*([a-z]+)\s*\]\]/i;

/**
 * A marker that is still arriving. While the model streams, `[[услу` must not
 * flash on screen before the closing brackets show up. Checked only after the
 * complete form fails, so a finished marker is never treated as partial.
 */
const PARTIAL_MARKER = /\[\[[^\]]*\]?$/;

export interface SplitAnswer {
  /** Answer text with the marker removed. */
  text: string;
  /** Service the assistant pointed at, or null when there is none. */
  service: ServiceKey | null;
}

export function splitServiceMarker(raw: string): SplitAnswer {
  const match = raw.match(MARKER);

  if (match && match.index !== undefined) {
    const key = (match[1] ?? '').toLowerCase();
    const text = `${raw.slice(0, match.index)}${raw.slice(match.index + match[0].length)}`;

    return {
      text: text.trim(),
      // An unknown key is dropped rather than shown as a broken card.
      service: isServiceKey(key) ? key : null,
    };
  }

  const partial = raw.match(PARTIAL_MARKER);

  if (partial && partial.index !== undefined) {
    return { text: raw.slice(0, partial.index).trimEnd(), service: null };
  }

  return { text: raw, service: null };
}
