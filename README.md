# zatca-qr

[![CI](https://github.com/ahmed29345/zatca-qr/actions/workflows/ci.yml/badge.svg)](https://github.com/ahmed29345/zatca-qr/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A small, dependency-free TypeScript library that encodes and decodes the QR code payload required on Saudi e-invoices.

Under ZATCA's e-invoicing rules (FATOORA), simplified tax invoices must carry a QR code whose content is a list of fields (seller name, VAT number, timestamp, totals) encoded as tag-length-value (TLV) bytes and then Base64. This package builds that payload with strict validation, and parses it back.

> This is an independent open-source library. It is not made, endorsed or certified by ZATCA. You are responsible for checking your invoices against ZATCA's current specifications and validation tools.

- Correct UTF-8 byte lengths, so Arabic seller names work.
- Values over 255 bytes are rejected, not silently truncated.
- Validates the VAT number, amounts and timestamp before encoding.
- Encodes and decodes Phase 2 tags 6–9 (it does not sign; see [Scope](#scope-phase-1-and-phase-2)).
- One typed error class with stable error codes.
- Runs in Node 20+ and modern browsers. No dependencies, no `Buffer`.
- ESM and CommonJS builds with TypeScript declarations.

## Install

```sh
npm install @ahmed29345/zatca-qr
```

## Usage

### Encode

```ts
import { encodeQr } from '@ahmed29345/zatca-qr';

const payload = encodeQr({
  sellerName: 'Bobs Records',
  vatNumber: '310122393500003',
  timestamp: '2022-04-25T15:30:00Z',
  invoiceTotal: '1000.00', // including VAT
  vatTotal: '150.00',
});
// 'AQxCb2JzIFJlY29yZHMCDzMxMDEyMjM5MzUwMDAwMwMUMjAyMi0wNC0yNVQxNTozMDowMFoEBzEwMDAuMDAFBjE1MC4wMA=='
```

The result is the text to put in the QR code. Any QR library can render it; see [`examples/generate-qr.mjs`](examples/generate-qr.mjs).

### Arabic seller name

```ts
const payload = encodeQr({
  sellerName: 'شركة المثال للتجارة',
  vatNumber: '399999999900003',
  timestamp: new Date(), // written in UTC, e.g. 2026-01-31T11:05:00Z
  invoiceTotal: 115, // numbers are formatted as "115.00"
  vatTotal: 15,
});
```

That name is 19 characters but 36 bytes in UTF-8 (17 Arabic letters at 2 bytes each, plus 2 spaces), so its TLV length byte is 36. Implementations that use `string.length` here produce QR codes that do not decode correctly.

### Decode

```ts
import { decodeQr } from '@ahmed29345/zatca-qr';

decodeQr(payload);
// {
//   sellerName: 'شركة المثال للتجارة',
//   vatNumber: '399999999900003',
//   timestamp: '2026-01-31T11:05:00Z',
//   invoiceTotal: '115.00',
//   vatTotal: '15.00'
// }
```

By default, `decodeQr` applies the same validation as `encodeQr` and rejects unknown tags. To inspect QR codes produced by other systems, which are not always strict, pass `{ strict: false }`: the TLV structure is still checked and tags 1–5 must be present, but values are returned as found and unknown tags are skipped.

```ts
decodeQr(scannedText, { strict: false });
```

### Errors

Every validation and parsing failure throws a `ZatcaQrError` with a `code` (and a `tag`, where one applies):

```ts
import { encodeQr, ZatcaQrError } from '@ahmed29345/zatca-qr';

try {
  encodeQr(fields);
} catch (error) {
  if (error instanceof ZatcaQrError && error.code === 'INVALID_VAT_NUMBER') {
    // e.g. highlight the VAT number field
  } else {
    throw error;
  }
}
```

| Code | Meaning |
| --- | --- |
| `INVALID_SELLER_NAME` | Seller name is missing or blank. |
| `INVALID_VAT_NUMBER` | Not 15 digits starting and ending with 3. |
| `INVALID_TIMESTAMP` | Not a valid ISO 8601 date and time. |
| `INVALID_AMOUNT` | Not a non-negative amount with two decimal places. |
| `INVALID_BINARY_FIELD` | A Phase 2 field is not a non-empty `Uint8Array`. |
| `INCOMPLETE_PHASE2` | Some, but not all, of tags 6, 7 and 8 were given. |
| `VALUE_TOO_LONG` | A value is longer than 255 bytes. |
| `INVALID_UTF8` | Text has unpaired surrogates, or decoded bytes are not valid UTF-8. |
| `INVALID_BASE64` | The payload is empty or not valid Base64. |
| `MALFORMED_TLV` | The TLV bytes are truncated. |
| `MISSING_TAG` | One of tags 1–5 is missing. |
| `DUPLICATE_TAG` | A tag appears twice. |
| `UNKNOWN_TAG` | A tag outside 1–9 (strict mode only). |
| `INVALID_TAG` | `toTlv` was given a tag outside 0–255. |

### Low-level TLV

`toTlv` and `fromTlv` work on raw entries, if you need to build or inspect a payload yourself. String values are written as UTF-8.

```ts
import { bytesToBase64, fromTlv, toTlv } from '@ahmed29345/zatca-qr';

const bytes = toTlv([
  { tag: 1, value: 'متجر' }, // -> 01 08 D9 85 D8 AA D8 AC D8 B1
  { tag: 2, value: '310122393500003' },
]);
bytesToBase64(bytes);
fromTlv(bytes); // [{ tag: 1, value: Uint8Array(8) }, { tag: 2, value: Uint8Array(15) }]
```

`bytesToBase64` and `base64ToBytes` are exported as well. They work the same in Node and browsers.

## Fields and validation

| Tag | Field | Type | Rule |
| --- | --- | --- | --- |
| 1 | `sellerName` | `string` | Non-blank. At most 255 UTF-8 bytes. |
| 2 | `vatNumber` | `string` | Exactly 15 ASCII digits, first and last digit `3`. |
| 3 | `timestamp` | `string \| Date` | ISO 8601 date and time (see below). |
| 4 | `invoiceTotal` | `string \| number` | Invoice total including VAT. Non-negative, two decimal places. |
| 5 | `vatTotal` | `string \| number` | VAT total. Non-negative, two decimal places. |
| 6 | `invoiceHash` | `Uint8Array` | Phase 2. Optional. |
| 7 | `ecdsaSignature` | `Uint8Array` | Phase 2. Optional. |
| 8 | `ecdsaPublicKey` | `Uint8Array` | Phase 2. Optional. |
| 9 | `certificateSignature` | `Uint8Array` | Phase 2, simplified invoices. Optional. |

Details:

- **Byte lengths.** Every value is limited to 255 bytes, because the TLV length field is a single byte. The limit is measured in UTF-8 bytes: Arabic letters are 2 bytes each, so 127 Arabic letters fit and 128 do not.
- **Timestamp.** Strings must look like `YYYY-MM-DDTHH:mm:ss`, optionally with fractional seconds and a `Z` or `±HH:mm` offset, and must be a real date and time (`2023-02-29` is rejected). Valid strings are kept exactly as given. A `Date` is written in UTC as `YYYY-MM-DDTHH:mm:ssZ`, with milliseconds dropped.
- **Amounts.** Strings must already be formatted, such as `"1150.00"` (no thousands separators, no leading zeros, no sign). Numbers are formatted to two decimals only if that is exact: `1150` and `1150.5` are accepted, but `0.1 + 0.2` and `1.005` are rejected instead of being rounded. Round amounts in your billing code, where the rounding rules belong.
- **Order.** `encodeQr` writes tags in ascending order. `decodeQr` accepts any order but rejects duplicates.
- The library does not check business rules across fields, such as whether the VAT total matches the invoice total.

## Scope: Phase 1 and Phase 2

ZATCA introduced e-invoicing in two phases.

**Phase 1 (Generation)** requires a QR code with tags 1–5 on simplified tax invoices. This library covers that fully.

**Phase 2 (Integration)** requires much more: UBL 2.1 XML invoices, invoice hashing, an ECDSA cryptographic stamp, device onboarding to obtain a cryptographic stamp identifier (CSID), and clearance or reporting through ZATCA's API. Its QR code adds tags 6–9: the invoice hash, the ECDSA signature, the ECDSA public key and, for simplified invoices, the signature of the stamp's certificate by ZATCA's certificate authority.

For Phase 2, this library only carries tags 6–9 in and out of the QR payload. It does **not**:

- build or canonicalise the XML invoice,
- compute the invoice hash,
- create or verify signatures,
- handle certificates, onboarding or any ZATCA API.

You compute those values with your own signing code and pass the resulting bytes in. They are written to the payload exactly as given. Note that implementations differ in what bytes they put in these tags: ZATCA's reference SDK, as commonly implemented, stores tags 6 and 7 as the UTF-8 bytes of the Base64 hash and signature text, and tags 8 and 9 as raw bytes (the DER public key and the certificate signature). Confirm the expected form against ZATCA's current SDK and validator for your setup.

```ts
import { base64ToBytes, encodeQr } from '@ahmed29345/zatca-qr';

const text = new TextEncoder();

const payload = encodeQr({
  ...phase1Fields,
  invoiceHash: text.encode(invoiceHashBase64),
  ecdsaSignature: text.encode(signatureBase64),
  ecdsaPublicKey: base64ToBytes(publicKeyDerBase64),
  certificateSignature: certificateSignatureBytes,
});
```

Using this library does not make an invoicing system Phase 2 compliant.

## Compatibility

- Node.js 20 or later, and current browsers. Only standard APIs are used (`TextEncoder`, `TextDecoder`, `Uint8Array`).
- Published as ESM and CommonJS, with TypeScript declarations for both.
- No runtime dependencies.

## Development

```sh
npm install
npm test          # Vitest
npm run lint      # ESLint and TypeScript type checks
npm run build     # ESM, CommonJS and .d.ts output in dist/
npm run example   # build, then run examples/generate-qr.mjs
```

The tests check exact bytes written out by hand, including the Arabic case, rather than comparing the encoder with itself. They also cover round trips, every validation rule, the 255-byte boundary, Phase 2 tags, malformed payloads, and the Base64 codec against RFC 4648 vectors and Node's `Buffer`. CI runs on Node 20, 22 and 24.

## License

[MIT](LICENSE) © 2026 Muhammad Ahmed Raza Memon
