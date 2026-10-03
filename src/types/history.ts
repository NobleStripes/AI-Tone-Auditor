import type { AnalysisResult } from './analysis';
import { ANALYSIS_SOURCES, type AnalysisSource, type ProviderRuntimeMeta } from './provider';
import { validateAnalysisResult } from '../services/validation/analysisValidator';

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
      if (!raw.data || typeof raw.data !== 'object' || Array.isArray(raw.data)) return [];
      const data = validateAnalysisResult(raw.data);
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