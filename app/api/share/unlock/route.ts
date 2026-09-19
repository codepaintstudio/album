import { prisma } from '@/lib/db';
import { buildUnlockCookie } from '@/lib/share-auth';
import bcrypt from 'bcryptjs';
import { isAfter } from 'date-fns';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const unlockSchema = z.object({
  token: z.string().min(8),
  password: z.string().min(1).max(200),
});

/**
 * POST /api/share/unlock
 * 密码走请求体而不是查询串：查询串会留在浏览器历史与服务器访问日志里。
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = unlockSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: '参数错误' }, { status: 400 });
  }

  const { token, password } = parsed.data;

  const shareLink = await prisma.shareLink.findUnique({
    where: { token },
    select: { password: true, expiresAt: true },
  });

  if (!shareLink) {
    return NextResponse.json({ error: '分享链接不存在' }, { status: 404 });
  }

  if (shareLink.expiresAt && isAfter(new Date(), shareLink.expiresAt)) {
    return NextResponse.json({ error: '分享链接已过期' }, { status: 410 });
  }

  if (shareLink.password) {
    const match = await bcrypt.compare(password, shareLink.password);
    if (!match) {
      return NextResponse.json({ error: '密码错误' }, { status: 401 });
    }
  }

  const response = NextResponse.json({ ok: true });
  const cookie = buildUnlockCookie(token, shareLink.expiresAt);
  response.cookies.set(cookie.name, cookie.value, cookie.options);
  return response;
}
