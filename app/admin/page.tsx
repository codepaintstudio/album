import { AdminShell } from '@/components/admin/admin-shell';
import { ADMIN_TABS, type AdminTab } from '@/components/admin/types';
import { AdminTabSkeleton } from '@/components/skeletons/admin-tab-skeleton';
import { requireAdminViewer } from '@/lib/access';
import { type SearchParams, readEnum } from '@/lib/params';
import { headers } from 'next/headers';
import { Suspense } from 'react';

import { AdminTabContent } from './_tab-content';

async function requestOrigin(): Promise<string> {
  const store = await headers();
  const host = store.get('x-forwarded-host') ?? store.get('host');
  if (host) {
    const proto = store.get('x-forwarded-proto') ?? 'http';
    return `${proto}://${host}`;
  }

  if (process.env.NEXTAUTH_URL) {
    try {
      return new URL(process.env.NEXTAUTH_URL).origin;
    } catch {
      // 配置值不是合法 URL，交给下面的相对路径兜底
    }
  }

  return '';
}

export default async function AdminPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireAdminViewer('/admin');

  const params = await searchParams;
  const tab = readEnum<AdminTab>(
    params,
    'tab',
    ADMIN_TABS.map(item => item.value),
    'categories'
  );
  const shareBaseUrl = `${await requestOrigin()}/share/`;

  return (
    <AdminShell tab={tab}>
      <Suspense fallback={<AdminTabSkeleton />}>
        <AdminTabContent tab={tab} params={params} shareBaseUrl={shareBaseUrl} />
      </Suspense>
    </AdminShell>
  );
}
