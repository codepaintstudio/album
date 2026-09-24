import {
  ALLOWED_IMAGE_MIME,
  ALLOWED_VIDEO_MIME,
  extensionForUpload,
  mimeFromFilename,
} from '@/lib/media-type';
import { TosClient, TosServerCode, TosServerError } from '@volcengine/tos-sdk';
import { randomUUID } from 'crypto';
import 'server-only';
import sharp from 'sharp';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_VIDEO_FILE_SIZE = 512 * 1024 * 1024; // 512MB for videos
const MAX_GENERAL_FILE_SIZE = 512 * 1024 * 1024; // 512MB for general files

export class ConfigurationError extends Error {}

interface StorageConfig {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  endpoint: string;
  bucket: string;
  uploadPrefix: string;
  thumbnailPrefix: string;
  filesPrefix: string;
  publicBaseUrl: string;
  presignExpiresSeconds?: number;
}

let cachedConfig: StorageConfig | null = null;
let cachedClient: TosClient | null = null;

export class UploadError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = 'UploadError';
    this.statusCode = statusCode;
  }
}

/**
 * mimeType 由调用方（resolveUploadMedia）决定，而不是这里再看一次 file.type：
 * 空 type 的上传在旧实现里会掉进 persistVideo 的视频白名单，被以
 * 「仅支持 MP4 / WebM / MOV 视频」拒绝。真正的字节仍由下面的 sharp 验证。
 */
