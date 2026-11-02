import { ZatcaQrError } from './errors.js';

const encoder = new TextEncoder();
// `fatal` rejects malformed byte sequences instead of silently inserting U+FFFD.
// `ignoreBOM` keeps a leading U+FEFF so decoding is an exact inverse of encoding.
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

// True if the string has a high surrogate without a following low one, or a
// low surrogate without a preceding high one. (A loop rather than a lookbehind
// regex, which older Safari versions cannot parse.)
function hasLoneSurrogate(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        i++;
        continue;
      }
      return true;
    }
    if (code >= 0xdc00 && code <= 0xdfff) {
      return true;
    }
  }
  return false;
}

/**
 * Encodes a string as UTF-8. Strings containing lone surrogates are rejected,
 * because TextEncoder would otherwise replace them with U+FFFD and the value
 * would not survive a round trip.
 */
export function utf8Encode(text: string, tag?: number): Uint8Array {
  if (hasLoneSurrogate(text)) {
    throw new ZatcaQrError(
      'INVALID_UTF8',
      `${describe(tag)} contains an unpaired UTF-16 surrogate and cannot be encoded as UTF-8.`,
      tag === undefined ? {} : { tag },
    );
  }
  return encoder.encode(text);
}

/** Decodes UTF-8 bytes, throwing `INVALID_UTF8` on malformed input. */
export function utf8Decode(bytes: Uint8Array, tag?: number): string {
  try {
    return decoder.decode(bytes);
  } catch (cause) {
    throw new ZatcaQrError('INVALID_UTF8', `${describe(tag)} is not valid UTF-8.`, {
      ...(tag === undefined ? {} : { tag }),
      cause,
    });
  }
}

function describe(tag: number | undefined): string {
  return tag === undefined ? 'Text' : `Tag ${tag} value`;
}
