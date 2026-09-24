/**
 * 媒体类型的唯一归属地：纯函数、零运行时依赖，因此既能被 route handler 用，
 * 也能脱离数据库与对象存储单测。
 *
 * 这里存在的理由：mediaType 与 mimeType 是两个必须互相对应的字段，而
 * app/api/upload/route.ts 原来分别从 `file.type.startsWith('image/')` 和
 * `file.type || (isImage ? … : 'video/mp4')` 两处独立推导它们。同一个值被两处
 * 决定，就意味着它们可以互相矛盾。现在只允许 resolveUploadMedia 产出这两个字段。
 *
 * 仓库里原先有三张 mime/扩展名对照表（ALLOWED_*_MIME、私有的 getExtensionFromMime、
 * guessMimeFromFilename），全部收在这里，且都是下面两张表的视图。
 */

export const MEDIA_KINDS = ['image', 'video'] as const;

export type MediaKind = (typeof MEDIA_KINDS)[number];

/** 相册域允许的图片类型。sharp 会二次验证真正的字节。 */
export const ALLOWED_IMAGE_MIME: ReadonlySet<string> = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
]);

/** 相册域允许的视频类型。 */
export const ALLOWED_VIDEO_MIME: ReadonlySet<string> = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime',
]);

/**
 * 扩展名 → MIME。原先的 guessMimeFromFilename 一个视频条目都没有，
 * 于是 `a.mp4` 会落到 application/octet-stream，任何靠它反推类型的路径都是半残的。
 * 不含 .svg：sharp 处理它会失败，不该被当作可上传的图片。
 */
const EXTENSION_TO_MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
};

/** MIME → 扩展名，用于文件名不带扩展名时给存储键补一个。 */
const MIME_TO_EXTENSION: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
};

/**
 * 既没有可信的声明类型、文件名也没有可用扩展名。
 *
 * 刻意不做 magic byte 嗅探：要覆盖 MP4/MOV 就得解析偏移 4 处的 ftyp box，
 * 那要么引依赖要么手写几十行。而"猜不出"的正确响应是一个说清问题的 400，
 * 不是一个大约 95% 情况下猜对的启发式。
 */
export class AmbiguousMediaError extends Error {
  constructor(name: string) {
    super(
      `无法识别文件类型：${name || '（无文件名）'}。图片请使用 jpg/png/gif/webp，视频请使用 mp4/webm/mov`
    );
    this.name = 'AmbiguousMediaError';
  }
}

export function isImageMime(mime: string): boolean {
  return ALLOWED_IMAGE_MIME.has(mime);
}

/** 该 MIME 是否属于相册域可接受的媒体；云盘的 pdf/txt 等返回 false。 */
export function isUploadableMedia(mime: string): boolean {
  return ALLOWED_IMAGE_MIME.has(mime) || ALLOWED_VIDEO_MIME.has(mime);
}

export function kindForMime(mime: string): MediaKind | null {
  if (ALLOWED_IMAGE_MIME.has(mime)) return 'image';
  if (ALLOWED_VIDEO_MIME.has(mime)) return 'video';
  return null;
}

export function extensionForMime(mime: string): string {
  return MIME_TO_EXTENSION[mime] ?? '';
}

/** 从文件名取扩展名（小写，含点）；没有则 ''。 */
export function extensionFromName(name: string): string {
  const match = /\.([^.]+)$/u.exec(name ?? '');
  return match?.[1] ? `.${match[1].toLowerCase()}` : '';
}

/** 由扩展名反推 MIME；未知返回 null，由调用方决定兜底值。 */
export function mimeFromFilename(name: string): string | null {
  const extension = extensionFromName(name);
  return extension ? (EXTENSION_TO_MIME[extension] ?? null) : null;
}

/**
 * 存储键的扩展名：优先用真实文件名的，缺失时退回 MIME 推导。
 * 原实现只在 persistVideo 里做 MIME 兜底，于是空类型 + 无扩展名的视频会存成没有扩展名的键。
 */
export function extensionForUpload(name: string, mime: string): string {
  return extensionFromName(name) || extensionForMime(mime);
}

export type ResolvedMedia = {
  kind: MediaKind;
  mimeType: string;
  /** 判定依据，同时是将来加 'sniffed' 的扩展位。 */
  source: 'declared' | 'extension';
};

/**
 * 产出 mediaType 与 mimeType 的唯一地方。
 *
 * 顺序与理由：浏览器声明的 type 优先于扩展名，因为对象存储的 contentType、缩略图分支
 * 与前端渲染都跟着它走，一个说谎的扩展名（vacation.jpg 实为 PNG）不该盖掉诚实的声明。
 * 声明可伪造，但图片路径有 sharp 兜底验证（persistImage 遇到非图片字节会抛），
 * 且两种媒体都在同一个 uploads/ 前缀下，所以谎报既不会漏删对象也不会跨域。
 * application/octet-stream 不算诚实的声明，会继续退回扩展名判定。
 */
export function resolveUploadMedia(input: { name: string; declaredType: string }): ResolvedMedia {
  const declared = (input.declaredType ?? '').trim().toLowerCase();

  const declaredKind = kindForMime(declared);
  if (declaredKind) {
    return { kind: declaredKind, mimeType: declared, source: 'declared' };
  }

  const fromName = mimeFromFilename(input.name ?? '');
  if (fromName) {
    const nameKind = kindForMime(fromName);
    if (nameKind) {
      return { kind: nameKind, mimeType: fromName, source: 'extension' };
    }
  }

  throw new AmbiguousMediaError(input.name ?? '');
}
