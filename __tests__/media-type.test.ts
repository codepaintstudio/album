import {
  ALLOWED_IMAGE_MIME,
  ALLOWED_VIDEO_MIME,
  AmbiguousMediaError,
  MEDIA_KINDS,
  type MediaKind,
  extensionForMime,
  extensionForUpload,
  kindForMime,
  mimeFromFilename,
  resolveUploadMedia,
} from '@/lib/media-type';
import { describe, expect, it } from 'vitest';

type MediaCase = {
  declaredType: string;
  name: string;
  kind?: MediaKind;
  mimeType?: string;
  source?: 'declared' | 'extension';
  rejects?: boolean;
  why: string;
};

const CASES: MediaCase[] = [
  {
    declaredType: 'image/png',
    name: 'a.png',
    kind: 'image',
    mimeType: 'image/png',
    source: 'declared',
    why: '声明可用时直接采信',
  },
  {
    declaredType: '',
    name: 'a.jpg',
    kind: 'image',
    mimeType: 'image/jpeg',
    source: 'extension',
    why: '缺陷 G：空 type 的真图片在旧实现里掉进 persistVideo 的视频白名单，被以「仅支持 MP4 / WebM / MOV 视频」误拒',
  },
  {
    declaredType: '',
    name: 'a.mp4',
    kind: 'video',
    mimeType: 'video/mp4',
    source: 'extension',
    why: '空 type 的视频靠扩展名回到视频路径',
  },
  {
    declaredType: '',
    name: 'a.MOV',
    kind: 'video',
    mimeType: 'video/quicktime',
    source: 'extension',
    why: '扩展名判定不分大小写',
  },
  {
    declaredType: 'application/octet-stream',
    name: 'a.webp',
    kind: 'image',
    mimeType: 'image/webp',
    source: 'extension',
    why: 'octet-stream 不算诚实的声明，继续退回扩展名',
  },
  {
    declaredType: 'video/mp4',
    name: 'a.jpg',
    kind: 'video',
    mimeType: 'video/mp4',
    source: 'declared',
    why: '说谎的扩展名不盖掉诚实的声明：contentType、缩略图分支与前端渲染都跟着声明走',
  },
  {
    declaredType: 'text/plain',
    name: 'evil.jpg',
    kind: 'image',
    mimeType: 'image/jpeg',
    source: 'extension',
    why: '声明不在白名单时退回扩展名，真正的字节由 sharp 在 persistImage 里验证',
  },
  {
    declaredType: 'video/webm',
    name: 'x',
    kind: 'video',
    mimeType: 'video/webm',
    source: 'declared',
    why: '无文件名时声明仍然够用',
  },
  {
    declaredType: 'image/heic',
    name: 'a.heic',
    rejects: true,
    why: '白名单外的声明与未知扩展名都不放行',
  },
  {
    declaredType: 'image/svg+xml',
    name: 'a.svg',
    rejects: true,
    why: 'svg 刻意不在表里：sharp 处理它会失败',
  },
  {
    declaredType: '',
    name: 'noext',
    rejects: true,
    why: '既无声明又无可用扩展名 ⇒ 宁可 400 也不猜',
  },
  {
    declaredType: '',
    name: '',
    rejects: true,
    why: '空文件名同样拒绝',
  },
  {
    declaredType: 'application/pdf',
    name: 'a.pdf',
    rejects: true,
    why: 'pdf 属于云盘域，相册只收图片与视频',
  },
];

const ACCEPTED = CASES.filter(testCase => !testCase.rejects);
const REFUSED = CASES.filter(testCase => testCase.rejects);

describe('resolveUploadMedia 判定矩阵', () => {
  for (const testCase of ACCEPTED) {
    it(`declaredType='${testCase.declaredType}' name='${testCase.name}' ⇒ ${testCase.kind}/${testCase.mimeType} via ${testCase.source}（${testCase.why}）`, () => {
      expect(
        resolveUploadMedia({ name: testCase.name, declaredType: testCase.declaredType })
      ).toEqual({
        kind: testCase.kind,
        mimeType: testCase.mimeType,
        source: testCase.source,
      });
    });
  }

  for (const testCase of REFUSED) {
    it(`declaredType='${testCase.declaredType}' name='${testCase.name}' ⇒ 抛 AmbiguousMediaError（${testCase.why}）`, () => {
      expect(() =>
        resolveUploadMedia({ name: testCase.name, declaredType: testCase.declaredType })
      ).toThrow(AmbiguousMediaError);
    });
  }
});