export async function persistImage(file: File, mimeType: string) {
  const config = getConfig();
  const client = getClient();

  if (!ALLOWED_IMAGE_MIME.has(mimeType)) {
    throw new UploadError('仅支持 JPG/PNG/GIF/WebP 图片');
  }

  if (file.size > MAX_FILE_SIZE) {
    throw new UploadError('文件大小超出限制 (10MB)');
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const originalName = file.name;
  const extension = extensionForUpload(file.name, mimeType);
  const filename = `${Date.now()}-${randomUUID()}${extension}`;
  const objectKey = buildObjectKey(filename, config);

  // 缩略图解码必须在原图上传之前：反过来时一张坏图片已经把一个永远没有数据库行
  // 引用它的原图写进了桶里，而这条孤儿没有任何代码能再找到它。
  let thumbnailBuffer: Buffer;
  try {
    const { data } = await sharp(buffer, { sequentialRead: true })
      .resize(400, 400, { fit: 'inside', withoutEnlargement: true, fastShrinkOnLoad: true })
      .webp({ quality: 80 })
      .toBuffer({ resolveWithObject: true });
    thumbnailBuffer = data;
  } catch (error) {
    // 走到这里说明声明/扩展名说它是图片，但字节不是 ⇒ 客户端得到诚实的 400，
    // 真实原因留在日志里，不把 sharp 的内部信息透给前端。
    console.error('[persistImage] 图片解码失败', file.name, error);
    throw new UploadError('图片内容无法解析，请确认文件确实是图片');
  }

  const originalUpload = client.putObject({
    bucket: config.bucket,
    key: objectKey,
    body: buffer,
    contentType: mimeType,
  });

  const thumbnailKey = buildThumbnailKey(filename, config);

  try {
    const uploads = await Promise.allSettled([
      originalUpload,
      client.putObject({
        bucket: config.bucket,
        key: thumbnailKey,
        body: thumbnailBuffer,
        contentType: 'image/webp',
      }),
    ]);
    const failedUpload = uploads.find(result => result.status === 'rejected');
    if (failedUpload?.status === 'rejected') throw failedUpload.reason;
  } catch (error) {
    try {
      await deleteImageAssets(filename);
    } catch (cleanupError) {
      console.error('[persistImage] 上传失败后的对象补偿清理失败', filename, cleanupError);
    }
    throw error;
  }

  return {
    filename,
    originalName,
  };
}

export async function persistVideo(file: File, mimeType: string) {
  const config = getConfig();
  const client = getClient();

  if (!ALLOWED_VIDEO_MIME.has(mimeType)) {
    throw new UploadError('仅支持 MP4 / WebM / MOV 视频');
  }

  if (file.size > MAX_VIDEO_FILE_SIZE) {
    throw new UploadError(`文件大小超出限制 (${Math.floor(MAX_VIDEO_FILE_SIZE / 1024 / 1024)}MB)`);
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const originalName = file.name;
  // 旧写法 getExtensionFromFile(file) || getExtensionFromMime(file.type) 在空 type 时
  // 两头都拿不到东西，于是键名没有扩展名，任何按扩展名反推类型的读取都会失败。
  const extension = extensionForUpload(file.name, mimeType);
  const filename = `${Date.now()}-${randomUUID()}${extension}`;
  const objectKey = buildObjectKey(filename, config);

  try {
    await client.putObject({
      bucket: config.bucket,
      key: objectKey,
      body: buffer,
      contentType: mimeType,
    });
  } catch (error) {
    try {
      await deleteUploadObject(filename);
    } catch (cleanupError) {
      console.error('[persistVideo] 上传失败后的对象补偿清理失败', filename, cleanupError);
    }
    throw error;
  }

  return {
    filename,
    originalName,
  };
}

/**
 * 只做配置解析、不碰任何对象。供批量删除在发起 N 次请求之前预检：
 * 环境没配好时应当一次报出，而不是让 4000 次删除各抛一遍同样的错误。
 *
 * 注意 getConfig() 即使只为删除也会检查公网 base URL（见其内部）。不修：
 * StorageConfig.publicBaseUrl 是 string，做成可空要波及 6 个 route 的 URL 构造，
 * 而没有哪条缺陷要求这个收益。调用方用 misconfigured 标记 + 可操作文案兜住即可。
 */
export function ensureStorageConfigured(): void {
  getConfig();
}

export async function deleteImageAssets(filename: string) {
  const config = getConfig();
  const client = getClient();

  const keys = [buildObjectKey(filename, config), buildThumbnailKey(filename, config)];

  await Promise.all(
    keys.map(async key => {
      try {
        await client.deleteObject({ bucket: config.bucket, key });
      } catch (error) {
        if (!isNotFoundError(error)) {
          throw error;
        }
      }
    })
  );
}

export async function deleteUploadObject(filename: string) {
  const config = getConfig();
  const client = getClient();
  const key = buildObjectKey(filename, config);

  try {
    await client.deleteObject({ bucket: config.bucket, key });
  } catch (error) {
    if (!isNotFoundError(error)) {
      throw error;
    }
  }
}

export async function getOriginalBuffer(filename: string) {
  return getObjectBuffer(buildObjectKey(filename, getConfig()));
}

export function createUploadFilename(name: string, mimeType: string) {
  return `${Date.now()}-${randomUUID()}${extensionForUpload(name, mimeType)}`;
}

export function uploadStorageKey(filename: string) {
  return buildObjectKey(filename, getConfig());
}

export function uploadThumbnailStorageKey(filename: string) {
  return buildThumbnailKey(filename, getConfig());
}

export async function getPresignedPhotoPutUrl(
  storageKey: string,
  mimeType: string,
  expiresSeconds = 900
) {
  const config = getConfig();
  return getClient().getPreSignedUrl({
    bucket: config.bucket,
    key: storageKey,
    method: 'PUT',
    expires: expiresSeconds,
    response: { contentType: mimeType },
  });
}

export async function inspectUploadObject(storageKey: string) {
  const result = await getClient().headObject({ bucket: getConfig().bucket, key: storageKey });
  return {
    size: Number(result.data['content-length']),
    contentType: result.data['content-type'],
  };
}

export async function getUploadObjectBuffer(storageKey: string) {
  return getObjectBuffer(storageKey);
}

export async function createImageThumbnail(thumbnailKey: string, buffer: Buffer) {
  const config = getConfig();
  let thumbnailBuffer: Buffer;
  try {
    thumbnailBuffer = await sharp(buffer, { sequentialRead: true })
      .resize(400, 400, { fit: 'inside', withoutEnlargement: true, fastShrinkOnLoad: true })
      .webp({ quality: 80 })
      .toBuffer();
  } catch (error) {
    console.error('[createImageThumbnail] 图片解码失败', thumbnailKey, error);
    throw new UploadError('图片内容无法解析，请确认文件确实是图片');
  }
  await getClient().putObject({
    bucket: config.bucket,
    key: thumbnailKey,
    body: thumbnailBuffer,
    contentType: 'image/webp',
  });
}

export async function deleteUploadStorageKey(storageKey: string) {
  const config = getConfig();
  try {
    await getClient().deleteObject({ bucket: config.bucket, key: storageKey });
  } catch (error) {
    if (!isNotFoundError(error)) throw error;
  }
}

export function getPublicObjectUrl(filename: string) {
  const config = getConfig();
  return joinUrl(config.publicBaseUrl, buildObjectKey(filename, config));
}

export function getPublicThumbnailUrl(filename: string) {
  const config = getConfig();
  return joinUrl(config.publicBaseUrl, buildThumbnailKey(filename, config));
}

function getConfig(): StorageConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  const accessKeyId = process.env.TOS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.TOS_SECRET_ACCESS_KEY;
  const region = process.env.TOS_REGION;
  const endpoint = process.env.TOS_ENDPOINT;
  const bucket = process.env.TOS_BUCKET;

  if (!accessKeyId || !secretAccessKey || !region || !endpoint || !bucket) {
    throw new ConfigurationError(
      'TOS 存储配置缺失，请检查 AccessKey、SecretKey、Region、Endpoint 与 Bucket 设置'
    );
  }

  const uploadPrefix = sanitizePrefix(
    process.env.TOS_UPLOAD_PREFIX ?? process.env.NEXT_PUBLIC_TOS_UPLOAD_PREFIX ?? 'uploads/'
  );

  const thumbnailPrefix = sanitizePrefix(
    process.env.TOS_THUMBNAIL_PREFIX ??
      process.env.NEXT_PUBLIC_TOS_THUMBNAIL_PREFIX ??
      `${uploadPrefix}thumbnails/`
  );

  const filesPrefix = sanitizePrefix(
    process.env.TOS_FILES_PREFIX ?? process.env.NEXT_PUBLIC_TOS_FILES_PREFIX ?? 'files/'
  );

  const publicBaseUrl = sanitizeBaseUrl(
    process.env.NEXT_PUBLIC_TOS_BASE_URL ?? process.env.TOS_PUBLIC_BASE_URL ?? ''
  );

  if (!publicBaseUrl) {
    throw new ConfigurationError(
      '未配置 NEXT_PUBLIC_TOS_BASE_URL 或 TOS_PUBLIC_BASE_URL，用于生成图片外链'
    );
  }

  cachedConfig = {
    accessKeyId,
    secretAccessKey,
    region,
    endpoint,
    bucket,
    uploadPrefix,
    thumbnailPrefix,
    filesPrefix,
    publicBaseUrl,
    presignExpiresSeconds: Number(process.env.TOS_PRESIGN_EXPIRES ?? 900) || 900,
  };

  return cachedConfig;
}

function getClient() {
  if (cachedClient) {
    return cachedClient;
  }

  const config = getConfig();

  cachedClient = new TosClient({
    accessKeyId: config.accessKeyId,
    accessKeySecret: config.secretAccessKey,
    region: config.region,
    endpoint: config.endpoint,
    secure: true,
  });

  return cachedClient;
}

async function getObjectBuffer(key: string) {
  const config = getConfig();
  const client = getClient();

  const response = await client.getObjectV2({
    bucket: config.bucket,
    key,
    dataType: 'buffer',
  });

  return response.data.content;
}

function buildObjectKey(filename: string, config: StorageConfig) {
  return `${config.uploadPrefix}${filename}`;
}

function buildThumbnailKey(filename: string, config: StorageConfig) {
  return `${config.thumbnailPrefix}thumb-${filename}`;
}

// ========= General File Upload (flat structure) =========

/**
 * Upload any file type (not just images) to object storage
 * Similar to persistImage but without thumbnail generation
 */
export async function persistFile(file: File) {
  const config = getConfig();
  const client = getClient();

  if (file.size > MAX_GENERAL_FILE_SIZE) {
    throw new UploadError(`文件大小超出限制 (${MAX_GENERAL_FILE_SIZE / 1024 / 1024}MB)`);
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const originalName = file.name;
  const extension = extensionForUpload(file.name, file.type || 'application/octet-stream');
  const filename = `${Date.now()}-${randomUUID()}${extension}`;
  const objectKey = buildFileObjectKey(filename, config);

  try {
    await client.putObject({
      bucket: config.bucket,
      key: objectKey,
      body: buffer,
      contentType: file.type || 'application/octet-stream',
    });
  } catch (error) {
    try {
      await deleteFileAsset(filename);
    } catch (cleanupError) {
      console.error('[persistFile] 上传失败后的对象补偿清理失败', filename, cleanupError);
    }
    throw error;
  }

  return {
    filename,
    originalName,
  };
}

/**
 * Delete a general file from storage
 */
export async function deleteFileAsset(filename: string) {
  const config = getConfig();
  const client = getClient();
  const key = buildFileObjectKey(filename, config);

  try {
    await client.deleteObject({ bucket: config.bucket, key });
  } catch (error) {
    if (!isNotFoundError(error)) {
      throw error;
    }
  }
}

/**
 * Get public URL for a general file
 */
export function getPublicFileUrl(filename: string) {
  const config = getConfig();
  return joinUrl(config.publicBaseUrl, buildFileObjectKey(filename, config));
}

/**
 * Build object key for general files
 */
function buildFileObjectKey(filename: string, config: StorageConfig) {
  return `${config.filesPrefix}${filename}`;
}

// ========= 直传/直下签名 =========
export function buildFilesStorageKey(parts: {
  filesetId: number | string;
  fileId: number | string;
  name?: string;
}) {
  const config = getConfig();
  const base = `${config.filesPrefix}${parts.filesetId}/${parts.fileId}`;
  return parts.name ? `${base}-${sanitizeName(parts.name)}` : base;
}

function sanitizeName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

export async function getPresignedPutUrl(storageKey: string, mime: string) {
  const config = getConfig();
  const client = getClient();
  const expires = config.presignExpiresSeconds ?? 900;
  const url = client.getPreSignedUrl({
    bucket: config.bucket,
    key: storageKey,
    method: 'PUT',
    expires,
    response: { contentType: mime },
  });
  // 如果需要限制 content-length，可在前端 PUT 时设置；SDK 可能不支持 header 注入
  return url;
}

export async function getPresignedGetUrl(storageKey: string, attachmentName?: string) {
  const config = getConfig();
  const client = getClient();
  const expires = config.presignExpiresSeconds ?? 900;
  const url = client.getPreSignedUrl({
    bucket: config.bucket,
    key: storageKey,
    method: 'GET',
    expires,
    response: {
      contentDisposition: attachmentName ? `attachment; filename="${attachmentName}"` : undefined,
    },
  });
  return url;
}

/**
 * Get a presigned GET url with inline content-disposition for general files.
 * Useful for previewing PDFs in-browser without triggering download.
 */
export async function getPresignedInlineFileUrl(
  filename: string,
  originalName?: string,
  mime?: string
) {
  const config = getConfig();
  const client = getClient();
  const expires = config.presignExpiresSeconds ?? 900;
  const key = buildFileObjectKey(filename, config);
  const contentDisposition = originalName ? `inline; filename="${originalName}"` : 'inline';
  const url = client.getPreSignedUrl({
    bucket: config.bucket,
    key,
    method: 'GET',
    expires,
    response: {
      contentDisposition,
      contentType: mime || undefined,
    },
  });
  return url;
}

export async function getPresignedInlineUrl(storageKey: string) {
  const config = getConfig();
  const client = getClient();
  const expires = config.presignExpiresSeconds ?? 900;
  const url = client.getPreSignedUrl({
    bucket: config.bucket,
    key: storageKey,
    method: 'GET',
    expires,
    response: {
      contentDisposition: 'inline',
    },
  });
  return url;
}

/**
 * Fetch general file bytes from storage by filename (under filesPrefix).
 */
export async function getFileBuffer(filename: string) {
  const config = getConfig();
  const key = buildFileObjectKey(filename, config);
  return getObjectBuffer(key);
}

/**
 * Best-effort MIME guess from filename extension for preview responses.
 * 表在 lib/media-type.ts，这里只补它的兜底值。
 */
export function guessMimeFromFilename(name: string) {
  return mimeFromFilename(name) ?? 'application/octet-stream';
}

function sanitizePrefix(input: string) {
  const trimmed = input.trim();
  if (!trimmed) return '';
  const withoutLeading = trimmed.replace(/^\/+/, '');
  return withoutLeading.endsWith('/') ? withoutLeading : `${withoutLeading}/`;
}

function sanitizeBaseUrl(input: string) {
  const trimmed = input.trim();
  return trimmed.replace(/\/+$/, '');
}

function joinUrl(base: string, path: string) {
  if (!base) return path;
  const normalizedPath = path.replace(/^\/+/, '');
  return `${base}/${normalizedPath}`;
}

export function isNotFoundError(error: unknown) {
  return error instanceof TosServerError && error.code === TosServerCode.NoSuchKey;
}
