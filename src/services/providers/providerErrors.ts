import { truncateErrorText } from '../../lib/errorText';

export function requireApiKey(name: string, label: string): string {
  const key = process.env[name]?.trim();
  if (!key) throw new Error(`Missing ${name} for ${label} provider. Configure it for external analysis, or use AI_PROVIDER=local.`);
  return key;
}

export class ProviderHttpError extends Error {
  readonly retryable: boolean;

  constructor(label: string, keyName: string, status: number, body: string, requestKey: string) {
    let detail = body;
    const keys = [requestKey, ...['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'XAI_API_KEY'].map(name => process.env[name]?.trim())];
    for (const key of keys) {
      if (key) detail = detail.split(key).join('[REDACTED]');
    }
    const authFailure = status === 401 || status === 403
      || /(?:invalid|incorrect|expired)[^\n]{0,40}(?:api[_ -]?key)|api[_ -]?key[^\n]{0,40}(?:invalid|incorrect|expired)/i.test(detail);
    super(`${label} request failed (${status})${authFailure ? `: authentication failed; check ${keyName} and provider access` : ''}.${detail ? ` ${truncateErrorText(detail)}` : ''}`);
    this.name = 'ProviderHttpError';
    this.retryable = !authFailure && [429, 500, 502, 503, 504].includes(status);
  }
}
