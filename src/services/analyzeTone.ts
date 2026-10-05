import type { AnalysisResult } from '../types/analysis';
import type { AnalysisSource, AnalyzeToneOutput, ProviderRuntimeMeta } from '../types/provider';
import { ANALYSIS_PROMPT_VERSION } from './promptBuilder';
import { applyLocalPromptComparison } from './localPromptComparison';
import { createAnalysisProvenance } from './auditProvenance';
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
  sourceModel: AnalysisSource,
  timeoutMs: number,
  retries: number,
): Promise<{ result: AnalysisResult; model: string }> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    recordProviderAttempt(provider.id);

    try {
      const model = provider.model;
      const result = await withTimeout(
        provider.analyzeTone({
          text,
          context: {
            promptVersion: ANALYSIS_PROMPT_VERSION,
            sourceModel,
          },
        }),
        timeoutMs,
        `${provider.label} provider`,
      );

      recordProviderSuccess(provider.id);
      return { result, model };
    } catch (error) {
      lastError = error;
      recordProviderFailure(provider.id);

      const shouldRetry = attempt < retries && isRetryableError(error);
      if (!shouldRetry) {
        break;
      }

      const delayMs = Math.min(500 * Math.pow(2, attempt) + (Math.random() * 200 - 100), 10_000);
      console.warn(`Retrying ${provider.id} provider after transient error (attempt ${attempt + 1}/${retries + 1}), waiting ${Math.round(delayMs)}ms`, error);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Provider request failed');
}

let lastRuntimeMeta: ProviderRuntimeMeta = {
  providerId: 'openai',
  providerLabel: 'OpenAI',
  model: process.env.OPENAI_MODEL || 'gpt-6-luna',
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

export async function analyzeTone(
  text: string,
  sourceModel: AnalysisSource = 'unknown',
  auditContext = '',
): Promise<AnalyzeToneOutput> {
  const selectedProviderId = process.env.AI_PROVIDER;
  const primaryProvider = resolveProvider(selectedProviderId);
  const fallbackProvider = resolveFallbackProvider(primaryProvider.id);
  const timeoutMs = readIntEnv('AI_PROVIDER_TIMEOUT_MS', DEFAULT_PROVIDER_TIMEOUT_MS);
  const retries = readIntEnv('AI_PROVIDER_RETRIES', DEFAULT_PROVIDER_RETRIES);

  try {
    const analyzed = await runProviderWithPolicy(primaryProvider, text, sourceModel, timeoutMs, retries);
    const result = applyLocalPromptComparison(
      analyzed.result,
      text,
      auditContext,
      sourceModel,
    );

    const meta = buildMeta(primaryProvider.id, primaryProvider.label, analyzed.model, false);
    lastRuntimeMeta = meta;
    recordAnalysisCompleted({
      usedFallback: false,
      primaryProvider: primaryProvider.id,
      finalProvider: primaryProvider.id,
    });

    return { result, meta, provenance: createAnalysisProvenance(meta, sourceModel) };
  } catch (primaryError) {
    console.warn(`Primary provider ${primaryProvider.id} failed, attempting fallback`, primaryError);
    const analyzed = await runProviderWithPolicy(fallbackProvider, text, sourceModel, timeoutMs, retries);
    const result = applyLocalPromptComparison(
      analyzed.result,
      text,
      auditContext,
      sourceModel,
    );

    const meta = buildMeta(fallbackProvider.id, fallbackProvider.label, analyzed.model, true);
    lastRuntimeMeta = meta;
    recordAnalysisCompleted({
      usedFallback: true,
      primaryProvider: primaryProvider.id,
      finalProvider: fallbackProvider.id,
    });

    return { result, meta, provenance: createAnalysisProvenance(meta, sourceModel) };
  }
}
