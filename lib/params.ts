/**
 * 读取 searchParams 的纯函数。服务端组件与未来的单测共用，不依赖 Next。
 */
import { idStringSchema } from '@/lib/validation';

export type ParamValue = string | string[] | undefined;
export type SearchParams = Record<string, ParamValue>;

function first(value: ParamValue): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export function readString(params: SearchParams, key: string): string {
  return first(params[key]) ?? '';
}

export function readInt(params: SearchParams, key: string): number | null {
  const raw = first(params[key]);
  if (!raw || !/^-?\d+$/u.test(raw)) return null;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

/** Reads a strict positive int32 path/query ID. */
export function readId(params: SearchParams, key: string): number | null {
  const raw = first(params[key]);
  if (raw === undefined) return null;
  const parsed = idStringSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export function readSort(params: SearchParams): 'asc' | 'desc' {
  return readString(params, 'sort') === 'asc' ? 'asc' : 'desc';
}

/** 白名单取值：URL 里是别的东西时退回默认值，而不是把非法值带进查询 */
export function readEnum<T extends string>(
  params: SearchParams,
  key: string,
  allowed: readonly T[],
  fallback: T
): T {
  const raw = readString(params, key);
  return (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback;
}

/**
 * 把请求的页码钳进真实范围：删掉最后一页的最后一个条目后，
 * 刷新应落在新的末页，而不是一片空白。
 */
export function clampPage(page: number | null, total: number, pageSize: number): number {
  const last = Math.max(1, Math.ceil(total / pageSize));
  if (page === null || page < 1) return 1;
  return Math.min(page, last);
}
