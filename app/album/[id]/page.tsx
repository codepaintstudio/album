import { PHOTO_PAGE_SIZE, PhotoPage } from '@/components/photo-page';
import { SearchTrigger } from '@/components/search-trigger';
import { PhotoGridSkeleton } from '@/components/skeletons/photo-grid-skeleton';
import { SortToggle } from '@/components/sort-toggle';
import { UploadDialog } from '@/components/upload-dialog';
import { getViewer } from '@/lib/access';
import { type Visibility, canViewCategory, categoryWhereFor } from '@/lib/access-rules';
import { prisma } from '@/lib/db';
import { type SearchParams, clampPage, readInt, readSort } from '@/lib/params';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { CalendarClock, CalendarDays, Image as ImageIcon, Images } from 'lucide-react';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';

type CategoryRow = {
  id: number;
  name: string;
  description: string | null;
  visibility: Visibility;
  createdAt: Date;
};

export default async function AlbumPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<SearchParams>;
}) {
  const { id } = await params;
  const q = (await searchParams) ?? {};
  const sort = readSort(q);
  const categoryId = Number.parseInt(id, 10);
  if (!Number.isInteger(categoryId)) {
    notFound();
  }

  const viewer = await getViewer();

  // 这里只取相册本身：照片窗口交给下面的 <Suspense> 流式补齐，
  // 否则页头会被最慢的那个大列表查询一起阻塞住。
  const category = (await prisma.category.findUnique({
    where: { id: categoryId },
    select: { id: true, name: true, description: true, visibility: true, createdAt: true },
  })) as CategoryRow | null;

  if (!category) {
    notFound();
  }

  const verdict = canViewCategory(viewer, category);
  if (verdict === 'not-found') {
    notFound();
  }
  if (verdict === 'login') {
    redirect(`/login?callbackUrl=${encodeURIComponent(`/album/${category.id}`)}`);
  }

  const stats = (await prisma.photo.aggregate({
    where: { categoryId: category.id },
    _count: { _all: true },
    _max: { createdAt: true },
  })) as { _count: { _all: number }; _max: { createdAt: Date | null } };

  const total = stats._count._all;
  const page = clampPage(readInt(q, 'p'), total, PHOTO_PAGE_SIZE);
  // ?photo= 一般只由客户端浅层写入，这里读一次是为了让深链指向的照片
  // 即使不在当前页窗口里也能打开灯箱
  const deepPhotoId = readInt(q, 'photo');

  const uploadCategories = viewer
    ? await prisma.category.findMany({
        where: categoryWhereFor(viewer),
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      })
    : [];

  const latestPhotoDate = stats._max.createdAt ?? category.createdAt;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-2">
          <div className="text-foreground flex items-center gap-2">
            <Images className="text-primary h-5 w-5" />
            <h1 className="text-2xl font-semibold tracking-tight">{category.name}</h1>
          </div>
          {category.description && (
            <p className="text-muted-foreground text-sm">{category.description}</p>
          )}
          <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
            <span className="bg-primary/10 text-primary inline-flex items-center gap-1 rounded-full px-3 py-1">
              <ImageIcon className="h-3 w-3" />
              {total} 个媒体
            </span>
            <span className="bg-muted inline-flex items-center gap-1 rounded-full px-3 py-1">
              <CalendarClock className="h-3 w-3" />
              最近更新：{format(latestPhotoDate, 'yyyy-MM-dd HH:mm', { locale: zhCN })}
            </span>
            <span className="bg-muted inline-flex items-center gap-1 rounded-full px-3 py-1">
              <CalendarDays className="h-3 w-3" />
              创建时间：{format(category.createdAt, 'yyyy-MM-dd', { locale: zhCN })}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <SearchTrigger categoryId={category.id} />
          <SortToggle />
          {viewer ? (
            <UploadDialog
              categories={uploadCategories}
              defaultCategoryId={category.id}
              triggerVariant="outline"
              triggerSize="sm"
              triggerLabel="上传媒体"
            />
          ) : null}
        </div>
      </div>

      <Suspense fallback={<PhotoGridSkeleton />}>
        <PhotoPage
          categoryId={category.id}
          sort={sort}
          page={page}
          total={total}
          viewerId={viewer?.id ?? null}
          canManageAll={viewer?.role === 'admin'}
          deepPhotoId={deepPhotoId}
          downloadStrategy="api"
          emptyTitle="暂无媒体，欢迎上传。"
        />
      </Suspense>
    </div>
  );
}
