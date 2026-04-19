import type { AnalysisResult } from '../types/analysis';
import type { AnalyzeToneOutput, ProviderRuntimeMeta } from '../types/provider';
import { ANALYSIS_PROMPT_VERSION } from './promptBuilder';
import { resolveFallbackProvider, resolveProvider } from './providers/factory';
import {
  getProviderTelemetrySnapshot,
  recordAnalysisCompleted,
  recordProviderAttempt,
  recordProviderFailure,
  recordProviderSuccess,
} from './telemetry/providerTelemetry';

const DEFAULT_PROVIDER_TIMEOUT_MS = 15000;
const DEFAULT_PROVIDER_RETRIES = 1;

function readIntEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }

  return parsed;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  if (timeoutMs <= 0) {
    return promise;
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timer) {
      clearTimeout(timer);
    }
  }) as Promise<T>;
}

function isRetryableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    message.includes('timed out') ||
    message.includes('timeout') ||
    message.includes('network') ||
    message.includes('fetch failed') ||
    message.includes('429') ||
    message.includes('500') ||
    message.includes('502') ||
    message.includes('503') ||
    message.includes('504')
  );
}

async function runProviderWithPolicy(
  provider: ReturnType<typeof resolveProvider>,
  text: string,
  timeoutMs: number,
  retries: number,
): Promise<AnalysisResult> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    recordProviderAttempt(provider.id);

    try {
      const result = await withTimeout(
        provider.analyzeTone({
          text,
          context: {
            promptVersion: ANALYSIS_PROMPT_VERSION,
          },
        }),
        timeoutMs,
        `${provider.label} provider`,
      );

      recordProviderSuccess(provider.id);
      return result;
    } catch (error) {
      lastError = error;
      recordProviderFailure(provider.id);

      const shouldRetry = attempt < retries && isRetryableError(error);
      if (!shouldRetry) {
        break;
      }

      console.warn(`Retrying ${provider.id} provider after transient error (attempt ${attempt + 1}/${retries + 1})`, error);
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Provider request failed');
}

let lastRuntimeMeta: ProviderRuntimeMeta = {
  providerId: 'openai',
  providerLabel: 'OpenAI',
  model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  usedFallback: false,
};

function buildMeta(providerId: ProviderRuntimeMeta['providerId'], providerLabel: string, model: string, usedFallback: boolean): ProviderRuntimeMeta {
  return {
    providerId,
    providerLabel,
    model,
    usedFallback,
  };
}

export function getLastAnalysisRuntimeMeta(): ProviderRuntimeMeta {
  return lastRuntimeMeta;
}

export { getProviderTelemetrySnapshot };

export async function analyzeTone(text: string): Promise<AnalyzeToneOutput> {
  const selectedProviderId = process.env.AI_PROVIDER;
  const primaryProvider = resolveProvider(selectedProviderId);
  const fallbackProvider = resolveFallbackProvider(primaryProvider.id);
  const timeoutMs = readIntEnv('AI_PROVIDER_TIMEOUT_MS', DEFAULT_PROVIDER_TIMEOUT_MS);
  const retries = readIntEnv('AI_PROVIDER_RETRIES', DEFAULT_PROVIDER_RETRIES);

  try {
    const result = await runProviderWithPolicy(primaryProvider, text, timeoutMs, retries);

    const meta = buildMeta(primaryProvider.id, primaryProvider.label, primaryProvider.model, false);
    lastRuntimeMeta = meta;
    recordAnalysisCompleted({
      usedFallback: false,
      primaryProvider: primaryProvider.id,
      finalProvider: primaryProvider.id,
    });

    return { result, meta };
  } catch (primaryError) {
    console.warn(`Primary provider ${primaryProvider.id} failed, attempting fallback`, primaryError);
    const result = await runProviderWithPolicy(fallbackProvider, text, timeoutMs, retries);

    const meta = buildMeta(fallbackProvider.id, fallbackProvider.label, fallbackProvider.model, true);
    lastRuntimeMeta = meta;
    recordAnalysisCompleted({
      usedFallback: true,
      primaryProvider: primaryProvider.id,
      finalProvider: fallbackProvider.id,
    });

    return { result, meta };
  }
}
