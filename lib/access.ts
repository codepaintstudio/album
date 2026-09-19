import type { Viewer } from '@/lib/access-rules';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import 'server-only';

export const getSession = cache(async () => auth());

/**
 * 每次请求都复核 User.status：登录时的一次性校验（lib/auth.ts 的 authorize）挡不住
 * "会话存活于被拒绝之后"，因为 JWT 从不回查数据库。
 *
 * 非 active 一律返回 null（等价于匿名访客）而不是抛错——这样这次修复不可能
 * 顺手开出新的特权路径。
 */
export const getViewer = cache(async (): Promise<Viewer> => {
  const session = await getSession();
  const userId = session?.user?.id ? Number.parseInt(session.user.id, 10) : NaN;
  if (!session?.user || Number.isNaN(userId)) return null;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, status: true },
  });
  if (!user || user.status !== 'active') return null;

  return { id: user.id, role: user.role === 'admin' ? 'admin' : 'member' };
});

function loginTarget(callbackUrl?: string) {
  return callbackUrl ? `/login?callbackUrl=${encodeURIComponent(callbackUrl)}` : '/login';
}

export async function requireViewer(callbackUrl?: string): Promise<NonNullable<Viewer>> {
  const viewer = await getViewer();
  if (!viewer) {
    redirect(loginTarget(callbackUrl));
  }
  return viewer;
}

export async function requireAdminViewer(callbackUrl?: string): Promise<NonNullable<Viewer>> {
  const viewer = await requireViewer(callbackUrl);
  if (viewer.role !== 'admin') {
    redirect(loginTarget(callbackUrl));
  }
  return viewer;
}
