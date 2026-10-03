import type { AnalysisResult } from './analysis';
import { ANALYSIS_SOURCES, type AnalysisSource, type ProviderRuntimeMeta } from './provider';

export interface HistoryEntry {
  id: string;
  title: string;
  timestamp: number;
  sourceModel: AnalysisSource;
  responseText: string;
  data: AnalysisResult;
  meta: ProviderRuntimeMeta | null;
}

export function parseAuditHistory(stored: string | null): HistoryEntry[] {
  try {
    const entries: unknown = JSON.parse(stored ?? '[]');
    if (!Array.isArray(entries)) return [];
    return entries.flatMap((entry: unknown): HistoryEntry[] => {
      if (!entry || typeof entry !== 'object') return [];
      const raw = entry as Record<string, unknown>;
      if (typeof raw.id !== 'string' || typeof raw.title !== 'string' || typeof raw.timestamp !== 'number' || !Number.isFinite(raw.timestamp)) return [];
      const data = raw.data as AnalysisResult | undefined;
      if (!data || typeof data !== 'object' || !data.scores || !Array.isArray(data.findings) || !data.personalization || !data.contextAnalysis || !Array.isArray(data.recommendations) || !Array.isArray(data.euphemisms)) return [];
      const meta = raw.meta as ProviderRuntimeMeta | undefined;
      const validMeta = meta && ['openai', 'anthropic', 'gemini', 'grok', 'local'].includes(meta.providerId)
        && typeof meta.providerLabel === 'string' && typeof meta.model === 'string' && typeof meta.usedFallback === 'boolean';
      return [{
        id: raw.id,
        title: raw.title,
        timestamp: raw.timestamp,
        sourceModel: ANALYSIS_SOURCES.includes(raw.sourceModel as AnalysisSource) ? raw.sourceModel as AnalysisSource : 'unknown',
        responseText: typeof raw.responseText === 'string' ? raw.responseText : '',
        data,
        meta: validMeta ? meta : null,
      }];
    }).slice(0, 50);
  } catch {
    return [];
  }
}