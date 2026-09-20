import {
  type AssetDeleter,
  type CleanupFailureResult,
  type CleanupPlan,
  type CleanupResult,
  type CleanupUnit,
  assertNever,
  deleteAssetsThenRowsWith,
  planFileUnits,
  planPhotoUnits,
} from '@/lib/asset-deletion';
import { prisma } from '@/lib/db';
import {
  ConfigurationError,
  deleteFileAsset,
  deleteImageAssets,
  deleteUploadObject,
  ensureStorageConfigured,
} from '@/lib/storage';
import { NextResponse } from 'next/server';
import 'server-only';

/**
 * 资产清理的执行层：把 lib/asset-deletion.ts 里那套与存储无关的策略接到 TOS 上，
 * 外加必须走数据库的子项枚举。
 *
 * 顺序、失败聚合、"有任何失败就不写行"这些判断都不在这里——它们在纯层，
 * 因此能脱离数据库与对象存储被单测。这个文件只负责三件事：调哪个单元算子、
 * 异常如何分类、以及失败响应长什么样。
 */

const tosDeleter: AssetDeleter = {
  ensureConfigured() {
    try {
      ensureStorageConfigured();
      return true;
    } catch (error) {
      console.error('[asset-cleanup] 对象存储未配置，放弃删除并保留数据行', error);
      return false;
    }
  },

  /** 按 AssetDeleter 的约定不抛异常，只回报失败原因。 */
  async deleteUnit(unit: CleanupUnit) {
    try {
      await runUnit(unit);
      return { ok: true } as const;
    } catch (error) {
      console.error('[asset-cleanup] 单个对象删除失败', unit.kind, unit.filename, error);
      return {
        ok: false as const,
        reason: error instanceof ConfigurationError ? ('config' as const) : ('storage' as const),
      };
    }
  },
};

/**
 * 仓库里唯一的删除入口：先删对象，全部成功后才执行 deleteRows()。
 * 语义与四条失败策略见 lib/asset-deletion.ts 的 deleteAssetsThenRowsWith。
 */
export function deleteAssetsThenRows<T>(
  units: readonly CleanupUnit[],
  deleteRows: () => Promise<T>
): Promise<CleanupResult<T>> {
  return deleteAssetsThenRowsWith(units, tosDeleter, deleteRows);
}

/**
 * 在删除父行之前枚举其下所有照片的对象键。
 *
 * 这个"之前"是承重的：Photo.category 带 onDelete: Cascade，父行一删，这些行就在库内
 * 消失了，而它们是这些对象存在过的唯一记录。缺陷 B 的成因正是没有这一步。
 */
export async function listPhotoUnitsOfCategory(categoryId: number): Promise<CleanupPlan> {
  const rows = (await prisma.photo.findMany({
    where: { categoryId },
    select: { filename: true, mediaType: true },
  })) as Array<{ filename: string; mediaType: string }>;

  return planPhotoUnits(rows);
}

/** 同上：File.fileSet 也是级联，必须先取文件名。 */
export async function listFileUnitsOfFileSet(filesetId: number): Promise<CleanupPlan> {
  const rows = (await prisma.file.findMany({
    where: { filesetId },
    select: { filename: true },
  })) as Array<{ filename: string }>;

  return planFileUnits(rows);
}

/**
 * 穷尽的 switch：加第四种 CleanupUnit 却忘了在这里处理会是编译错误。
 * 这已经是这个仓库能拿到的最强保证——Prisma 的委托参数是 any，字段名拼错什么都不会报。
 */
async function runUnit(unit: CleanupUnit): Promise<void> {
  switch (unit.kind) {
    case 'image-assets':
      return deleteImageAssets(unit.filename);
    case 'upload-object':
      return deleteUploadObject(unit.filename);
    case 'file-asset':
      return deleteFileAsset(unit.filename);
    default:
      return assertNever(unit);
  }
}

/**
 * 包络键沿用各域现状（相册/用户 {error}，云盘 {message}），理由见
 * lib/prisma-errors.ts 里的同一个参数。
 *
 * 部分失败必须是非 2xx：行还在，客户端若把这当成功，用户会以为删掉了而对象与行都活着。
 * 502 而不是 500——那是上游存储的故障，与本应用自己的错误分开，也提示重试有可能成功。
 */
export function cleanupErrorResponse(
  outcome: { ok: false } & CleanupFailureResult,
  envelope: 'error' | 'message' = 'error'
): NextResponse {
  if (outcome.misconfigured) {
    return NextResponse.json(
      { [envelope]: '对象存储配置错误', code: 'storage_misconfigured' },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      [envelope]: '对象存储删除失败，媒体已保留未删除，请重试',
      code: 'storage_cleanup_failed',
      attempted: outcome.attempted,
      objectTotal: outcome.objectTotal,
      failed: outcome.failed,
    },
    { status: 502 }
  );
}

/** 空 filename 被跳过是异常数据信号，值得出声，但不必因此让整个请求失败。 */
export function reportSkippedNames(scope: string, skipped: string[]): void {
  if (skipped.length > 0) {
    console.warn(
      `[asset-cleanup] ${scope}：${skipped.length} 条记录的 filename 为空，已跳过其对象删除`
    );
  }
}
