import { canTouchFileSet } from '@/lib/access-rules';
import { requireAdmin, requireAuth } from '@/lib/auth-guards';
import { prisma } from '@/lib/db';
import { deleteFileAsset, getPublicFileUrl } from '@/lib/storage';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const updateSchema = z.object({
  description: z.string().max(500).optional(),
});

/**
 * GET /api/files/:id - Get file details
 */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: idStr } = await params;
    const id = Number(idStr);
    if (Number.isNaN(id)) return NextResponse.json({ message: 'ID 错误' }, { status: 400 });

    const authCheck = await requireAuth();
    if (!authCheck.ok) return authCheck.error;
    const { viewer } = authCheck;

    const file = await prisma.file.findUnique({
      where: { id },
      select: {
        id: true,
        filename: true,
        originalName: true,
        description: true,
        mimeType: true,
        size: true,
        filesetId: true,
        uploaderId: true,
        createdAt: true,
        updatedAt: true,
        fileSet: {
          select: { visibility: true, createdBy: true },
        },
      },
    });

    if (!file) return NextResponse.json({ message: '未找到' }, { status: 404 });

    if (!canTouchFileSet(viewer, file.fileSet)) {
      return NextResponse.json({ message: '无权限' }, { status: 403 });
    }

    return NextResponse.json({
      item: {
        id: file.id,
        filename: file.filename,
        originalName: file.originalName,
        description: file.description,
        mimeType: file.mimeType,
        size: file.size,
        filesetId: file.filesetId,
        uploaderId: file.uploaderId,
        createdAt: file.createdAt,
        updatedAt: file.updatedAt,
        url: getPublicFileUrl(file.filename),
      },
    });
  } catch (e: any) {
    console.error('[GET /api/files/:id]', e);
    if (e?.message === 'Unauthorized') {
      return NextResponse.json({ message: '未登录' }, { status: 401 });
    }
    return NextResponse.json({ message: '获取失败' }, { status: 500 });
  }
}

/**
 * PUT /api/files/:id - Update file description (uploader or admin only)
 */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: idStr } = await params;
    const id = Number(idStr);
    if (Number.isNaN(id)) return NextResponse.json({ message: 'ID 错误' }, { status: 400 });

    const authCheck = await requireAuth();
    if (!authCheck.ok) return authCheck.error;
    const { viewer } = authCheck;

    const file = await prisma.file.findUnique({
      where: { id },
      select: { uploaderId: true },
    });

    if (!file) return NextResponse.json({ message: '未找到' }, { status: 404 });

    // Only uploader or admin can update
    if (viewer.role !== 'admin' && file.uploaderId !== viewer.id) {
      return NextResponse.json({ message: '无权限' }, { status: 403 });
    }

    const body = await req.json().catch(() => undefined);
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { message: '参数错误', errors: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const updated = await prisma.file.update({
      where: { id },
      data: parsed.data,
      select: {
        id: true,
        filename: true,
        originalName: true,
        description: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({
      item: {
        ...updated,
        url: getPublicFileUrl(updated.filename),
      },
    });
  } catch (e: any) {
    console.error('[PUT /api/files/:id]', e);
    if (e?.message === 'Unauthorized') {
      return NextResponse.json({ message: '未登录' }, { status: 401 });
    }
    return NextResponse.json({ message: '更新失败' }, { status: 500 });
  }
}

/**
 * DELETE /api/files/:id - Delete file (uploader or admin only)
 */
export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: idStr } = await params;
    const id = Number(idStr);
    if (Number.isNaN(id)) return NextResponse.json({ message: 'ID 错误' }, { status: 400 });

    const authCheck = await requireAuth();
    if (!authCheck.ok) return authCheck.error;
    const { viewer } = authCheck;

    const file = await prisma.file.findUnique({
      where: { id },
      select: { filename: true, uploaderId: true },
    });

    if (!file) return NextResponse.json({ message: '未找到' }, { status: 404 });

    // Only uploader or admin can delete
    if (viewer.role !== 'admin' && file.uploaderId !== viewer.id) {
      return NextResponse.json({ message: '无权限' }, { status: 403 });
    }

    // Delete from storage
    await deleteFileAsset(file.filename);

    // Delete from database
    await prisma.file.delete({ where: { id } });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('[DELETE /api/files/:id]', e);
    if (e?.message === 'Unauthorized') {
      return NextResponse.json({ message: '未登录' }, { status: 401 });
    }
    return NextResponse.json({ message: '删除失败' }, { status: 500 });
  }
}
