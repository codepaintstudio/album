import { idSchema, optionalIdSchema, visibilitySchema } from '@/lib/validation';
import { describe, expect, it } from 'vitest';

describe('idSchema', () => {
  it('接受合法自增主键', () => {
    for (const value of [1, 42, 2147483647]) {
      expect(idSchema.safeParse(value).success).toBe(true);
    }
  });

  it('拒绝 0 与负数（此前 9 处放行，会一路流到 prisma.update/delete 变成裸 500）', () => {
    for (const value of [0, -1, -99999]) {
      expect(idSchema.safeParse(value).success).toBe(false);
    }
  });

  it('拒绝非整数与 NaN/Infinity', () => {
    for (const value of [1.5, NaN, Infinity, -Infinity]) {
      expect(idSchema.safeParse(value).success).toBe(false);
    }
  });

  it('拒绝字符串 id：JSON 接口不做隐式转换', () => {
    for (const value of ['1', '42']) {
      expect(idSchema.safeParse(value).success).toBe(false);
    }
  });

  it('拒绝 null 与 undefined', () => {
    expect(idSchema.safeParse(null).success).toBe(false);
    expect(idSchema.safeParse(undefined).success).toBe(false);
  });

  it('拒绝超出 MySQL 有符号 INT 的值：1e21 被 .int() 连坐拒掉，3e9 只能靠 .max()', () => {
    // zod 的 .int() 要求"安全整数"，所以它自己就拒 1e21；真正需要 .max() 兜住的是
    // 2^31-1 到安全整数上限之间那段——3000000000 是合法安全整数，却是 MySQL INT 溢出。
    expect(Number.isSafeInteger(1e21)).toBe(false);
    expect(Number.isSafeInteger(3000000000)).toBe(true);

    expect(idSchema.safeParse(1e21).success).toBe(false);
    expect(idSchema.safeParse(2147483648).success).toBe(false);
    expect(idSchema.safeParse(3000000000).success).toBe(false);
  });

  it('错误信息说清是哪一条规则没通过', () => {
    expect(idSchema.safeParse(0).error?.issues[0].message).toBe('ID 必须为正整数');
    expect(idSchema.safeParse(1.5).error?.issues[0].message).toBe('ID 必须是整数');
    expect(idSchema.safeParse(3000000000).error?.issues[0].message).toBe('ID 超出范围');
  });
});

describe('optionalIdSchema', () => {
  it('缺省合法，但给了就必须是合法 id（transferToUserId 就是这个形状）', () => {
    expect(optionalIdSchema.safeParse(undefined).success).toBe(true);
    expect(optionalIdSchema.safeParse(7).success).toBe(true);
    expect(optionalIdSchema.safeParse(0).success).toBe(false);
    expect(optionalIdSchema.safeParse(null).success).toBe(false);
  });
});

describe('visibilitySchema（既有导出，此前无测试）', () => {
  it('只认 private/internal/public', () => {
    for (const value of ['private', 'internal', 'public']) {
      expect(visibilitySchema.safeParse(value).success).toBe(true);
    }
    for (const value of ['restricted', 'PUBLIC', '', null, undefined]) {
      expect(visibilitySchema.safeParse(value).success).toBe(false);
    }
  });
});
