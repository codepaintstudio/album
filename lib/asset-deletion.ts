/**
 * "删掉这批行要动存储里的哪些对象"——这条决定的唯一归属地。
 * 纯函数、零运行时依赖，分层理由与 lib/access-rules.ts 相同：同一份判断既能被 route
 * handler 使用，也能脱离数据库与对象存储单测。
 *
 * 存在的理由：这个判断此前散在三处，且每处都不一样——
 * - app/api/photos/route.ts 用 `photo.mediaType === 'image' ? … : …` 现场重推；
 * - app/api/filesets/[id]/route.ts 硬编码 deleteFileAsset；
 * - app/api/categories/route.ts 与 app/api/users/route.ts 干脆什么都没做。
 *
 * 关键是 kind 与 domain 被绑在同一个联合成员上：域决定前缀，于是"云盘文件被路由到
 * uploads/ 前缀"在这个类型下**不可表示**。这不是洁癖——TOS 删一个不存在的键返回 204
 * 而不是 NoSuchKey，所以 deleteUploadObject(云盘 filename) 不只是空操作，它会报告成功，
 * 泄漏掉真正的对象而没有任何调用方能察觉。唯一可靠的防线是让它写不出来。
 */

export type AssetDomain = 'photo' | 'drive';

/**
 * 删除动作的最小单位。kind 是一个封闭标签联合：它唯一决定 lib/storage 的哪个单元
 * 算子被调用，而 domain 由 kind 决定，调用方无从选择。
 */
export type CleanupUnit =
  /** uploads/{filename} + uploads/thumbnails/thumb-{filename} */
  | { readonly kind: 'image-assets'; readonly domain: 'photo'; readonly filename: string }
  /** uploads/{filename} —— 相册域的视频，没有缩略图 */
  | { readonly kind: 'upload-object'; readonly domain: 'photo'; readonly filename: string }
  /** files/{filename} —— 云盘域 */
  | { readonly kind: 'file-asset'; readonly domain: 'drive'; readonly filename: string };

export type CleanupUnitKind = CleanupUnit['kind'];

/**
 * mediaType 故意用 string 而不是 'image' | 'video'：types/prisma-client.d.ts 让
 * Prisma 的真实类型在这个环境里不存在，运行时拿到的值未必落在枚举内。
 * 用字面量联合来自证清白是谎话，宁可让 unitForPhoto 对脏数据做保守处理。
 */
export type PhotoLike = { readonly filename: string; readonly mediaType: string };
export type FileLike = { readonly filename: string };

export type CleanupPlan = {
  units: CleanupUnit[];
  /** 因 filename 为空而被跳过的原始值，调用方需要把它报出去而不是假装无事发生。 */
  skipped: string[];
};

export type CleanupFailure = {
  /** config = ConfigurationError（环境没配好，重试也不会成功）；storage = 传输层错误。 */
  reason: 'config' | 'storage';
  kind: CleanupUnitKind;
  filename: string;
  message: string;
};

const OBJECTS_PER_UNIT: Record<CleanupUnitKind, number> = {
  'image-assets': 2,
  'upload-object': 1,
  'file-asset': 1,
};

/**
 * 只有明确写着 video 的才按单个原图对象处理，其它任何值（''、null、'IMAGE'、
 * 枚举漂移出来的新值）一律按图片处理。
 *
 * 方向是故意的：多删一个本不存在的缩略图只是 204 no-op，漏删一个真实缩略图则是
 * 永久且无人可寻的泄漏。注意这与旧实现相反——旧写法对损坏行会走少删一侧。
 */
export function unitForPhoto(photo: PhotoLike): CleanupUnit {
  return photo.mediaType === 'video'
    ? { kind: 'upload-object', domain: 'photo', filename: photo.filename }
    : { kind: 'image-assets', domain: 'photo', filename: photo.filename };
}

/** 没有任何入参能改变这个结果：云盘域永远只走 files/ 前缀。 */
export function unitForFile(file: FileLike): CleanupUnit {
  return { kind: 'file-asset', domain: 'drive', filename: file.filename };
}

export function objectsTouchedBy(unit: CleanupUnit): number {
  return OBJECTS_PER_UNIT[unit.kind];
}

/** 应当从桶里消失的键数，与 units.length（删除调用数）不同。 */
export function objectCount(units: readonly CleanupUnit[]): number {
  return units.reduce((total, unit) => total + objectsTouchedBy(unit), 0);
}

export function planPhotoUnits(rows: readonly PhotoLike[]): CleanupPlan {
  return planUnits(rows.map(unitForPhoto));
}

export function planFileUnits(rows: readonly FileLike[]): CleanupPlan {
  return planUnits(rows.map(unitForFile));
}

