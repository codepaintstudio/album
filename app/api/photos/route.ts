import { getViewer } from '@/lib/access';
import { categoryWhereFor } from '@/lib/access-rules';
import {
  cleanupErrorResponse,
  deleteAssetsThenRows,
  reportSkippedNames,
} from '@/lib/asset-cleanup';
import { planPhotoUnits } from '@/lib/asset-deletion';
import { requireAuth } from '@/lib/auth-guards';
import { prisma } from '@/lib/db';
import {
  ConfigurationError,
  getOriginalBuffer,
  getPublicObjectUrl,
  getPublicThumbnailUrl,
  isNotFoundError,
} from '@/lib/storage';
import { idSchema, idStringSchema } from '@/lib/validation';
import JSZip from 'jszip';
import { NextResponse } from 'next/server';
import { z } from 'zod';

type PhotoWithRelations = {
  id: number;
  filename: string;
  originalName: string;
  description: string | null;
  createdAt: Date;
  mediaType: 'image' | 'video';
  mimeType: string;
  uploader: { username: string };
  category: { name: string };
};

type PhotoForDeletion = {
  id: number;
  filename: string;
  uploaderId: number;
  mediaType: 'image' | 'video';
};

const idArraySchema = z.array(idSchema).min(1);

const deleteSchema = z.object({
  ids: idArraySchema,
});

const downloadSchema = z.object({
  ids: idArraySchema,
});

const renameSchema = z.object({
  id: idSchema,
  description: z
    .string()
    .max(300)
    .transform(value => value.trim())
    .optional(),
});

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const categoryIdParam = searchParams.get('categoryId');
  const pageParam = searchParams.get('page') ?? '1';
  const pageSizeParam = searchParams.get('pageSize') ?? '24';

  const page = Math.max(Number.parseInt(pageParam, 10) || 1, 1);
  const pageSize = Math.min(Math.max(Number.parseInt(pageSizeParam, 10) || 24, 1), 96);

  const parsedCategoryId =
    categoryIdParam === null ? undefined : idStringSchema.safeParse(categoryIdParam);
  if (parsedCategoryId && !parsedCategoryId.success) {
    return NextResponse.json({ error: '分类 ID 错误' }, { status: 400 });
  }
  const viewer = await getViewer();
  const where = {
    ...(parsedCategoryId?.success ? { categoryId: parsedCategoryId.data } : {}),
    category: categoryWhereFor(viewer),
  };

  const photos = (await prisma.photo.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    skip: (page - 1) * pageSize,
    take: pageSize,
    include: {
      uploader: {
        select: { username: true },
      },
      category: {
        select: { name: true },
      },
    },
  })) as PhotoWithRelations[];

  const total = await prisma.photo.count({ where });

  try {
    return NextResponse.json({
      data: photos.map(photo => ({
        id: photo.id,
        filename: photo.filename,
        originalName: photo.originalName,
        description: photo.description,
        createdAt: photo.createdAt,
        uploader: photo.uploader.username,
        category: photo.category.name,
        mediaType: photo.mediaType,
        mimeType: photo.mimeType,
        fileUrl: getPublicObjectUrl(photo.filename),
        thumbnailUrl: photo.mediaType === 'image' ? getPublicThumbnailUrl(photo.filename) : null,
      })),
      meta: {
        page,
        pageSize,
        total,
      },
    });
  } catch (error) {
    if (error instanceof ConfigurationError) {
      console.error(error);
      return NextResponse.json({ error: '对象存储配置错误' }, { status: 500 });
    }
    throw error;
  }
}

