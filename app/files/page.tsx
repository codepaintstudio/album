import { FilesSidebar } from '@/components/files/sidebar';
import { FilesToolbar } from '@/components/files/toolbar';
import { FileTableSkeleton } from '@/components/skeletons/file-table-skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { requireViewer } from '@/lib/access';
import { fileSetWhereFor } from '@/lib/access-rules';
import { prisma } from '@/lib/db';
import { type SearchParams, readId, readInt, readString } from '@/lib/params';
import { FileIcon } from 'lucide-react';
import { Suspense } from 'react';

import { FileList } from './_file-list';

type FileSetRow = {
  id: number;
  name: string;
  description: string | null;
  _count: { files: number };
};

export default async function FilesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const viewer = await requireViewer('/files');
  const params = await searchParams;

  const fileSets = (await prisma.fileSet.findMany({
    where: fileSetWhereFor(viewer),
    orderBy: { updatedAt: 'desc' },
    select: { id: true, name: true, description: true, _count: { select: { files: true } } },
  })) as FileSetRow[];

  // ?fileset= 指向无权访问或不存在的集合时，静默回落到第一个可见集合
  const requestedId = readId(params, 'fileset');
  const activeSet = fileSets.find(set => set.id === requestedId) ?? fileSets[0] ?? null;
  const query = readString(params, 'q');

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-2">
          <div className="text-foreground flex items-center gap-2">
            <FileIcon className="text-primary h-5 w-5" />
            <h1 className="text-2xl font-semibold tracking-tight">文件管理</h1>
          </div>
        </div>
        <FilesToolbar initialQuery={query} activeFileSetId={activeSet?.id ?? null} />
      </div>

      <div className="flex gap-4 md:gap-8">
        <FilesSidebar
          fileSets={fileSets.map(set => ({
            id: set.id,
            name: set.name,
            description: set.description,
            fileCount: set._count.files,
          }))}
          activeFileSetId={activeSet?.id ?? null}
        />

        <section className="min-w-0 flex-1">
          {activeSet && (
            <div className="mb-3">
              <h2 className="text-lg font-medium">{activeSet.name}</h2>
              {activeSet.description && (
                <p className="text-muted-foreground text-sm">{activeSet.description}</p>
              )}
            </div>
          )}

          {activeSet ? (
            <Suspense fallback={<FileTableSkeleton />}>
              <FileList filesetId={activeSet.id} query={query} page={readInt(params, 'p')} />
            </Suspense>
          ) : (
            <EmptyState title="暂无文件分类" />
          )}
        </section>
      </div>
    </div>
  );
}
