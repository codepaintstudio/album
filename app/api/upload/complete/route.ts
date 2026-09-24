import { canUploadToCategory } from '@/lib/access-rules';
import { requireAuth } from '@/lib/auth-guards';
import { prisma } from '@/lib/db';
import {
  ConfigurationError,
  UploadError,
  createImageThumbnail,
  getPublicObjectUrl,
  getPublicThumbnailUrl,
  getUploadObjectBuffer,
  inspectUploadObject,
} from '@/lib/storage';
import { validateUploadObjectMetadata } from '@/lib/upload-intent-validation';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const schema = z.object({ intentId: z.string().uuid() });

function photoResponse(photo: {
  id: number;
  filename: string;
  originalName: string;
  description: string | null;
  categoryId: number;
  createdAt: Date;
  mediaType: 'image' | 'video';
  mimeType: string;
  uploader: { username: string };
}) {
  return {
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
  };
}

export async function POST(request: Request) {
  const authCheck = await requireAuth();
  if (!authCheck.ok) return authCheck.error;
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ error: '请求格式无效' }, { status: 400 });
  }
  const parsed = schema.safeParse(input);
  if (!parsed.success) return NextResponse.json({ error: '上传凭证无效' }, { status: 400 });

  const intent = await prisma.uploadIntent.findUnique({
    where: { id: parsed.data.intentId },
    include: { photo: { include: { uploader: { select: { username: true } } } } },
  });
  if (!intent || intent.uploaderId !== authCheck.viewer.id) {
    return NextResponse.json({ error: '上传凭证不存在' }, { status: 404 });
  }
  if (intent.expiresAt <= new Date()) {
    return NextResponse.json({ error: '上传凭证已过期' }, { status: 410 });
  }

  const category = await prisma.category.findUnique({
    where: { id: intent.categoryId },
    select: { id: true, visibility: true },
  });
  if (!category) return NextResponse.json({ error: '分类不存在' }, { status: 404 });
  if (!canUploadToCategory(authCheck.viewer, category)) {
    return NextResponse.json({ error: '无权在该分类上传' }, { status: 403 });
  }

  if (intent.completedAt) {
    return intent.photo
      ? NextResponse.json(photoResponse(intent.photo))
      : NextResponse.json({ error: '上传凭证已完成但媒体记录不可用' }, { status: 410 });
  }

  try {
    const object = await inspectUploadObject(intent.storageKey);
    const metadataIssue = validateUploadObjectMetadata(
      { mediaType: intent.mediaType, mimeType: intent.mimeType, size: intent.expectedSize },
      object
    );
    if (metadataIssue === 'size_mismatch') {
      return NextResponse.json({ error: '上传文件大小与凭证不符' }, { status: 400 });
    }
    if (metadataIssue === 'mime_mismatch') {
      return NextResponse.json({ error: '上传文件类型与凭证不符' }, { status: 400 });
    }

    if (intent.mediaType === 'image') {
      if (!intent.thumbnailKey) throw new Error('图片上传意图缺少缩略图对象键');
      const buffer = await getUploadObjectBuffer(intent.storageKey);
      await createImageThumbnail(intent.thumbnailKey, buffer);
    }

    try {
      const photo = await prisma.$transaction(async (tx: typeof prisma) => {
        const created = await tx.photo.create({
          data: {
            filename: intent.storageKey.slice(intent.storageKey.lastIndexOf('/') + 1),
            originalName: intent.originalName,
            description: intent.description,
            categoryId: intent.categoryId,
            uploaderId: intent.uploaderId,
            mediaType: intent.mediaType,
            mimeType: intent.mimeType,
            uploadIntentId: intent.id,
          },
          include: { uploader: { select: { username: true } } },
        });
        await tx.uploadIntent.update({
          where: { id: intent.id },
          data: { completedAt: new Date() },
        });
        return created;
      });
      return NextResponse.json(photoResponse(photo));
    } catch (error) {
      // The unique Photo.uploadIntentId constraint is the atomic idempotency claim.
      const winner = await prisma.photo.findUnique({
        where: { uploadIntentId: intent.id },
        include: { uploader: { select: { username: true } } },
      });
      if (winner) return NextResponse.json(photoResponse(winner));
      throw error;
    }
  } catch (error) {
    if (error instanceof UploadError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    if (error instanceof ConfigurationError) {
      console.error(error);
      return NextResponse.json({ error: '对象存储配置错误' }, { status: 500 });
    }
    console.error('[upload complete] Failed to complete upload', error);
    return NextResponse.json({ error: '上传处理失败，可重试' }, { status: 500 });
  }
}