export async function POST(request: Request) {
  const authCheck = await requireAuth();
  if (!authCheck.ok) return authCheck.error;

  const body = await request.json().catch(() => null);
  const parsed = downloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  // 打包下载同样受可见性约束：否则只要猜到 id，就能取到无权浏览的相册原图
  const photos = await prisma.photo.findMany({
    where: { id: { in: parsed.data.ids }, category: categoryWhereFor(authCheck.viewer) },
    select: {
      id: true,
      filename: true,
      originalName: true,
    },
  });

  if (photos.length === 0) {
    return NextResponse.json({ error: '媒体不存在' }, { status: 404 });
  }

  const zip = new JSZip();
  let addedCount = 0;

  try {
    for (const photo of photos) {
      try {
        const fileBuffer = await getOriginalBuffer(photo.filename);
        const name = photo.originalName || photo.filename;
        zip.file(name, fileBuffer);
        addedCount += 1;
      } catch (error) {
        if (isNotFoundError(error)) {
          continue;
        }
        throw error;
      }
    }
  } catch (error) {
    if (error instanceof ConfigurationError) {
      console.error(error);
      return NextResponse.json({ error: '对象存储配置错误' }, { status: 500 });
    }
    throw error;
  }

  if (addedCount === 0) {
    return NextResponse.json({ error: '媒体文件不存在' }, { status: 404 });
  }

  const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
  const zipArrayBuffer = new ArrayBuffer(zipBuffer.byteLength);
  const zipView = new Uint8Array(zipArrayBuffer);
  zipView.set(new Uint8Array(zipBuffer.buffer, zipBuffer.byteOffset, zipBuffer.byteLength));

  const response = new Response(zipArrayBuffer, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename=photos-${Date.now()}.zip`,
    },
  });

  return response;
}

export async function DELETE(request: Request) {
  const authCheck = await requireAuth();
  if (!authCheck.ok) return authCheck.error;

  const body = await request.json().catch(() => null);
  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const targetPhotos = (await prisma.photo.findMany({
    where: { id: { in: parsed.data.ids } },
    select: { id: true, filename: true, uploaderId: true, mediaType: true },
  })) as PhotoForDeletion[];

  if (targetPhotos.length === 0) {
    return NextResponse.json({ deleted: 0 }, { status: 200 });
  }

  const requesterId = authCheck.viewer.id;
  const isAdmin = authCheck.viewer.role === 'admin';
  const unauthorized = targetPhotos.filter(photo => photo.uploaderId !== requesterId && !isAdmin);
  if (unauthorized.length > 0) {
    return NextResponse.json({ error: '仅可操作自己上传的照片' }, { status: 403 });
  }

  const plan = planPhotoUnits(targetPhotos);
  reportSkippedNames('DELETE /api/photos', plan.skipped);

  // 对象先、行后：反过来时行一旦没了，filename 就再也找不到，泄漏不可追溯。
  // 泛型显式写出：本环境的 Prisma 客户端是手写声明，不写就会退化成 unknown，
  // 而这个 .count 恰恰是"到底删了几行"的真话来源。
  const outcome = await deleteAssetsThenRows<{ count: number }>(plan.units, () =>
    prisma.photo.deleteMany({ where: { id: { in: targetPhotos.map(photo => photo.id) } } })
  );

  if (!outcome.ok) return cleanupErrorResponse(outcome);

  return NextResponse.json({ deleted: outcome.result.count });
}

export async function PATCH(request: Request) {
  const authCheck = await requireAuth();
  if (!authCheck.ok) return authCheck.error;

  const body = await request.json().catch(() => null);
  const parsed = renameSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const photo = await prisma.photo.findUnique({
    where: { id: parsed.data.id },
    select: { id: true, uploaderId: true },
  });

  if (!photo) {
    return NextResponse.json({ error: '媒体不存在' }, { status: 404 });
  }

  const { viewer } = authCheck;
  if (viewer.role !== 'admin' && photo.uploaderId !== viewer.id) {
    return NextResponse.json({ error: '仅可操作自己上传的照片' }, { status: 403 });
  }

  const updated = await prisma.photo.update({
    where: { id: parsed.data.id },
    data: {
      description:
        parsed.data.description && parsed.data.description.length > 0
          ? parsed.data.description
          : null,
    },
    select: {
      id: true,
      filename: true,
      originalName: true,
      description: true,
      createdAt: true,
      uploader: { select: { username: true } },
      category: { select: { name: true } },
    },
  });

  return NextResponse.json({
    id: updated.id,
    filename: updated.filename,
    originalName: updated.originalName,
    description: updated.description,
    createdAt: updated.createdAt,
    uploader: updated.uploader.username,
    category: updated.category.name,
  });
}
