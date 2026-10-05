import type { AnalysisSource, AnalyzeToneOutput, ProviderRuntimeMeta } from '../types/provider';
import type { ProviderTelemetrySnapshot } from './telemetry/providerTelemetry';
import type { ComparisonRequest, ComparisonResult } from '../types/comparison';

const DEFAULT_META: ProviderRuntimeMeta = {
  providerId: 'openai',
  providerLabel: 'OpenAI',
  model: 'gpt-6-luna',
  usedFallback: false,
};

const DEFAULT_TELEMETRY: ProviderTelemetrySnapshot = {
  totalAnalyses: 0,
  fallbackActivations: 0,
  fallbackRatePercent: 0,
  recentFallbackRatePercent: 0,
  recentWindowSize: 30,
  fallbackTrend: 'steady',
  recentEvents: [],
  providers: {
    openai: { attempts: 0, successes: 0, failures: 0 },
    anthropic: { attempts: 0, successes: 0, failures: 0 },
    gemini: { attempts: 0, successes: 0, failures: 0 },
    grok: { attempts: 0, successes: 0, failures: 0 },
    local: { attempts: 0, successes: 0, failures: 0 },
  },
};

let lastMeta: ProviderRuntimeMeta = { ...DEFAULT_META };
let lastTelemetry: ProviderTelemetrySnapshot = { ...DEFAULT_TELEMETRY };

async function readAnalysisResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let errorMessage = `Analysis request failed (${response.status})`;
    try {
      const errorData = (await response.json()) as { error?: string };
      if (errorData.error) errorMessage = errorData.error;
    } catch {
      // The status remains available when the error body is not JSON.
    }
    throw new Error(errorMessage);
  }
  return response.json() as Promise<T>;
}

export function getLastAnalysisRuntimeMeta(): ProviderRuntimeMeta {
  return lastMeta;
}

export function getProviderTelemetrySnapshot(): ProviderTelemetrySnapshot {
  return lastTelemetry;
}

export async function analyzeTone(
  text: string,
  signal?: AbortSignal,
  sourceModel: AnalysisSource = 'unknown',
  auditContext = '',
): Promise<AnalyzeToneOutput> {
  const response = await fetch('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, sourceModel, auditContext }),
    signal,
  });

  const data = await readAnalysisResponse<{
    result: AnalyzeToneOutput['result'];
    meta: ProviderRuntimeMeta;
    provenance?: AnalyzeToneOutput['provenance'];
    telemetry: ProviderTelemetrySnapshot;
  }>(response);

  lastMeta = data.meta;
  lastTelemetry = data.telemetry;

  return { result: data.result, meta: data.meta, provenance: data.provenance };
}

export async function compareToneResponses(input: ComparisonRequest, signal?: AbortSignal): Promise<ComparisonResult> {
  const response = await fetch('/api/compare', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal,
  });
  const data = await readAnalysisResponse<{ comparison: ComparisonResult; telemetry: ProviderTelemetrySnapshot }>(response);
  lastTelemetry = data.telemetry;
  const completed = data.comparison.items.find((item) => item.status === 'completed');
  if (completed?.status === 'completed') lastMeta = completed.analysis.meta;
  return data.comparison;
}
