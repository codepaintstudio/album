'use client';

import { useQueryParamWriter } from '@/lib/query-state';
import { cn } from '@/lib/utils';

import type { FileSet } from './types';

export function FilesSidebar({
  fileSets,
  activeFileSetId,
}: {
  fileSets: FileSet[];
  activeFileSetId: number | null;
}) {
  const setParam = useQueryParamWriter();

  return (
    <aside className="hidden w-64 shrink-0 md:block">
      <div className="rounded-md border p-3">
        <div className="mb-3 text-sm font-medium">文件分类</div>
        <div className="space-y-1">
          {fileSets.map(fs => (
            <button
              key={fs.id}
              className={cn(
                'hover:bg-muted w-full rounded px-3 py-2 text-left text-sm transition-colors',
                activeFileSetId === fs.id && 'bg-muted font-medium'
              )}
              onClick={() => setParam('fileset', String(fs.id))}
            >
              <div className="flex items-center justify-between">
                <span className="truncate">{fs.name}</span>
                <span className="text-muted-foreground text-xs">{fs.fileCount}</span>
              </div>
              {fs.description && (
                <div className="text-muted-foreground mt-1 truncate text-xs">{fs.description}</div>
              )}
            </button>
          ))}
          {fileSets.length === 0 && (
            <div className="text-muted-foreground py-4 text-center text-sm">暂无文件分类</div>
          )}
        </div>
      </div>
    </aside>
  );
}
