import {
  type AssetDeleter,
  type CleanupUnit,
  type PhotoLike,
  deleteAssetsThenRowsWith,
  objectCount,
  planFileUnits,
  planPhotoUnits,
  unitForFile,
  unitForPhoto,
} from '@/lib/asset-deletion';
import { describe, expect, it } from 'vitest';

const imagePhoto: PhotoLike = { filename: '1700-x.png', mediaType: 'image' };
const videoPhoto: PhotoLike = { filename: '1700-y.mp4', mediaType: 'video' };

describe('unitForPhoto 对 mediaType 的取值矩阵', () => {
  const cases: Array<[string, unknown, CleanupUnit['kind']]> = [
    ['image', 'image', 'image-assets'],
    ['video', 'video', 'upload-object'],
    ['空串', '', 'image-assets'],
    ['null', null, 'image-assets'],
    ['undefined', undefined, 'image-assets'],
    ['大写变体', 'IMAGE', 'image-assets'],
    ['枚举漂移出的新值', 'raw', 'image-assets'],
  ];

  for (const [label, mediaType, expected] of cases) {
    it(`mediaType=${label} ⇒ ${expected}`, () => {
      expect(unitForPhoto({ filename: 'a', mediaType: mediaType as string }).kind).toBe(expected);
    });
  }

  it('未知取值一律偏向超集：宁可多删一个不存在的缩略图（204 no-op），不可漏删真实缩略图（永久泄漏）', () => {
    // 与旧实现方向相反：app/api/photos/route.ts 原来是 `mediaType === 'image' ? 图片 : 视频`，
    // 脏数据会落到少删一侧。
    for (const mediaType of ['', 'null', 'IMAGE', 'raw', undefined]) {
      expect(unitForPhoto({ filename: 'a', mediaType: mediaType as string }).kind).toBe(
        'image-assets'
      );
    }
  });
});

describe('域不可能被路由错（这是本模块存在的理由）', () => {
  it('云盘文件在任何输入下都只产 file-asset / drive，没有任何入参能把它送去 uploads/', () => {
    for (const filename of ['a.pdf', '', '   ', 'x.png', 'x.mp4']) {
      const unit = unitForFile({ filename });
      expect(unit.kind).toBe('file-asset');
      expect(unit.domain).toBe('drive');
    }
  });

  it('相册域的视频与图片都留在 photo 域，不会跑到 files/', () => {
    const units = planPhotoUnits([imagePhoto, videoPhoto]).units;
    expect(units.every(unit => unit.domain === 'photo')).toBe(true);
    expect(units.some(unit => unit.domain === 'drive')).toBe(false);
  });

  it('kind 与 domain 的对应关系是唯一绑定的，不是调用方选的', () => {
    const byKind: Record<string, string> = {};
    for (const unit of [
      ...planPhotoUnits([imagePhoto, videoPhoto]).units,
      ...planFileUnits([{ filename: 'a.pdf' }]).units,
    ]) {
      byKind[unit.kind] = unit.domain;
    }
    expect(byKind).toEqual({
      'image-assets': 'photo',
      'upload-object': 'photo',
      'file-asset': 'drive',
    });
  });
});

describe('planPhotoUnits / planFileUnits 对空 filename 的处理', () => {
  it('空 filename 不产生删除单位', () => {
    expect(planPhotoUnits([{ filename: '', mediaType: 'image' }]).units).toEqual([]);
    expect(planPhotoUnits([{ filename: '   ', mediaType: 'video' }]).units).toEqual([]);
    expect(planFileUnits([{ filename: '' }]).units).toEqual([]);
  });

  it('被跳过的原始值要报出去，不能假装无事发生', () => {
    const plan = planPhotoUnits([imagePhoto, { filename: '', mediaType: 'image' }]);
    expect(plan.units).toHaveLength(1);
    expect(plan.skipped).toEqual(['']);
  });

  it('空的含义是不含任何非空白字符，而不是去掉首尾空白后非空——键名必须原样使用', () => {
    const plan = planPhotoUnits([{ filename: ' a.jpg ', mediaType: 'image' }]);
    expect(plan.units).toHaveLength(1);
    expect(plan.units[0].filename).toBe(' a.jpg ');
  });

  it('理由：buildObjectKey("") 得到的就是 uploads/ 这个前缀标记对象，而删它会成功', () => {
    expect(planPhotoUnits([{ filename: '', mediaType: 'video' }]).units).toEqual([]);
  });
});