describe('mediaType 与 mimeType 永不互斥（两者由同一次调用同时产出）', () => {
  for (const testCase of ACCEPTED) {
    it(`${testCase.declaredType || '（空声明）'} + ${testCase.name || '（空文件名）'} ⇒ kind 跟着 mimeType 走`, () => {
      const media = resolveUploadMedia({
        name: testCase.name,
        declaredType: testCase.declaredType,
      });
      expect(media.kind).toBe(media.mimeType.startsWith('image/') ? 'image' : 'video');
    });
  }

  it('拒绝时不返回半成品，因此调用方无从写入矛盾的两列', () => {
    for (const testCase of REFUSED) {
      expect(() =>
        resolveUploadMedia({ name: testCase.name, declaredType: testCase.declaredType })
      ).toThrow();
    }
  });
});

describe('两张白名单', () => {
  it('图片与视频白名单无交集', () => {
    for (const mime of ALLOWED_IMAGE_MIME) {
      expect(ALLOWED_VIDEO_MIME.has(mime)).toBe(false);
    }
  });

  it('每个允许的 mime 都能反推出扩展名，否则键名没有扩展名、读时按扩展名认类型就永远失败', () => {
    for (const mime of [...ALLOWED_IMAGE_MIME, ...ALLOWED_VIDEO_MIME]) {
      expect(kindForMime(mime)).not.toBeNull();
      expect(extensionForMime(mime)).not.toBe('');
    }
  });

  it('反推出来的扩展名再正推回同一个 mime（两张表不能各自漂移）', () => {
    for (const mime of [...ALLOWED_IMAGE_MIME, ...ALLOWED_VIDEO_MIME]) {
      expect(mimeFromFilename(`x${extensionForMime(mime)}`)).toBe(mime);
    }
  });

  it('白名单里的 mime 全部是 image/ 或 video/ 前缀', () => {
    for (const mime of [...ALLOWED_IMAGE_MIME, ...ALLOWED_VIDEO_MIME]) {
      expect(mime.startsWith('image/') || mime.startsWith('video/')).toBe(true);
    }
  });
});

describe('mimeFromFilename（原先这张表里一个视频条目都没有）', () => {
  it('视频扩展名能被反推', () => {
    expect(mimeFromFilename('a.mp4')).toBe('video/mp4');
    expect(mimeFromFilename('a.webm')).toBe('video/webm');
    expect(mimeFromFilename('a.MOV')).toBe('video/quicktime');
  });

  it('云盘类型保持可反推，preview-proxy 的读时兜底不退化', () => {
    expect(mimeFromFilename('a.pdf')).toBe('application/pdf');
    expect(mimeFromFilename('a.md')).toBe('text/markdown');
    expect(mimeFromFilename('a.txt')).toBe('text/plain');
  });

  it('未知与无扩展名返回 null，由调用方决定兜底值', () => {
    expect(mimeFromFilename('a.xyz')).toBeNull();
    expect(mimeFromFilename('noext')).toBeNull();
    expect(mimeFromFilename('')).toBeNull();
  });
});

describe('extensionForUpload（键名扩展名的唯一来源）', () => {
  it('文件名里的扩展名优先，不被 MIME 推导覆盖', () => {
    expect(extensionForUpload('holiday.jpeg', 'image/jpeg')).toBe('.jpeg');
  });

  it('文件名没有扩展名时退回 MIME 推导，而不是存成无扩展名的键', () => {
    expect(extensionForUpload('noext', 'video/quicktime')).toBe('.mov');
  });

  it('两头都拿不到时返回空串，调用方仍能得到一个唯一键', () => {
    expect(extensionForUpload('noext', 'application/pdf')).toBe('');
  });

  it('产出的扩展名总是带点且小写', () => {
    for (const mime of [...ALLOWED_IMAGE_MIME, ...ALLOWED_VIDEO_MIME]) {
      const extension = extensionForUpload('noext', mime);
      expect(extension.startsWith('.')).toBe(true);
      expect(extension).toBe(extension.toLowerCase());
    }
  });
});

describe('kindForMime / MEDIA_KINDS', () => {
  it('相册域之外的 mime 返回 null', () => {
    expect(kindForMime('application/octet-stream')).toBeNull();
    expect(kindForMime('')).toBeNull();
  });

  it('联合只有 image 与 video，与 Prisma 的 MediaType 枚举同形', () => {
    expect([...MEDIA_KINDS].sort()).toEqual(['image', 'video']);
  });
});
