import { validateUploadObjectMetadata } from '@/lib/upload-intent-validation';
import { describe, expect, it } from 'vitest';

describe('upload object verification', () => {
  const expected = { mediaType: 'image' as const, mimeType: 'image/jpeg', size: 2048 };

  it('accepts the exact size and MIME type case-insensitively', () => {
    expect(
      validateUploadObjectMetadata(expected, { size: 2048, contentType: 'IMAGE/JPEG' })
    ).toBeNull();
  });

  it('rejects absent, changed, oversized, or non-finite object sizes', () => {
    for (const size of [
      0,
      2047,
      2049,
      10 * 1024 * 1024 + 1,
      Number.NaN,
      Number.POSITIVE_INFINITY,
    ]) {
      expect(validateUploadObjectMetadata(expected, { size })).toBe('size_mismatch');
    }
  });

  it('rejects a stored MIME type that differs from the authorized intent', () => {
    expect(validateUploadObjectMetadata(expected, { size: 2048, contentType: 'image/png' })).toBe(
      'mime_mismatch'
    );
  });

  it('allows a missing stored MIME header when the provider omits it', () => {
    expect(validateUploadObjectMetadata(expected, { size: 2048 })).toBeNull();
  });

  it('applies separate image and video maximum sizes', () => {
    expect(
      validateUploadObjectMetadata(
        { mediaType: 'video', mimeType: 'video/mp4', size: 512 * 1024 * 1024 },
        { size: 512 * 1024 * 1024 }
      )
    ).toBeNull();
    expect(
      validateUploadObjectMetadata(
        { mediaType: 'image', mimeType: 'image/png', size: 10 * 1024 * 1024 + 1 },
        { size: 10 * 1024 * 1024 + 1 }
      )
    ).toBe('size_mismatch');
    expect(
      validateUploadObjectMetadata(
        { mediaType: 'video', mimeType: 'video/mp4', size: 512 * 1024 * 1024 + 1 },
        { size: 512 * 1024 * 1024 + 1 }
      )
    ).toBe('size_mismatch');
  });
});
