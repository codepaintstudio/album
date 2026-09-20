import { requireAdmin } from '@/lib/auth-guards';
import { prisma } from '@/lib/db';
import { idSchema } from '@/lib/validation';
import bcrypt from 'bcryptjs';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const resetPasswordSchema = z.object({
  userId: idSchema,
  newPassword: z.string().min(6, '密码至少 6 位'),
});

export async function POST(request: Request) {
  const adminCheck = await requireAdmin();
  if ('error' in adminCheck) return adminCheck.error;

  const body = await request.json().catch(() => null);
  const parsed = resetPasswordSchema.safeParse(body);

  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors;
    const errorMessage = Object.values(errors).flat()[0] || '请求参数错误';
    return NextResponse.json({ error: errorMessage }, { status: 400 });
  }

  const { userId, newPassword } = parsed.data;

  // 检查用户是否存在
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    return NextResponse.json({ error: '用户不存在' }, { status: 404 });
  }

  // 加密新密码
  const hashedPassword = await bcrypt.hash(newPassword, 10);

  // 更新密码
  await prisma.user.update({
    where: { id: userId },
    data: { password: hashedPassword },
  });

  return NextResponse.json({ success: true, message: '密码重置成功' });
}
