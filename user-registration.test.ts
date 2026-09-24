import {
  SELF_REGISTRATION_RESPONSE,
  isUsernameUniqueConstraintError,
  selfRegistrationPrivacyResponse,
} from '@/lib/user-registration';
import { describe, expect, it } from 'vitest';

describe('self-registration response policy', () => {
  it('hides both successful creation and a duplicate-username race behind the same response', () => {
    const successfulCreationResponse = selfRegistrationPrivacyResponse(true, { ok: true });
    const duplicateUsernameResponse = selfRegistrationPrivacyResponse(true, {
      ok: false,
      error: { code: 'P2002' },
    });

    expect(successfulCreationResponse).toEqual(duplicateUsernameResponse);
    expect(successfulCreationResponse).toEqual({
      status: 200,
      body: SELF_REGISTRATION_RESPONSE,
    });
    expect(JSON.stringify(successfulCreationResponse)).not.toContain('用户名已存在');
  });

  it('does not hide non-self-registration results or unrelated database errors', () => {
    expect(selfRegistrationPrivacyResponse(false, { ok: true })).toBeNull();
    expect(
      selfRegistrationPrivacyResponse(true, { ok: false, error: { code: 'P2003' } })
    ).toBeNull();
  });

  it('recognizes Prisma unique-constraint errors, including the create race', () => {
    expect(isUsernameUniqueConstraintError({ code: 'P2002' })).toBe(true);
    expect(isUsernameUniqueConstraintError(new Error('duplicate'))).toBe(false);
    expect(isUsernameUniqueConstraintError({ code: 'P2003' })).toBe(false);
  });
});
