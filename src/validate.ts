import { ZatcaQrError } from './errors.js';

const VAT_NUMBER = /^3\d{13}3$/;
const AMOUNT = /^(?:0|[1-9]\d*)\.\d{2}$/;
const ISO_DATE_TIME =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:Z|[+-](\d{2}):(\d{2}))?$/;

/** Seller name: any non-blank text. Its byte length is checked when it is encoded. */
export function validateSellerName(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ZatcaQrError('INVALID_SELLER_NAME', 'Seller name must be a non-empty string.', { tag: 1 });
  }
  return value;
}

/** VAT registration number: 15 ASCII digits, first and last digit 3. */
export function validateVatNumber(value: unknown): string {
  if (typeof value !== 'string' || !VAT_NUMBER.test(value)) {
    throw new ZatcaQrError(
      'INVALID_VAT_NUMBER',
      `VAT registration number must be 15 digits that start and end with 3, got ${JSON.stringify(value)}.`,
      { tag: 2 },
    );
  }
  return value;
}

/**
 * Timestamp: an ISO 8601 date and time, `YYYY-MM-DDTHH:mm:ss`, with optional
 * fractional seconds and an optional `Z` or `±HH:mm` offset. Strings are
 * checked (including real calendar dates) and kept exactly as given.
 *
 * A `Date` is written in UTC as `YYYY-MM-DDTHH:mm:ssZ`; milliseconds are dropped.
 */
export function formatTimestamp(value: unknown): string {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new ZatcaQrError('INVALID_TIMESTAMP', 'Timestamp is an invalid Date.', { tag: 3 });
    }
    value = value.toISOString().replace(/\.\d{3}Z$/, 'Z');
  }

  if (typeof value !== 'string' || !isIsoDateTime(value)) {
    throw new ZatcaQrError(
      'INVALID_TIMESTAMP',
      `Timestamp must be an ISO 8601 date and time such as "2026-01-31T14:05:00Z", got ${JSON.stringify(value)}.`,
      { tag: 3 },
    );
  }
  return value;
}

/**
 * Amount: a non-negative decimal with exactly two decimal places.
 *
 * Strings must already be in that form (`"1150.00"`) and are kept as given.
 * Numbers are formatted with two decimals, but only if that is exact: `115.5`
 * becomes `"115.50"`, while `0.1 + 0.2` is rejected. This library never rounds
 * money on your behalf.
 */
export function formatAmount(value: unknown, field: 'invoiceTotal' | 'vatTotal'): string {
  const tag = field === 'invoiceTotal' ? 4 : 5;

  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) {
      throw new ZatcaQrError('INVALID_AMOUNT', `${field} must be a finite, non-negative number, got ${value}.`, { tag });
    }
    const fixed = value.toFixed(2);
    if (Number(fixed) !== value) {
      throw new ZatcaQrError(
        'INVALID_AMOUNT',
        `${field} ${value} has more than two decimal places; round it before encoding.`,
        { tag },
      );
    }
    value = fixed;
  }

  if (typeof value !== 'string' || !AMOUNT.test(value)) {
    throw new ZatcaQrError(
      'INVALID_AMOUNT',
      `${field} must be a non-negative decimal with two decimal places such as "1150.00", got ${JSON.stringify(value)}.`,
      { tag },
    );
  }
  return value;
}

function isIsoDateTime(text: string): boolean {
  const match = ISO_DATE_TIME.exec(text);
  if (!match) {
    return false;
  }

  const [, year, month, day, hour, minute, second, offsetHour, offsetMinute] = match.map(Number);
  return (
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysInMonth(year, month) &&
    hour <= 23 &&
    minute <= 59 &&
    second <= 59 &&
    (match[7] === undefined || (offsetHour <= 23 && offsetMinute <= 59))
  );
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return leap ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}
