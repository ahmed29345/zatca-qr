import { expect } from 'vitest';
import { ZatcaQrError, type ZatcaQrErrorCode } from '../src/index.js';

/** Bytes of an ASCII string, built from char codes so tests do not depend on TextEncoder. */
export function ascii(text: string): number[] {
  return Array.from(text, (char) => {
    const code = char.charCodeAt(0);
    if (code > 0x7f) {
      throw new Error(`ascii() helper got non-ASCII character ${JSON.stringify(char)}`);
    }
    return code;
  });
}

/** One hand-built TLV entry: tag, length, value bytes. */
export function tlv(tag: number, value: number[]): number[] {
  return [tag, value.length, ...value];
}

export function bytes(...parts: number[][]): Uint8Array {
  return Uint8Array.from(parts.flat());
}

export function catchError(fn: () => unknown): ZatcaQrError {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(ZatcaQrError);
    return error as ZatcaQrError;
  }
  throw new Error('Expected a ZatcaQrError to be thrown, but nothing was thrown.');
}

export function expectCode(fn: () => unknown, code: ZatcaQrErrorCode, tag?: number): void {
  const error = catchError(fn);
  expect(error.code).toBe(code);
  if (tag !== undefined) {
    expect(error.tag).toBe(tag);
  }
}
