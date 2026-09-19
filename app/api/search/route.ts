import { getViewer } from '@/lib/access';
import { canViewCategory, categoryWhereFor } from '@/lib/access-rules';
import { prisma } from '@/lib/db';
import { getPublicObjectUrl, getPublicThumbnailUrl } from '@/lib/storage';
import { NextResponse } from 'next/server';

const CATEGORY_LIMIT = 5;
const PHOTO_LIMIT = 45;

type CategoryRow = {
  id: number;
  name: string;
  description: string | null;
  _count: { photos: number };
};

type PhotoRow = {
  id: number;
  filename: string;
  originalName: string;
  description: string | null;
  mediaType: 'image' | 'video';
  categoryId: number;
  category: { name: string };
};

/**
 * GET /api/search?q=&categoryId=
 * 相册域的全局搜索。categoryId 用于"在某个相册内搜索"，此时只返回该相册的媒体。
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') ?? '').trim();
  if (!q) {
    return NextResponse.json({ categories: [], photos: [] });
  }

  const viewer = await getViewer();
  const categoryFilter = categoryWhereFor(viewer);

  const rawCategoryId = searchParams.get('categoryId');
  const parsedCategoryId = rawCategoryId ? Number.parseInt(rawCategoryId, 10) : NaN;
  const scopedCategoryId = Number.isInteger(parsedCategoryId) ? parsedCategoryId : null;

  if (scopedCategoryId !== null) {
    const scope = await prisma.category.findUnique({
      where: { id: scopedCategoryId },
      select: { visibility: true },
    });
    if (!scope || canViewCategory(viewer, scope) !== 'allow') {
      return NextResponse.json({ categories: [], photos: [] });
    }
  }

  const photoWhere = {
    category:
      scopedCategoryId === null
        ? categoryFilter
        : { AND: [categoryFilter, { id: scopedCategoryId }] },
    OR: [{ originalName: { contains: q } }, { description: { contains: q } }],
  };

  const photoQuery = prisma.photo.findMany({
    where: photoWhere,
    orderBy: { createdAt: 'desc' },
    take: PHOTO_LIMIT,
    select: {
      id: true,
      filename: true,
      originalName: true,
      description: true,
      mediaType: true,
      categoryId: true,
      category: { select: { name: true } },
    },
  }) as Promise<PhotoRow[]>;

  if (scopedCategoryId !== null) {
    const photos = await photoQuery;
    return NextResponse.json({ categories: [], photos: mapPhotos(photos) });
  }

  const categoryQuery = prisma.category.findMany({
    where: {
      AND: [categoryFilter, { OR: [{ name: { contains: q } }, { description: { contains: q } }] }],
    },
    orderBy: { createdAt: 'desc' },
    take: CATEGORY_LIMIT,
    select: { id: true, name: true, description: true, _count: { select: { photos: true } } },
  }) as Promise<CategoryRow[]>;

  const [categories, photos] = await Promise.all([categoryQuery, photoQuery]);

  return NextResponse.json({
    categories: categories.map(category => ({
      id: category.id,
      name: category.name,
      description: category.description,
      photoCount: category._count.photos,
    })),
    photos: mapPhotos(photos),
  });
}

function mapPhotos(photos: PhotoRow[]) {
  return photos.map(photo => ({
    id: photo.id,
    categoryId: photo.categoryId,
    categoryName: photo.category.name,
    filename: photo.filename,
    originalName: photo.originalName,
    description: photo.description,
    mediaType: photo.mediaType,
    thumbnailUrl: photo.mediaType === 'image' ? getPublicThumbnailUrl(photo.filename) : null,
    fileUrl: getPublicObjectUrl(photo.filename),
  }));
}
