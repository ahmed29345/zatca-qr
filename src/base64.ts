import { ZatcaQrError } from './errors.js';

// A small, dependency-free Base64 codec (RFC 4648, standard alphabet).
// It behaves the same in Node and browsers, and unlike btoa/atob it works on
// bytes rather than "binary strings", so there is no Latin-1 pitfall.

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

const LOOKUP = new Int8Array(128).fill(-1);
for (let i = 0; i < ALPHABET.length; i++) {
  LOOKUP[ALPHABET.charCodeAt(i)] = i;
}

/** Encodes bytes as padded, standard-alphabet Base64. */
export function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  let i = 0;

  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += ALPHABET[(n >> 18) & 63] + ALPHABET[(n >> 12) & 63] + ALPHABET[(n >> 6) & 63] + ALPHABET[n & 63];
  }

  const remaining = bytes.length - i;
  if (remaining === 1) {
    const n = bytes[i] << 16;
    out += ALPHABET[(n >> 18) & 63] + ALPHABET[(n >> 12) & 63] + '==';
  } else if (remaining === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
    out += ALPHABET[(n >> 18) & 63] + ALPHABET[(n >> 12) & 63] + ALPHABET[(n >> 6) & 63] + '=';
  }

  return out;
}

/**
 * Decodes standard-alphabet Base64. Padding is optional and ASCII whitespace
 * (for example line breaks from copy and paste) is ignored. Anything else that
 * is not in the alphabet throws `INVALID_BASE64`.
 */
export function base64ToBytes(input: string): Uint8Array {
  if (typeof input !== 'string') {
    throw new ZatcaQrError('INVALID_BASE64', 'Base64 input must be a string.');
  }

  const clean = input.replace(/[\t\n\f\r ]/g, '');
  const data = clean.replace(/={1,2}$/, '');

  if (data.length !== clean.length && clean.length % 4 !== 0) {
    throw new ZatcaQrError('INVALID_BASE64', 'Base64 input has incorrect padding.');
  }
  if (data.length % 4 === 1) {
    throw new ZatcaQrError('INVALID_BASE64', 'Base64 input has an impossible length.');
  }

  const out = new Uint8Array(Math.floor((data.length * 3) / 4));
  let buffer = 0;
  let bits = 0;
  let written = 0;

  for (let i = 0; i < data.length; i++) {
    const code = data.charCodeAt(i);
    const value = code < 128 ? LOOKUP[code] : -1;
    if (value < 0) {
      throw new ZatcaQrError('INVALID_BASE64', `Invalid Base64 character at position ${i}.`);
    }

    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[written++] = (buffer >> bits) & 0xff;
      buffer &= (1 << bits) - 1;
    }
  }

  return out;
}
