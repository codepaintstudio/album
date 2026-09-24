import { canTouchFileSet } from '@/lib/access-rules';
import { requireAuth } from '@/lib/auth-guards';
import { prisma } from '@/lib/db';
import { deleteFileAsset, getPublicFileUrl, persistFile } from '@/lib/storage';
import { idStringSchema } from '@/lib/validation';
import { NextResponse } from 'next/server';

type FileItem = {
  id: number;
  filename: string;
  originalName: string | null;
  description: string | null;
  mimeType: string;
  size: number;
  uploaderId: number;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * GET /api/files - List files in a fileset
 */
export async function GET(req: Request) {
  try {
    const authCheck = await requireAuth();
    if (!authCheck.ok) return authCheck.error;
    const { viewer } = authCheck;

    const url = new URL(req.url);
    const filesetIdParam = url.searchParams.get('filesetId');
    const q = url.searchParams.get('q');
    const parsedFilesetId =
      filesetIdParam === null ? undefined : idStringSchema.safeParse(filesetIdParam);

    if (!parsedFilesetId?.success) {
      return NextResponse.json(
        { message: filesetIdParam === null ? '缺少 filesetId' : 'filesetId 错误' },
        { status: 400 }
      );
    }
    const filesetId = parsedFilesetId.data;

    // Check fileset access permission
    const fileset = await prisma.fileSet.findUnique({
      where: { id: filesetId },
      select: { id: true, visibility: true, createdBy: true },
    });

    if (!fileset) {
      return NextResponse.json({ message: '文件集不存在' }, { status: 404 });
    }

    if (!canTouchFileSet(viewer, fileset)) {
      return NextResponse.json({ message: '无权限' }, { status: 403 });
    }

    const where: any = { filesetId };
    if (q) where.originalName = { contains: q };

    const items = (await prisma.file.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        filename: true,
        originalName: true,
        description: true,
        mimeType: true,
        size: true,
        uploaderId: true,
        createdAt: true,
        updatedAt: true,
      },
      take: 100,
    })) as FileItem[];

    return NextResponse.json({
      items: items.map(item => ({
        ...item,
        url: getPublicFileUrl(item.filename),
      })),
    });
  } catch (e: any) {
    console.error('[GET /api/files]', e);
    if (e?.message === 'Unauthorized') {
      return NextResponse.json({ message: '未登录' }, { status: 401 });
    }
    return NextResponse.json({ items: [], message: '文件列表暂不可用' }, { status: 500 });
  }
}

/**
 * POST /api/files - Upload a file
 * Uses multipart/form-data
 */
export async function POST(req: Request) {
  let uploadedFilename: string | null = null;
  try {
    const authCheck = await requireAuth();
    if (!authCheck.ok) return authCheck.error;
    const { viewer } = authCheck;

    const formData = await req.formData();
    const file = formData.get('file');
    const filesetIdValue = formData.get('filesetId');
    const description = (formData.get('description') as string | null) || undefined;

    if (!(file instanceof File) || typeof filesetIdValue !== 'string') {
      return NextResponse.json({ message: '缺少文件或文件集ID' }, { status: 400 });
    }
    const parsedFilesetId = idStringSchema.safeParse(filesetIdValue);
    if (!parsedFilesetId.success) {
      return NextResponse.json({ message: 'filesetId 错误' }, { status: 400 });
    }
    const filesetId = parsedFilesetId.data;

    // Check fileset exists and has permission
    const fileset = await prisma.fileSet.findUnique({
      where: { id: filesetId },
      select: { id: true, visibility: true, createdBy: true },
    });

    if (!fileset) {
      return NextResponse.json({ message: '文件集不存在' }, { status: 404 });
    }

    if (!canTouchFileSet(viewer, fileset)) {
      return NextResponse.json({ message: '无权限上传' }, { status: 403 });
    }

    // Upload file to storage
    const { filename, originalName } = await persistFile(file);
    uploadedFilename = filename;

    // Create file record
    const created = await prisma.file.create({
      data: {
        filename,
        originalName,
        description,
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
        filesetId,
        uploaderId: viewer.id,
      },
      select: {
        id: true,
        filename: true,
        originalName: true,
        description: true,
        mimeType: true,
        size: true,
        createdAt: true,
      },
    });
    uploadedFilename = null;

    return NextResponse.json(
      {
        item: {
          ...created,
          url: getPublicFileUrl(created.filename),
        },
      },
      { status: 201 }
    );
  } catch (e: any) {
    if (uploadedFilename) {
      try {
        await deleteFileAsset(uploadedFilename);
      } catch (cleanupError) {
        console.error(
          '[POST /api/files] DB 写入失败后的对象补偿清理失败',
          uploadedFilename,
          cleanupError
        );
      }
    }
    console.error('[POST /api/files]', e);
    if (e?.message === 'Unauthorized') {
      return NextResponse.json({ message: '未登录' }, { status: 401 });
    }
    if (e?.name === 'UploadError') {
      return NextResponse.json({ message: e.message }, { status: e.statusCode || 400 });
    }
    return NextResponse.json({ message: '上传失败' }, { status: 500 });
  }
}
