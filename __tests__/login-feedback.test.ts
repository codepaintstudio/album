import { LOGIN_FEEDBACK_TEXT, classifySignInError, isAccountBlocked } from '@/lib/login-feedback';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('classifySignInError 分类矩阵', () => {
  const table: Array<[string, Parameters<typeof classifySignInError>[0], string]> = [
    ['待审核文案', LOGIN_FEEDBACK_TEXT.pending, 'pending'],
    ['被拒文案', LOGIN_FEEDBACK_TEXT.rejected, 'rejected'],
    ['密码错（NextAuth 字面量）', 'CredentialsSignin', 'invalid'],
    ['undefined', undefined, 'invalid'],
    ['null', null, 'invalid'],
    ['空串', '', 'invalid'],
    ['任意其它散文', 'Something went wrong', 'invalid'],
    ['配置问题也不外泄', 'MissingSecret', 'invalid'],
  ];

  for (const [label, input, expected] of table) {
    it(`${label} ⇒ ${expected}`, () => {
      expect(classifySignInError(input)).toBe(expected);
    });
  }

  it('被拒用户不再被告知"用户名或密码错误"（本次修复的那条谎报）', () => {
    // 旧实现只测 `待审核|审核`，而「账户已被拒绝，无法登录」一个都不含，于是密码
    // 正确却被拒绝的人看到的是一句让他继续重试的话。
    expect(classifySignInError(LOGIN_FEEDBACK_TEXT.rejected)).toBe('rejected');
    expect(classifySignInError(LOGIN_FEEDBACK_TEXT.rejected)).not.toBe('invalid');
  });
});

describe('两个特征串必须各自独有，否则匹配顺序会互相抢', () => {
  it('pending 的文案里不含 rejected 的特征串，反之亦然', () => {
    expect(LOGIN_FEEDBACK_TEXT.pending).toContain('待审核');
    expect(LOGIN_FEEDBACK_TEXT.pending).not.toContain('被拒绝');
    expect(LOGIN_FEEDBACK_TEXT.rejected).toContain('被拒绝');
    expect(LOGIN_FEEDBACK_TEXT.rejected).not.toContain('待审核');
  });

  it('旧匹配式的漏检原因：被拒文案一个特征词都不含，于是整条分支永不命中', () => {
    // 旧代码判的是 `response.error.includes('待审核') || includes('审核')`。
    // pending 命中，而「账户已被拒绝，无法登录」两个都不含 —— 不是顺序抢错，
    // 是那条分支根本不存在，所以它一路掉进 else 的"用户名或密码错误"。
    expect(LOGIN_FEEDBACK_TEXT.pending).toContain('审核');
    expect(LOGIN_FEEDBACK_TEXT.rejected).not.toContain('审核');
    expect(LOGIN_FEEDBACK_TEXT.rejected).not.toContain('待审核');
  });

  it('invalid 的文案不能被误分类成受限状态', () => {
    expect(isAccountBlocked(classifySignInError(LOGIN_FEEDBACK_TEXT.invalid))).toBe(false);
  });
});

describe('文案只有一个来源（lib/auth.ts 抛的就是它）', () => {
  const authSource = readFileSync('lib/auth.ts', 'utf8').replace(/\r\n/g, '\n');

  it('authorize() 引用 LOGIN_FEEDBACK_TEXT 而不是自己再写一遍', () => {
    expect(authSource).toContain('LOGIN_FEEDBACK_TEXT.pending');
    expect(authSource).toContain('LOGIN_FEEDBACK_TEXT.rejected');
  });

  it('lib/auth.ts 里不再存在手写的状态文案，因此改文案不会把某个分支降级成 invalid', () => {
    expect(authSource).not.toContain("'账户待审核");
    expect(authSource).not.toContain("'账户已被拒绝");
  });
});

describe('isAccountBlocked', () => {
  it('待审核与被拒绝算受限，密码错不算', () => {
    expect(isAccountBlocked('pending')).toBe(true);
    expect(isAccountBlocked('rejected')).toBe(true);
    expect(isAccountBlocked('invalid')).toBe(false);
  });
});
