import type { AnalysisResult } from '../types/analysis';
import { setTimeout as delay } from 'node:timers/promises';
import { DEFAULT_LOCAL_RUNTIME_META, type AnalysisSource, type AnalyzeToneOutput, type ProviderRuntimeMeta } from '../types/provider';
import { ProviderHttpError } from './providers/providerErrors';
import { ApiPolicyError, providerLimits } from './apiPolicy';
import { trackProviderWork } from './providerWork';
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
  const pending = trackProviderWork(operation(controller.signal));
  try {
    return await Promise.race([pending, aborted]);
  } catch (error) {
    // Do not overlap a timed-out attempt with a retry or fallback.
    if (controller.signal.aborted && !signal?.aborted) await Promise.allSettled([pending]);
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
    controller.signal.removeEventListener('abort', rejectAbort);
  }
}

function isRetryableError(error: unknown): boolean {
  if (error instanceof ApiPolicyError) return false;
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
      if (error instanceof ApiPolicyError) throw error;
      lastError = error;
      recordProviderFailure(provider.id);

      const shouldRetry = attempt < retries && isRetryableError(error);
      if (!shouldRetry) {
        break;
      }

      const delayMs = Math.min(500 * Math.pow(2, attempt) + (Math.random() * 200 - 100), 10_000);
      console.warn('[provider] retrying transient failure', { provider: provider.id, attempt: attempt + 1 });
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
  const { timeoutMs, retries } = providerLimits();

  let analyzed: { result: AnalysisResult; model: string };
  let finalProvider = primaryProvider;
  let usedFallback = false;
  try {
    analyzed = await runProviderWithPolicy(primaryProvider, text, sourceModel, timeoutMs, retries, signal);
  } catch (primaryError) {
    signal?.throwIfAborted();
    if (primaryError instanceof ApiPolicyError) throw primaryError;
    if (!fallbackProvider) throw primaryError;
    console.warn('[provider] attempting configured fallback', { primary: primaryProvider.id, fallback: fallbackProvider.id });
    try {
      analyzed = await runProviderWithPolicy(fallbackProvider, text, sourceModel, timeoutMs, retries, signal);
    } catch (fallbackError) {
      signal?.throwIfAborted();
      if (fallbackError instanceof ApiPolicyError) throw fallbackError;
      throw new AggregateError([], 'Primary and configured fallback auditors failed. Check provider configuration.');
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
