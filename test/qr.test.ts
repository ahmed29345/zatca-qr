import { describe, expect, it } from 'vitest';
import {
  base64ToBytes,
  bytesToBase64,
  decodeQr,
  encodeQr,
  fromTlv,
  ZatcaQrError,
  type ZatcaQrFields,
  type ZatcaQrInput,
} from '../src/index.js';
import { ascii, bytes, catchError, expectCode, tlv } from './helpers.js';

// The sample values commonly used in ZATCA QR code examples.
const BOBS_RECORDS: ZatcaQrFields = {
  sellerName: 'Bobs Records',
  vatNumber: '310122393500003',
  timestamp: '2022-04-25T15:30:00Z',
  invoiceTotal: '1000.00',
  vatTotal: '150.00',
};

// Built by hand: tag, length, then the ASCII bytes of each value.
const BOBS_RECORDS_TLV = bytes(
  [0x01, 0x0c], ascii('Bobs Records'), //          12 bytes
  [0x02, 0x0f], ascii('310122393500003'), //       15 bytes
  [0x03, 0x14], ascii('2022-04-25T15:30:00Z'), //  20 bytes
  [0x04, 0x07], ascii('1000.00'), //                7 bytes
  [0x05, 0x06], ascii('150.00'), //                 6 bytes
);

const BOBS_RECORDS_BASE64 =
  'AQxCb2JzIFJlY29yZHMCDzMxMDEyMjM5MzUwMDAwMwMUMjAyMi0wNC0yNVQxNTozMDowMFoEBzEwMDAuMDAFBjE1MC4wMA==';

// "متجر" (store): 4 letters, 8 bytes.
const MATJAR_UTF8 = [0xd9, 0x85, 0xd8, 0xaa, 0xd8, 0xac, 0xd8, 0xb1];

function withFields(overrides: Partial<Record<keyof ZatcaQrInput, unknown>>): ZatcaQrInput {
  return { ...BOBS_RECORDS, ...overrides } as ZatcaQrInput;
}

describe('encodeQr: known vectors', () => {
  it('produces the exact TLV bytes and Base64 for the Bobs Records sample', () => {
    const payload = encodeQr(BOBS_RECORDS);
    expect(base64ToBytes(payload)).toEqual(BOBS_RECORDS_TLV);
    expect(payload).toBe(BOBS_RECORDS_BASE64);
  });

  it('uses the UTF-8 byte length for an Arabic seller name', () => {
    const payload = encodeQr({
      sellerName: 'متجر',
      vatNumber: '300000000000003',
      timestamp: '2026-01-31T14:05:00Z',
      invoiceTotal: '115.00',
      vatTotal: '15.00',
    });

    const expected = bytes(
      [0x01, 0x08], MATJAR_UTF8, // 4 characters, 8 bytes
      [0x02, 0x0f], ascii('300000000000003'),
      [0x03, 0x14], ascii('2026-01-31T14:05:00Z'),
      [0x04, 0x06], ascii('115.00'),
      [0x05, 0x05], ascii('15.00'),
    );
    expect(base64ToBytes(payload)).toEqual(expected);
    expect(payload).toBe(bytesToBase64(expected));
  });

  it('handles a longer mixed Arabic and Latin name', () => {
    const sellerName = 'مؤسسة المثال التجارية Example Est.';
    const [first] = fromTlv(base64ToBytes(encodeQr({ ...BOBS_RECORDS, sellerName })));
    // 19 Arabic letters x 2 bytes + 15 ASCII bytes (spaces, Latin letters, period).
    expect(first).toEqual({ tag: 1, value: new TextEncoder().encode(sellerName) });
    expect(first.value.length).toBe(19 * 2 + 15);
    expect(sellerName.length).toBe(34);
  });
});

describe('encodeQr: input conversion', () => {
  it('formats numeric amounts with two decimal places', () => {
    const decoded = decodeQr(encodeQr(withFields({ invoiceTotal: 1150, vatTotal: 150.5 })));
    expect(decoded.invoiceTotal).toBe('1150.00');
    expect(decoded.vatTotal).toBe('150.50');
    expect(decodeQr(encodeQr(withFields({ invoiceTotal: 0, vatTotal: 0 }))).vatTotal).toBe('0.00');
    expect(decodeQr(encodeQr(withFields({ vatTotal: 19.99 }))).vatTotal).toBe('19.99');
  });

  it('writes a Date in UTC with whole seconds', () => {
    const timestamp = new Date(Date.UTC(2026, 0, 31, 14, 5, 9, 789));
    expect(decodeQr(encodeQr(withFields({ timestamp }))).timestamp).toBe('2026-01-31T14:05:09Z');
  });

  it('keeps valid timestamp strings exactly as given', () => {
    for (const timestamp of [
      '2022-04-25T15:30:00',
      '2022-04-25T15:30:00.123Z',
      '2022-04-25T18:30:00+03:00',
      '2022-04-25T10:00:00-05:30',
      '2024-02-29T00:00:00Z',
      '2000-02-29T23:59:59Z',
    ]) {
      expect(decodeQr(encodeQr(withFields({ timestamp }))).timestamp).toBe(timestamp);
    }
  });
});

