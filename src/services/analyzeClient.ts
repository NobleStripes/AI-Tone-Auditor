import { DEFAULT_LOCAL_RUNTIME_META, type AnalysisSource, type AnalyzeToneOutput, type ProviderRuntimeMeta } from '../types/provider';
import type { ProviderTelemetrySnapshot } from './telemetry/providerTelemetry';
import type { ComparisonRequest, ComparisonResult } from '../types/comparison';
import { applyAnthropomorphismGuard, requestsFiction } from './anthropomorphismGuard';
import { accessWasRejected, apiHeaders, rejectApiAccess } from './apiAccess';
import { PROVIDER_IDS } from '../types/provider';

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

let lastMeta: ProviderRuntimeMeta = { ...DEFAULT_LOCAL_RUNTIME_META };
let lastTelemetry: ProviderTelemetrySnapshot = { ...DEFAULT_TELEMETRY };

const SAFE_ERRORS: Record<string, string> = {
  ACCESS_REQUIRED: 'API access key required or rejected. Unlock the API to continue.',
  RATE_LIMITED: 'Too many API requests. Wait before retrying.',
  BUDGET_EXHAUSTED: 'External audit budget exhausted. No further provider calls were made.',
  SERVER_BUSY: 'Auditor is busy. Retry later.',
  HTTPS_REQUIRED: 'HTTPS is required.',
  ORIGIN_DENIED: 'Request origin is not allowed.',
  INVALID_REQUEST: 'Invalid audit input. Check the response, prompt, source and comparison count.',
  INVALID_JSON: 'Malformed JSON request.',
  PAYLOAD_TOO_LARGE: 'JSON payload is too large.',
  UNSUPPORTED_CONTENT_TYPE: 'Use uncompressed application/json.',
  AUDIT_FAILED: 'Audit failed. Check server configuration or try again later.',
};

export class ApiRequestError extends Error {
  constructor(
    readonly status: number, readonly code: string, readonly retryAfter?: number,
    readonly partialComparison?: ComparisonResult,
  ) {
    super(`Analysis request failed (${status}): ${SAFE_ERRORS[code] || 'The API or proxy could not complete this request.'}${retryAfter ? ` Retry after ${retryAfter} seconds.` : ''}`);
    this.name = 'ApiRequestError';
  }
}

function isPartialComparison(value: unknown, input: ComparisonRequest): value is ComparisonResult {
  if (!value || typeof value !== 'object' || !('items' in value) || !Array.isArray(value.items)
      || value.items.length !== input.responses.length || !('rubricVersion' in value) || typeof value.rubricVersion !== 'string'
      || !('localRuleVersion' in value) || typeof value.localRuleVersion !== 'string') return false;
  return value.items.every((item: unknown, index) => {
    if (!item || typeof item !== 'object' || !('id' in item) || !('text' in item) || !('sourceModel' in item)
        || !('status' in item) || item.id !== input.responses[index].id || item.text !== input.responses[index].text
        || item.sourceModel !== input.responses[index].sourceModel) return false;
    if (item.status === 'failed') return 'error' in item && typeof item.error === 'string';
    if (item.status !== 'completed' || !('analysis' in item) || !item.analysis || typeof item.analysis !== 'object') return false;
    const analysis = item.analysis;
    if (!('result' in analysis) || !analysis.result || typeof analysis.result !== 'object'
        || !('meta' in analysis) || !analysis.meta || typeof analysis.meta !== 'object') return false;
    const meta = analysis.meta;
    return 'providerId' in meta && PROVIDER_IDS.some(id => id === meta.providerId)
      && 'model' in meta && typeof meta.model === 'string' && 'providerLabel' in meta && typeof meta.providerLabel === 'string'
      && 'usedFallback' in meta && typeof meta.usedFallback === 'boolean'
      && 'scores' in analysis.result && 'findings' in analysis.result && Array.isArray(analysis.result.findings);
  });
}

async function readAnalysisResponse<T>(response: Response, input?: ComparisonRequest): Promise<T> {
  if (!response.ok) {
    let code = '';
    let partial: ComparisonResult | undefined;
    try {
      const errorData: unknown = await response.json();
      if (errorData && typeof errorData === 'object' && 'code' in errorData && typeof errorData.code === 'string') {
        code = errorData.code;
        if (response.status === 429 && code === 'BUDGET_EXHAUSTED' && input && 'comparison' in errorData && isPartialComparison(errorData.comparison, input)) {
          partial = errorData.comparison;
        }
      }
    } catch {
      // Never expose arbitrary proxy/upstream bodies as public diagnostics.
    }
    if (response.status === 401) { rejectApiAccess(); code = 'ACCESS_REQUIRED'; }
    const rawRetryAfter = response.headers?.get('Retry-After');
    const retryAfter = rawRetryAfter && /^\d+$/.test(rawRetryAfter) ? Math.min(Number(rawRetryAfter), 86_400) : undefined;
    throw new ApiRequestError(response.status, code, retryAfter, partial);
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
  if (accessWasRejected()) throw new ApiRequestError(401, 'ACCESS_REQUIRED');
  const response = await fetch('/api/analyze', {
    method: 'POST',
    headers: apiHeaders(),
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

  return { result: applyAnthropomorphismGuard(data.result, text, requestsFiction(auditContext)), meta: data.meta, provenance: data.provenance };
}

export async function compareToneResponses(input: ComparisonRequest, signal?: AbortSignal): Promise<ComparisonResult> {
  if (accessWasRejected()) throw new ApiRequestError(401, 'ACCESS_REQUIRED');
  const response = await fetch('/api/compare', {
    method: 'POST',
    headers: apiHeaders(),
    body: JSON.stringify(input),
    signal,
  });
  const data = await readAnalysisResponse<{ comparison: ComparisonResult; telemetry: ProviderTelemetrySnapshot }>(response, input);
  lastTelemetry = data.telemetry;
  const completed = data.comparison.items.find((item) => item.status === 'completed');
  if (completed?.status === 'completed') lastMeta = completed.analysis.meta;
  return { ...data.comparison, items: data.comparison.items.map(item => item.status === 'completed' ? {
    ...item, analysis: { ...item.analysis,
      result: applyAnthropomorphismGuard(item.analysis.result, item.text, requestsFiction(input.originalPrompt)) },
  } : item) };
}
