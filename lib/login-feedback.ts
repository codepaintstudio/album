/**
 * 把 NextAuth 回传的字符串变成一个可渲染的结论。纯函数、零依赖。
 *
 * 为什么需要它：NextAuth 的 credentials 流程只给我们一个字符串——authorize() 抛出
 * 的错误消息会被编码进 /api/auth/error?error=…，再由 next-auth/react 解出来塞进
 * response.error。于是"这次登录失败到底是密码错了、还是账户没通过审核"完全取决于
 * 对一段散文做子串匹配。
 *
 * 而组件里那段匹配是错的：`components/login-form.tsx` 原来只测
 * `待审核|审核`，而 lib/auth.ts 抛出的「账户已被拒绝，无法登录」两个词都不含，
 * 于是**密码正确但被管理员拒绝的用户被告知"用户名或密码错误"**——一个会说谎的
 * 提示，用户会一直重试自己的正确密码。
 *
 * 匹配用的是两个词各自独有的特征串（`待审核` / `被拒绝`）而不是共享的"审核"，
 * 且文案本身由下面的常量唯一提供、lib/auth.ts 也从这里取：两处各写一遍文案时，
 * 改文案就会静默把某个分支降级成 invalid。
 */

export type LoginFeedback = 'pending' | 'rejected' | 'invalid';

/** 既是给用户看的话，也是 authorize() 抛出去的话——只有这一个来源。 */
export const LOGIN_FEEDBACK_TEXT: Record<LoginFeedback, string> = {
  pending: '账户待审核，请等待管理员通过',
  rejected: '账户已被拒绝，无法登录',
  invalid: '用户名或密码错误',
};

/**
 * 一切未知都归到 invalid。
 *
 * 特意如此：'CredentialsSignin' 是 authorize() 返回 null（即密码错或用户不存在）时
 * NextAuth 发的字面量；此外还可能是 'Configuration'、网络层文本、任何东西。把它们
 * 统统显示成"用户名或密码错误"既是最保守的措辞，也不会把内部配置问题泄露到登录页。
 */
export function classifySignInError(error: string | undefined | null): LoginFeedback {
  if (!error) return 'invalid';
  if (error.includes('待审核')) return 'pending';
  if (error.includes('被拒绝')) return 'rejected';
  return 'invalid';
}

/** 受限（而非"密码错了"）的两种状态，UI 用它决定渲染成告警还是错误。 */
export function isAccountBlocked(feedback: LoginFeedback): feedback is 'pending' | 'rejected' {
  return feedback === 'pending' || feedback === 'rejected';
}
