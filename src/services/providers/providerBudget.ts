import { ApiPolicyError, providerLimits } from '../apiPolicy';

export class ProviderBudget {
  private day = '';
  private attempts = 0;
  private tokens = 0;

  reserve(body: string, now = Date.now()): void {
    const limits = providerLimits();
    const day = new Date(now).toISOString().slice(0, 10);
    if (day !== this.day) {
      this.day = day;
      this.attempts = 0;
      this.tokens = 0;
    }
    // Reserve one unit per UTF-8 byte of the entire wire body, plus envelope
    // headroom and the output cap. These are conservative units, not billing.
    const reservation = Buffer.byteLength(body, 'utf8') + 4096 + limits.outputTokens;
    if (this.attempts >= limits.dailyAttempts || this.tokens + reservation > limits.dailyTokens) {
      const midnight = Date.parse(`${day}T00:00:00.000Z`) + 86_400_000;
      throw new ApiPolicyError('BUDGET_EXHAUSTED', 429, 'External audit budget exhausted. No further provider calls were made.', Math.max(1, Math.ceil((midnight - now) / 1000)));
    }
    this.attempts++;
    this.tokens += reservation;
  }
}

export const providerBudget = new ProviderBudget();

export function providerSignal(signal?: AbortSignal): AbortSignal {
  signal?.throwIfAborted();
  const timeout = AbortSignal.timeout(providerLimits().timeoutMs);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

export function reserveProviderRequest(body: string, signal?: AbortSignal): string {
  signal?.throwIfAborted();
  providerBudget.reserve(body);
  return body;
}
