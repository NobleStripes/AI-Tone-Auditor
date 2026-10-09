import type { AnalysisResult } from './analysis';
import { ANALYSIS_SOURCES, type AnalysisSource, type ProviderRuntimeMeta } from './provider';
import { validateAnalysisResult } from '../services/validation/analysisValidator';
import type { AnalysisProvenance } from './provenance';
import { normalizeAnalysisProvenance, normalizeProviderMeta } from '../services/auditProvenance';

export interface HistoryEntry {
  id: string;
  title: string;
  timestamp: number;
  sourceModel: AnalysisSource;
  responseText: string;
  data: AnalysisResult;
  meta: ProviderRuntimeMeta | null;
  provenance?: AnalysisProvenance;
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
      const responseText = typeof raw.responseText === 'string' ? raw.responseText : '';
      const data = validateAnalysisResult(raw.data, { responseText, restored: true });
      const meta = normalizeProviderMeta(raw.meta);
      const sourceModel = ANALYSIS_SOURCES.find((source) => source === raw.sourceModel) ?? 'unknown';
      return [{
        id: raw.id,
        title: raw.title,
        timestamp: raw.timestamp,
        sourceModel,
        responseText,
        data,
        meta,
        ...(raw.provenance ? { provenance: normalizeAnalysisProvenance(raw.provenance, meta, sourceModel, 'restored_without_prompt') } : {}),
      }];
    }).slice(0, 50);
  } catch {
    return [];
  }
}