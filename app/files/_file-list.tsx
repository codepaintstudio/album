import { FilesTable } from '@/components/files/table';
import type { FileItem } from '@/components/files/types';
import { PaginationControls } from '@/components/pagination-controls';
import { prisma } from '@/lib/db';
import { clampPage } from '@/lib/params';
import { getPublicFileUrl } from '@/lib/storage';

const PAGE_SIZE = 50;

type FileRow = {
  id: number;
  filename: string;
  originalName: string;
  description: string | null;
  mimeType: string;
  size: number;
  uploaderId: number;
  createdAt: Date;
};

export async function FileList({
  filesetId,
  query,
  page,
}: {
  filesetId: number;
  query: string;
  page: number | null;
}) {
  const where = { filesetId, ...(query ? { originalName: { contains: query } } : {}) };

  // 先数总数再钳页码：skip 依赖钳后的值，否则越界的 ?p= 会渲染出一片空白
  const total = (await prisma.file.count({ where })) as number;
  const currentPage = clampPage(page, total, PAGE_SIZE);

  const rows = (await prisma.file.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    skip: (currentPage - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: {
      id: true,
      filename: true,
      originalName: true,
      description: true,
      mimeType: true,
      size: true,
      uploaderId: true,
      createdAt: true,
    },
  })) as FileRow[];

  const files: FileItem[] = rows.map(row => ({
    id: row.id,
    filename: row.filename,
    originalName: row.originalName,
    description: row.description,
    mimeType: row.mimeType,
    size: row.size,
    uploaderId: row.uploaderId,
    createdAt: row.createdAt.toISOString(),
    url: getPublicFileUrl(row.filename),
  }));

  return (
    <div className="space-y-4">
      <FilesTable files={files} />
      <PaginationControls page={currentPage} total={total} pageSize={PAGE_SIZE} />
    </div>
  );
}