/**
 * 丢掉空 filename 的单位，并按 (kind, filename) 去重、保留首次出现顺序。
 *
 * 空值必须丢而不是传下去：buildObjectKey('') 得到的就是 `uploads/` 这个前缀标记对象，
 * 而对它的删除会成功。去重则让 objectCount 成为"本该死掉多少个"的可信数字。
 */
function planUnits(units: readonly CleanupUnit[]): CleanupPlan {
  const seen = new Set<string>();
  const kept: CleanupUnit[] = [];
  const skipped: string[] = [];

  for (const unit of units) {
    if (typeof unit.filename !== 'string' || unit.filename.trim() === '') {
      skipped.push(String(unit.filename));
      continue;
    }
    const key = `${unit.kind}:${unit.filename}`;
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(unit);
  }

  return { units: kept, skipped };
}

/** 让执行器的 switch 穷尽性成为编译期检查，而不是靠人盯。 */
export function assertNever(value: never): never {
  throw new Error(`未处理的清理单位类型：${JSON.stringify(value)}`);
}

// ========= 编排（纯，靠注入执行器脱离对象存储单测） =========

/**
 * 单个单位的结局。执行器**不抛异常**而是返回它，是为了让"这是环境没配好"与
 * "这是一次可以重试的传输故障"这两种失败在纯层就能被区分——那个判断决定客户端
 * 收到 500 还是 502，不该被锁在只有真实 TOS 才能触发的代码路径里。
 */
export type UnitOutcome = { ok: true } | { ok: false; reason: 'config' | 'storage' };

export interface AssetDeleter {
  /** 预检。返回 false 时不应发起任何删除，也不应删任何行。 */
  ensureConfigured(): boolean;
  deleteUnit(unit: CleanupUnit): Promise<UnitOutcome>;
}

/** 失败结果只带数量：具体是哪个键失败进日志，不透给客户端。 */
export type CleanupFailureResult = {
  attempted: number;
  objectTotal: number;
  failed: number;
  misconfigured: boolean;
};

export type CleanupResult<T> =
  | { ok: true; result: T; objectTotal: number }
  | ({ ok: false } & CleanupFailureResult);

/**
 * 先删对象，全部成功后才删行。这是仓库里唯一的删除顺序，且没有任何导出函数能单独删行。
 *
 * 四条策略，每条都对应一次真实的失败模式：
 * 1. units 为空直通 deleteRows()——一个没有照片的分类仍应能被删掉。
 * 2. 预检失败时不发起 N 次注定失败的删除，也不碰行：4000 张照片的场合会把同一句
 *    错误重复 4000 遍。
 * 3. 用 allSettled 收集而不是 all：一个死键不该把另外 400 个成功藏起来（缺陷 F 正是
 *    allSettled 的结果从不上报，于是整桶失败仍返回 {ok:true}）。
 * 4. 有任何失败就不写行、返回非 2xx：行还在，重试可收敛。
 *
 * 反过来（先删行）时行一旦没了，filename 就是那些对象唯一的记录，泄漏从此不可追溯。
 *
 * deleteRows() 的异常刻意不吞：那时对象已经删掉了，这是唯一需要人介入的状态，
 * 也正是选了"对象先"才换来它可被追溯（行仍带着 filename，重试会删一个已不存在的键
 * 并得到 204）。由调用方交给 prismaErrorResponse 映射。
 */
export async function deleteAssetsThenRowsWith<T>(
  units: readonly CleanupUnit[],
  deleter: AssetDeleter,
  deleteRows: () => Promise<T>
): Promise<CleanupResult<T>> {
  const objectTotal = objectCount(units);

  if (units.length === 0) {
    return { ok: true, result: await deleteRows(), objectTotal };
  }

  if (!deleter.ensureConfigured()) {
    return { ok: false, attempted: 0, objectTotal, failed: 0, misconfigured: true };
  }

  const settled = await Promise.allSettled(units.map(unit => deleter.deleteUnit(unit)));

  const failures: Array<'config' | 'storage'> = [];
  for (const entry of settled) {
    // 执行器按约定不抛，rejected 只能是编程错误；按可重试的存储故障处理，行照样保住。
    if (entry.status === 'rejected') {
      failures.push('storage');
    } else if (!entry.value.ok) {
      failures.push(entry.value.reason);
    }
  }

  if (failures.length > 0) {
    return {
      ok: false,
      attempted: units.length,
      objectTotal,
      failed: failures.length,
      misconfigured: failures.includes('config'),
    };
  }

  return { ok: true, result: await deleteRows(), objectTotal };
}

// ========= 删除用户：资产处置决策 =========

