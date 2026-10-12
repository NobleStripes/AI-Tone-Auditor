import type { AnalysisResult } from '../types/analysis';
import { setTimeout as delay } from 'node:timers/promises';
import { DEFAULT_LOCAL_RUNTIME_META, type AnalysisSource, type AnalyzeToneOutput, type ProviderRuntimeMeta } from '../types/provider';
import { ProviderHttpError } from './providers/providerErrors';
import { MAX_ERROR_BODY_LENGTH, truncateErrorText } from '../lib/errorText';
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

async function withTimeout<T>(operation: (signal: AbortSignal) => Promise<T>, timeoutMs: number, label: string, signal?: AbortSignal): Promise<T> {
  signal?.throwIfAborted();
  const controller = new AbortController();
  const onAbort = () => controller.abort(signal?.reason);
  signal?.addEventListener('abort', onAbort, { once: true });
  let timer: ReturnType<typeof setTimeout> | undefined;
  let rejectAbort: () => void;
  const aborted = new Promise<never>((_, reject) => {
    rejectAbort = () => reject(controller.signal.reason);
    controller.signal.addEventListener('abort', rejectAbort, { once: true });
  });
  if (timeoutMs > 0) {
    timer = setTimeout(() => controller.abort(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
  }
  try {
    return await Promise.race([operation(controller.signal), aborted]);
  } finally {
    if (timer) clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
    controller.signal.removeEventListener('abort', rejectAbort);
  }
}

function isRetryableError(error: unknown): boolean {
  if (error instanceof ProviderHttpError) return error.retryable;
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
  signal?: AbortSignal,
): Promise<{ result: AnalysisResult; model: string }> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    signal?.throwIfAborted();
    recordProviderAttempt(provider.id);

    try {
      const model = provider.model;
      const result = await withTimeout(
        (attemptSignal) => provider.analyzeTone({
          text,
          signal: attemptSignal,
          context: {
            promptVersion: ANALYSIS_PROMPT_VERSION,
            sourceModel,
          },
        }),
        timeoutMs,
        `${provider.label} provider`,
        signal,
      );

      recordProviderSuccess(provider.id);
      return { result, model };
    } catch (error) {
      signal?.throwIfAborted();
      lastError = error;
      recordProviderFailure(provider.id);

      const shouldRetry = attempt < retries && isRetryableError(error);
      if (!shouldRetry) {
        break;
      }

      const delayMs = Math.min(500 * Math.pow(2, attempt) + (Math.random() * 200 - 100), 10_000);
      console.warn(`Retrying ${provider.id} provider after transient error (attempt ${attempt + 1}/${retries + 1}), waiting ${Math.round(delayMs)}ms`, error);
      await delay(delayMs, undefined, { signal });
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Provider request failed');
}

let lastRuntimeMeta: ProviderRuntimeMeta = { ...DEFAULT_LOCAL_RUNTIME_META };

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
  signal?: AbortSignal,
): Promise<AnalyzeToneOutput> {
  signal?.throwIfAborted();
  const selectedProviderId = process.env.AI_PROVIDER;
  const primaryProvider = resolveProvider(selectedProviderId);
  const fallbackProvider = resolveFallbackProvider(primaryProvider.id);
  const timeoutMs = readIntEnv('AI_PROVIDER_TIMEOUT_MS', DEFAULT_PROVIDER_TIMEOUT_MS);
  const retries = readIntEnv('AI_PROVIDER_RETRIES', DEFAULT_PROVIDER_RETRIES);

  let analyzed: { result: AnalysisResult; model: string };
  let finalProvider = primaryProvider;
  let usedFallback = false;
  try {
    analyzed = await runProviderWithPolicy(primaryProvider, text, sourceModel, timeoutMs, retries, signal);
  } catch (primaryError) {
    signal?.throwIfAborted();
    if (!fallbackProvider) throw primaryError;
    console.warn(`Primary provider ${primaryProvider.id} failed, attempting configured fallback ${fallbackProvider.id}`, primaryError);
    try {
      analyzed = await runProviderWithPolicy(fallbackProvider, text, sourceModel, timeoutMs, retries, signal);
    } catch (fallbackError) {
      signal?.throwIfAborted();
      const message = (error: unknown) => truncateErrorText(
        error instanceof Error ? error.message : String(error), Math.floor(MAX_ERROR_BODY_LENGTH / 3));
      throw new AggregateError([primaryError, fallbackError],
        `${primaryProvider.label} failed: ${message(primaryError)}; configured fallback ${fallbackProvider.label} also failed: ${message(fallbackError)}`);
    }
    finalProvider = fallbackProvider;
    usedFallback = true;
  }
  signal?.throwIfAborted();
  const result = applyLocalPromptComparison(analyzed.result, text, auditContext, sourceModel);
  const meta = buildMeta(finalProvider.id, finalProvider.label, analyzed.model, usedFallback);
  lastRuntimeMeta = meta;
  recordAnalysisCompleted({ usedFallback, primaryProvider: primaryProvider.id, finalProvider: finalProvider.id });
  return { result, meta, provenance: createAnalysisProvenance(meta, sourceModel) };
}
