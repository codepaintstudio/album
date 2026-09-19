import { SearchTrigger } from '@/components/search-trigger';
import { CategoryGridSkeleton } from '@/components/skeletons/category-grid-skeleton';
import { SortToggle } from '@/components/sort-toggle';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { UploadDialog } from '@/components/upload-dialog';
import { getViewer } from '@/lib/access';
import { type Visibility, categoryWhereFor } from '@/lib/access-rules';
import { prisma } from '@/lib/db';
import { getPublicThumbnailUrl } from '@/lib/storage';
import { Images } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { Suspense } from 'react';

/** 首页不做分页：相册是人工创建的，这个上限只是防止无界负载 */
const CATEGORY_CAP = 200;

export default function HomePage({
  searchParams,
}: {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  return (
    <Suspense fallback={<CategoryGridSkeleton />}>
      <HomeContent searchParams={searchParams} />
    </Suspense>
  );
}

async function HomeContent({
  searchParams,
}: {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = (await searchParams) ?? {};
  const sort =
    (typeof params['sort'] === 'string' ? params['sort'] : undefined) === 'asc' ? 'asc' : 'desc';
  const viewer = await getViewer();
  type CategoryCard = {
    id: number;
    name: string;
    description: string | null;
    visibility: Visibility;
    createdAt: Date;
    photos: Array<{ filename: string; createdAt: Date }>;
    _count: { photos: number };
  };
  const where = categoryWhereFor(viewer);

  const categories = (await prisma.category.findMany({
    where,
    orderBy: { createdAt: sort },
    take: CATEGORY_CAP,
    include: {
      _count: { select: { photos: true } },
      photos: {
        orderBy: { createdAt: sort },
        take: 1,
        select: {
          filename: true,
          createdAt: true,
        },
      },
    },
  })) as CategoryCard[];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-2">
          <div className="text-foreground flex items-center gap-2">
            <Images className="text-primary h-6 w-6" />
            <h1 className="text-2xl font-semibold tracking-tight">相册</h1>
          </div>
          <p className="text-muted-foreground text-sm">查看你的相册集、上传照片。</p>
        </div>
        <div className="flex items-center gap-2">
          <SearchTrigger />
          <SortToggle />
        </div>
        {viewer && categories.length > 0 && (
          <div className="flex items-center gap-2">
            <UploadDialog
              categories={categories.map(category => ({
                id: category.id,
                name: category.name,
              }))}
              triggerVariant="outline"
              triggerSize="sm"
              triggerLabel="快速上传"
            />
          </div>
        )}
      </div>

      {categories.length === 0 ? (
        <EmptyState
          icon={<Images className="text-primary h-10 w-10" />}
          title="暂无相册，请先在控制台中创建分类。"
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map(category => (
            <Link key={category.id} href={`/album/${category.id}`}>
              <Card className="group relative h-64 overflow-hidden border p-0 transition hover:shadow-xl">
                {category.photos[0] ? (
                  <ImageFill filename={category.photos[0].filename} />
                ) : (
                  <div className="from-muted to-muted-foreground/20 flex h-full w-full items-center justify-center bg-gradient-to-br">
                    <span className="text-muted-foreground text-sm">暂无照片</span>
                  </div>
                )}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/40 to-transparent p-4 text-white">
                  <div className="flex items-center justify-between text-sm font-medium">
                    <span>{category.name}</span>
                    <span className="text-xs text-white/80">{category._count.photos} 张</span>
                  </div>
                  {category.description && (
                    <p className="mt-2 line-clamp-2 text-xs text-white/80">
                      {category.description}
                    </p>
                  )}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {categories.length >= CATEGORY_CAP ? (
        <p className="text-muted-foreground text-center text-xs">
          相册过多，仅显示前 {CATEGORY_CAP} 个。
        </p>
      ) : null}
    </div>
  );
}

function ImageFill({ filename }: { filename: string }) {
  return (
    <div className="relative h-full w-full">
      <Image
        src={getPublicThumbnailUrl(filename)}
        alt="分类封面"
        fill
        priority={false}
        sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
        className="object-cover"
        unoptimized
      />
    </div>
  );
}

// client-only search trigger moved to components/search-trigger.tsx
// client-only search trigger moved to components/search-trigger.tsx
