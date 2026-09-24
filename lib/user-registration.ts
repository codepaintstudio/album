export const SELF_REGISTRATION_RESPONSE = {
  message: '如果符合注册条件，账户将按流程处理。',
} as const;

export function isUsernameUniqueConstraintError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}

export function selfRegistrationPrivacyResponse(
  isSelfRegistration: boolean,
  outcome: { ok: true } | { ok: false; error: unknown }
) {
  if (!isSelfRegistration) return null;
  if (!outcome.ok && !isUsernameUniqueConstraintError(outcome.error)) return null;
  return { status: 200 as const, body: SELF_REGISTRATION_RESPONSE };
}
