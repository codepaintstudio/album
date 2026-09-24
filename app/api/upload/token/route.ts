import { canUploadToCategory } from '@/lib/access-rules';
import { requireAuth } from '@/lib/auth-guards';
import { prisma } from '@/lib/db';
import { AmbiguousMediaError, resolveUploadMedia } from '@/lib/media-type';
import {
  createUploadFilename,
  getPresignedPhotoPutUrl,
  uploadStorageKey,
  uploadThumbnailStorageKey,
} from '@/lib/storage';
import { idSchema } from '@/lib/validation';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const MAX_VIDEO_SIZE = 512 * 1024 * 1024;
const tokenSchema = z.object({
  categoryId: idSchema,
  name: z.string().min(1).max(255),
  description: z.string().max(300).optional(),
  mimeType: z.string().max(100),
  size: z.number().int().positive(),
});
const PRESIGNED_URL_TTL_SECONDS = 15 * 60;
// Keep an extra minute so cleanup cannot remove an intent while its signed PUT is still valid.
const INTENT_TTL_MS = (PRESIGNED_URL_TTL_SECONDS + 60) * 1000;

export async function POST(request: Request) {
  const authCheck = await requireAuth();
  if (!authCheck.ok) return authCheck.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '请求格式无效' }, { status: 400 });
  }
  const parsed = tokenSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  let media;
  try {
    media = resolveUploadMedia({ name: parsed.data.name, declaredType: parsed.data.mimeType });
  } catch (error) {
    if (error instanceof AmbiguousMediaError) {
      return NextResponse.json(
        { error: error.message, code: 'ambiguous_media_type' },
        { status: 400 }
      );
    }
    throw error;
  }
  const limit = media.kind === 'image' ? MAX_IMAGE_SIZE : MAX_VIDEO_SIZE;
  if (parsed.data.size > limit) {
    return NextResponse.json(
      { error: `文件大小超出限制 (${Math.floor(limit / 1024 / 1024)}MB)` },
      { status: 400 }
    );
  }

  const category = await prisma.category.findUnique({
    where: { id: parsed.data.categoryId },
    select: { id: true, visibility: true },
  });
  if (!category) return NextResponse.json({ error: '分类不存在' }, { status: 404 });
  if (!canUploadToCategory(authCheck.viewer, category)) {
    return NextResponse.json({ error: '无权在该分类上传' }, { status: 403 });
  }

  const filename = createUploadFilename(parsed.data.name, media.mimeType);
  const storageKey = uploadStorageKey(filename);
  const thumbnailKey = media.kind === 'image' ? uploadThumbnailStorageKey(filename) : null;
  const expiresAt = new Date(Date.now() + INTENT_TTL_MS);
  try {
    const uploadUrl = await getPresignedPhotoPutUrl(
      storageKey,
      media.mimeType,
      PRESIGNED_URL_TTL_SECONDS
    );
    const intent = await prisma.uploadIntent.create({
      data: {
        storageKey,
        thumbnailKey,
        uploaderId: authCheck.viewer.id,
        categoryId: category.id,
        originalName: parsed.data.name,
        description: parsed.data.description,
        mimeType: media.mimeType,
        mediaType: media.kind,
        expectedSize: parsed.data.size,
        expiresAt,
      },
      select: { id: true },
    });
    return NextResponse.json({
      intentId: intent.id,
      uploadUrl,
      storageKey,
      expiresAt,
      method: 'PUT',
      headers: { 'Content-Type': media.mimeType },
    });
  } catch (error) {
    console.error('[upload token] Failed to create upload intent', error);
    return NextResponse.json({ error: '无法创建上传凭证' }, { status: 500 });
  }
}
