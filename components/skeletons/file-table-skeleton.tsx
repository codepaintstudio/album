import { Skeleton } from '@/components/ui/skeleton';

/** 只覆盖文件表区域：页头与侧栏由外层壳渲染，已在屏幕上 */
export function FileTableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-4">
      <div className="space-y-2 rounded-md border p-3">
        <Skeleton className="h-4 w-full" />
        {Array.from({ length: rows }, (_, index) => (
          <Skeleton key={index} className="h-10 w-full" />
        ))}
      </div>
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-8 w-40" />
      </div>
    </div>
  );
}