describe('encodeQr: validation', () => {
  it.each([[''], ['   '], [123], [undefined]])('rejects seller name %j', (sellerName) => {
    expectCode(() => encodeQr(withFields({ sellerName })), 'INVALID_SELLER_NAME', 1);
  });

  it.each([
    ['310122393500002'], // does not end with 3
    ['210122393500003'], // does not start with 3
    ['31012239350003'], // 14 digits
    ['3101223935000033'], // 16 digits
    ['31012239350000a3'],
    ['٣١٠١٢٢٣٩٣٥٠٠٠٠٣'], // Arabic-Indic digits
    [' 310122393500003'],
    [310122393500003],
  ])('rejects VAT number %j', (vatNumber) => {
    expectCode(() => encodeQr(withFields({ vatNumber })), 'INVALID_VAT_NUMBER', 2);
  });

  it.each([
    ['2022-04-25'], // date only
    ['15:30:00'], // time only
    ['2022-04-25 15:30:00'], // space separator
    ['2022-04-25T15:30Z'], // no seconds
    ['2022-02-30T10:00:00Z'], // no such day
    ['2023-02-29T10:00:00Z'], // not a leap year
    ['1900-02-29T10:00:00Z'], // not a leap year
    ['2022-13-01T00:00:00Z'],
    ['2022-04-25T24:00:00Z'],
    ['2022-04-25T15:60:00Z'],
    ['2022-04-25T15:30:00+24:00'],
    ['2022-04-25t15:30:00z'],
    ['not a date'],
    [new Date('invalid')],
    [1650900600000],
  ])('rejects timestamp %j', (timestamp) => {
    expectCode(() => encodeQr(withFields({ timestamp })), 'INVALID_TIMESTAMP', 3);
  });

  it.each([
    ['1000'], // no decimals
    ['1000.0'],
    ['1000.000'],
    ['-1.00'],
    ['1,000.00'],
    ['01.00'],
    [' 1.00'],
    ['١٠٠٠.٠٠'], // Arabic-Indic digits
    [-1],
    [Number.NaN],
    [Number.POSITIVE_INFINITY],
    [0.1 + 0.2], // 0.30000000000000004
    [1.005],
    [1e21],
    [null],
  ])('rejects invoice total %j', (invoiceTotal) => {
    expectCode(() => encodeQr(withFields({ invoiceTotal })), 'INVALID_AMOUNT', 4);
  });

  it('reports the VAT total with its own tag', () => {
    expectCode(() => encodeQr(withFields({ vatTotal: '15' })), 'INVALID_AMOUNT', 5);
  });

  it('rejects a seller name over 255 bytes even when it is under 255 characters', () => {
    const name = 'م'.repeat(128); // 128 characters, 256 bytes
    expectCode(() => encodeQr(withFields({ sellerName: name })), 'VALUE_TOO_LONG', 1);
    expect(() => encodeQr(withFields({ sellerName: 'م'.repeat(127) }))).not.toThrow();
  });

  it('throws ZatcaQrError, a real Error with a name, code and message', () => {
    const error = catchError(() => encodeQr(withFields({ vatNumber: '123' })));
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('ZatcaQrError');
    expect(error.code).toBe('INVALID_VAT_NUMBER');
    expect(error.message).toMatch(/15 digits/);
  });
});

