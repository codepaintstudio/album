export type UploadMediaType = 'image' | 'video';

export type UploadMetadataIssue = 'size_mismatch' | 'mime_mismatch';

const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const MAX_VIDEO_SIZE = 512 * 1024 * 1024;

export function validateUploadObjectMetadata(
  expected: { mediaType: UploadMediaType; mimeType: string; size: number },
  actual: { size: number; contentType?: unknown }
): UploadMetadataIssue | null {
  const maxSize = expected.mediaType === 'image' ? MAX_IMAGE_SIZE : MAX_VIDEO_SIZE;
  if (!Number.isFinite(actual.size) || actual.size !== expected.size || actual.size > maxSize) {
    return 'size_mismatch';
  }

  if (
    typeof actual.contentType === 'string' &&
    actual.contentType.toLowerCase() !== expected.mimeType.toLowerCase()
  ) {
    return 'mime_mismatch';
  }

  return null;
}
