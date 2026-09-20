import { mapPrismaError, prismaErrorCode, prismaErrorResponse } from '@/lib/prisma-errors';
import { describe, expect, it } from 'vitest';

/** 造一个尽可能像生成版客户端的对象。 */
function prismaError(code: unknown, meta: unknown = { target: 'User' }) {
  return Object.assign(new Error(`Prisma error ${code}`), {
    name: 'PrismaClientKnownRequestError',
    code,
    meta,
  });
}

describe('mapPrismaError 状态码矩阵', () => {
  const table: Array<[string, number, string]> = [
    ['P2025', 404, 'not_found'],
    ['P2003', 409, 'related_records_remain'],
    ['P2002', 409, 'unique_conflict'],
  ];

  for (const [code, status, expectCode] of table) {
    it(`${code} ⇒ ${status} / ${expectCode}`, () => {
      const mapped = mapPrismaError(prismaError(code));
      expect(mapped.status).toBe(status);
      expect(mapped.code).toBe(expectCode);
      expect(mapped.message.length).toBeGreaterThan(0);
    });
  }

  it('未知 P 码与一切非 Prisma 错误都落到 500，不猜语义', () => {
    for (const error of [prismaError('P9999'), new Error('boom'), null, undefined, 'P2025', {}]) {
      expect(mapPrismaError(error)).toEqual({
        status: 500,
        message: '操作失败',
        code: 'internal_error',
      });
    }
  });
});

describe('TosServerError 不能被误认成 Prisma 错误', () => {
  it('它同样带一个字符串 code，但那是对象存储的错误码', () => {
    const tosLike = Object.assign(new Error('NoSuchKey'), {
      name: 'TosServerError',
      code: 'NoSuchKey',
    });
    expect(prismaErrorCode(tosLike)).toBeNull();
    expect(mapPrismaError(tosLike).status).toBe(500);
  });

  it('AccessDenied 这种可重试的上游故障不能被洗成 404/409', () => {
    const tosLike = Object.assign(new Error('AccessDenied'), {
      name: 'TosServerError',
      code: 'AccessDenied',
    });
    const mapped = mapPrismaError(tosLike);
    expect(mapped.status).toBe(500);
    expect(mapped.code).toBe('internal_error');
  });
});

describe('识别条件必须 name 与 P 形码同时成立', () => {
  it('只有 code、没有 name ⇒ 不认', () => {
    expect(prismaErrorCode({ code: 'P2025' })).toBeNull();
  });

  it('只有 name、没有 code ⇒ 不认', () => {
    expect(prismaErrorCode({ name: 'PrismaClientKnownRequestError' })).toBeNull();
  });

  it('code 不是字符串（数字 2025）⇒ 不认', () => {
    expect(prismaErrorCode(prismaError(2025))).toBeNull();
  });

  it('code 形似但非 P 开头（2025、P20、P20255）⇒ 不认', () => {
    for (const code of ['2025', 'P20', 'P20255', 'X2025']) {
      expect(prismaErrorCode(prismaError(code))).toBeNull();
    }
  });

  it('name 是子类型（PrismaClientValidationError）⇒ 不认，交给 500', () => {
    expect(
      prismaErrorCode(
        Object.assign(new Error('validation'), {
          name: 'PrismaClientValidationError',
          code: 'P2025',
        })
      )
    ).toBeNull();
  });
});

describe('错误文案不外泄内部标识', () => {
  it('meta.target、表名与 SQL 片段都不出现在给客户端的消息里', () => {
    const leaky = prismaError('P2003', {
      target: '`album`.`File_uploader_fkey`',
      model: 'User',
      database: 'DROP TABLE',
    });
    const mapped = mapPrismaError(leaky);
    expect(mapped.message).not.toContain('album');
    expect(mapped.message).not.toContain('File_uploader_fkey');
    expect(mapped.message).not.toContain('User');
    expect(mapped.message).not.toContain('DROP');
    expect(mapped).not.toHaveProperty('meta');
  });

  it('P2025 不能被读成"删除失败"：缺陷 F 里不存在 id 的文件集应是 404 而非误导性的 500', () => {
    expect(mapPrismaError(prismaError('P2025')).status).toBe(404);
  });
});

describe('prismaErrorResponse 保留各域既有包络键', () => {
  it('相册与用户域用 error（前端读 body.error）', async () => {
    const response = prismaErrorResponse(prismaError('P2025'));
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: '记录不存在',
      code: 'not_found',
    });
  });

  it('云盘域用 message（前端读 json.message），不能被统一掉', async () => {
    const response = prismaErrorResponse(prismaError('P2025'), 'message');
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      message: '记录不存在',
      code: 'not_found',
    });
  });

  it('两条包络都不吞掉 code：它才是客户端能稳定分支的东西', async () => {
    const response = prismaErrorResponse(prismaError('P2003'), 'message');
    expect(response.status).toBe(409);
    const body = (await response.json()) as { code?: string };
    expect(body.code).toBe('related_records_remain');
  });
});
