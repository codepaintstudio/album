import { canUploadToCategory } from '@/lib/access-rules';
import { requireAuth } from '@/lib/auth-guards';
import { prisma } from '@/lib/db';
import { AmbiguousMediaError, resolveUploadMedia } from '@/lib/media-type';
import {
  ConfigurationError,
  UploadError,
  getPublicObjectUrl,
  getPublicThumbnailUrl,
  persistImage,
  persistVideo,
} from '@/lib/storage';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const uploadSchema = z.object({
  categoryId: z.coerce.number().int().positive(),
  description: z.string().max(300).optional(),
});

export async function POST(request: Request) {
  const authCheck = await requireAuth();
  if (!authCheck.ok) return authCheck.error;

  const formData = await request.formData();
  const file = formData.get('file');

  if (!(file instanceof File)) {
    return NextResponse.json({ error: '缺少上传文件' }, { status: 400 });
  }

  const parsed = uploadSchema.safeParse({
    categoryId: formData.get('categoryId'),
    description: formData.get('description') || undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const category = await prisma.category.findUnique({
    where: { id: parsed.data.categoryId },
    select: { id: true, visibility: true },
  });
  if (!category) {
    return NextResponse.json({ error: '分类不存在' }, { status: 404 });
  }

  const { viewer } = authCheck;
  if (!canUploadToCategory(viewer, category)) {
    return NextResponse.json({ error: '无权在该分类上传' }, { status: 403 });
  }

  const uploaderId = viewer.id;

  try {
    // mediaType 与 mimeType 由同一个函数同源产出。旧写法分两处推导：
    // `file.type.startsWith('image/')` 决定 mediaType，`file.type || (isImage ? … : 'video/mp4')`
    // 决定 mimeType。空 type 时 isImage 为 false，于是真图片会掉进 persistVideo 的
    // 视频白名单，被以「仅支持 MP4 / WebM / MOV 视频」这个误导性的 400 拒掉。
    const media = resolveUploadMedia({ name: file.name, declaredType: file.type });
    const { filename, originalName } =
      media.kind === 'image'
        ? await persistImage(file, media.mimeType)
        : await persistVideo(file, media.mimeType);

    const photo = await prisma.photo.create({
      data: {
        filename,
        originalName,
        description: parsed.data.description,
        categoryId: parsed.data.categoryId,
        uploaderId,
        mediaType: media.kind,
        mimeType: media.mimeType,
      },
      include: {
        uploader: { select: { username: true } },
      },
    });

    return NextResponse.json({
      id: photo.id,
      filename: photo.filename,
      originalName: photo.originalName,
      description: photo.description,
      categoryId: photo.categoryId,
      uploader: photo.uploader.username,
      createdAt: photo.createdAt,
      mediaType: photo.mediaType,
      mimeType: photo.mimeType,
      fileUrl: getPublicObjectUrl(photo.filename),
      thumbnailUrl: photo.mediaType === 'image' ? getPublicThumbnailUrl(photo.filename) : null,
    });
  } catch (error) {
    if (error instanceof AmbiguousMediaError) {
      return NextResponse.json(
        { error: error.message, code: 'ambiguous_media_type' },
        { status: 400 }
      );
    }
    if (error instanceof UploadError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    if (error instanceof ConfigurationError) {
      console.error(error);
      return NextResponse.json({ error: '对象存储配置错误' }, { status: 500 });
    }
    console.error(error);
    return NextResponse.json({ error: '上传失败' }, { status: 500 });
  }
}
