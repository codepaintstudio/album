import { NextResponse } from 'next/server';

/**
 * 把 Prisma 的已知请求错误映射成 HTTP 状态码。
 *
 * 存在的理由：P2025/P2003 在整个仓库里从来没有出现过一次，所以一个"格式合法但不存在"
 * 的 id 会一路冒到 Next 的默认错误处理，客户端拿到裸 500；而前端一律读 `body.error`
 * 或 `json.message`，500 的响应体里没有这两个键，于是只显示一句通用的兜底文案。
 * 缺陷 D（删除用户时撞外键）与缺陷 F（删除不存在的文件集）都需要这个映射才有意义，
 * 没有它，那些修复只会把一种误导性 500 换成另一种。
 *
 * 为什么是鸭子类型而不是 instanceof：本机与 CI 都没有生成 Prisma 客户端
 * （types/prisma-client.d.ts 是手写声明，运行时来自 scripts/create-prisma-stub.cjs），
 * 那个 stub 的 Prisma 对象里根本没有 PrismaClientKnownRequestError 这个类。
 *
 * 但鸭子类型有个这仓库真会踩的坑：@volcengine/tos-sdk 的 TosServerError 同样带一个
 * `code: string`（'NoSuchKey'、'AccessDenied'…）。所以必须同时要求 name 与 P 形码，
 * 否则一次对象存储故障会被误报成 404/409，把可重试的上游错误洗成客户端错误。
 *
 * 本模块可以 import next/server：next/server 不拉 server-only，因此 prismaErrorCode
 * 与 mapPrismaError 仍然能在纯 node 环境下脱离数据库单测。
 */

const PRISMA_KNOWN_REQUEST_ERROR = 'PrismaClientKnownRequestError';
const PRISMA_CODE = /^P\d{4}$/;

export type MappedError = {
  status: 400 | 404 | 409 | 500;
  message: string;
  code: string;
};

/** 命中 Prisma 已知错误时返回其 P 形码，否则 null（包括一切 TosServerError）。 */
export function prismaErrorCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;

  const candidate = error as { name?: unknown; code?: unknown };
  if (candidate.name !== PRISMA_KNOWN_REQUEST_ERROR) return null;

  const { code } = candidate;
  return typeof code === 'string' && PRISMA_CODE.test(code) ? code : null;
}

/**
 * 文案只说结论，不带 `meta.target`、表名或任何 SQL 片段：这些接口的调用方
 * 包含匿名访客能看到的分享页，错误信息不是日志。
 */
export function mapPrismaError(error: unknown): MappedError {
  switch (prismaErrorCode(error)) {
    case 'P2025':
      return { status: 404, message: '记录不存在', code: 'not_found' };
    case 'P2003':
      return {
        status: 409,
        message: '仍存在关联数据，请先处置后重试',
        code: 'related_records_remain',
      };
    case 'P2002':
      return { status: 409, message: '该值已被占用', code: 'unique_conflict' };
    default:
      return { status: 500, message: '操作失败', code: 'internal_error' };
  }
}

/**
 * 相册域与云盘域的响应包络历来不同：前者是 `{ error }`，后者是 `{ message }`
 * （前端分别读 body.error 与 json.message）。统一它要同时改 11 个 route 和 6 个
 * 组件，关掉的却是一个不会坏的不一致，所以本批保留现状——但把差异收在这一个参数里，
 * 而不是让它以两份复制的样板长在每个文件里。
 *
 * 只有落到 500 的才打日志：404/409 是调用方的问题，不是服务端故障，
 * 混在错误日志里只会淹掉后者。
 */
export function prismaErrorResponse(
  error: unknown,
  envelope: 'error' | 'message' = 'error'
): NextResponse {
  const mapped = mapPrismaError(error);
  if (mapped.status === 500) {
    console.error(error);
  }
  return NextResponse.json(
    { [envelope]: mapped.message, code: mapped.code },
    { status: mapped.status }
  );
}
