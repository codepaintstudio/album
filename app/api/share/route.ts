import { requireAdmin } from '@/lib/auth-guards';
import { prisma } from '@/lib/db';
import { ConfigurationError, getPublicObjectUrl, getPublicThumbnailUrl } from '@/lib/storage';
import { idSchema } from '@/lib/validation';
import bcrypt from 'bcryptjs';
import { addHours, isAfter } from 'date-fns';
import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';

type SharedPhoto = {
  id: number;
  filename: string;
  originalName: string;
  description: string | null;
  createdAt: Date;
  mediaType: 'image' | 'video';
  mimeType: string;
  uploader: { username: string };
};

type ShareLinkWithCategory = {
  token: string;
  expiresAt: Date | null;
  password?: string | null;
  category: {
    id: number;
    name: string;
    description: string | null;
    photos: SharedPhoto[];
  };
};

const createShareSchema = z.object({
  categoryId: idSchema,
  password: z.string().min(4).max(50).optional(),
  expireInHours: z.number().int().positive().max(720).optional(),
});

const shareAccessSchema = z.object({
  token: z.string().min(8),
  password: z.string().optional(),
});

const deleteShareSchema = z.object({
  id: idSchema,
});

export async function POST(request: Request) {
  const adminCheck = await requireAdmin();
  if ('error' in adminCheck) return adminCheck.error;

  const body = await request.json().catch(() => null);
  const parsed = createShareSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const category = await prisma.category.findUnique({
    where: { id: parsed.data.categoryId },
  });

  if (!category) {
    return NextResponse.json({ error: '分类不存在' }, { status: 404 });
  }

  const token = uuidv4().replace(/-/g, '');
  const expiresAt = parsed.data.expireInHours
    ? addHours(new Date(), parsed.data.expireInHours)
    : null;

  const passwordHash = parsed.data.password ? await bcrypt.hash(parsed.data.password, 10) : null;

  const shareLink = await prisma.shareLink.create({
    data: {
      categoryId: parsed.data.categoryId,
      token,
      password: passwordHash,
      expiresAt,
    },
    select: {
      id: true,
      token: true,
      expiresAt: true,
      categoryId: true,
      createdAt: true,
    },
  });

  return NextResponse.json(shareLink, { status: 201 });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsed = shareAccessSchema.safeParse({
    token: searchParams.get('token'),
    password: searchParams.get('password') ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: '无效的分享链接' }, { status: 400 });
  }

  const shareLink = (await prisma.shareLink.findUnique({
    where: { token: parsed.data.token },
    include: {
      category: {
        select: {
          id: true,
          name: true,
          description: true,
          photos: {
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              filename: true,
              originalName: true,
              description: true,
              createdAt: true,
              mediaType: true,
              mimeType: true,
              uploader: {
                select: { username: true },
              },
            },
          },
        },
      },
    },
  })) as ShareLinkWithCategory | null;

  if (!shareLink) {
    return NextResponse.json({ error: '分享链接不存在' }, { status: 404 });
  }

  if (shareLink.expiresAt && isAfter(new Date(), shareLink.expiresAt)) {
    return NextResponse.json({ error: '分享链接已过期' }, { status: 410 });
  }

  if (shareLink.password) {
    if (!parsed.data.password) {
      return NextResponse.json({ error: '需要访问密码' }, { status: 401 });
    }
    const match = await bcrypt.compare(parsed.data.password, shareLink.password);
    if (!match) {
      return NextResponse.json({ error: '密码错误' }, { status: 401 });
    }
  }

  try {
    return NextResponse.json({
      token: shareLink.token,
      expiresAt: shareLink.expiresAt?.toISOString() ?? null,
      category: {
        id: shareLink.category.id,
        name: shareLink.category.name,
        description: shareLink.category.description,
        photos: shareLink.category.photos.map(photo => ({
          id: photo.id,
          filename: photo.filename,
          originalName: photo.originalName,
          description: photo.description,
          createdAt: photo.createdAt.toISOString(),
          uploader: photo.uploader.username,
          mediaType: photo.mediaType,
          mimeType: photo.mimeType,
          fileUrl: getPublicObjectUrl(photo.filename),
          thumbnailUrl: photo.mediaType === 'image' ? getPublicThumbnailUrl(photo.filename) : null,
        })),
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

export async function DELETE(request: Request) {
  const adminCheck = await requireAdmin();
  if ('error' in adminCheck) return adminCheck.error;

  const body = await request.json().catch(() => null);
  const parsed = deleteShareSchema.safeParse(body);

  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors;
    const errorMessage = Object.values(errors).flat()[0] || '请求参数错误';
    return NextResponse.json({ error: errorMessage }, { status: 400 });
  }

  const { id } = parsed.data;

  // 检查分享链接是否存在
  const shareLink = await prisma.shareLink.findUnique({
    where: { id },
  });

  if (!shareLink) {
    return NextResponse.json({ error: '分享链接不存在' }, { status: 404 });
  }

  // 删除分享链接
  await prisma.shareLink.delete({
    where: { id },
  });

  return NextResponse.json({ success: true });
}
