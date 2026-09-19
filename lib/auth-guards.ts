import { getViewer } from '@/lib/access';
import type { Viewer } from '@/lib/access-rules';
import { auth } from '@/lib/auth';
import type { Session } from 'next-auth';
import { NextResponse } from 'next/server';

type SessionWithUser = Omit<Session, 'user'> & { user: NonNullable<Session['user']> };
type AuthOk = { ok: true; session: SessionWithUser; viewer: NonNullable<Viewer> };
type AuthErr = { ok: false; error: NextResponse };
type AuthResult = AuthOk | AuthErr;

export async function requireAuth(): Promise<AuthResult> {
  const session = await auth();
  if (!session?.user) {
    return {
      ok: false,
      error: NextResponse.json({ error: '未授权' }, { status: 401 }),
    };
  }

  // viewer 为空意味着账号已不存在或状态不是 active：JWT 里仍带着旧角色，必须当作未登录处理
  const viewer = await getViewer();
  if (!viewer) {
    return {
      ok: false,
      error: NextResponse.json(
        { error: '账户待审核或已被拒绝', code: 'account_inactive' },
        { status: 401 }
      ),
    };
  }

  return { ok: true, session: session as SessionWithUser, viewer };
}

export async function requireAdmin(): Promise<AuthResult> {
  const res = await requireAuth();
  if (!res.ok) return res;

  if (res.viewer.role !== 'admin') {
    return {
      ok: false,
      error: NextResponse.json({ error: '权限不足' }, { status: 403 }),
    };
  }

  return res;
}
