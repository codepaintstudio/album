import { AdminFileSets } from '@/components/admin-filesets';
import { AdminCategoriesTab } from '@/components/admin/admin-categories-tab';
import { AdminShareTab } from '@/components/admin/admin-share-tab';
import { AdminUsersTab } from '@/components/admin/admin-users-tab';
import type {
  AdminTab,
  CategoryItem,
  FileSetItem,
  ShareLinkItem,
  UserItem,
} from '@/components/admin/types';
import { USER_ASSET_COUNT_SELECT, type UserAssetCounts } from '@/lib/asset-deletion';
import { prisma } from '@/lib/db';
import { type SearchParams, clampPage, readInt, readString } from '@/lib/params';

const USER_PAGE_SIZES = [10, 20, 50] as const;
const USER_PAGE_DEFAULT = 20;
const SHARE_PAGE_SIZE = 20;

type CategoryRow = {
  id: number;
  name: string;
  description: string | null;
  createdAt: Date;
  visibility: 'private' | 'internal' | 'public';
  _count: { photos: number };
};

type UserRow = {
  id: number;
  username: string;
  role: 'admin' | 'member';
  status: 'pending' | 'active' | 'rejected';
  createdAt: Date;
  _count: UserAssetCounts;
};

type ShareLinkRow = {
  id: number;
  categoryId: number;
  token: string;
  expiresAt: Date | null;
  createdAt: Date;
  category: { name: string };
};

type FileSetRow = {
  id: number;
  name: string;
  description: string | null;
  visibility: 'private' | 'internal' | 'public';
  createdAt: Date;
  _count: { files: number };
};

function toUserItem(row: UserRow): UserItem {
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    status: row.status,
    photoCount: row._count.photos,
    fileCount: row._count.filesUploaded,
    fileSetCount: row._count.fileSetsCreated,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * 只查询当前 tab 需要的数据。切换 tab 因此是一次往返，
 * 换来的是文档负载从"四张无界表"降到"一张表的一页"。
 */
export async function AdminTabContent({
  tab,
  params,
  shareBaseUrl,
}: {
  tab: AdminTab;
  params: SearchParams;
  shareBaseUrl: string;
}) {
  if (tab === 'categories') {
    const rows = (await prisma.category.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { photos: true } } },
    })) as CategoryRow[];

    const categories: CategoryItem[] = rows.map(row => ({
      id: row.id,
      name: row.name,
      description: row.description,
      photoCount: row._count.photos,
      createdAt: row.createdAt.toISOString(),
      visibility: row.visibility,
    }));

    return <AdminCategoriesTab categories={categories} />;
  }

  if (tab === 'filesets') {
    const rows = (await prisma.fileSet.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { files: true } } },
    })) as FileSetRow[];

    const fileSets: FileSetItem[] = rows.map(row => ({
      id: row.id,
      name: row.name,
      description: row.description,
      visibility: row.visibility,
      fileCount: row._count.files,
      createdAt: row.createdAt.toISOString(),
    }));

    return <AdminFileSets filesets={fileSets} />;
  }

  if (tab === 'users') {
    const query = readString(params, 'q').trim();
    const rawRole = readString(params, 'role');
    const role = rawRole === 'admin' || rawRole === 'member' ? rawRole : null;
    const requestedPageSize = readInt(params, 'pageSize');
    const pageSize =
      requestedPageSize && (USER_PAGE_SIZES as readonly number[]).includes(requestedPageSize)
        ? requestedPageSize
        : USER_PAGE_DEFAULT;

    const where = {
      status: 'active' as const,
      ...(role ? { role } : {}),
      ...(query ? { username: { contains: query } } : {}),
    };

    const total = (await prisma.user.count({ where })) as number;
    const page = clampPage(readInt(params, 'p'), total, pageSize);

    const [activeRows, pendingRows] = (await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { _count: { select: { ...USER_ASSET_COUNT_SELECT } } },
      }),
      prisma.user.findMany({
        where: { status: 'pending' },
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { ...USER_ASSET_COUNT_SELECT } } },
      }),
    ])) as [UserRow[], UserRow[]];

    return (
      <AdminUsersTab
        users={activeRows.map(toUserItem)}
        pendingUsers={pendingRows.map(toUserItem)}
        total={total}
        page={page}
        pageSize={pageSize}
        query={query}
        role={role ?? ''}
      />
    );
  }

  const total = (await prisma.shareLink.count()) as number;
  const page = clampPage(readInt(params, 'p'), total, SHARE_PAGE_SIZE);

  const [rows, categoryRows] = (await Promise.all([
    prisma.shareLink.findMany({
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * SHARE_PAGE_SIZE,
      take: SHARE_PAGE_SIZE,
      include: { category: { select: { name: true } } },
    }),
    prisma.category.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
  ])) as [ShareLinkRow[], Array<{ id: number; name: string }>];

  const shareLinks: ShareLinkItem[] = rows.map(row => ({
    id: row.id,
    token: row.token,
    categoryId: row.categoryId,
    categoryName: row.category.name,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  }));

  return (
    <AdminShareTab
      shareLinks={shareLinks}
      categories={categoryRows}
      shareBaseUrl={shareBaseUrl}
      total={total}
      page={page}
      pageSize={SHARE_PAGE_SIZE}
    />
  );
}
