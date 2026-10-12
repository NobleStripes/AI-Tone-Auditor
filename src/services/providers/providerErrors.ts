export function requireApiKey(name: string, label: string): string {
  const key = process.env[name]?.trim();
  if (!key) throw new Error(`Missing ${name} for ${label} provider. Configure it for external analysis, or use AI_PROVIDER=local.`);
  return key;
}

export class ProviderHttpError extends Error {
  readonly retryable: boolean;

  constructor(label: string, keyName: string, status: number, body: string) {
    const authFailure = status === 401 || status === 403
      || /(?:invalid|incorrect|expired)[^\n]{0,40}(?:api[_ -]?key)|api[_ -]?key[^\n]{0,40}(?:invalid|incorrect|expired|not[_ ]valid)/i.test(body);
    super(`${label} request failed (${status})${authFailure ? `: authentication failed; check ${keyName} and provider access` : ''}.`);
    this.name = 'ProviderHttpError';
    this.retryable = !authFailure && [429, 500, 502, 503, 504].includes(status);
  }
}
