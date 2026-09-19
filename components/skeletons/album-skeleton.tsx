import { PhotoGridSkeleton } from '@/components/skeletons/photo-grid-skeleton';
import { Skeleton } from '@/components/ui/skeleton';

export function AlbumSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-44" />
          <Skeleton className="h-4 w-72" />
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-6 w-24 rounded-full" />
            <Skeleton className="h-6 w-40 rounded-full" />
            <Skeleton className="h-6 w-36 rounded-full" />
          </div>
        </div>
        <Skeleton className="h-8 w-40" />
      </div>
      <PhotoGridSkeleton count={count} />
    </div>
  );
}
