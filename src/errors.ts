/**
 * Machine-readable reason for a {@link ZatcaQrError}.
 *
 * Field validation:
 * - `INVALID_SELLER_NAME`, `INVALID_VAT_NUMBER`, `INVALID_TIMESTAMP`,
 *   `INVALID_AMOUNT`, `INVALID_BINARY_FIELD`
 * - `INCOMPLETE_PHASE2`: some, but not all, of the Phase 2 tags 6–8 were given
 *
 * Encoding and decoding:
 * - `VALUE_TOO_LONG`: a value is longer than 255 bytes (single-byte length field)
 * - `INVALID_TAG`: a TLV tag is not an integer in 0–255
 * - `INVALID_UTF8`: text cannot be represented as, or decoded from, valid UTF-8
 * - `INVALID_BASE64`: the QR payload is not valid Base64
 * - `MALFORMED_TLV`: the byte stream is truncated or a length overruns the data
 * - `MISSING_TAG`, `DUPLICATE_TAG`, `UNKNOWN_TAG`
 */
export type ZatcaQrErrorCode =
  | 'INVALID_SELLER_NAME'
  | 'INVALID_VAT_NUMBER'
  | 'INVALID_TIMESTAMP'
  | 'INVALID_AMOUNT'
  | 'INVALID_BINARY_FIELD'
  | 'INCOMPLETE_PHASE2'
  | 'VALUE_TOO_LONG'
  | 'INVALID_TAG'
  | 'INVALID_UTF8'
  | 'INVALID_BASE64'
  | 'MALFORMED_TLV'
  | 'MISSING_TAG'
  | 'DUPLICATE_TAG'
  | 'UNKNOWN_TAG';

export interface ZatcaQrErrorOptions {
  /** The TLV tag the error relates to, when there is one. */
  tag?: number;
  cause?: unknown;
}

/** Thrown for every invalid field value and malformed payload. Branch on `code`, not on `message`. */
export class ZatcaQrError extends Error {
  readonly code: ZatcaQrErrorCode;
  readonly tag?: number;

  constructor(code: ZatcaQrErrorCode, message: string, options: ZatcaQrErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'ZatcaQrError';
    this.code = code;
    if (options.tag !== undefined) {
      this.tag = options.tag;
    }
  }
}