describe('Phase 2 tags', () => {
  // Shaped like real values, but synthetic. The library does not inspect them.
  const invoiceHash = new TextEncoder().encode('V0bLJ0zU5gLOAcKhxjSgcX3WTi1uG8Jt+ivQuKCj7aI='); // tag 6
  const ecdsaSignature = Uint8Array.from({ length: 96 }, (_, i) => (i * 7) & 0xff); // tag 7
  const ecdsaPublicKey = Uint8Array.from({ length: 88 }, (_, i) => (i === 0 ? 0x30 : (i * 13) & 0xff)); // tag 8
  const certificateSignature = Uint8Array.from({ length: 71 }, (_, i) => 0xff - i); // tag 9

  const phase2: ZatcaQrFields = { ...BOBS_RECORDS, invoiceHash, ecdsaSignature, ecdsaPublicKey, certificateSignature };

  it('round-trips tags 6-9 byte for byte', () => {
    expect(decodeQr(encodeQr(phase2))).toEqual(phase2);
  });

  it('appends tags 6-9 after tags 1-5 in tag order', () => {
    const entries = fromTlv(base64ToBytes(encodeQr(phase2)));
    expect(entries.map((entry) => entry.tag)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(entries[7].value).toEqual(ecdsaPublicKey);
  });

  it('produces exact bytes for small Phase 2 values', () => {
    const payload = encodeQr({
      ...BOBS_RECORDS,
      invoiceHash: Uint8Array.of(0xaa, 0xbb),
      ecdsaSignature: Uint8Array.of(0x00),
      ecdsaPublicKey: Uint8Array.of(0x01, 0x02, 0x03),
    });
    expect(base64ToBytes(payload)).toEqual(
      bytes(Array.from(BOBS_RECORDS_TLV), tlv(6, [0xaa, 0xbb]), tlv(7, [0x00]), tlv(8, [0x01, 0x02, 0x03])),
    );
  });

  it('makes tag 9 optional', () => {
    const withoutCertificate: ZatcaQrFields = { ...BOBS_RECORDS, invoiceHash, ecdsaSignature, ecdsaPublicKey };
    expect(decodeQr(encodeQr(withoutCertificate))).toEqual(withoutCertificate);
  });

  it('requires tags 6, 7 and 8 together', () => {
    expectCode(() => encodeQr({ ...BOBS_RECORDS, invoiceHash }), 'INCOMPLETE_PHASE2');
    expectCode(() => encodeQr({ ...BOBS_RECORDS, invoiceHash, ecdsaSignature }), 'INCOMPLETE_PHASE2');
    expectCode(() => encodeQr({ ...BOBS_RECORDS, certificateSignature }), 'INCOMPLETE_PHASE2');
  });

  it('rejects empty or non-binary values', () => {
    expectCode(() => encodeQr({ ...phase2, ecdsaSignature: new Uint8Array(0) }), 'INVALID_BINARY_FIELD', 7);
    expectCode(() => encodeQr(withFields({ ...phase2, invoiceHash: 'abc' })), 'INVALID_BINARY_FIELD', 6);
  });

  it('rejects a Phase 2 value over 255 bytes', () => {
    expectCode(() => encodeQr({ ...phase2, ecdsaPublicKey: new Uint8Array(256) }), 'VALUE_TOO_LONG', 8);
  });
});

describe('decodeQr', () => {
  it('decodes the Bobs Records sample', () => {
    expect(decodeQr(BOBS_RECORDS_BASE64)).toEqual(BOBS_RECORDS);
  });

  it('round-trips an Arabic seller name', () => {
    const fields: ZatcaQrFields = { ...BOBS_RECORDS, sellerName: 'شركة المثال للتجارة' };
    expect(decodeQr(encodeQr(fields))).toEqual(fields);
  });

  it('accepts tags in any order', () => {
    const shuffled = bytes(
      tlv(5, ascii('150.00')),
      tlv(3, ascii('2022-04-25T15:30:00Z')),
      tlv(1, ascii('Bobs Records')),
      tlv(4, ascii('1000.00')),
      tlv(2, ascii('310122393500003')),
    );
    expect(decodeQr(bytesToBase64(shuffled))).toEqual(BOBS_RECORDS);
  });

  it('rejects input that is empty or not Base64', () => {
    expectCode(() => decodeQr(''), 'INVALID_BASE64');
    expectCode(() => decodeQr('not base64!'), 'INVALID_BASE64');
  });

  it('rejects a truncated payload', () => {
    expectCode(() => decodeQr(bytesToBase64(BOBS_RECORDS_TLV.slice(0, -2))), 'MALFORMED_TLV', 5);
  });

  it('rejects a missing required tag', () => {
    expectCode(() => decodeQr(bytesToBase64(BOBS_RECORDS_TLV.slice(0, -8))), 'MISSING_TAG', 5);
  });

  it('rejects a duplicated tag', () => {
    const duplicated = bytes(Array.from(BOBS_RECORDS_TLV), tlv(2, ascii('310122393500003')));
    expectCode(() => decodeQr(bytesToBase64(duplicated)), 'DUPLICATE_TAG', 2);
  });

  it('rejects invalid UTF-8 in a text tag', () => {
    const invalid = bytes(tlv(1, [0xd9]), Array.from(BOBS_RECORDS_TLV.slice(14)));
    expectCode(() => decodeQr(bytesToBase64(invalid)), 'INVALID_UTF8', 1);
  });

  it('validates field values by default', () => {
    const lenientAmount = bytes(Array.from(BOBS_RECORDS_TLV.slice(0, -8)), tlv(5, ascii('150')));
    expectCode(() => decodeQr(bytesToBase64(lenientAmount)), 'INVALID_AMOUNT', 5);
  });

  it('rejects unknown tags by default', () => {
    const extra = bytes(Array.from(BOBS_RECORDS_TLV), tlv(10, [0x01]));
    expectCode(() => decodeQr(bytesToBase64(extra)), 'UNKNOWN_TAG', 10);
  });

  it('with strict: false, returns values as found and skips unknown tags', () => {
    const payload = bytesToBase64(
      bytes(Array.from(BOBS_RECORDS_TLV.slice(0, -8)), tlv(5, ascii('150')), tlv(0, []), tlv(42, [0x01])),
    );
    expect(decodeQr(payload, { strict: false })).toEqual({ ...BOBS_RECORDS, vatTotal: '150' });
  });

  it('still checks structure with strict: false', () => {
    expectCode(() => decodeQr(bytesToBase64(BOBS_RECORDS_TLV.slice(0, -8)), { strict: false }), 'MISSING_TAG', 5);
  });

  it('exposes errors as ZatcaQrError instances', () => {
    expect(() => decodeQr('AQ')).toThrow(ZatcaQrError);
  });
});
