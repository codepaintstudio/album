import { cookies } from 'next/headers';
import { createHmac, timingSafeEqual } from 'node:crypto';
import 'server-only';

/** 解锁凭证最长 8 小时，且不超过分享链接本身的有效期 */
const MAX_UNLOCK_MINUTES = 8 * 60;

/**
 * Secure 必须跟"实际用的协议"走，而不是 NODE_ENV：`next start` 在生产模式下
 * NODE_ENV=production，但用 http 提供服务时浏览器会直接丢弃 Secure cookie，
 * 表现为密码正确却仍停在门后。NEXTAUTH_URL 是应用对外地址，以它为准。
 */
function cookieSecure(): boolean {
  const publicUrl = process.env.NEXTAUTH_URL;
  if (publicUrl) return publicUrl.startsWith('https://');
  return process.env.NODE_ENV === 'production';
}

function gateValue(token: string): string {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error('NEXTAUTH_SECRET 未配置，无法签发分享解锁凭证');
  }
  return createHmac('sha256', secret).update(`share-gate:${token}`).digest('hex');
}

/** cookie-name 不能含冒号等字符，所以用连字符前缀 */
export function shareCookieName(token: string): string {
  return `share-${token}`;
}

export async function isShareUnlocked(token: string): Promise<boolean> {
  const store = await cookies();
  const value = store.get(shareCookieName(token))?.value;
  if (!value) return false;

  const expected = gateValue(token);
  const provided = Buffer.from(value);
  const accepted = Buffer.from(expected);
  return provided.length === accepted.length && timingSafeEqual(provided, accepted);
}

export function buildUnlockCookie(token: string, expiresAt: Date | null) {
  const remaining = expiresAt
    ? Math.floor((expiresAt.getTime() - Date.now()) / 60_000)
    : MAX_UNLOCK_MINUTES;
  const minutes = Math.max(1, Math.min(MAX_UNLOCK_MINUTES, remaining));

  return {
    name: shareCookieName(token),
    // 凭证由服务端密钥派生：分享密码本身既不入库为明文，也不写进 cookie
    value: gateValue(token),
    options: {
      httpOnly: true,
      sameSite: 'lax' as const,
      secure: cookieSecure(),
      path: `/share/${token}`,
      maxAge: minutes * 60,
    },
  };
}
