/**
 * 可见性规则的唯一归属地。纯函数、零运行时依赖，因此同一份判断既能被服务端组件
 * 使用，也能被 route handler 使用，还能脱离数据库单测。
 *
 * 只使用裸字符串字面量：types/prisma-client.d.ts 把 Prisma 的 *WhereInput 声明为
 * Record<string, unknown>，任何 where 子句都不受类型检查，写错只能靠测试矩阵发现。
 */

export const VISIBILITIES = ['private', 'internal', 'public'] as const;

export type Visibility = (typeof VISIBILITIES)[number];
export type Role = 'admin' | 'member';

/** null 表示匿名访客 */
export type Viewer = { id: number; role: Role } | null;

/**
 * 相册访问裁决，而不是布尔：页面需要据此在 notFound() 与 redirect('/login') 之间选择，
 * API 需要据此在 404 与 401 之间选择。规则由这里裁定，响应形式仍归调用方。
 */
export type CategoryVerdict = 'allow' | 'not-found' | 'login';

type CategoryLike = { visibility: Visibility };
type FileSetLike = { visibility: Visibility; createdBy: number };

const MEMBER_VISIBLE: Visibility[] = ['internal', 'public'];

// —— 相册：以读者为绝对（匿名可浏览 public）——

export function categoryWhereFor(viewer: Viewer): Record<string, unknown> {
  if (!viewer) return { visibility: 'public' };
  if (viewer.role === 'admin') return {};
  return { visibility: { in: MEMBER_VISIBLE } };
}

export function canViewCategory(viewer: Viewer, category: CategoryLike): CategoryVerdict {
  if (viewer?.role === 'admin') return 'allow';
  if (category.visibility === 'public') return 'allow';
  if (category.visibility === 'internal') return viewer ? 'allow' : 'login';
  return 'not-found';
}

export function canUploadToCategory(viewer: Viewer, category: CategoryLike): boolean {
  if (!viewer) return false;
  return viewer.role === 'admin' || category.visibility !== 'private';
}

// —— 文件集：必须登录，且以拥有者为相对（各入口的 requireAuth 仍各自保留）——

export function fileSetWhereFor(viewer: NonNullable<Viewer>): Record<string, unknown> {
  if (viewer.role === 'admin') return {};
  return {
    OR: [{ visibility: 'internal' }, { visibility: 'public' }, { createdBy: viewer.id }],
  };
}

/** 读取与上传目前共享同一个布尔式，因此合并为一个谓词 */
export function canTouchFileSet(viewer: NonNullable<Viewer>, fileSet: FileSetLike): boolean {
  return (
    viewer.role === 'admin' ||
    fileSet.visibility === 'public' ||
    fileSet.visibility === 'internal' ||
    fileSet.createdBy === viewer.id
  );
}
