import { describe, expect, it } from 'vitest';
import { fromTlv, MAX_TLV_VALUE_LENGTH, toTlv } from '../src/index.js';
import { ascii, bytes, expectCode, tlv } from './helpers.js';

// "متجر" (store): four Arabic letters, two UTF-8 bytes each.
//   م U+0645 -> D9 85    ت U+062A -> D8 AA    ج U+062C -> D8 AC    ر U+0631 -> D8 B1
const MATJAR = 'متجر';
const MATJAR_UTF8 = [0xd9, 0x85, 0xd8, 0xaa, 0xd8, 0xac, 0xd8, 0xb1];

describe('toTlv', () => {
  it('writes tag, one-byte length and value for each entry, in order', () => {
    expect(
      toTlv([
        { tag: 1, value: 'Hi' },
        { tag: 2, value: 'abc' },
      ]),
    ).toEqual(bytes([0x01, 0x02, 0x48, 0x69], [0x02, 0x03, 0x61, 0x62, 0x63]));
  });

  it('counts the length in UTF-8 bytes, not characters', () => {
    expect(MATJAR.length).toBe(4);
    expect(toTlv([{ tag: 1, value: MATJAR }])).toEqual(bytes([0x01, 0x08], MATJAR_UTF8));
  });

  it('encodes three- and four-byte characters correctly', () => {
    // € U+20AC -> E2 82 AC; 😀 U+1F600 (a surrogate pair in JS) -> F0 9F 98 80
    expect(toTlv([{ tag: 1, value: '€😀' }])).toEqual(
      bytes([0x01, 0x07, 0xe2, 0x82, 0xac, 0xf0, 0x9f, 0x98, 0x80]),
    );
  });

  it('writes binary values verbatim', () => {
    expect(toTlv([{ tag: 8, value: Uint8Array.of(0x00, 0xff, 0x30) }])).toEqual(bytes([0x08, 0x03, 0x00, 0xff, 0x30]));
  });

  it('allows empty values and an empty entry list', () => {
    expect(toTlv([{ tag: 7, value: '' }])).toEqual(bytes([0x07, 0x00]));
    expect(toTlv([])).toEqual(new Uint8Array(0));
  });

  it('accepts a value of exactly 255 bytes', () => {
    const encoded = toTlv([{ tag: 1, value: 'a'.repeat(MAX_TLV_VALUE_LENGTH) }]);
    expect(encoded.length).toBe(257);
    expect(encoded[1]).toBe(0xff);
  });

  it('rejects a value of 256 bytes', () => {
    expectCode(() => toTlv([{ tag: 1, value: 'a'.repeat(256) }]), 'VALUE_TOO_LONG', 1);
    expectCode(() => toTlv([{ tag: 8, value: new Uint8Array(256) }]), 'VALUE_TOO_LONG', 8);
  });

  it('applies the limit to bytes: 127 Arabic letters fit, 128 do not', () => {
    const letter = 'م';
    expect(toTlv([{ tag: 1, value: letter.repeat(127) }])[1]).toBe(254);
    expectCode(() => toTlv([{ tag: 1, value: letter.repeat(128) }]), 'VALUE_TOO_LONG', 1);
  });

  it('rejects tags outside 0-255', () => {
    for (const tag of [-1, 256, 1.5, Number.NaN]) {
      expectCode(() => toTlv([{ tag, value: 'x' }]), 'INVALID_TAG');
    }
  });

  it('rejects strings with unpaired surrogates', () => {
    expectCode(() => toTlv([{ tag: 1, value: 'a\uD83Db' }]), 'INVALID_UTF8', 1);
    expectCode(() => toTlv([{ tag: 1, value: '\uDE00' }]), 'INVALID_UTF8', 1);
  });

  it('rejects values that are neither strings nor Uint8Arrays', () => {
    expectCode(() => toTlv([{ tag: 6, value: [1, 2] as unknown as Uint8Array }]), 'INVALID_BINARY_FIELD', 6);
  });
});

describe('fromTlv', () => {
  it('parses entries in the order they appear', () => {
    expect(fromTlv(bytes(tlv(2, ascii('ab')), tlv(1, MATJAR_UTF8), tlv(9, [])))).toEqual([
      { tag: 2, value: Uint8Array.from(ascii('ab')) },
      { tag: 1, value: Uint8Array.from(MATJAR_UTF8) },
      { tag: 9, value: new Uint8Array(0) },
    ]);
  });

  it('is the inverse of toTlv', () => {
    const entries = [
      { tag: 1, value: Uint8Array.from(MATJAR_UTF8) },
      { tag: 200, value: new Uint8Array(255).fill(7) },
      { tag: 0, value: Uint8Array.of(0) },
    ];
    expect(fromTlv(toTlv(entries))).toEqual(entries);
  });

  it('returns an empty list for empty input', () => {
    expect(fromTlv(new Uint8Array(0))).toEqual([]);
  });

  it('returns copies of the values', () => {
    const input = bytes(tlv(1, [0x41]));
    const [entry] = fromTlv(input);
    entry.value[0] = 0x42;
    expect(input[2]).toBe(0x41);
  });

  it('rejects a truncated header', () => {
    expectCode(() => fromTlv(bytes(tlv(1, [0x41]), [0x02])), 'MALFORMED_TLV');
  });

  it('rejects a length that runs past the end of the data', () => {
    expectCode(() => fromTlv(bytes([0x01, 0x05, 0x41, 0x42])), 'MALFORMED_TLV', 1);
  });
});
