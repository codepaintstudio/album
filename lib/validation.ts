import { VISIBILITIES } from '@/lib/access-rules';
import { z } from 'zod';

export const visibilitySchema = z.enum(VISIBILITIES);

/**
 * 所有自增主键的共用校验。
 *
 * .positive() 之前只在 photos/upload 两处手写，其余 9 处放行了 0 与负数：它们对
 * findUnique 无害（匹配不到），但会流到 prisma.update/delete 上变成 P2025 → 裸 500。
 *
 * .max() 挡住的是 2^31-1 到安全整数上限之间的那些值。zod 的 .int() 只要求它是
 * 安全整数（所以它连 1e21 都会拒），而这里每一列都是 MySQL 有符号 INT：
 * 3000000000 能通过 .int()，却会在驱动层报错，放行它只是把 400 换成 500。
 */
const MAX_INT32 = 2147483647;

export const idSchema = z
  .number()
  .int('ID 必须是整数')
  .positive('ID 必须为正整数')
  .max(MAX_INT32, 'ID 超出范围');

export const optionalIdSchema = idSchema.optional();

/** Path/query/form IDs arrive as decimal strings; reject whitespace, fractions, and suffix junk. */
export const idStringSchema = z
  .string()
  .regex(/^\d+$/u, 'ID 必须是十进制整数')
  .transform(value => Number(value))
  .pipe(idSchema);
