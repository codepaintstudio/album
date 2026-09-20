import { getViewer } from '@/lib/access';
import { type Visibility, categoryWhereFor } from '@/lib/access-rules';
import {
  cleanupErrorResponse,
  deleteAssetsThenRows,
  listPhotoUnitsOfCategory,
  reportSkippedNames,
} from '@/lib/asset-cleanup';
import { requireAdmin } from '@/lib/auth-guards';
import { prisma } from '@/lib/db';
import { prismaErrorResponse } from '@/lib/prisma-errors';
import { idSchema, visibilitySchema } from '@/lib/validation';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const categoryCreateSchema = z.object({
  name: z.string().min(1, '分类名称不能为空'),
  description: z.string().optional(),
  visibility: visibilitySchema.default('internal'),
});

const categoryUpdateSchema = categoryCreateSchema.extend({
  id: idSchema,
});

const categoryDeleteSchema = z.object({
  id: idSchema,
});

type CategoryWithCount = {
  id: number;
  name: string;
  description: string | null;
  createdAt: Date;
  visibility: Visibility;
  _count: { photos: number };
};

export async function GET() {
  const viewer = await getViewer();
  const where = categoryWhereFor(viewer);

  const categories = (await prisma.category.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      _count: {
        select: { photos: true },
      },
    },
  })) as CategoryWithCount[];

  return NextResponse.json(
    categories.map(category => ({
      id: category.id,
      name: category.name,
      description: category.description,
      createdAt: category.createdAt,
      photoCount: category._count.photos,
      visibility: category.visibility,
    }))
  );
}

export async function POST(request: Request) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.ok) return adminCheck.error;

  const body = await request.json().catch(() => null);
  const parseResult = categoryCreateSchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json({ error: parseResult.error.flatten().fieldErrors }, { status: 400 });
  }

  const category = await prisma.category.create({
    data: {
      name: parseResult.data.name,
      description: parseResult.data.description,
      visibility: parseResult.data.visibility,
    },
  });
  return NextResponse.json(category, { status: 201 });
}

export async function PUT(request: Request) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.ok) return adminCheck.error;

  const body = await request.json().catch(() => null);
  const parseResult = categoryUpdateSchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json({ error: parseResult.error.flatten().fieldErrors }, { status: 400 });
  }

  try {
    const category = await prisma.category.update({
      where: { id: parseResult.data.id },
      data: {
        name: parseResult.data.name,
        description: parseResult.data.description,
        visibility: parseResult.data.visibility,
      },
    });
    return NextResponse.json(category);
  } catch (error) {
    // DELETE 不在此列：它的清理与错误处理在同一个改动里落地（缺陷 B）。
    return prismaErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.ok) return adminCheck.error;

  const body = await request.json().catch(() => null);
  const parseResult = categoryDeleteSchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json({ error: parseResult.error.flatten().fieldErrors }, { status: 400 });
  }

  const { id } = parseResult.data;

  const category = await prisma.category.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!category) {
    return NextResponse.json({ error: '分类不存在' }, { status: 404 });
  }

  // 必须在删分类之前取走子照片的对象键：Photo.category 的 onDelete: Cascade 会让这些行
  // 在库内消失，而它们是那些对象存在过的唯一记录。缺这一步就是缺陷 B 本身。
  const plan = await listPhotoUnitsOfCategory(id);
  reportSkippedNames('DELETE /api/categories', plan.skipped);

  try {
    const outcome = await deleteAssetsThenRows(plan.units, () =>
      prisma.category.delete({ where: { id } })
    );
    if (!outcome.ok) return cleanupErrorResponse(outcome);

    return NextResponse.json({ success: true });
  } catch (error) {
    return prismaErrorResponse(error);
  }
}
