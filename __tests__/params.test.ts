import { readId, readInt } from '@/lib/params';
import { describe, expect, it } from 'vitest';

describe('search parameter parsing', () => {
  it('accepts only complete decimal integers for numeric pagination values', () => {
    expect(readInt({ page: '12' }, 'page')).toBe(12);
    expect(readInt({ page: '-2' }, 'page')).toBe(-2);
    for (const value of [' 1', '1 ', '1abc', '1.5', '1e2', '9007199254740992']) {
      expect(readInt({ page: value }, 'page')).toBeNull();
    }
  });

  it('requires query IDs to be positive int32 decimal values', () => {
    expect(readId({ photo: '2147483647' }, 'photo')).toBe(2147483647);
    for (const value of ['', '0', '-1', '1abc', '1.5', '2147483648']) {
      expect(readId({ photo: value }, 'photo')).toBeNull();
    }
  });
});