describe('objectCount 区分"删除调用数"与"应当消失的键数"', () => {
  it('图片记 2 个键，相册视频与云盘文件各记 1 个', () => {
    expect(objectCount(planPhotoUnits([imagePhoto]).units)).toBe(2);
    expect(objectCount(planPhotoUnits([videoPhoto]).units)).toBe(1);
    expect(objectCount(planFileUnits([{ filename: 'a.pdf' }]).units)).toBe(1);
  });

  it('混合批次里两者相加', () => {
    const units = [
      ...planPhotoUnits([imagePhoto, videoPhoto]).units,
      ...planFileUnits([{ filename: 'a.pdf' }, { filename: 'b.txt' }]).units,
    ];
    expect(units).toHaveLength(4);
    expect(objectCount(units)).toBe(5);
  });

  it('去重后 objectCount 与实际键数一致，重复行不会双报', () => {
    const units = planPhotoUnits([imagePhoto, imagePhoto, imagePhoto]).units;
    expect(units).toHaveLength(1);
    expect(objectCount(units)).toBe(2);
  });
});

describe('按 (kind, filename) 去重并保留首次出现顺序', () => {
  it('同一文件名的图片与视频记录是两种单位，不应互相吞掉', () => {
    const units = planPhotoUnits([
      { filename: 'a', mediaType: 'image' },
      { filename: 'a', mediaType: 'video' },
    ]).units;
    expect(units.map(unit => unit.kind)).toEqual(['image-assets', 'upload-object']);
  });

  it('相册与云盘同名文件各自保留', () => {
    const photoUnits = planPhotoUnits([{ filename: 'same', mediaType: 'video' }]).units;
    const fileUnits = planFileUnits([{ filename: 'same' }]).units;
    expect(photoUnits).toHaveLength(1);
    expect(fileUnits).toHaveLength(1);
    expect(photoUnits[0].domain).not.toBe(fileUnits[0].domain);
  });

  it('空输入产出空计划：执行层据此仍会继续删行，没有照片的分类必须还能被删掉', () => {
    expect(planPhotoUnits([])).toEqual({ units: [], skipped: [] });
    expect(planFileUnits([])).toEqual({ units: [], skipped: [] });
    expect(objectCount([])).toBe(0);
  });
});

// ========= 删除编排：顺序与失败语义 =========

type Fake = AssetDeleter & {
  log: string[];
  configured: boolean;
  failingFilenames: string[];
  configFailures: string[];
  throwingFilenames: string[];
};

function fakeDeleter(overrides: Partial<Fake> = {}): Fake {
  const log: string[] = [];
  return {
    log,
    configured: true,
    failingFilenames: [],
    configFailures: [],
    throwingFilenames: [],
    ensureConfigured() {
      log.push('configure');
      return this.configured;
    },
    async deleteUnit(unit: CleanupUnit) {
      log.push(`delete:${unit.filename}`);
      if (this.throwingFilenames.includes(unit.filename)) {
        throw new Error(`执行器违约抛错：${unit.filename}`);
      }
      if (this.configFailures.includes(unit.filename)) {
        return { ok: false as const, reason: 'config' as const };
      }
      if (this.failingFilenames.includes(unit.filename)) {
        return { ok: false as const, reason: 'storage' as const };
      }
      return { ok: true } as const;
    },
    ...overrides,
  };
}

const mixedUnits = [
  ...planPhotoUnits([imagePhoto, videoPhoto]).units,
  ...planFileUnits([{ filename: 'doc.pdf' }]).units,
];

