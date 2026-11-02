import { base64ToBytes, bytesToBase64 } from './base64.js';
import { ZatcaQrError } from './errors.js';
import { fromTlv, toTlv, type TlvInput } from './tlv.js';
import { utf8Decode } from './utf8.js';
import { formatAmount, formatTimestamp, validateSellerName, validateVatNumber } from './validate.js';

/** TLV tag numbers used in the ZATCA QR code. */
export const ZatcaQrTag = {
  SellerName: 1,
  VatNumber: 2,
  Timestamp: 3,
  InvoiceTotal: 4,
  VatTotal: 5,
  InvoiceHash: 6,
  EcdsaSignature: 7,
  EcdsaPublicKey: 8,
  CertificateSignature: 9,
} as const;

export type ZatcaQrTag = (typeof ZatcaQrTag)[keyof typeof ZatcaQrTag];

/** The fields of a ZATCA QR code, as returned by {@link decodeQr}. */
export interface ZatcaQrFields {
  /** Tag 1. Seller name, any language. At most 255 UTF-8 bytes. */
  sellerName: string;
  /** Tag 2. VAT registration number: 15 digits, first and last digit 3. */
  vatNumber: string;
  /** Tag 3. Invoice date and time in ISO 8601. */
  timestamp: string;
  /** Tag 4. Invoice total including VAT, two decimal places. */
  invoiceTotal: string;
  /** Tag 5. VAT total, two decimal places. */
  vatTotal: string;

  // Phase 2 tags. The library carries these bytes verbatim; it does not
  // compute, sign or verify them.

  /** Tag 6. Hash of the XML invoice. */
  invoiceHash?: Uint8Array;
  /** Tag 7. ECDSA signature. */
  ecdsaSignature?: Uint8Array;
  /** Tag 8. ECDSA public key. */
  ecdsaPublicKey?: Uint8Array;
  /** Tag 9. For simplified tax invoices: the signature of the stamp's certificate by ZATCA's CA. */
  certificateSignature?: Uint8Array;
}

/** Input to {@link encodeQr}. Like {@link ZatcaQrFields}, with a few convenience types. */
export interface ZatcaQrInput extends Omit<ZatcaQrFields, 'timestamp' | 'invoiceTotal' | 'vatTotal'> {
  /** ISO 8601 string (kept as given) or a `Date` (written in UTC, whole seconds). */
  timestamp: string | Date;
  /** `"1150.00"`, or a number with at most two decimal places such as `1150` or `1150.5`. */
  invoiceTotal: string | number;
  /** `"150.00"`, or a number with at most two decimal places. */
  vatTotal: string | number;
}

export interface DecodeOptions {
  /**
   * When `true` (the default), decoded fields must pass the same validation as
   * {@link encodeQr}, and unknown tags are rejected. When `false`, only the
   * structure is checked (valid Base64 and TLV, tags 1–5 present, no
   * duplicates), field values are returned as found, and unknown tags are
   * skipped. Use `false` to inspect QR codes produced by other systems.
   */
  strict?: boolean;
}

const BINARY_FIELDS = [
  [ZatcaQrTag.InvoiceHash, 'invoiceHash'],
  [ZatcaQrTag.EcdsaSignature, 'ecdsaSignature'],
  [ZatcaQrTag.EcdsaPublicKey, 'ecdsaPublicKey'],
  [ZatcaQrTag.CertificateSignature, 'certificateSignature'],
] as const;

const PHASE2_REQUIRED = ['invoiceHash', 'ecdsaSignature', 'ecdsaPublicKey'] as const;

/**
 * Validates the fields and returns the QR payload: the TLV encoding of tags
 * 1–5 (and any Phase 2 tags given), in tag order, as Base64.
 */
