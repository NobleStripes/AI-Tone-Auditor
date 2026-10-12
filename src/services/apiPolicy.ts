export class ApiPolicyError extends Error {
  constructor(
    readonly code: 'BUDGET_EXHAUSTED' | 'SERVER_BUSY',
    readonly status: 429 | 503,
    message: string,
    readonly retryAfter: number,
  ) {
    super(message);
    this.name = 'ApiPolicyError';
  }
}

export function readBoundedInteger(
  env: Record<string, string | undefined>, name: string, fallback: number, min: number, max: number,
): number {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  if (!/^\d+$/.test(raw)) throw new Error(`Invalid configuration: ${name}`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`Invalid configuration: ${name}`);
  return value;
}

export function providerLimits(env: Record<string, string | undefined> = process.env) {
  return {
    timeoutMs: readBoundedInteger(env, 'AI_PROVIDER_TIMEOUT_MS', 15_000, 1, 120_000),
    retries: readBoundedInteger(env, 'AI_PROVIDER_RETRIES', 1, 0, 2),
    outputTokens: readBoundedInteger(env, 'AI_MAX_OUTPUT_TOKENS', 3_000, 1, 32_000),
    dailyAttempts: readBoundedInteger(env, 'AI_DAILY_REQUEST_LIMIT', 100, 1, 1_000_000),
    dailyTokens: readBoundedInteger(env, 'AI_DAILY_TOKEN_LIMIT', 1_000_000, 1, 1_000_000_000),
  };
}