describe('deleteAssetsThenRowsWith：对象先、行后', () => {
  it('全部成功时按"每个对象一次、删行最后一次"的顺序发生', async () => {
    const deleter = fakeDeleter();
    const outcome = await deleteAssetsThenRowsWith(mixedUnits, deleter, async () => {
      deleter.log.push('rows');
      return { count: 3 };
    });

    expect(outcome.ok).toBe(true);
    // 删行必须排在所有删除调用之后——这正是缺陷 C 反过来时的样子。
    expect(deleter.log).toEqual([
      'configure',
      'delete:1700-x.png',
      'delete:1700-y.mp4',
      'delete:doc.pdf',
      'rows',
    ]);
  });

  it('objectTotal 数的是键而不是调用数：一张图片要带走两个对象', async () => {
    const outcome = await deleteAssetsThenRowsWith(
      planPhotoUnits([imagePhoto]).units,
      fakeDeleter(),
      async () => null
    );
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.objectTotal).toBe(2);
  });

  it('有任何一个对象失败就绝不写行，行保留以便重试收敛（缺陷 C 的正解）', async () => {
    const deleter = fakeDeleter({ failingFilenames: ['1700-y.mp4'] });
    let rowsTouched = 0;
    const outcome = await deleteAssetsThenRowsWith(mixedUnits, deleter, async () => {
      rowsTouched += 1;
      return null;
    });

    expect(outcome.ok).toBe(false);
    expect(rowsTouched).toBe(0);
    if (!outcome.ok) {
      expect(outcome).toEqual({
        ok: false,
        attempted: 3,
        objectTotal: 4,
        failed: 1,
        misconfigured: false,
      });
    }
  });

  it('一个失败不会把另外两个的成功藏起来：failed 是计数而不是布尔', async () => {
    const outcome = await deleteAssetsThenRowsWith(
      mixedUnits,
      fakeDeleter({ failingFilenames: ['1700-x.png', 'doc.pdf'] }),
      async () => null
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.failed).toBe(2);
      expect(outcome.attempted).toBe(3);
    }
  });

  it('缺陷 F：整批全失败也必须回报为非 2xx，而不是旧的 allSettled 从不查看那样返回成功', async () => {
    const all = mixedUnits.map(unit => unit.filename);
    const outcome = await deleteAssetsThenRowsWith(
      mixedUnits,
      fakeDeleter({ failingFilenames: all }),
      async () => {
        throw new Error('不该走到这里');
      }
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.failed).toBe(3);
  });
});

describe('deleteAssetsThenRowsWith：配置与环境失败要单独可辨', () => {
  it('预检不过时一个对象都不发起、一行都不删', async () => {
    const deleter = fakeDeleter({ configured: false });
    let rowsTouched = 0;
    const outcome = await deleteAssetsThenRowsWith(mixedUnits, deleter, async () => {
      rowsTouched += 1;
      return null;
    });

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.misconfigured).toBe(true);
      expect(outcome.attempted).toBe(0);
      expect(outcome.failed).toBe(0);
    }
    expect(deleter.log).toEqual(['configure']);
    expect(rowsTouched).toBe(0);
  });

  it('单元级 config 失败会汇总成 misconfigured，让客户端收到 500 而不是可重试的 502', async () => {
    const outcome = await deleteAssetsThenRowsWith(
      mixedUnits,
      fakeDeleter({ configFailures: ['doc.pdf'] }),
      async () => null
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.misconfigured).toBe(true);
      expect(outcome.failed).toBe(1);
    }
  });

  it('纯传输故障不算 misconfigured：它是重试可得的上游错误', async () => {
    const outcome = await deleteAssetsThenRowsWith(
      mixedUnits,
      fakeDeleter({ failingFilenames: ['doc.pdf'] }),
      async () => null
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.misconfigured).toBe(false);
  });
});

describe('deleteAssetsThenRowsWith：空计划与违约执行器', () => {
  it('没有对象要删时直接删行，不预检配置：没有照片的分类必须还能被删掉', async () => {
    const deleter = fakeDeleter({ configured: false });
    const outcome = await deleteAssetsThenRowsWith([], deleter, async () => ({ count: 1 }));

    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.result).toEqual({ count: 1 });
    expect(deleter.log).toEqual([]);
  });

  it('执行器抛异常（违反不抛的约定）时按可重试的存储故障处理，行照样保住', async () => {
    const deleter = fakeDeleter({ throwingFilenames: ['1700-x.png'] });
    let rowsTouched = 0;
    const outcome = await deleteAssetsThenRowsWith(mixedUnits, deleter, async () => {
      rowsTouched += 1;
      return null;
    });

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.failed).toBe(1);
      expect(outcome.misconfigured).toBe(false);
    }
    expect(rowsTouched).toBe(0);
  });

  it('删行阶段自己抛错时不吞：对象已消失，这是唯一需要人介入且唯一可追溯的状态', async () => {
    await expect(
      deleteAssetsThenRowsWith(mixedUnits, fakeDeleter(), async () => {
        throw new Error('P2003');
      })
    ).rejects.toThrow('P2003');
  });
});