export function encodeQr(input: ZatcaQrInput): string {
  const fields = normalizeFields(input);

  const entries: TlvInput[] = [
    { tag: ZatcaQrTag.SellerName, value: fields.sellerName },
    { tag: ZatcaQrTag.VatNumber, value: fields.vatNumber },
    { tag: ZatcaQrTag.Timestamp, value: fields.timestamp },
    { tag: ZatcaQrTag.InvoiceTotal, value: fields.invoiceTotal },
    { tag: ZatcaQrTag.VatTotal, value: fields.vatTotal },
  ];
  for (const [tag, key] of BINARY_FIELDS) {
    const value = fields[key];
    if (value !== undefined) {
      entries.push({ tag, value });
    }
  }

  return bytesToBase64(toTlv(entries));
}

/** Parses a Base64 QR payload back into its fields. The inverse of {@link encodeQr}. */
export function decodeQr(payload: string, options: DecodeOptions = {}): ZatcaQrFields {
  const strict = options.strict ?? true;

  if (typeof payload !== 'string' || payload.trim() === '') {
    throw new ZatcaQrError('INVALID_BASE64', 'QR payload must be a non-empty Base64 string.');
  }

  const values = new Map<number, Uint8Array>();
  for (const { tag, value } of fromTlv(base64ToBytes(payload))) {
    if (tag < ZatcaQrTag.SellerName || tag > ZatcaQrTag.CertificateSignature) {
      if (strict) {
        throw new ZatcaQrError('UNKNOWN_TAG', `Tag ${tag} is not a ZATCA QR tag (expected 1–9).`, { tag });
      }
      continue;
    }
    if (values.has(tag)) {
      throw new ZatcaQrError('DUPLICATE_TAG', `Tag ${tag} appears more than once.`, { tag });
    }
    values.set(tag, value);
  }

  const text = (tag: ZatcaQrTag): string => {
    const value = values.get(tag);
    if (value === undefined) {
      throw new ZatcaQrError('MISSING_TAG', `Required tag ${tag} is missing.`, { tag });
    }
    return utf8Decode(value, tag);
  };

  const fields: ZatcaQrFields = {
    sellerName: text(ZatcaQrTag.SellerName),
    vatNumber: text(ZatcaQrTag.VatNumber),
    timestamp: text(ZatcaQrTag.Timestamp),
    invoiceTotal: text(ZatcaQrTag.InvoiceTotal),
    vatTotal: text(ZatcaQrTag.VatTotal),
  };
  for (const [tag, key] of BINARY_FIELDS) {
    const value = values.get(tag);
    if (value !== undefined) {
      fields[key] = value;
    }
  }

  return strict ? normalizeFields(fields) : fields;
}

function normalizeFields(input: ZatcaQrInput): ZatcaQrFields {
  if (typeof input !== 'object' || input === null) {
    throw new TypeError('Expected an object of ZATCA QR fields.');
  }

  const fields: ZatcaQrFields = {
    sellerName: validateSellerName(input.sellerName),
    vatNumber: validateVatNumber(input.vatNumber),
    timestamp: formatTimestamp(input.timestamp),
    invoiceTotal: formatAmount(input.invoiceTotal, 'invoiceTotal'),
    vatTotal: formatAmount(input.vatTotal, 'vatTotal'),
  };

  for (const [tag, key] of BINARY_FIELDS) {
    const value: unknown = input[key];
    if (value === undefined) {
      continue;
    }
    if (!(value instanceof Uint8Array) || value.length === 0) {
      throw new ZatcaQrError('INVALID_BINARY_FIELD', `${key} (tag ${tag}) must be a non-empty Uint8Array.`, { tag });
    }
    fields[key] = value;
  }

  const hasPhase2 = BINARY_FIELDS.some(([, key]) => fields[key] !== undefined);
  const missing = PHASE2_REQUIRED.filter((key) => fields[key] === undefined);
  if (hasPhase2 && missing.length > 0) {
    throw new ZatcaQrError(
      'INCOMPLETE_PHASE2',
      `Phase 2 QR codes need tags 6, 7 and 8 together; missing ${missing.join(', ')}.`,
    );
  }

  return fields;
}