/**
 * User 上每一个会阻止删除的关系（Prisma 对必填关系默认 Restrict，所以删除会撞 P2003）。
 *
 * 这些字段名必须与 prisma/schema.prisma 里 model User 的反向关系逐字一致。本环境的
 * Prisma 委托参数是 any，写错一个字母 tsc 与 CI 都不会报，而它会把"这个用户到底有
 * 什么"数成一个错误的 0，于是放行一次必然撞外键的删除。
 * __tests__/schema-invariants.test.ts 把这条钉住。
 *
 * 下面这个 select 对象是这三处 _count 查询（删除接口、管理页 RSC）唯一的书写处：
 * 名单本身只长在这里，调用点抄不出第四个名字，也漏不掉一个。
 */
export const USER_ASSET_COUNT_SELECT = {
  photos: true,
  filesUploaded: true,
  fileSetsCreated: true,
} as const;

export const USER_RESTRICTING_RELATIONS = Object.keys(
  USER_ASSET_COUNT_SELECT
) as (keyof typeof USER_ASSET_COUNT_SELECT)[];

/** 上面那份 select 的返回形状：两个消费点都从这里取，名字不再各自硬写一遍。 */
export type UserAssetCounts = { [K in keyof typeof USER_ASSET_COUNT_SELECT]: number };

/**
 * 'delete' 目前是**写出来就会被拒**的取值：本系统的处置方式是转移，用户删除不销毁任何
 * 资产。留着这个标签是有意的——将来放开"连资产一并销毁"时，需要的是在这里加一条规则，
 * 而不是再设计一遍决策表，且销毁路径可以直接复用 deleteAssetsThenRowsWith。
 */
export type AssetDisposition = 'transfer' | 'delete';

export type UserDeleteInput = {
  photoCount: number;
  fileCount: number;
  fileSetCount: number;
  photoDecision?: AssetDisposition;
  driveDecision?: AssetDisposition;
  transferToUserId?: number;
  /** 正要被删除的那个用户。 */
  targetUserId: number;
  isSelf: boolean;
  isTargetAdmin: boolean;
  adminCount: number;
  transferTargetExists: boolean;
  transferTargetActive: boolean;
};

export type UserDeletePlan =
  | { ok: false; errors: string[] }
  | {
      ok: true;
      photos: AssetDisposition | 'none';
      drive: AssetDisposition | 'none';
      transferToUserId?: number;
    };

/**
 * 删除用户前把每一条违规**一次全部**报出来。
 *
 * 旧实现是逐条揭示：先只问照片（app/api/users/route.ts 的 deletePhotos 分支），
 * 照片处置完才在 prisma.user.delete 上撞它从没问过的云盘外键，返回一个裸 500——
 * 此时照片行已被销毁而它们的对象永远留在桶里。把决策做成前置的纯函数表之后，
 * 那条路径不存在了：任何写发生之前，所有会被 Restrict 的关系都已处置干净。
 */
export function planUserDelete(input: UserDeleteInput): UserDeletePlan {
  const errors: string[] = [];
  const hasPhotos = input.photoCount > 0;
  const hasDrive = input.fileCount > 0 || input.fileSetCount > 0;

  if (input.isSelf) {
    errors.push('不能删除自己的账户');
  }
  if (input.isTargetAdmin && input.adminCount <= 1) {
    errors.push('这是系统中唯一的管理员，删除后将无人可管理后台');
  }

  const domains: Array<[string, AssetDisposition | undefined, boolean]> = [
    ['照片', input.photoDecision, hasPhotos],
    ['云盘', input.driveDecision, hasDrive],
  ];

  for (const [label, decision, hasRows] of domains) {
    // 该域没有行就不需要决定：没有资产的用户应能被直接删除，今天恰恰是这个分支
    // 被 `userToDelete._count.photos > 0` 之外的条件挡住了。
    if (!hasRows) continue;
    if (!decision) {
      errors.push(`该用户有${label}资产，请选择如何处置`);
      continue;
    }
    if (decision !== 'transfer') {
      errors.push(`${label}目前只能转移给其他用户，不支持随删除一并销毁`);
    }
  }

  const needsTransfer = hasPhotos || hasDrive;

  if (needsTransfer) {
    if (input.transferToUserId === undefined) {
      errors.push('缺少资产转移的目标用户');
    } else {
      if (input.transferToUserId === input.targetUserId) {
        errors.push('不能把资产转移给正在被删除的用户');
      }
      if (!input.transferTargetExists) {
        errors.push('目标用户不存在');
      } else if (!input.transferTargetActive) {
        errors.push('目标账户尚未激活，不能接收资产');
      }
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    photos: hasPhotos ? 'transfer' : 'none',
    drive: hasDrive ? 'transfer' : 'none',
    transferToUserId: needsTransfer ? input.transferToUserId : undefined,
  };
}
