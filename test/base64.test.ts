import { Buffer } from 'node:buffer';
import { describe, expect, it } from 'vitest';
import { base64ToBytes, bytesToBase64 } from '../src/index.js';
import { ascii, expectCode } from './helpers.js';

// RFC 4648, section 10.
const RFC_VECTORS: [string, string][] = [
  ['', ''],
  ['f', 'Zg=='],
  ['fo', 'Zm8='],
  ['foo', 'Zm9v'],
  ['foob', 'Zm9vYg=='],
  ['fooba', 'Zm9vYmE='],
  ['foobar', 'Zm9vYmFy'],
];

/** Small deterministic PRNG (mulberry32) so the comparison test is reproducible. */
function prng(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('base64', () => {
  it.each(RFC_VECTORS)('encodes and decodes the RFC 4648 vector %j', (text, encoded) => {
    expect(bytesToBase64(Uint8Array.from(ascii(text)))).toBe(encoded);
    expect(base64ToBytes(encoded)).toEqual(Uint8Array.from(ascii(text)));
  });

  it('matches Node Buffer for every byte value and for many lengths', () => {
    const all = Uint8Array.from({ length: 256 }, (_, i) => i);
    expect(bytesToBase64(all)).toBe(Buffer.from(all).toString('base64'));

    const random = prng(2026);
    for (let length = 0; length <= 300; length++) {
      const data = Uint8Array.from({ length }, () => Math.floor(random() * 256));
      const encoded = bytesToBase64(data);
      expect(encoded).toBe(Buffer.from(data).toString('base64'));
      expect(base64ToBytes(encoded)).toEqual(data);
    }
  });

  it('accepts missing padding and ignores whitespace', () => {
    expect(base64ToBytes('Zm9vYg')).toEqual(Uint8Array.from(ascii('foob')));
    expect(base64ToBytes(' Zm9v\r\nYmE= \n')).toEqual(Uint8Array.from(ascii('fooba')));
  });

  it('rejects characters outside the standard alphabet', () => {
    for (const input of ['Zm9v-mFy', 'Zm9v_mFy', 'Zm9v*mFy', 'Zm9vYmé=', 'Zg===']) {
      expectCode(() => base64ToBytes(input), 'INVALID_BASE64');
    }
  });

  it('rejects impossible lengths and misplaced padding', () => {
    expectCode(() => base64ToBytes('Z'), 'INVALID_BASE64');
    expectCode(() => base64ToBytes('Zg='), 'INVALID_BASE64');
    expectCode(() => base64ToBytes('Zg==Zg=='), 'INVALID_BASE64');
  });
});
