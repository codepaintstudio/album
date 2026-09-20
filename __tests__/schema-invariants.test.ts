import { USER_RESTRICTING_RELATIONS } from '@/lib/asset-deletion';
import { MEDIA_KINDS } from '@/lib/media-type';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * schema.prisma 的离线门禁。
 *
 * 为什么需要它：本环境的 Prisma 委托是 `[key: string]: any`（types/prisma-client.d.ts），
 * 所以关系字段改名、少一个反向关系、把归属关系改成 Cascade——tsc 与 CI 全部沉默，
 * 只有真正跑到那条查询时才会炸。prisma validate 能查关系完整性，但它不在 CI 里，
 * 而且看不见"某个字段名被 lib/ 里的代码硬编码引用"这层耦合。
 */

/**
 * 工作副本是 CRLF（core.autocrlf=true 且仓库没有 .gitattributes），而索引里是 LF。
 * 必须先归一化：任何用 `$` 锚定的正则在 `\r` 存在时都会静默失配，测试会"绿着"什么
 * 都没检查——这比没有测试更糟。
 */
function readSchema(): string {
  return readFileSync('prisma/schema.prisma', 'utf8').replace(/\r\n/g, '\n');
}

function modelBlock(source: string, model: string): string {
  const match = new RegExp(`^model ${model} \\{\\n([\\s\\S]*?)^\\}`, 'm').exec(source);
  if (!match) {
    throw new Error(`prisma/schema.prisma 里找不到 model ${model}`);
  }
  return match[1];
}

/** 取某个模型里指定字段的整行声明。 */
function fieldLine(source: string, model: string, field: string): string {
  const block = modelBlock(source, model);
  const match = new RegExp(`^\\s+${field}\\s+.*$`, 'm').exec(block);
  if (!match) {
    throw new Error(`model ${model} 里没有字段 ${field}`);
  }
  return match[0];
}

/** 模型里所有指向另一模型的列表型反向关系字段名。 */
function backRelationFields(source: string, model: string): string[] {
  const block = modelBlock(source, model);
  return [...block.matchAll(/^\s+(\w+)\s+\w+\[\]/gm)].map(entry => entry[1]);
}

function enumMembers(source: string, enumName: string): string[] {
  const match = new RegExp(`^enum ${enumName} \\{\\n([\\s\\S]*?)^\\}`, 'm').exec(source);
  if (!match) {
    throw new Error(`prisma/schema.prisma 里没有 enum ${enumName}`);
  }
  return [...match[1].matchAll(/^\s+(\w+)\s*$/gm)].map(entry => entry[1]);
}

const schema = readSchema();

describe('归属关系禁止 onDelete: Cascade（缺陷 B 的成因）', () => {
  const ownership: Array<[string, string]> = [
    ['Photo', 'uploader'],
    ['File', 'uploader'],
    ['FileSet', 'creator'],
  ];

  for (const [model, field] of ownership) {
    it(`${model}.${field} 没有 onDelete: Cascade`, () => {
      const line = fieldLine(schema, model, field);
      expect(line).not.toMatch(/onDelete:\s*Cascade/);
    });
  }

  it('理由是：Cascade 会让子行在库内消失，应用从此读不到 filename，泄漏不可追溯', () => {
    // 用户删除因此不能靠 Cascade "修"好 P2003——必须像现在这样先显式处置子行。
    for (const [model, field] of ownership) {
      expect(fieldLine(schema, model, field)).not.toMatch(/onDelete:/);
    }
  });
});

describe('生命周期关系必须保留 onDelete: Cascade', () => {
  const lifecycle: Array<[string, string]> = [
    ['Photo', 'category'],
    ['File', 'fileSet'],
    ['ShareLink', 'category'],
  ];

  for (const [model, field] of lifecycle) {
    it(`${model}.${field} 带 onDelete: Cascade`, () => {
      expect(fieldLine(schema, model, field)).toMatch(/onDelete:\s*Cascade/);
    });
  }

  it('防止有人用"去掉级联"来绕过缺陷 B：正解是在删父行之前枚举子行的对象键', () => {
    // lib/asset-cleanup.ts 的 listPhotoUnitsOfCategory / listFileUnitsOfFileSet 依赖
    // 这个级联仍然存在（它负责清掉子行），去掉级联只会让删除变成半成功。
    expect(fieldLine(schema, 'Photo', 'category')).toMatch(/onDelete:\s*Cascade/);
    expect(fieldLine(schema, 'File', 'fileSet')).toMatch(/onDelete:\s*Cascade/);
  });
});

describe('model User 上会阻止删除的关系与 lib/asset-deletion.ts 的清单逐字一致', () => {
  it('这是 D 里最危险的静默错误：字段名拼错会数出一个错误的 0，tsc 与 CI 都不会报', () => {
    expect(backRelationFields(schema, 'User').sort()).toEqual(
      [...USER_RESTRICTING_RELATIONS].sort()
    );
  });

  it('清单里的每个名字都真的是 model User 上的字段（app/api/users/route.ts 按名字 _count 它们）', () => {
    for (const relation of USER_RESTRICTING_RELATIONS) {
      expect(fieldLine(schema, 'User', relation)).toMatch(/\w+\[\]/);
    }
  });
});

describe('MediaType 枚举与 lib/media-type.ts 的联合同形', () => {
  it('两边成员一致，扩枚举而不改纯层会被拦下', () => {
    expect(enumMembers(schema, 'MediaType').sort()).toEqual([...MEDIA_KINDS].sort());
  });
});

describe('解析器本身没有静默失配（否则上面所有断言都是空的）', () => {
  it('能取到 model 与 enum，且已知字段可寻', () => {
    expect(modelBlock(schema, 'Photo')).toContain('filename');
    expect(enumMembers(schema, 'CategoryVisibility').sort()).toEqual([
      'internal',
      'private',
      'public',
    ]);
    expect(fieldLine(schema, 'User', 'username')).toContain('@unique');
  });

  it('找不到时抛错而不是返回空串', () => {
    expect(() => modelBlock(schema, 'NoSuchModel')).toThrow();
    expect(() => fieldLine(schema, 'Photo', 'nonexistent')).toThrow();
  });

  it('工作副本确实带 CRLF，因此上面的归一化不是多余的防御', () => {
    expect(readFileSync('prisma/schema.prisma', 'utf8')).toContain('\r\n');
  });
});
