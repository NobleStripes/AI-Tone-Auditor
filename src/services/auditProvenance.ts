import { version } from '../../package.json';
import { ANALYSIS_PROMPT_VERSION } from './promptBuilder';
import { LOCAL_RULE_VERSION } from './localRuleVersion';
import { ANALYSIS_SOURCES, PROVIDER_IDS, type AnalysisSource, type ProviderRuntimeMeta } from '../types/provider';
import type { AnalysisProvenance, AssessmentContext } from '../types/provenance';

export const AUDITOR_VERSION = version;

export function normalizeProviderMeta(value: unknown): ProviderRuntimeMeta | null {
  const raw = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const providerId = PROVIDER_IDS.find((id) => id === raw.providerId);
  return providerId && typeof raw.providerLabel === 'string' && raw.providerLabel.trim()
    && typeof raw.model === 'string' && raw.model.trim() && typeof raw.usedFallback === 'boolean'
    ? { providerId, providerLabel: raw.providerLabel, model: raw.model, usedFallback: raw.usedFallback }
    : null;
}

export function createAnalysisProvenance(
  meta: ProviderRuntimeMeta,
  selectedSourceModel: AnalysisSource,
  comparisonSessionId: string | null = null,
): AnalysisProvenance {
  return {
    auditorVersion: AUDITOR_VERSION,
    promptVersion: ANALYSIS_PROMPT_VERSION,
    localRuleVersion: LOCAL_RULE_VERSION,
    analysisProvider: { ...meta },
    selectedSourceModel,
    analyzedAt: new Date().toISOString(),
    comparisonSessionId,
    assessmentContext: 'live',
  };
}

export function normalizeAnalysisProvenance(
  value: unknown,
  meta: ProviderRuntimeMeta | null = null,
  source: AnalysisSource = 'unknown',
  context?: AssessmentContext,
): AnalysisProvenance {
  const raw = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const text = (field: string) => {
    const value = raw[field];
    return typeof value === 'string' && value.trim() ? value : null;
  };
  const date = typeof raw.analyzedAt === 'string' ? Date.parse(raw.analyzedAt) : NaN;
  return {
    auditorVersion: text('auditorVersion'),
    promptVersion: text('promptVersion'),
    localRuleVersion: text('localRuleVersion'),
    analysisProvider: normalizeProviderMeta(raw.analysisProvider) ?? (meta ? { ...meta } : null),
    selectedSourceModel: ANALYSIS_SOURCES.find((item) => item === raw.selectedSourceModel) ?? source,
    analyzedAt: Number.isFinite(date) ? new Date(date).toISOString() : null,
    comparisonSessionId: text('comparisonSessionId'),
    assessmentContext: context ?? (['live', 'restored_without_prompt', 'unrecorded'] as const).find((item) => item === raw.assessmentContext) ?? 'unrecorded',
  };
}
