const SENSITIVE_KEY_FRAGMENTS = ['KEY', 'SECRET', 'TOKEN', 'PASSWORD', 'AUTH', 'CREDENTIAL'];

export function isSensitiveKey(key: string): boolean {
  const upper = key.toUpperCase();
  return SENSITIVE_KEY_FRAGMENTS.some(fragment => upper.includes(fragment));
}

export function maskSensitiveEnv(env: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(env).map(([key, value]) => [key, isSensitiveKey(key) ? '***' : value])
  );
}
