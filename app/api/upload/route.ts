import { canUploadToCategory } from '@/lib/access-rules';
import { requireAuth } from '@/lib/auth-guards';
import { prisma } from '@/lib/db';
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
  if ('error' in authCheck) {
    return authCheck.error;
  }

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
    const isImage = file.type.startsWith('image/');
    const mimeType = file.type || (isImage ? 'image/jpeg' : 'video/mp4');
    const { filename, originalName } = isImage
      ? await persistImage(file)
      : await persistVideo(file);

    const photo = await prisma.photo.create({
      data: {
        filename,
        originalName,
        description: parsed.data.description,
        categoryId: parsed.data.categoryId,
        uploaderId,
        mediaType: isImage ? 'image' : 'video',
        mimeType,
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
