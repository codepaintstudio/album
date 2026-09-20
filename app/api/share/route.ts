import { requireAdmin } from '@/lib/auth-guards';
import { prisma } from '@/lib/db';
import { idSchema } from '@/lib/validation';
import bcrypt from 'bcryptjs';
import { addHours } from 'date-fns';
import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';

/**
 * 只有两个方法：POST 创建分享链接，DELETE 撤销它。
 *
 * 原来还有一个 GET /api/share?token=…&password=…，一次返回整册的照片元数据与可访问
 * fileUrl。它被删掉而不是被修，三条理由：
 *
 * 1. 没有调用方。分享落地页 app/share/[token]/page.tsx 直接查 Prisma，门禁由
 *    lib/share-auth.ts 在服务端用 HMAC cookie 判定；admin-share-tab 只发 POST 与
 *    DELETE。留下的是一份没人用的重复实现，还得跟着 token/过期/密码逻辑一起维护。
 * 2. 它把密码放在查询串里。兄弟路由 app/api/share/unlock/route.ts 的注释早已写明
 *    本项目的政策：「密码走请求体而不是查询串：查询串会留在浏览器历史与服务器访问
 *    日志里」。所以这不是一个被权衡过的设计，是同一族重构做了一半。
 * 3. 它无鉴权也无限流，任何拿到 token 的人都能一次取回整册清单。
 *
 * 若确有外部集成在用这个 URL，它会开始收到 405。对外承诺的入口一直是分享落地页本身
 * （admin-share-tab 复制给用户的就是那个页面地址）。
 */

const createShareSchema = z.object({
  categoryId: idSchema,
  password: z.string().min(4).max(50).optional(),
  expireInHours: z.number().int().positive().max(720).optional(),
});

const deleteShareSchema = z.object({
  id: idSchema,
});

export async function POST(request: Request) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.ok) return adminCheck.error;

  const body = await request.json().catch(() => null);
  const parsed = createShareSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const category = await prisma.category.findUnique({
    where: { id: parsed.data.categoryId },
  });

  if (!category) {
    return NextResponse.json({ error: '分类不存在' }, { status: 404 });
  }

  const token = uuidv4().replace(/-/g, '');
  const expiresAt = parsed.data.expireInHours
    ? addHours(new Date(), parsed.data.expireInHours)
    : null;

  const passwordHash = parsed.data.password ? await bcrypt.hash(parsed.data.password, 10) : null;

  const shareLink = await prisma.shareLink.create({
    data: {
      categoryId: parsed.data.categoryId,
      token,
      password: passwordHash,
      expiresAt,
    },
    select: {
      id: true,
      token: true,
      expiresAt: true,
      categoryId: true,
      createdAt: true,
    },
  });

  return NextResponse.json(shareLink, { status: 201 });
}

export async function DELETE(request: Request) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.ok) return adminCheck.error;

  const body = await request.json().catch(() => null);
  const parsed = deleteShareSchema.safeParse(body);

  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors;
    const errorMessage = Object.values(errors).flat()[0] || '请求参数错误';
    return NextResponse.json({ error: errorMessage }, { status: 400 });
  }

  const { id } = parsed.data;

  // 检查分享链接是否存在
  const shareLink = await prisma.shareLink.findUnique({
    where: { id },
  });

  if (!shareLink) {
    return NextResponse.json({ error: '分享链接不存在' }, { status: 404 });
  }

  // 删除分享链接
  await prisma.shareLink.delete({
    where: { id },
  });

  return NextResponse.json({ success: true });
}
