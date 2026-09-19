import { PaginationControls } from '@/components/pagination-controls';
import { PhotoGrid } from '@/components/photo-grid';
import { EmptyState } from '@/components/ui/empty-state';
import { prisma } from '@/lib/db';
import { getPublicObjectUrl, getPublicThumbnailUrl } from '@/lib/storage';

/** 日/月/年三档缩放共用一个页大小：年视图 8 列时 24 张会显得太空 */
export const PHOTO_PAGE_SIZE = 60;

type PhotoRecord = {
  id: number;
  filename: string;
  originalName: string;
  description: string | null;
  categoryId: number;
  uploaderId: number;
  mediaType: 'image' | 'video';
  createdAt: Date;
  uploader: { username: string };
};

function toItem(photo: PhotoRecord, viewerId: number | null) {
  return {
    id: photo.id,
    filename: photo.filename,
    originalName: photo.originalName,
    description: photo.description,
    createdAt: photo.createdAt.toISOString(),
    uploader: photo.uploader.username,
    mediaType: photo.mediaType,
    thumbnailUrl: photo.mediaType === 'image' ? getPublicThumbnailUrl(photo.filename) : null,
    fileUrl: getPublicObjectUrl(photo.filename),
    isOwner: viewerId !== null && photo.uploaderId === viewerId,
  };
}

/**
 * 一窗媒体 + 分页器。相册页与分享页共用，差别只在 access 与 downloadStrategy：
 * 分享页是匿名访问，因此传 viewerId=null、canManageAll=false、downloadStrategy='public'。
 */
export async function PhotoPage({
  categoryId,
  sort,
  page,
  total,
  deepPhotoId,
  viewerId,
  canManageAll,
  downloadStrategy,
  emptyTitle,
}: {
  categoryId: number;
  sort: 'asc' | 'desc';
  page: number;
  total: number;
  deepPhotoId: number | null;
  viewerId: number | null;
  canManageAll: boolean;
  downloadStrategy: 'api' | 'public';
  emptyTitle: string;
}) {
  const rows = (await prisma.photo.findMany({
    where: { categoryId },
    orderBy: { createdAt: sort },
    skip: (page - 1) * PHOTO_PAGE_SIZE,
    take: PHOTO_PAGE_SIZE,
    include: { uploader: { select: { username: true } } },
  })) as PhotoRecord[];

  const photos = rows.map(row => toItem(row, viewerId));

  if (deepPhotoId !== null && !photos.some(photo => photo.id === deepPhotoId)) {
    const deep = (await prisma.photo.findUnique({
      where: { id: deepPhotoId },
      include: { uploader: { select: { username: true } } },
    })) as PhotoRecord | null;

    // 只接受确实属于本相册的照片，否则 ?photo= 就成了跨相册窥探的入口
    if (deep && deep.categoryId === categoryId) {
      photos.push(toItem(deep, viewerId));
    }
  }

  if (photos.length === 0) {
    return <EmptyState title={emptyTitle} />;
  }

  return (
    <div className="space-y-4">
      {/* key 随页码变化会重挂载网格，于是翻页会清空选择集；
          view/group/photo 存在 URL 里，因此不受重挂载影响 */}
      <PhotoGrid
        key={`page-${page}`}
        photos={photos}
        canManageAll={canManageAll}
        allowOwnActions={viewerId !== null}
        downloadStrategy={downloadStrategy}
      />
      <PaginationControls page={page} total={total} pageSize={PHOTO_PAGE_SIZE} />
    </div>
  );
}
