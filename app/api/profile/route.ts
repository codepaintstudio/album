import { requireAuth } from '@/lib/auth-guards';
import { prisma } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const updateUsernameSchema = z.object({
  type: z.literal('username'),
  username: z.string().min(3, '用户名至少 3 位').max(32, '用户名最多 32 位'),
});

const updatePasswordSchema = z.object({
  type: z.literal('password'),
  currentPassword: z.string().min(6, '当前密码至少 6 位'),
  newPassword: z.string().min(6, '新密码至少 6 位'),
});

export async function PATCH(request: Request) {
  const authCheck = await requireAuth();
  if (!authCheck.ok) return authCheck.error;

  const body = await request.json().catch(() => null);
  const parsed = parsePayload(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const userId = authCheck.viewer.id;

  if (parsed.data.type === 'username') {
    const exists = await prisma.user.findUnique({ where: { username: parsed.data.username } });
    if (exists && exists.id !== userId) {
      return NextResponse.json({ error: '用户名已被占用' }, { status: 409 });
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { username: parsed.data.username },
      select: {
        id: true,
        username: true,
        role: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      message: '用户名已更新',
      user: updated,
    });
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return NextResponse.json({ error: '用户不存在' }, { status: 404 });
  }

  const match = await bcrypt.compare(parsed.data.currentPassword, user.password);
  if (!match) {
    return NextResponse.json({ error: '当前密码错误' }, { status: 401 });
  }

  const newHash = await bcrypt.hash(parsed.data.newPassword, 10);
  await prisma.user.update({
    where: { id: userId },
    data: { password: newHash },
  });

  return NextResponse.json({ message: '密码已更新' });
}

function parsePayload(body: unknown) {
  if (body && typeof body === 'object' && 'type' in (body as Record<string, unknown>)) {
    if ((body as { type: string }).type === 'username') {
      return updateUsernameSchema.safeParse(body);
    }
    if ((body as { type: string }).type === 'password') {
      return updatePasswordSchema.safeParse(body);
    }
  }
  return { success: false, error: '请求格式错误' } as const;
}
