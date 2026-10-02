import type { AnalyzeToneOutput, ProviderRuntimeMeta } from '../types/provider';
import type { ProviderTelemetrySnapshot } from './telemetry/providerTelemetry';

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
    local: { attempts: 0, successes: 0, failures: 0 },
  },
};

let lastMeta: ProviderRuntimeMeta = { ...DEFAULT_META };
let lastTelemetry: ProviderTelemetrySnapshot = { ...DEFAULT_TELEMETRY };

export function getLastAnalysisRuntimeMeta(): ProviderRuntimeMeta {
  return lastMeta;
}

export function getProviderTelemetrySnapshot(): ProviderTelemetrySnapshot {
  return lastTelemetry;
}

export async function analyzeTone(text: string, signal?: AbortSignal): Promise<AnalyzeToneOutput> {
  const response = await fetch('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
    signal,
  });

  if (!response.ok) {
    let errorMessage = `Analysis request failed (${response.status})`;
    try {
      const errorData = (await response.json()) as { error?: string };
      if (errorData.error) errorMessage = errorData.error;
    } catch {
      // Fall back to generic message
    }
    throw new Error(errorMessage);
  }

  const data = (await response.json()) as {
    result: AnalyzeToneOutput['result'];
    meta: ProviderRuntimeMeta;
    telemetry: ProviderTelemetrySnapshot;
  };

  lastMeta = data.meta;
  lastTelemetry = data.telemetry;

  return { result: data.result, meta: data.meta };
}
