import {
  type Viewer,
  type Visibility,
  canTouchFileSet,
  canUploadToCategory,
  canViewCategory,
  categoryWhereFor,
  fileSetWhereFor,
} from '@/lib/access-rules';
import { describe, expect, it } from 'vitest';

const VISIBILITIES: Visibility[] = ['private', 'internal', 'public'];

const admin: NonNullable<Viewer> = { id: 1, role: 'admin' };
const member: NonNullable<Viewer> = { id: 2, role: 'member' };
const otherMember: NonNullable<Viewer> = { id: 3, role: 'member' };
const anon: Viewer = null;

describe('categoryWhereFor（相册列表的服务端过滤条件）', () => {
  it('匿名只能看到 public', () => {
    expect(categoryWhereFor(anon)).toEqual({ visibility: 'public' });
  });

  it('管理员无过滤', () => {
    expect(categoryWhereFor(admin)).toEqual({});
  });

  it('成员看到 internal 与 public，永远不含 private', () => {
    const where = categoryWhereFor(member) as { visibility: { in: Visibility[] } };
    expect(where.visibility.in).toEqual(['internal', 'public']);
    expect(where.visibility.in).not.toContain('private');
  });
});

describe('canViewCategory 裁决矩阵', () => {
  const expected: Record<string, Record<Visibility, string>> = {
    admin: { private: 'allow', internal: 'allow', public: 'allow' },
    member: { private: 'not-found', internal: 'allow', public: 'allow' },
    anon: { private: 'not-found', internal: 'login', public: 'allow' },
  };

  for (const [who, verdicts] of Object.entries(expected)) {
    const viewer: Viewer = who === 'admin' ? admin : who === 'member' ? member : anon;
    for (const visibility of VISIBILITIES) {
      it(`${who} 访问 ${visibility} 相册 ⇒ ${verdicts[visibility]}`, () => {
        expect(canViewCategory(viewer, { visibility })).toBe(verdicts[visibility]);
      });
    }
  }

  it('同一函数同时给出页面与 API 所需的两种信息：私有对被拒读者是 not-found 而非 login', () => {
    expect(canViewCategory(anon, { visibility: 'private' })).toBe('not-found');
    expect(canViewCategory(anon, { visibility: 'internal' })).toBe('login');
  });
});

describe('canUploadToCategory', () => {
  it('匿名不可上传任何相册', () => {
    for (const visibility of VISIBILITIES) {
      expect(canUploadToCategory(anon, { visibility })).toBe(false);
    }
  });

  it('成员只能上传到 internal/public，私有相册仅管理员', () => {
    expect(canUploadToCategory(member, { visibility: 'private' })).toBe(false);
    expect(canUploadToCategory(member, { visibility: 'internal' })).toBe(true);
    expect(canUploadToCategory(member, { visibility: 'public' })).toBe(true);
  });

  it('管理员可上传到任意相册', () => {
    for (const visibility of VISIBILITIES) {
      expect(canUploadToCategory(admin, { visibility })).toBe(true);
    }
  });
});

describe('fileSetWhereFor（文件集是 owner-relative，与相册不同）', () => {
  it('管理员无过滤', () => {
    expect(fileSetWhereFor(admin)).toEqual({});
  });

  it('成员的条件包含自己创建的集合，即使它是 private', () => {
    expect(fileSetWhereFor(member)).toEqual({
      OR: [{ visibility: 'internal' }, { visibility: 'public' }, { createdBy: 2 }],
    });
  });
});

describe('canTouchFileSet（读取与上传共用同一谓词）', () => {
  const privateOwnedByMember = { visibility: 'private' as const, createdBy: member.id };
  const privateOwnedByOther = { visibility: 'private' as const, createdBy: otherMember.id };

  it('成员可以访问自己的私有文件集', () => {
    expect(canTouchFileSet(member, privateOwnedByMember)).toBe(true);
  });

  it('成员不能访问他人的私有文件集', () => {
    expect(canTouchFileSet(otherMember, privateOwnedByMember)).toBe(false);
    expect(canTouchFileSet(member, privateOwnedByOther)).toBe(false);
  });

  it('internal/public 对任意登录成员开放', () => {
    for (const visibility of ['internal', 'public'] as Visibility[]) {
      expect(canTouchFileSet(member, { visibility, createdBy: otherMember.id })).toBe(true);
      expect(canTouchFileSet(otherMember, { visibility, createdBy: member.id })).toBe(true);
    }
  });

  it('管理员可访问任意文件集', () => {
    for (const visibility of VISIBILITIES) {
      expect(canTouchFileSet(admin, { visibility, createdBy: otherMember.id })).toBe(true);
    }
  });

  it('谓词与列表过滤对"自己的私有集"结论一致', () => {
    const where = fileSetWhereFor(member) as { OR: Array<Record<string, unknown>> };
    expect(where.OR).toContainEqual({ createdBy: member.id });
    expect(canTouchFileSet(member, privateOwnedByMember)).toBe(true);
  });
});
