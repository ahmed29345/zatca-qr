import { ZatcaQrError } from './errors.js';
import { utf8Encode } from './utf8.js';

/**
 * The largest value a single TLV entry can carry. The ZATCA QR format uses one
 * byte for the length, so 255 bytes is a hard limit, not a recommendation.
 */
export const MAX_TLV_VALUE_LENGTH = 255;

/** A decoded TLV entry. */
export interface TlvEntry {
  tag: number;
  value: Uint8Array;
}

/** A TLV entry to encode. String values are written as UTF-8. */
export interface TlvInput {
  tag: number;
  value: Uint8Array | string;
}

/**
 * Serialises entries as `tag (1 byte) | length (1 byte) | value (length bytes)`,
 * in the order given.
 *
 * Lengths are counted in UTF-8 bytes, not characters: an Arabic letter takes
 * two bytes, so a 128-letter Arabic name (256 bytes) is rejected.
 */
export function toTlv(entries: readonly TlvInput[]): Uint8Array {
  const prepared = entries.map(({ tag, value }) => {
    if (!Number.isInteger(tag) || tag < 0 || tag > 255) {
      throw new ZatcaQrError('INVALID_TAG', `TLV tag must be an integer from 0 to 255, got ${String(tag)}.`);
    }

    let bytes: Uint8Array;
    if (typeof value === 'string') {
      bytes = utf8Encode(value, tag);
    } else if (value instanceof Uint8Array) {
      bytes = value;
    } else {
      throw new ZatcaQrError('INVALID_BINARY_FIELD', `Tag ${tag} value must be a string or a Uint8Array.`, { tag });
    }

    if (bytes.length > MAX_TLV_VALUE_LENGTH) {
      throw new ZatcaQrError(
        'VALUE_TOO_LONG',
        `Tag ${tag} value is ${bytes.length} bytes; the maximum is ${MAX_TLV_VALUE_LENGTH} ` +
          'because the TLV length field is a single byte.',
        { tag },
      );
    }

    return { tag, bytes };
  });

  const size = prepared.reduce((total, entry) => total + 2 + entry.bytes.length, 0);
  const out = new Uint8Array(size);
  let offset = 0;

  for (const { tag, bytes } of prepared) {
    out[offset] = tag;
    out[offset + 1] = bytes.length;
    out.set(bytes, offset + 2);
    offset += 2 + bytes.length;
  }

  return out;
}

/**
 * Parses a TLV byte stream into entries, in the order they appear. Values are
 * copies, so mutating them does not affect the input. Throws `MALFORMED_TLV`
 * if the stream is truncated.
 */
export function fromTlv(bytes: Uint8Array): TlvEntry[] {
  if (!(bytes instanceof Uint8Array)) {
    throw new ZatcaQrError('MALFORMED_TLV', 'TLV input must be a Uint8Array.');
  }

  const entries: TlvEntry[] = [];
  let offset = 0;

  while (offset < bytes.length) {
    if (offset + 2 > bytes.length) {
      throw new ZatcaQrError('MALFORMED_TLV', `Truncated TLV header at byte ${offset}.`);
    }

    const tag = bytes[offset];
    const length = bytes[offset + 1];
    const start = offset + 2;
    const end = start + length;

    if (end > bytes.length) {
      throw new ZatcaQrError(
        'MALFORMED_TLV',
        `Tag ${tag} declares ${length} bytes but only ${bytes.length - start} remain.`,
        { tag },
      );
    }

    entries.push({ tag, value: bytes.slice(start, end) });
    offset = end;
  }

  return entries;
}
