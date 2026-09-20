import { requireAdmin } from '@/lib/auth-guards';
import { prisma } from '@/lib/db';
import { prismaErrorResponse } from '@/lib/prisma-errors';
import { idSchema } from '@/lib/validation';
import type { Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { NextResponse } from 'next/server';
import { z } from 'zod';

type UserWithCount = {
  id: number;
  username: string;
  role: 'admin' | 'member';
  status: 'pending' | 'active' | 'rejected';
  createdAt: Date;
  _count: { photos: number };
};

const createUserSchema = z.object({
  username: z.string().min(3, '用户名至少 3 位'),
  password: z.string().min(6, '密码至少 6 位'),
  role: z.enum(['admin', 'member']).optional(),
});

const updateRoleSchema = z.object({
  id: idSchema,
  role: z.enum(['admin', 'member']),
});

const updateStatusSchema = z.object({
  id: idSchema,
  status: z.enum(['pending', 'active', 'rejected']),
});

const deleteUserSchema = z.object({
  id: z.number().int(),
  transferToUserId: z.number().int().optional(),
  deletePhotos: z.boolean().optional(),
});

export async function GET(request: Request) {
  const adminCheck = await requireAdmin();
  if ('error' in adminCheck) return adminCheck.error;

  const { searchParams } = new URL(request.url);
  const pageParam = searchParams.get('page') ?? '1';
  const pageSizeParam = searchParams.get('pageSize') ?? '20';
  const q = (searchParams.get('q') ?? '').trim();
  const roleParam = (searchParams.get('role') ?? '').trim();
  const statusParam = (searchParams.get('status') ?? '').trim();

  const page = Math.max(Number.parseInt(pageParam, 10) || 1, 1);
  const pageSize = Math.min(Math.max(Number.parseInt(pageSizeParam, 10) || 20, 1), 100);

  const where: Prisma.UserWhereInput = {
    ...(q ? { username: { contains: q } } : {}),
    ...(roleParam === 'admin' || roleParam === 'member'
      ? { role: roleParam as 'admin' | 'member' }
      : {}),
    ...(statusParam === 'pending' || statusParam === 'active' || statusParam === 'rejected'
      ? { status: statusParam as 'pending' | 'active' | 'rejected' }
      : {}),
  };

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        username: true,
        role: true,
        status: true,
        createdAt: true,
        _count: {
          select: { photos: true },
        },
      },
    }) as Promise<UserWithCount[]>,
    prisma.user.count({ where }),
  ]);

  return NextResponse.json({
    data: users.map(user => ({
      id: user.id,
      username: user.username,
      role: user.role,
      status: user.status,
      createdAt: user.createdAt,
      photoCount: user._count.photos,
    })),
    meta: { page, pageSize, total },
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = createUserSchema.safeParse(body);
  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors;
    const errorMessage = Object.values(errors).flat()[0] || '请求参数错误';
    return NextResponse.json({ error: errorMessage }, { status: 400 });
  }

  const totalUsers = await prisma.user.count();
  let role = parsed.data.role ?? 'member';
  let status: 'pending' | 'active' = 'pending';

  if (totalUsers === 0) {
    role = 'admin';
    status = 'active';
  } else if (parsed.data.role && parsed.data.role !== 'member') {
    const adminCheck = await requireAdmin();
    if ('error' in adminCheck) {
      return adminCheck.error;
    }
    status = 'active';
  }

  const existing = await prisma.user.findUnique({ where: { username: parsed.data.username } });
  if (existing) {
    return NextResponse.json({ error: '用户名已存在' }, { status: 409 });
  }

  const hashed = await bcrypt.hash(parsed.data.password, 10);

  const user = await prisma.user.create({
    data: {
      username: parsed.data.username,
      password: hashed,
      role,
      status,
    },
    select: {
      id: true,
      username: true,
      role: true,
      status: true,
      createdAt: true,
    },
  });

  return NextResponse.json(user, { status: 201 });
}

export async function PUT(request: Request) {
  const adminCheck = await requireAdmin();
  if ('error' in adminCheck) return adminCheck.error;

  const body = await request.json().catch(() => null);
  const parsed = updateRoleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: '请求参数错误' }, { status: 400 });
  }

  try {
    const user = await prisma.user.update({
      where: { id: parsed.data.id },
      data: { role: parsed.data.role },
      select: {
        id: true,
        username: true,
        role: true,
        createdAt: true,
      },
    });

    return NextResponse.json(user);
  } catch (error) {
    return prismaErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  const adminCheck = await requireAdmin();
  if ('error' in adminCheck) return adminCheck.error;

  const body = await request.json().catch(() => null);
  const parsed = updateStatusSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: '请求参数错误' }, { status: 400 });
  }

  try {
    const user = await prisma.user.update({
      where: { id: parsed.data.id },
      data: { status: parsed.data.status },
      select: {
        id: true,
        username: true,
        role: true,
        status: true,
        createdAt: true,
      },
    });

    return NextResponse.json(user);
  } catch (error) {
    return prismaErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  const adminCheck = await requireAdmin();
  if ('error' in adminCheck) return adminCheck.error;

  const body = await request.json().catch(() => null);
  const parsed = deleteUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: '请求参数错误' }, { status: 400 });
  }

  const { id, transferToUserId, deletePhotos } = parsed.data;

  // 检查要删除的用户是否存在
  const userToDelete = await prisma.user.findUnique({
    where: { id },
    include: { _count: { select: { photos: true } } },
  });

  if (!userToDelete) {
    return NextResponse.json({ error: '用户不存在' }, { status: 404 });
  }

  // 如果有照片需要处理
  if (userToDelete._count.photos > 0) {
    if (deletePhotos) {
      // 删除该用户的所有照片
      await prisma.photo.deleteMany({
        where: { uploaderId: id },
      });
    } else if (transferToUserId) {
      // 转移到指定用户
      const targetUser = await prisma.user.findUnique({
        where: { id: transferToUserId },
      });

      if (!targetUser) {
        return NextResponse.json({ error: '目标用户不存在' }, { status: 404 });
      }

      await prisma.photo.updateMany({
        where: { uploaderId: id },
        data: { uploaderId: transferToUserId },
      });
    } else {
      return NextResponse.json(
        { error: '用户有照片，请选择转移到其他用户或直接删除' },
        { status: 400 }
      );
    }
  }

  // 删除用户
  await prisma.user.delete({
    where: { id },
  });

  return NextResponse.json({ success: true });
}
