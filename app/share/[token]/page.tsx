import { PHOTO_PAGE_SIZE, PhotoPage } from '@/components/photo-page';
import { SharePasswordForm } from '@/components/share-password-form';
import { PhotoGridSkeleton } from '@/components/skeletons/photo-grid-skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { EmptyState } from '@/components/ui/empty-state';
import { prisma } from '@/lib/db';
import { type SearchParams, clampPage, readInt } from '@/lib/params';
import { isShareUnlocked } from '@/lib/share-auth';
import { format, isAfter } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

type ShareRow = {
  token: string;
  expiresAt: Date | null;
  password: string | null;
  category: { id: number; name: string; description: string | null };
};

export default async function SharePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams?: Promise<SearchParams>;
}) {
  const { token } = await params;
  const q = (await searchParams) ?? {};

  const shareLink = (await prisma.shareLink.findUnique({
    where: { token },
    select: {
      token: true,
      expiresAt: true,
      password: true,
      category: { select: { id: true, name: true, description: true } },
    },
  })) as ShareRow | null;

  if (!shareLink) {
    notFound();
  }

  if (shareLink.expiresAt && isAfter(new Date(), shareLink.expiresAt)) {
    return <EmptyState title="分享链接已过期" description="该链接已失效，请联系分享者重新生成。" />;
  }

  const { category } = shareLink;

  // 需要密码却尚未解锁时，连媒体数量都不透露——解锁判断在服务端完成，
  // 不再靠"先发请求、再看是不是 401"猜出来
  if (shareLink.password && !(await isShareUnlocked(token))) {
    return (
      <div className="mx-auto max-w-sm space-y-4">
        <Alert>
          <AlertTitle>访问受限</AlertTitle>
          <AlertDescription>请输入访问密码</AlertDescription>
        </Alert>
        <SharePasswordForm token={token} />
      </div>
    );
  }

  const total = (await prisma.photo.count({ where: { categoryId: category.id } })) as number;
  const page = clampPage(readInt(q, 'p'), total, PHOTO_PAGE_SIZE);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">{category.name}</h1>
        {category.description && (
          <p className="text-muted-foreground text-sm">{category.description}</p>
        )}
        <p className="text-muted-foreground text-xs">
          {total} 个媒体
          {shareLink.expiresAt &&
            ` · 链接将在 ${format(shareLink.expiresAt, 'yyyy-MM-dd HH:mm', { locale: zhCN })} 过期`}
        </p>
      </div>

      <Suspense fallback={<PhotoGridSkeleton />}>
        <PhotoPage
          categoryId={category.id}
          sort="desc"
          page={page}
          total={total}
          deepPhotoId={readInt(q, 'photo')}
          viewerId={null}
          canManageAll={false}
          downloadStrategy="public"
          emptyTitle="暂未添加任何媒体。"
        />
      </Suspense>
    </div>
  );
}
