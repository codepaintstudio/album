import {
  USER_ASSET_COUNT_SELECT,
  type UserAssetCounts,
  planUserDelete,
} from '@/lib/asset-deletion';
import { requireAdmin } from '@/lib/auth-guards';
import { prisma } from '@/lib/db';
import { prismaErrorResponse } from '@/lib/prisma-errors';
import { idSchema, optionalIdSchema } from '@/lib/validation';
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
  id: idSchema,
  photoDecision: z.enum(['transfer', 'delete']).optional(),
  driveDecision: z.enum(['transfer', 'delete']).optional(),
  transferToUserId: optionalIdSchema,
});

export async function GET(request: Request) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.ok) return adminCheck.error;

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
    if (!adminCheck.ok) {
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
  if (!adminCheck.ok) return adminCheck.error;

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
  if (!adminCheck.ok) return adminCheck.error;

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
  if (!adminCheck.ok) return adminCheck.error;

  const body = await request.json().catch(() => null);
  const parsed = deleteUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: '请求参数错误' }, { status: 400 });
  }

  const { id, photoDecision, driveDecision, transferToUserId } = parsed.data;

  const userToDelete = (await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      role: true,
      _count: { select: { ...USER_ASSET_COUNT_SELECT } },
    },
  })) as { id: number; role: string; _count: UserAssetCounts } | null;

  if (!userToDelete) {
    return NextResponse.json({ error: '用户不存在' }, { status: 404 });
  }

  const adminCount = (await prisma.user.count({ where: { role: 'admin' } })) as number;

  const receiver = transferToUserId
    ? ((await prisma.user.findUnique({
        where: { id: transferToUserId },
        select: { id: true, status: true },
      })) as { id: number; status: string } | null)
    : null;

  const plan = planUserDelete({
    photoCount: userToDelete._count.photos,
    fileCount: userToDelete._count.filesUploaded,
    fileSetCount: userToDelete._count.fileSetsCreated,
    photoDecision,
    driveDecision,
    transferToUserId,
    targetUserId: id,
    isSelf: adminCheck.viewer.id === id,
    isTargetAdmin: userToDelete.role === 'admin',
    adminCount,
    transferTargetExists: receiver !== null,
    transferTargetActive: receiver?.status === 'active',
  });

  if (!plan.ok) {
    return NextResponse.json(
      { error: plan.errors.join('；'), errors: plan.errors, code: 'invalid_deletion_request' },
      { status: 400 }
    );
  }

  const receiverId = plan.transferToUserId;

  try {
    // 三个会 Restrict 的关系全部改指向，P2003 才由构造不可达。
    //
    // File 不区分它所在文件集归谁、一律跟着转移：uploaderId 除了"谁上传的"还兼着
    // "谁能改/删这个文件"（app/api/files/[id]/route.ts:95,157）。把它留在一个已经
    // 不存在的行上，那些文件就永远只能由管理员处置——一个没人选择过的状态。
    //
    // 这一步不删任何对象：用户删除只转移资产、不销毁资产，所以这条路径上不存在
    // "删了行没删对象"的泄漏（issue #15 / #5 Bug 3 报的那条由构造消失）。
    if (receiverId !== undefined) {
      await prisma.photo.updateMany({
        where: { uploaderId: id },
        data: { uploaderId: receiverId },
      });
      await prisma.file.updateMany({ where: { uploaderId: id }, data: { uploaderId: receiverId } });
      await prisma.fileSet.updateMany({
        where: { createdBy: id },
        data: { createdBy: receiverId },
      });
    }

    await prisma.user.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    // 枚举与写入之间用户又上传了的话，这里会拿到 P2003 → 409，重试即收敛。
    // 不再额外做一次 count 复查：那只是把同一个竞态窗口挪近一点，并不会关掉它。
    return prismaErrorResponse(error);
  }
}
